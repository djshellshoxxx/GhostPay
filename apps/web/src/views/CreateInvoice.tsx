import { ManifestBanner } from '../components/ManifestBanner';
import { findChain, findToken, isQuoteAvailable } from '@ghostpay/chain-adapters';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { BufferPolicy, Invoice } from '@ghostpay/invoice-schema';
import { CopyButton, Field, Notice } from '../components/Common';
import { useManifest } from '../components/Disclosure';
import { QrFrame } from '../components/QrFrame';
import { ContextHelp } from '../components/ContextHelp';
import { displayMessage, captureUserMessage, type DisplayMessage } from '../lib/errors';
import { formatUnits } from '../lib/format';
import { MAX_BUFFER_WEI } from '../lib/pay';
import { multipartIfNeeded } from '../lib/qrMultipart';
import { buildInvoiceLink, tokenChoices, type CreatedInvoice, type InvoiceForm, type LineItemInput } from '../lib/invoiceCreate';
import { GENERATED_PASSPHRASE_BITS, GENERATED_PASSPHRASE_WORDS, generatePassphrase } from '../lib/keystore';
import { registrationFromInvoice } from '../lib/reconciliationMatch';
import { createCurrentReconciliationVault } from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { useServices } from '../lib/services';
import { useApp } from '../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

/** Fiat pricing needs a verified Chainlink feed for the exact chain, token and currency (G-03); fail closed otherwise. */
function fiatQuoteAvailable(chainId: number, token: string, currency: string): boolean {
  const symbol = token === 'native' ? findChain(chainId)?.nativeSymbol : findToken(chainId, token)?.symbol;
  return symbol !== undefined && isQuoteAvailable(chainId, symbol, currency.trim().toUpperCase());
}

const EMPTY_ITEM: LineItemInput = { description: '', quantity: '1', unitPrice: '' };

const MAX_UINT256 = 2n ** 256n - 1n;
/** Native coins on supported chains use 18 decimals. */
const NATIVE_DECIMALS = 18;
/** The payer safety cap as rendered in the buffer hint and cap error, derived so the copy cannot drift from what pay.ts enforces. */
const BUFFER_CAP_VALUES = { capWei: MAX_BUFFER_WEI.toString(), capNative: formatUnits(MAX_BUFFER_WEI, NATIVE_DECIMALS) } as const;
type BufferMode = 'off' | 'declined' | 'range';

/** Canonical positive decimal wei: ASCII digits only, no sign, padding, exponent or leading zero; at most 2^256-1. */
function parseWei(raw: string): bigint | undefined {
  if (!/^[1-9][0-9]*$/.test(raw)) return undefined;
  const n = BigInt(raw);
  return n <= MAX_UINT256 ? n : undefined;
}

function supportsInvoice(invoice: Invoice, supportedOnly: boolean): boolean {
  return !supportedOnly || (invoice.v === 1 && invoice.amountPolicy.mode === 'fixed_token');
}

