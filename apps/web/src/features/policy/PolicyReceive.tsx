import { ZERO_ADDRESS, deriveScheme2OwnerKey, type Address, type Hex, type PolicyRecord } from '@ghostpay/policy-scheme';
import type { ScanCursor } from '@ghostpay/chain-adapters';
import { useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../../components/Common';
import { UserFacingError, userMessage } from '../../lib/errors';
import { withSessionSecrets, withSessionSecretsAsync } from '../../lib/session';
import { sendViaWallet } from '../../lib/wallet';
import { useApp } from '../../state';
import { getAddress, isAddress } from 'viem/utils';
import { chainNow, readAccount, readBalance, readNonceUsed, readWindow, type AccountView } from './chain';
import { fetchAccountEvents, summarizeAccount, type AccountSummary } from './guard';
import { fetchScheme2Announcements, matchScheme2, mergeMatches, type Scheme2Match } from './scan2';
import { deployCall, planWithdraw, randomNonce, signCancel, signWithdraw, wipe, type WithdrawPlan } from './withdraw';
import type { PolicyCtx } from './PolicyView';

type Msg = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string };

async function withOwnerKey<T>(m: Scheme2Match, ctx: PolicyCtx, fn: (secret: Parameters<typeof signCancel>[0]['ownerSecret']) => Promise<T>): Promise<T> {
  const dep = ctx.deployment;
  if (dep === undefined) throw new UserFacingError('Verify the contracts first.');
  return withSessionSecretsAsync(async (s) => {
    const k = deriveScheme2OwnerKey(
      { stealthAddress: m.accountAddress, ephemeralPublicKey: m.ephemeralPublicKey, metadata: m.metadata },
      s.keys, s.keys.spendingPublicKey, [m.policyHash], dep,
    );
    try {
      return await fn(k.ownerSecret);
    } finally {
      wipe(k.ownerSecret);
    }
  });
}

