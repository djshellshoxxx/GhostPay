import { ZERO_ADDRESS, deriveScheme2OwnerKey, type Address, type Hex, type PolicyRecord } from '@ghostpay/policy-scheme';
import type { ScanCursor } from '@ghostpay/chain-adapters';
import { useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../../components/Common';
import { UserFacingError, userMessage } from '../../lib/errors';
import { captureSessionGuard, withSessionSecrets, withSessionSecretsAsync } from '../../lib/session';
import type { WalletAttempt } from '../../lib/duplicateAttemptJournal';
import { useApp } from '../../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../../i18n/context';
import { getAddress, isAddress } from 'viem/utils';
import { readWithdrawalSnapshot, recoveredExecution, withdrawalActionScope, type WithdrawalSnapshot } from './withdrawalState';
import { clearPolicyAction, policyActionAttempts, policyActionKey, sendPolicyAction } from './withdrawalJournal';
import { fetchScheme2Announcements, matchScheme2, mergeMatches, type Scheme2Match } from './scan2';
import { deployCall, randomNonce, signCancel, signWithdraw, wipe } from './withdraw';
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
  // Test renders without an I18nProvider fall back to the source English catalog.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [snapshot, setSnapshot] = useState<WithdrawalSnapshot | undefined>(undefined);
  const view = snapshot?.view;
  const summary = snapshot?.summary;
  const plan = snapshot === undefined ? undefined : { token: snapshot.token, balance: snapshot.balance, plan: snapshot.plan };
  const [token, setToken] = useState('native');
  const [amount, setAmount] = useState('');
  const [attempts, setAttempts] = useState<readonly WalletAttempt[]>([]);
  const [msg, setMsg] = useState<Msg | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const client = async () => {
    const c = await app.getRpc(ctx.chain.chainId);
    if (c === undefined) throw new UserFacingError(t('policy.error.noRpc'));
    return c;
  };
  // The seller-key session is captured when the action starts; every wallet request re-checks it immediately before the
  // provider call, so a lock or key change mid-action refuses without contacting the wallet (as Pay does).
  const run = (fn: (assertCurrent: () => void) => Promise<void>): void => {
    setBusy(true);
    setMsg(undefined);
    Promise.resolve().then(() => {
      const assertSessionCurrent = captureSessionGuard();
      const assertCurrent = (): void => { assertSessionCurrent(); ctx.assertDeploymentCurrent(); };
      assertCurrent();
      return fn(assertCurrent);
    }).catch((e: unknown) => { setMsg({ kind: 'error', text: userMessage(e, t) }); }).finally(() => { setBusy(false); });
  };
  const tokenAddress = (): Address => {
    const value = token.trim().toLowerCase() === 'native' ? ZERO_ADDRESS : token.trim();
    if (!isAddress(value, { strict: true })) throw new UserFacingError(t('policy.account.tokenInvalid'));
    return getAddress(value);
  };
  const actionScope = (tok: Address, action: string): string => {
    if (app.session === undefined || ctx.deployment === undefined) throw new UserFacingError(t('policy.error.verifyFirst'));
    return `${withdrawalActionScope(app.session, ctx.deployment, match.accountAddress, tok)}:${action}`;
  };
  const refreshAttempts = (tok: Address, current?: WithdrawalSnapshot): void => {
    const scopes = [actionScope(tok, 'request'), actionScope(ZERO_ADDRESS, 'deploy')];
    for (const request of current?.requests ?? []) {
      scopes.push(actionScope(request.token, 'request'), actionScope(request.token, `execute:${request.id}`), actionScope(ZERO_ADDRESS, `cancel:withdraw:${request.id}`));
    }
    if (current?.summary.pendingDestination !== undefined) scopes.push(actionScope(ZERO_ADDRESS, `cancel:destination:${current.summary.pendingDestination.id}`));
    const found = new Map<string, WalletAttempt>();
    for (const scope of scopes) {
      const key = policyActionKey({ chainId: ctx.chain.chainId, account: ZERO_ADDRESS }, { to: match.accountAddress, data: '0x', value: 0n }, scope);
      for (const attempt of policyActionAttempts(key)) found.set(attempt.id, attempt);
    }
    setAttempts([...found.values()]);
  };
  const fresh = async (tok: Address, assertCurrent: () => void, nonce?: bigint): Promise<WithdrawalSnapshot> => {
    if (ctx.deployment === undefined) throw new UserFacingError(t('policy.error.verifyFirst'));
    const c = await client(); assertCurrent();
    const next = await readWithdrawalSnapshot({ client: c, chain: ctx.chain, deployment: ctx.deployment, account: match.accountAddress, owner: match.ownerAddress, record, token: tok, knownIds: props.knownIds, assertCurrent, ...(nonce === undefined ? {} : { nonce }) });
    assertCurrent();
    setSnapshot(next);
    refreshAttempts(tok, next);
    return next;
  };
  const send = async (prepare: () => Promise<{ to: Address; data: Hex; value: bigint }>, label: string, tok: Address, action: string, assertCurrent: () => void): Promise<void> => {
    if (ctx.wallet === undefined) throw new UserFacingError(t('policy.account.walletRequired'));
    assertCurrent();
    const scope = actionScope(tok, action);
    try {
      const hash = await sendPolicyAction({ wallet: ctx.wallet, prepare, scope, assertCurrent });
      // The journal has already preserved the hash, even if this scope was replaced after broadcast.
      assertCurrent();
      setMsg({ kind: 'ok', text: t('policy.account.submitted', { label, hash }) });
    } finally {
      try { assertCurrent(); refreshAttempts(tok, snapshot); } catch { /* Never mask a returned broadcast hash with stale UI cleanup. */ }
    }
  };

  const check = (): void => run(async (assertCurrent) => {
    setSnapshot(undefined);
    const tok = tokenAddress();
    refreshAttempts(tok);
    await fresh(tok, assertCurrent);
  });

  const deploy = (): void => run(async (assertCurrent) => {
    await send(async () => {
      const current = await fresh(ZERO_ADDRESS, assertCurrent);
      const d = deployCall(current.deployment, match.ownerAddress, record);
      if (current.view.deployed || d.account !== match.accountAddress) throw new UserFacingError(t('policy.account.deployMismatch'));
      return d;
    }, t('policy.account.deployment'), ZERO_ADDRESS, 'deploy', assertCurrent);
  });

  const withdraw = (): void => run(async (assertCurrent) => {
    if (plan === undefined || !/^[1-9][0-9]{0,77}$/.test(amount.trim())) throw new UserFacingError(t('policy.account.amountInvalid'));
    const tok = plan.token;
    const requestedAmount = BigInt(amount.trim());
    await send(async () => {
      const nonce = randomNonce();
      const current = await fresh(tok, assertCurrent, nonce);
      assertCurrent();
      const signed = await withOwnerKey(match, ctx, async (secret) => {
        assertCurrent();
        const result = await signWithdraw({
          chainId: ctx.chain.chainId, account: match.accountAddress, owner: match.ownerAddress, record, plan: current.plan,
          token: tok, amount: requestedAmount, deadline: current.block.timestamp + 1800n, nonce, ownerSecret: secret,
        });
        assertCurrent();
        return result;
      });
      props.remember(signed.id);
      return signed.request;
    }, t('policy.account.withdrawal'), tok, 'request', assertCurrent);
    // A broadcast hash gives no execution timestamp. A fresh canonical history read recovers the actual request.
    setSnapshot(undefined);
    setMsg((previous) => previous?.kind === 'ok' ? { kind: 'ok', text: `${previous.text} ${t('policy.withdraw.refreshRequired')}` } : previous);
  });

  const cancel = (kind: 'withdraw' | 'destination', id: Hex): void => run(async (assertCurrent) => {
    await send(async () => {
      const current = await fresh(tokenAddress(), assertCurrent);
      const exists = kind === 'withdraw' ? current.requests.some((r) => r.id === id && r.status === 1) : current.summary.pendingDestination?.id === id;
      if (!exists) throw new UserFacingError({ key: 'policy.withdraw.notReady' });
      assertCurrent();
      return withOwnerKey(match, ctx, async (secret) => {
        assertCurrent();
        const call = await signCancel({ chainId: ctx.chain.chainId, account: match.accountAddress, owner: match.ownerAddress, kind, id, ownerSecret: secret });
        assertCurrent();
        return call;
      });
    }, t('policy.account.cancel'), ZERO_ADDRESS, `cancel:${kind}:${id}`, assertCurrent);
  });

  const execute = (id: Hex, tok: Address): void => run(async (assertCurrent) => {
    await send(async () => recoveredExecution(await fresh(tok, assertCurrent), id), t('policy.account.execution'), tok, `execute:${id}`, assertCurrent);
    setSnapshot(undefined);
  });

  const clear = (key: string): void => run(async (assertCurrent) => {
    const confirmed = window.confirm(t('policy.withdraw.clearConfirm'));
    assertCurrent();
    if (!confirmed) return;
    await clearPolicyAction(key, true, undefined, undefined, assertCurrent);
    assertCurrent();
    refreshAttempts(tokenAddress(), snapshot);
  });

  return (
    <li>
      <p>{t('policy.account.label')} <Mono>{match.accountAddress}</Mono> {t('policy.account.block', { number: match.blockNumber.toString() })}</p>
      <Field label={t('policy.account.tokenLabel')}>{(id) => <input id={id} dir="ltr" value={token} disabled={busy} onChange={(e) => { setToken(e.target.value); setSnapshot(undefined); setAttempts([]); }} spellCheck={false} />}</Field>
      <button type="button" disabled={busy} onClick={check}>{t('policy.account.check')}</button>
      {view?.deployed === false && (
        <>
          <Notice kind="info">{t('policy.account.notDeployed')}</Notice>
          <button type="button" disabled={busy} onClick={deploy}>{t('policy.account.deploy')}</button>
        </>
      )}
      {summary?.alerts.map((a, i) => (
        <Notice key={i} kind={a.level === 'danger' ? 'error' : 'warn'} title={a.level === 'danger' ? t('policy.account.alertDanger') : t('policy.account.alertWarn')}>
          {a.text}
          {a.cancel !== undefined && <button type="button" disabled={busy} onClick={() => { cancel(a.cancel!.kind, a.cancel!.id); }}>{t('policy.account.cancelIt')}</button>}
        </Notice>
      ))}
      {plan !== undefined && (
        <>
          <dl className="kv" aria-label={t('policy.account.limitsAria')}>
            <dt>{t('policy.account.balance')}</dt><dd>{plan.balance.toString()}</dd>
            <dt>{t('policy.account.limitPerWindow')}</dt><dd>{plan.plan.limit === null ? t('policy.account.none') : plan.plan.limit.toString()}</dd>
            <dt>{t('policy.account.canRequest')}</dt><dd>{plan.plan.max.toString()}</dd>
            <dt>{t('policy.account.unlocksAfter')}</dt><dd>{new Date(Number(plan.plan.executeAfter) * 1000).toISOString()}</dd>
            <dt>{t('policy.account.paidTo')}</dt><dd><Mono>{record.policy.destination}</Mono></dd>
          </dl>
          {plan.plan.problems.map((p) => <Notice key={p} kind="warn">{p}</Notice>)}
          {plan.plan.max > 0n && (
            <>
              <Field label={t('policy.account.amountLabel')}>{(id) => <input id={id} dir="ltr" disabled={busy} inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); }} />}</Field>
              <button type="button" disabled={busy} onClick={withdraw}>{t('policy.account.signWithdraw')}</button>
            </>
          )}
        </>
      )}
      {summary?.pending.map((pending) => (
        <p key={pending.id}>
          {t('policy.account.executeAfter', { date: new Date(Number(pending.executeAfter) * 1000).toISOString() })} <Mono>{pending.id.slice(0, 10)}…</Mono>.{' '}
          <button type="button" disabled={busy} onClick={() => { execute(pending.id, pending.token); }}>{t('policy.account.executeWithdrawal')}</button>
        </p>
      ))}
      <Notice kind="info">{t('policy.withdraw.storageNotice')}</Notice>
      {attempts.length > 0 && <section aria-label={t('policy.withdraw.attempts')}>
        {attempts.map((attempt) => <p key={attempt.id}>
          <Mono>{attempt.hash ?? attempt.status}</Mono>{' '}
          <button type="button" disabled={busy} onClick={() => { clear(attempt.key); }}>{t('policy.withdraw.clearAttempt')}</button>
        </p>)}
      </section>}
      {msg !== undefined && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </li>
  );
}

