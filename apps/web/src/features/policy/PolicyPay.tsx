import { useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../../components/Common';
import { userMessage } from '../../lib/errors';
import { sendViaWallet } from '../../lib/wallet';
import { useApp } from '../../state';
import { useServices } from '../../lib/services';
import { preparePolicyPayment, type PreparedPolicyPayment } from './pay';
import type { PolicyCtx } from './PolicyView';

const DEC = /^[1-9][0-9]{0,77}$/;

/** Pay a policy meta-address through GhostPayPolicyRouter (fee 0.25 %, announced as scheme 0x47500002). */
export function PolicyPay(props: { readonly ctx: PolicyCtx }): ReactNode {
  const app = useApp();
  const services = useServices();
  const { deployment, wallet } = props.ctx;
  const [meta, setMeta] = useState('');
  const [token, setToken] = useState('native');
  const [amount, setAmount] = useState('');
  const [prepared, setPrepared] = useState<PreparedPolicyPayment | undefined>(undefined);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const review = (): void => {
    setMsg(undefined);
    setPrepared(undefined);
    if (deployment === undefined) return;
    try {
      if (!DEC.test(amount.trim())) throw new Error('amount');
      setPrepared(preparePolicyPayment({ metaAddress: meta, deployment, token, gross: BigInt(amount.trim()), nowSec: BigInt(Math.floor(services.nowMs() / 1000)) }));
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error && e.message === 'amount' ? 'Enter the amount as a whole number of base units.' : userMessage(e) });
    }
  };

  const send = async (): Promise<void> => {
    if (prepared === undefined || wallet === undefined) return;
    setBusy(true);
    setMsg(undefined);
    try {
      if (prepared.approval !== undefined) await sendViaWallet(wallet, prepared.approval, undefined, { kind: 'approval' });
      const hash = await sendViaWallet(wallet, prepared.built.tx, undefined, { kind: 'payment' });
      setMsg({ kind: 'ok', text: `Payment submitted: ${hash}` });
      app.announce('Policy payment submitted.');
      setPrepared(undefined);
    } catch (e) {
      setMsg({ kind: 'error', text: userMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="policy-pay">
      <h3 id="policy-pay">Pay a policy meta-address</h3>
      {deployment === undefined ? <Notice kind="info">Verify the contracts above first.</Notice> : (
        <>
          <Field label="Payee policy meta-address" hint="Get it from the payee over a channel you trust: you cannot check the policy behind it.">
            {(id, hint) => <input id={id} aria-describedby={hint} value={meta} onChange={(e) => { setMeta(e.target.value); setPrepared(undefined); }} spellCheck={false} />}
          </Field>
          <Field label='Token ("native" or ERC-20 address)'>{(id) => <input id={id} value={token} onChange={(e) => { setToken(e.target.value); setPrepared(undefined); }} spellCheck={false} />}</Field>
          <Field label="Amount (base units)">{(id) => <input id={id} inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); setPrepared(undefined); }} />}</Field>
          <button type="button" onClick={review}>Review payment</button>
          {prepared !== undefined && (
            <>
              <dl className="kv" aria-label="Policy payment review">
                <dt>Method</dt><dd><Mono>{prepared.built.method}</Mono></dd>
                <dt>Fresh policy account</dt><dd><Mono>{prepared.payment.accountAddress}</Mono></dd>
                <dt>Router</dt><dd><Mono>{prepared.built.tx.to}</Mono></dd>
                <dt>Fee</dt><dd>{prepared.built.fee.toString()}</dd>
                <dt>Payee receives</dt><dd>{prepared.built.net.toString()}</dd>
                {prepared.approval !== undefined && (<><dt>Approval first</dt><dd>approve router for {amount.trim()}</dd></>)}
              </dl>
              {wallet === undefined ? <Notice kind="info">Connect a wallet on this network to send.</Notice> : (
                <button type="button" disabled={busy} onClick={() => { void send(); }}>Send payment</button>
              )}
            </>
          )}
          {msg !== undefined && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </>
      )}
    </section>
  );
}