function AccountPanel(props: { readonly ctx: PolicyCtx; readonly match: Scheme2Match; readonly record: PolicyRecord; readonly knownIds: Set<string>; readonly remember: (id: Hex) => void }): ReactNode {
  const app = useApp();
  const { ctx, match, record } = props;
  const [view, setView] = useState<AccountView | undefined>(undefined);
  const [token, setToken] = useState('native');
  const [plan, setPlan] = useState<{ token: Address; plan: WithdrawPlan; balance: bigint } | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [summary, setSummary] = useState<AccountSummary | undefined>(undefined);
  const [pendingExec, setPendingExec] = useState<{ id: Hex; executeAfter: bigint; call: { to: Address; data: Hex; value: bigint } } | undefined>(undefined);
  const [msg, setMsg] = useState<Msg | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const client = async () => {
    const c = await app.getRpc(ctx.chain.chainId);
    if (c === undefined) throw new UserFacingError('Configure an RPC for this network in Settings first.');
    return c;
  };
  const run = (fn: () => Promise<void>): void => {
    setBusy(true);
    setMsg(undefined);
    fn().catch((e: unknown) => { setMsg({ kind: 'error', text: userMessage(e) }); }).finally(() => { setBusy(false); });
  };
  const send = async (tx: { to: Address; data: Hex; value: bigint }, label: string): Promise<void> => {
    if (ctx.wallet === undefined) throw new UserFacingError('Connect a wallet on this network to relay the transaction (any account may relay).');
    const hash = await sendViaWallet(ctx.wallet, tx);
    setMsg({ kind: 'ok', text: `${label} submitted: ${hash}` });
  };

  const check = (): void => run(async () => {
    const c = await client();
    const v = await readAccount(c, match.accountAddress);
    setView(v);
    const t = token.trim().toLowerCase() === 'native' ? ZERO_ADDRESS : token.trim();
    if (!isAddress(t, { strict: true })) throw new UserFacingError('The token must be "native" or a checksummed address.');
    const tok = getAddress(t);
    const [balance, window, now] = await Promise.all([readBalance(c, match.accountAddress, tok), v.deployed ? readWindow(c, match.accountAddress, tok) : Promise.resolve({ window: 0n, bucket: 0n, current: 0n, previous: 0n }), chainNow(c)]);
    let pendingSameToken = 0n;
    if (v.deployed) {
      const ev = await fetchAccountEvents(c, ctx.chain, match.accountAddress, match.blockNumber);
      const s = summarizeAccount(ev.events, props.knownIds, record.policy.destination);
      setSummary(s);
      pendingSameToken = s.pending.filter((p) => p.token === tok).reduce((a, p) => a + p.amount, 0n);
      if (!ev.complete) setMsg({ kind: 'warn', text: 'Only part of the account history was read (request cap). Pending actions may be missing.' });
    }
    setPlan({ token: tok, balance, plan: planWithdraw({ record, view: v, token: tok, balance, window, pendingSameToken, nowSec: now }) });
  });

  const deploy = (): void => run(async () => {
    if (ctx.deployment === undefined) throw new UserFacingError('Verify the contracts first.');
    const d = deployCall(ctx.deployment, match.ownerAddress, record);
    if (d.account !== match.accountAddress) throw new UserFacingError('The deployment would create another account. Nothing was sent.');
    await send(d, 'Deployment');
  });

  const withdraw = (): void => run(async () => {
    if (plan === undefined || !/^[1-9][0-9]{0,77}$/.test(amount.trim())) throw new UserFacingError('Enter an amount in base units.');
    const c = await client();
    let nonce = randomNonce();
    if (await readNonceUsed(c, match.accountAddress, nonce)) nonce = randomNonce();
    const now = await chainNow(c);
    const signed = await withOwnerKey(match, ctx, (secret) => signWithdraw({
      chainId: ctx.chain.chainId, account: match.accountAddress, owner: match.ownerAddress, record, plan: plan.plan,
      token: plan.token, amount: BigInt(amount.trim()), deadline: now + 1800n, nonce, ownerSecret: secret,
    }));
    props.remember(signed.id);
    await send(signed.request, 'Withdrawal request');
    setPendingExec({ id: signed.id, executeAfter: now + record.policy.delaySeconds, call: signed.execute });
  });

  const cancel = (kind: 'withdraw' | 'destination', id: Hex): void => run(async () => {
    const call = await withOwnerKey(match, ctx, (secret) => signCancel({ chainId: ctx.chain.chainId, account: match.accountAddress, owner: match.ownerAddress, kind, id, ownerSecret: secret }));
    await send(call, 'Cancel');
  });

  return (
    <li>
      <p>Account <Mono>{match.accountAddress}</Mono> (block {match.blockNumber.toString()})</p>
      <Field label="Token to withdraw">{(id) => <input id={id} value={token} onChange={(e) => { setToken(e.target.value); setPlan(undefined); }} spellCheck={false} />}</Field>
      <button type="button" disabled={busy} onClick={check}>Check account</button>
      {view?.deployed === false && (
        <>
          <Notice kind="info">Not deployed yet. Deploying reveals the full policy (destination, delay, limits) on-chain.</Notice>
          <button type="button" disabled={busy} onClick={deploy}>Deploy account</button>
        </>
      )}
      {summary?.alerts.map((a, i) => (
        <Notice key={i} kind={a.level === 'danger' ? 'error' : 'warn'} title={a.level === 'danger' ? 'Action needed' : 'Warning'}>
          {a.text}
          {a.cancel !== undefined && <button type="button" disabled={busy} onClick={() => { cancel(a.cancel!.kind, a.cancel!.id); }}>Cancel it</button>}
        </Notice>
      ))}
      {plan !== undefined && (
        <>
          <dl className="kv" aria-label="Withdrawal limits">
            <dt>Balance</dt><dd>{plan.balance.toString()}</dd>
            <dt>Limit per window</dt><dd>{plan.plan.limit === null ? 'none' : plan.plan.limit.toString()}</dd>
            <dt>Can request now</dt><dd>{plan.plan.max.toString()}</dd>
            <dt>Unlocks after</dt><dd>{new Date(Number(plan.plan.executeAfter) * 1000).toISOString()}</dd>
            <dt>Paid to</dt><dd><Mono>{record.policy.destination}</Mono></dd>
          </dl>
          {plan.plan.problems.map((p) => <Notice key={p} kind="warn">{p}</Notice>)}
          {plan.plan.max > 0n && (
            <>
              <Field label="Amount to withdraw (base units)">{(id) => <input id={id} inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); }} />}</Field>
              <button type="button" disabled={busy} onClick={withdraw}>Sign and send withdrawal request</button>
            </>
          )}
        </>
      )}
      {pendingExec !== undefined && (
        <p>
          After {new Date(Number(pendingExec.executeAfter) * 1000).toISOString()} anyone can execute request <Mono>{pendingExec.id.slice(0, 10)}…</Mono>.{' '}
          <button type="button" disabled={busy} onClick={() => { run(() => send(pendingExec.call, 'Execution')); }}>Execute withdrawal</button>
        </p>
      )}
      {msg !== undefined && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </li>
  );
}