/** Scheme-2 scan and per-account withdraw/guard panels. */
export function PolicyReceive(props: { readonly ctx: PolicyCtx }): ReactNode {
  const app = useApp();
  const { ctx } = props;
  // Test renders without an I18nProvider fall back to the source English catalog.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [fromBlock, setFromBlock] = useState('');
  const [cursor, setCursor] = useState<ScanCursor | undefined>(undefined);
  const [matches, setMatches] = useState<readonly Scheme2Match[]>([]);
  const [scannedSession, setScannedSession] = useState(app.session);
  const sameSession = scannedSession === app.session;
  const visibleCursor = sameSession ? cursor : undefined;
  const visibleMatches = sameSession ? matches : [];
  const [msg, setMsg] = useState<Msg | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [knownIds] = useState(() => new Set<string>());

  const scan = async (): Promise<void> => {
    const dep = ctx.deployment;
    if (dep === undefined) return;
    setBusy(true);
    setMsg(undefined);
    try {
      const assertSessionCurrent = captureSessionGuard();
      ctx.assertDeploymentCurrent();
      const c = await app.getRpc(ctx.chain.chainId);
      assertSessionCurrent();
      ctx.assertDeploymentCurrent();
      if (c === undefined) throw new UserFacingError(t('policy.error.noRpc'));
      const start = visibleCursor ?? { nextBlock: /^[0-9]{1,15}$/.test(fromBlock.trim()) ? BigInt(fromBlock.trim()) : 0n };
      const f = await fetchScheme2Announcements({ chain: ctx.chain, client: c, deployment: dep, cursor: start });
      assertSessionCurrent();
      ctx.assertDeploymentCurrent();
      const hashes = ctx.records.map((r) => r.policyHash);
      const found = withSessionSecrets((s) => matchScheme2(f.announcements, s.keys.viewingSecret, s.keys.spendingPublicKey, hashes, dep));
      if (!sameSession) knownIds.clear();
      setMatches((prev) => mergeMatches(sameSession ? prev : [], found, f.reorg));
      setCursor(f.cursor);
      setScannedSession(app.session);
      setMsg({ kind: f.truncated ? 'warn' : 'ok', text: `${t('policy.receive.result', { count: String(f.announcements.length), fresh: String(found.length) })}${f.truncated ? ` ${t('policy.receive.capped')}` : ''}` });
    } catch (e) {
      setMsg({ kind: 'error', text: userMessage(e, t) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="policy-receive">
      <h3 id="policy-receive">{t('policy.receive.heading')}</h3>
      {ctx.deployment === undefined ? <Notice kind="info">{t('policy.receive.verifyFirst')}</Notice>
        : app.session === undefined ? <Notice kind="info">{t('policy.receive.needSession')}</Notice>
        : ctx.records.length === 0 ? <Notice kind="info">{t('policy.receive.needPolicy')}</Notice>
        : (
          <>
            {visibleCursor === undefined && <Field label={t('policy.receive.startBlock')}>{(id) => <input id={id} inputMode="numeric" value={fromBlock} onChange={(e) => { setFromBlock(e.target.value); }} />}</Field>}
            <button type="button" disabled={busy} onClick={() => { void scan(); }}>{visibleCursor === undefined ? t('policy.receive.scan') : t('policy.receive.continue')}</button>
            {msg !== undefined && (sameSession || msg.kind === 'error') && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <ul className="plain">
              {visibleMatches.map((m) => {
                const record = ctx.records.find((r) => r.policyHash === m.policyHash);
                return record === undefined ? null : <AccountPanel key={m.accountAddress} ctx={ctx} match={m} record={record} knownIds={knownIds} remember={(id) => { knownIds.add(id); }} />;
              })}
            </ul>
          </>
        )}
    </section>
  );
}