export function CreateInvoice({ supportedOnly = false }: { readonly supportedOnly?: boolean } = {}): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const services = useServices();
  const [chainId, setChainId] = useState<number>(services.chains[0]?.chainId ?? 84532);
  const [token, setToken] = useState('native');
  const [currency, setCurrency] = useState('USD');
  const [items, setItems] = useState<LineItemInput[]>([{ ...EMPTY_ITEM }]);
  const [taxRate, setTaxRate] = useState('0');
  const [feePolicy, setFeePolicy] = useState<'payer_pays' | 'seller_pays'>('seller_pays');
  const [amountMode, setAmountMode] = useState<'fiat_quote' | 'fixed_token'>('fixed_token');
  const [tokenAmount, setTokenAmount] = useState('');
  const [expiryHours, setExpiryHours] = useState(24);
  const [quoteMinutes, setQuoteMinutes] = useState(15);
  const [slippage, setSlippage] = useState(50);
  const [memo, setMemo] = useState('');
  const [bufferMode, setBufferMode] = useState<BufferMode>('off');
  const [bufferMin, setBufferMin] = useState('');
  const [bufferMax, setBufferMax] = useState('');
  const [encrypt, setEncrypt] = useState(false);
  const [protectWithPassphrase, setProtectWithPassphrase] = useState(false);
  // The invoice passphrase starts as a generated suggestion (L1-06), shown in clear only while untouched.
  const [suggested, setSuggested] = useState(generatePassphrase);
  const [passphrase, setPassphrase] = useState(suggested);
  const [passphraseAgain, setPassphraseAgain] = useState('');
  const [error, setError] = useState<DisplayMessage | undefined>(undefined);
  const [created, setCreated] = useState<CreatedInvoice | undefined>(undefined);
  // Opt-in, off by default: keeps minimized invoice fields in the encrypted reconciliation vault for local matching.
  const [registerForMatching, setRegisterForMatching] = useState(false);
  const [registration, setRegistration] = useState<{ readonly kind: 'busy' | 'ok' } | { readonly kind: 'error'; readonly message: DisplayMessage } | undefined>(undefined);
  const registrationRun = useRef(0);
  const manifest = useManifest(chainId);
  // Each profile lifetime has its own identity, including full -> lean -> full.
  const creationScope = useMemo(() => ({ supportedOnly }), [supportedOnly]);
  const currentCreationScope = useRef(creationScope); currentCreationScope.current = creationScope;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  if (app.session === undefined) {
    return (
      <section aria-labelledby="inv-h">
        <h2 id="inv-h">{t('create.title')}</h2>
        <Notice kind="info">{t('create.needKeys')}</Notice>
        <button type="button" className="btn btn-primary" onClick={() => { app.setView('seller'); }}>
          {t('create.goSeller')}
        </button>
      </section>
    );
  }

  const choices = tokenChoices(chainId);
  const FIAT_QUOTE_AVAILABLE = fiatQuoteAvailable(chainId, token, currency);
  // Retained full-profile state or a lost feed must never keep fiat mode in this build.
  const effectiveAmountMode = !supportedOnly && FIAT_QUOTE_AVAILABLE ? amountMode : 'fixed_token';
  // Payers never offer gas buffers on native-coin invoices, so any policy there (even "declined") would only make the
  // invoice v2 and unpayable on lean builds for no benefit (ADR-0024). The native coin therefore always means no policy.
  const bufferChoicesAvailable = token !== 'native';
  const effectiveBufferMode: BufferMode = bufferChoicesAvailable ? bufferMode : 'off';
  const visibleCreated = created !== undefined && supportsInvoice(created.invoice, supportedOnly) ? created : undefined;
  // A link too long for one QR is offered as GhostPay multi-part codes; otherwise one code that any camera app opens.
  // (Not a hook: this follows an early return. Splitting is local and cheap.)
  const linkParts = visibleCreated === undefined ? undefined : linkPartsFor(visibleCreated.link);

  const registerCreated = (invoice: Invoice): void => {
    const run = ++registrationRun.current;
    // The view renders this form only with a session (early return above).
    const session = app.session!;
    if (!registerForMatching) {
      setRegistration(undefined);
      return;
    }
    setRegistration({ kind: 'busy' });
    void (async () => {
      const entry = registrationFromInvoice(invoice);
      const vault = await createCurrentReconciliationVault(invoice.chainId, checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey));
      try {
        await vault.registerInvoice(entry);
      } finally {
        vault.lock();
      }
    })().then(
      () => { if (registrationRun.current === run) setRegistration({ kind: 'ok' }); },
      (err: unknown) => { if (registrationRun.current === run) setRegistration({ kind: 'error', message: captureUserMessage(err) }); },
    );
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setError(undefined);
    if (protectWithPassphrase && passphrase !== passphraseAgain) {
      setError(t('create.error.passphraseMismatch'));
      return;
    }
    // v2 invoices are rejected by lean builds, so the policy is only ever produced by the full profile (ADR-0024).
    let bufferPolicy: BufferPolicy | undefined;
    if (!supportedOnly && effectiveBufferMode === 'declined') {
      bufferPolicy = { accepted: false, maxWei: '0', minWei: '0', refund: 'none' };
    } else if (!supportedOnly && effectiveBufferMode === 'range') {
      const min = parseWei(bufferMin);
      const max = parseWei(bufferMax);
      if (min === undefined) { setError(t('create.buffer.error.min')); return; }
      if (max === undefined) { setError(t('create.buffer.error.max')); return; }
      if (max < min) { setError(t('create.buffer.error.order')); return; }
      if (min > MAX_BUFFER_WEI) { setError(t('create.buffer.error.cap', BUFFER_CAP_VALUES)); return; }
      bufferPolicy = { accepted: true, maxWei: max.toString(), minWei: min.toString(), refund: 'none' };
    }
    const form: InvoiceForm = {
      chainId,
      token,
      currency: currency.trim().toUpperCase(),
      lineItems: items,
      taxRatePercent: taxRate,
      feePolicy,
      amountMode: effectiveAmountMode,
      tokenAmount,
      expiryHours,
      quoteTtlMinutes: quoteMinutes,
      maxSlippageBps: slippage,
      memo,
      encrypt,
      ...(protectWithPassphrase ? { passphrase } : {}),
      ...(bufferPolicy === undefined ? {} : { bufferPolicy }),
    };
    const scope = creationScope;
    const current = (): boolean => mounted.current && currentCreationScope.current === scope;
    buildInvoiceLink(form, services.baseUrl(), Math.floor(services.nowMs() / 1000)).then(
      (c) => {
        if (!current()) return;
        if (!supportsInvoice(c.invoice, supportedOnly)) {
          setCreated(undefined);
          registrationRun.current++;
          setRegistration(undefined);
          setError(t('create.error.unsupported'));
          return;
        }
        setCreated(c);
        registerCreated(c.invoice);
        setPassphrase('');
        setPassphraseAgain('');
        app.announce(t('create.announce.created'));
      },
      (err: unknown) => {
        if (!current()) return;
        setCreated(undefined);
        registrationRun.current++;
        setRegistration(undefined);
        setError(captureUserMessage(err));
      },
    );
  };

  const setItem = (i: number, patch: Partial<LineItemInput>): void => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  return (
    <section aria-labelledby="inv-h">
      <h2 id="inv-h">{t('create.title')}</h2>
      <form onSubmit={onSubmit} className="stack" noValidate>
        <fieldset>
          <legend>{t('create.where.legend')}</legend>
          <Field label={t('create.chain')}>
            {(id) => (
              <select
                id={id}
                value={chainId}
                onChange={(e) => {
                  setChainId(Number(e.target.value));
                  setToken('native');
                }}
              >
                {services.chains.map((c) => (
                  <option key={c.chainId} value={c.chainId}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <ManifestBanner manifest={manifest} />
          {manifest?.status !== 'loaded' && manifest !== undefined && (
            <Notice kind="warn">{t('create.noManifest')}</Notice>
          )}
          <Field label={t('create.token')}>
            {(id) => (
              <select id={id} value={token} onChange={(e) => { setToken(e.target.value); }}>
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </fieldset>

        <fieldset>
          <legend>{t('create.amount.legend')}</legend>
          <Field label={t('create.pricing')}>
            {(id) => (
              <select id={id} value={effectiveAmountMode} onChange={(e) => { setAmountMode(!supportedOnly && FIAT_QUOTE_AVAILABLE && e.target.value === 'fiat_quote' ? 'fiat_quote' : 'fixed_token'); }}>
                <option value="fixed_token">{t('create.pricing.fixed')}</option>
                {!supportedOnly && <option value="fiat_quote" disabled={!FIAT_QUOTE_AVAILABLE}>
                  {FIAT_QUOTE_AVAILABLE ? t('create.pricing.fiat') : t('create.pricing.fiatUnavailable')}
                </option>}
              </select>
            )}
          </Field>
          {effectiveAmountMode === 'fixed_token' ? (
            <Field label={t('create.tokenAmount')} hint={t('create.tokenAmount.hint')}>
              {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={tokenAmount} onChange={(e) => { setTokenAmount(e.target.value); }} />}
            </Field>
          ) : (
            <Notice kind="info">
              {t('create.fiatNotice')}
            </Notice>
          )}
          <Field label={t('create.currency')}>{(id) => <input id={id} maxLength={3} value={currency} onChange={(e) => { setCurrency(e.target.value); }} />}</Field>
          <Field label={t('create.feePolicy')}>
            {(id) => (
              <select id={id} value={feePolicy} onChange={(e) => { setFeePolicy(e.target.value as 'payer_pays' | 'seller_pays'); }}>
                <option value="seller_pays">{t('create.feePolicy.seller')}</option>
                <option value="payer_pays">{t('create.feePolicy.payer')}</option>
              </select>
            )}
          </Field>
        </fieldset>

        <fieldset>
          <legend>{t('create.items.legend')}</legend>
          {items.map((it, i) => (
            <div className="row" key={i}>
              <Field label={t('create.item.description', { n: String(i + 1) })}>{(id) => <input id={id} value={it.description} maxLength={200} onChange={(e) => { setItem(i, { description: e.target.value }); }} />}</Field>
              <Field label={t('create.item.quantity', { n: String(i + 1) })}>{(id) => <input id={id} inputMode="numeric" value={it.quantity} onChange={(e) => { setItem(i, { quantity: e.target.value }); }} />}</Field>
              <Field label={t('create.item.unitPrice', { n: String(i + 1) })}>{(id) => <input id={id} inputMode="decimal" value={it.unitPrice} onChange={(e) => { setItem(i, { unitPrice: e.target.value }); }} />}</Field>
              {items.length > 1 && (
                <button type="button" className="btn" onClick={() => { setItems((p) => p.filter((_, idx) => idx !== i)); }}>
                  {t('create.item.remove', { n: String(i + 1) })}
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn" onClick={() => { setItems((p) => [...p, { ...EMPTY_ITEM }]); }} disabled={items.length >= 50}>
            {t('create.item.add')}
          </button>
          <Field label={t('create.taxRate')}>{(id) => <input id={id} inputMode="decimal" value={taxRate} onChange={(e) => { setTaxRate(e.target.value); }} />}</Field>
        </fieldset>

        <fieldset>
          <legend>{t('create.validity.legend')}</legend>
          <Field label={t('create.expiryHours')}>{(id) => <input id={id} type="number" min={1} max={2160} value={expiryHours} onChange={(e) => { setExpiryHours(Number(e.target.value)); }} />}</Field>
          <Field label={t('create.quoteMinutes')}>{(id) => <input id={id} type="number" min={1} max={1440} value={quoteMinutes} onChange={(e) => { setQuoteMinutes(Number(e.target.value)); }} />}</Field>
          <Field label={t('create.slippage')}>{(id) => <input id={id} type="number" min={0} max={10000} value={slippage} onChange={(e) => { setSlippage(Number(e.target.value)); }} />}</Field>
          {!supportedOnly && (
            <>
              <Field label={t('create.buffer.label')} hint={t('create.buffer.hint', BUFFER_CAP_VALUES)}>
                {(id, d) => (
                  <select id={id} aria-describedby={d} value={effectiveBufferMode} onChange={(e) => { setBufferMode(e.target.value as BufferMode); }}>
                    <option value="off">{t('create.buffer.off')}</option>
                    <option value="declined" disabled={!bufferChoicesAvailable}>{t('create.buffer.declined')}</option>
                    <option value="range" disabled={!bufferChoicesAvailable}>{t('create.buffer.range')}</option>
                  </select>
                )}
              </Field>
              {!bufferChoicesAvailable && <Notice kind="info">{t('create.buffer.nativeHint')}</Notice>}
              {effectiveBufferMode === 'range' && (
                <>
                  <Field label={t('create.buffer.min')}>{(id) => <input id={id} inputMode="numeric" autoComplete="off" value={bufferMin} onChange={(e) => { setBufferMin(e.target.value); }} />}</Field>
                  <Field label={t('create.buffer.max')}>{(id) => <input id={id} inputMode="numeric" autoComplete="off" value={bufferMax} onChange={(e) => { setBufferMax(e.target.value); }} />}</Field>
                </>
              )}
              <Notice kind="info">{t('create.buffer.v2Notice')}</Notice>
            </>
          )}
          <Field label={t('create.memo')}>{(id) => <textarea id={id} rows={2} maxLength={500} value={memo} onChange={(e) => { setMemo(e.target.value); }} />}</Field>
          <div className="check">
            <input id="enc" type="checkbox" checked={encrypt} disabled={protectWithPassphrase} onChange={(e) => { setEncrypt(e.target.checked); }} />
            <label htmlFor="enc">{t('create.encrypt')}</label>
          </div>
          <p className="hint">{t('create.encrypt.hint')}</p>
          <div className="check">
            <input id="passphrase-protect" type="checkbox" checked={protectWithPassphrase} onChange={(e) => { setProtectWithPassphrase(e.target.checked); }} />
            <label htmlFor="passphrase-protect">{t('create.passphrase.protect')}</label>
          </div>
          {protectWithPassphrase && (
            <>
              <Field
                label={t('create.passphrase.label')}
                hint={`${passphrase !== '' && passphrase === suggested ? t('create.passphrase.hintSuggested', { words: GENERATED_PASSPHRASE_WORDS, bits: GENERATED_PASSPHRASE_BITS }) : t('create.passphrase.hintPlain')} ${t('create.passphrase.hintSend')}`}
              >
                {(id, d) => <input id={id} aria-describedby={d} type={passphrase !== '' && passphrase === suggested ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={passphrase} onChange={(e) => { setPassphrase(e.target.value); }} />}
              </Field>
              <p><button type="button" className="btn" onClick={() => { const next = generatePassphrase(); setSuggested(next); setPassphrase(next); setPassphraseAgain(''); }}>{t('create.passphrase.another')}</button></p>
              <Field label={t('create.passphrase.repeat')}>
                {(id) => <input id={id} type="password" autoComplete="off" value={passphraseAgain} onChange={(e) => { setPassphraseAgain(e.target.value); }} />}
              </Field>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>{t('create.matching.legend')}</legend>
          <div className="check">
            <input id="register-matching" aria-describedby="register-matching-help" type="checkbox" checked={registerForMatching} onChange={(e) => { setRegisterForMatching(e.target.checked); }} />
            <label htmlFor="register-matching">{t('create.matching.label')}</label>
          </div>
          <p className="hint">{t('create.matching.hint')}</p>
          <ContextHelp id="register-matching-help" label={t('help.about', { control: t('create.matching.label') })}>{t('help.merchantRegistration')}</ContextHelp>
        </fieldset>

        <button type="submit" className="btn btn-primary">{t('create.submit')}</button>
      </form>

      {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}

      {visibleCreated !== undefined && (
        <div className="result" aria-live="polite">
          <h3>{t('create.result.title')}</h3>
          <Notice kind="warn" title={t('create.bearer.title')}>
            {t('create.bearer.lead')} {visibleCreated.passphraseProtected ? t('create.bearer.passphrase') : visibleCreated.encrypted ? t('create.bearer.encrypted') : t('create.bearer.plain')} {t('create.bearer.copies')}
          </Notice>
          {registration?.kind === 'busy' && <Notice kind="info">{t('create.registration.busy')}</Notice>}
          {registration?.kind === 'ok' && <Notice kind="ok">{t('create.registration.ok')}</Notice>}
          {registration?.kind === 'error' && <Notice kind="warn">{t('create.registration.error', { message: displayMessage(registration.message, t) })}</Notice>}
          <Field label={t('create.link.label')}>{(id) => <textarea id={id} readOnly rows={4} className="mono" value={visibleCreated.link} onFocus={(e) => { e.currentTarget.select(); }} />}</Field>
          <p><CopyButton text={visibleCreated.link} label={t('create.link.copy')} /></p>
          {linkParts !== undefined && <p className="hint">{t('create.qr.multipartNote', { total: linkParts.length })}</p>}
          <QrFrame
            kind={visibleCreated.encrypted && !visibleCreated.passphraseProtected ? 'bearer' : 'shareable'}
            text={visibleCreated.link}
            caption={t('create.qr.caption')}
            {...(linkParts === undefined ? {} : { chunks: linkParts })}
          />
        </div>
      )}
    </section>
  );
}

function linkPartsFor(link: string): readonly string[] | undefined {
  try { return multipartIfNeeded(link); } catch { return undefined; }
}