/** Scheme-2 scan and per-account withdraw/guard panels. */
export function PolicyReceive(props: { readonly ctx: PolicyCtx }): ReactNode {
  const app = useApp();
  const { ctx } = props;
  const [fromBlock, setFromBlock] = useState('');
  const [cursor, setCursor] = useState<ScanCursor | undefined>(undefined);
  const [matches, setMatches] = useState<readonly Scheme2Match[]>([]);
  const [msg, setMsg] = useState<Msg | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [knownIds] = useState(() => new Set<string>());

  const scan = async (): Promise<void> => {
    const dep = ctx.deployment;
    if (dep === undefined) return;
    setBusy(true);
    setMsg(undefined);
    try {
      const c = await app.getRpc(ctx.chain.chainId);
      if (c === undefined) throw new UserFacingError('Configure an RPC for this network in Settings first.');
      const start = cursor ?? { nextBlock: /^[0-9]{1,15}$/.test(fromBlock.trim()) ? BigInt(fromBlock.trim()) : 0n };
      const f = await fetchScheme2Announcements({ chain: ctx.chain, client: c, deployment: dep, cursor: start });
      const hashes = ctx.records.map((r) => r.policyHash);
      const found = withSessionSecrets((s) => matchScheme2(f.announcements, s.keys.viewingSecret, s.keys.spendingPublicKey, hashes, dep));
      setMatches((prev) => mergeMatches(prev, found, f.reorg));
      setCursor(f.cursor);
      setMsg({ kind: f.truncated ? 'warn' : 'ok', text: `${String(f.announcements.length)} policy announcement(s) read, ${String(found.length)} new for your keys.${f.truncated ? ' Stopped at a cap: scan again to continue.' : ''}` });
    } catch (e) {
      setMsg({ kind: 'error', text: userMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="policy-receive">
      <h3 id="policy-receive">Find and withdraw policy payments</h3>
      {ctx.deployment === undefined ? <Notice kind="info">Verify the contracts above first.</Notice>
        : app.session === undefined ? <Notice kind="info">Load or generate seller keys first (Seller keys).</Notice>
        : ctx.records.length === 0 ? <Notice kind="info">Create or import a policy record first: the scanner matches payments by policy.</Notice>
        : (
          <>
            {cursor === undefined && <Field label="Start block (optional)">{(id) => <input id={id} inputMode="numeric" value={fromBlock} onChange={(e) => { setFromBlock(e.target.value); }} />}</Field>}
            <button type="button" disabled={busy} onClick={() => { void scan(); }}>{cursor === undefined ? 'Scan for policy payments' : 'Continue scan'}</button>
            {msg !== undefined && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <ul className="plain">
              {matches.map((m) => {
                const record = ctx.records.find((r) => r.policyHash === m.policyHash);
                return record === undefined ? null : <AccountPanel key={m.accountAddress} ctx={ctx} match={m} record={record} knownIds={knownIds} remember={(id) => { knownIds.add(id); }} />;
              })}
            </ul>
          </>
        )}
    </section>
  );
}
