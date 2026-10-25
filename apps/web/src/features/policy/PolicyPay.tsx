import { useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../../components/Common';
import { userMessage } from '../../lib/errors';
import { useApp } from '../../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../../i18n/context';
import { useServices } from '../../lib/services';
import { preparePolicyPayment, type PreparedPolicyPayment } from './pay';
import { sendPolicyPayment } from './send';
import type { Hex } from '@ghostpay/policy-scheme';
import type { PolicyCtx } from './PolicyView';

const DEC = /^[1-9][0-9]{0,77}$/;

/** Pay a policy meta-address through GhostPayPolicyRouter (fee 0.25 %, announced as scheme 0x47500002). */
export function PolicyPay(props: { readonly ctx: PolicyCtx }): ReactNode {
  const app = useApp();
  const services = useServices();
  const { deployment, wallet } = props.ctx;
  // Test renders without an I18nProvider fall back to the source English catalog.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [meta, setMeta] = useState('');
  const [token, setToken] = useState('native');
  const [amount, setAmount] = useState('');
  const [prepared, setPrepared] = useState<PreparedPolicyPayment | undefined>(undefined);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [broadcast, setBroadcast] = useState<readonly Hex[]>([]);

  const review = (): void => {
    setMsg(undefined);
    setPrepared(undefined);
    if (deployment === undefined) return;
    try {
      if (!DEC.test(amount.trim())) throw new Error('amount');
      setPrepared(preparePolicyPayment({ metaAddress: meta, deployment, token, gross: BigInt(amount.trim()), nowSec: BigInt(Math.floor(services.nowMs() / 1000)) }));
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error && e.message === 'amount' ? t('policy.pay.amountInvalid') : userMessage(e) });
    }
  };

  const send = async (): Promise<void> => {
    if (prepared === undefined || wallet === undefined) return;
    setBusy(true);
    setMsg(undefined);
    setStatus(undefined);
    try {
      const rpc = await app.getRpc(props.ctx.chain.chainId);
      const res = await sendPolicyPayment(
        wallet,
        prepared,
        { rpc, nowSeconds: () => Math.floor(services.nowMs() / 1000), sleep: services.sleep },
        setStatus,
        (h) => { setBroadcast((prev) => [...prev, h]); },
      );
      setMsg({ kind: 'ok', text: `${t('policy.pay.submitted', { hash: res.hash })}${res.receipt?.status === 'success' ? ` ${t('policy.pay.confirmed')}` : ''}` });
      app.announce(t('policy.pay.announced'));
      setPrepared(undefined);
    } catch (e) {
      setMsg({ kind: 'error', text: userMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="policy-pay">
      <h3 id="policy-pay">{t('policy.pay.heading')}</h3>
      {deployment === undefined ? <Notice kind="info">{t('policy.pay.verifyFirst')}</Notice> : (
        <>
          <Field label={t('policy.pay.metaLabel')} hint={t('policy.pay.metaHint')}>
            {(id, hint) => <input id={id} aria-describedby={hint} value={meta} onChange={(e) => { setMeta(e.target.value); setPrepared(undefined); }} spellCheck={false} />}
          </Field>
          <Field label={t('policy.pay.tokenLabel')}>{(id) => <input id={id} value={token} onChange={(e) => { setToken(e.target.value); setPrepared(undefined); }} spellCheck={false} />}</Field>
          <Field label={t('policy.pay.amountLabel')}>{(id) => <input id={id} inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); setPrepared(undefined); }} />}</Field>
          <button type="button" onClick={review}>{t('policy.pay.review')}</button>
          {prepared !== undefined && (
            <>
              <dl className="kv" aria-label={t('policy.pay.reviewAria')}>
                <dt>{t('policy.pay.method')}</dt><dd><Mono>{prepared.built.method}</Mono></dd>
                <dt>{t('policy.pay.freshAccount')}</dt><dd><Mono>{prepared.payment.accountAddress}</Mono></dd>
                <dt>{t('policy.pay.router')}</dt><dd><Mono>{prepared.built.tx.to}</Mono></dd>
                <dt>{t('policy.pay.fee')}</dt><dd>{prepared.built.fee.toString()}</dd>
                <dt>{t('policy.pay.payeeReceives')}</dt><dd>{prepared.built.net.toString()}</dd>
                {prepared.approval !== undefined && (<><dt>{t('policy.pay.approvalFirst')}</dt><dd>{t('policy.pay.approveFor', { amount: amount.trim() })}</dd></>)}
              </dl>
              {wallet === undefined ? <Notice kind="info">{t('policy.pay.connectToSend')}</Notice> : (
                <button type="button" disabled={busy} onClick={() => { void send(); }}>{t('policy.pay.send')}</button>
              )}
            </>
          )}
          {status !== undefined && <p role="status">{status}</p>}
          {broadcast.length > 0 && (
            <div aria-label={t('policy.pay.broadcastAria')}>
              <p>{t('policy.pay.keepHashes')}</p>
              <ul className="plain">{broadcast.map((h, i) => <li key={`${h}-${String(i)}`}><Mono>{h}</Mono></li>)}</ul>
            </div>
          )}
          {msg !== undefined && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </>
      )}
    </section>
  );
}
