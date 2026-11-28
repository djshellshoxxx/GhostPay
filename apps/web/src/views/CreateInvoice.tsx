import { ControlTip } from '../components/ControlTips';
import { InvoiceMetadataChoice, DownloadInvoiceLink } from '../components/InvoiceSharing';
import { ManifestBanner } from '../components/ManifestBanner';
import { usePresentationGeneration } from '../components/SessionPresentationBoundary';
import { findChain, findToken, isQuoteAvailable } from '@ghostpay/chain-adapters';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { BufferPolicy, Invoice } from '@ghostpay/invoice-schema';
import { CopyButton, Field, Notice } from '../components/Common';
import { MetadataRetentionControls } from '../components/MetadataRetentionControls';
import { useManifest } from '../components/Disclosure';
import { QrFrame } from '../components/QrFrame';
import { PaymentRequestDownload } from '../components/PaymentRequestDownload';
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
import { useInvoicePreviewRetention } from '../lib/useInvoicePreviewRetention';
import { emptyItem, shownTerms, type BufferMode, type DraftForm, type FeePolicy } from '../lib/invoiceDraft';
import { useInvoiceDraft, type InvoiceDraftStatus } from '../lib/useInvoiceDraft';
import { useApp } from '../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

/** Fiat pricing needs a verified Chainlink feed for the exact chain, token and currency (G-03); fail closed otherwise. */
function fiatQuoteAvailable(chainId: number, token: string, currency: string): boolean {
  const symbol = token === 'native' ? findChain(chainId)?.nativeSymbol : findToken(chainId, token)?.symbol;
  return symbol !== undefined && isQuoteAvailable(chainId, symbol, currency.trim().toUpperCase());
}

const MAX_UINT256 = 2n ** 256n - 1n;
/** Native coins on supported chains use 18 decimals. */
const NATIVE_DECIMALS = 18;
/** The payer safety cap as rendered in the buffer hint and cap error, derived so the copy cannot drift from what pay.ts enforces. */
const BUFFER_CAP_VALUES = { capWei: MAX_BUFFER_WEI.toString(), capNative: formatUnits(MAX_BUFFER_WEI, NATIVE_DECIMALS) } as const;
const DRAFT_MESSAGES = {
  saving: 'create.draft.saving', saved: 'create.draft.saved', saveFailed: 'create.draft.saveFailed',
  openFailed: 'create.draft.openFailed', removeFailed: 'create.draft.removeFailed',
} as const satisfies Partial<Record<InvoiceDraftStatus, string>>;

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
  const presentation = usePresentationGeneration();
  const { session } = useApp();
  const [owner, setOwner] = useState({ session, generation: 0 });
  // Invoice drafts and retention choices belong to one loaded seller and presentation interval.
  if (owner.session !== session) setOwner({ session, generation: owner.generation + 1 });
  return <InvoiceForm key={`${owner.generation}:${presentation}`} supportedOnly={supportedOnly} />;
}

function InvoiceForm({ supportedOnly }: { readonly supportedOnly: boolean }): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const services = useServices();
  // Editable form values. They live in this keyed form only, so lock, idle and seller replacement drop them; an opt-in
  // encrypted copy for this tab is kept only while the seller asks for one (useInvoiceDraft).
  const draftForm: DraftForm = { supportedOnly, quoteAvailable: (d) => fiatQuoteAvailable(d.chainId, d.token, d.currency) };
  const editor = useInvoiceDraft(app.session, services.chains[0]?.chainId ?? 84532, services.chains.map((c) => c.chainId),
    draftForm);
  const { draft, change } = editor;
  const { chainId, token, currency, items, taxRate, feePolicy, tokenAmount, expiryHours, quoteMinutes,
    slippage, minimalMetadata, memo, bufferMin, bufferMax, encrypt, protectWithPassphrase } = draft;
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
  // Ignore callbacks from superseded invoice submissions, including older failures.
  const submissionRun = useRef(0);
  const manifest = useManifest(chainId);
  // Each profile lifetime has its own identity, including full -> lean -> full.
  const creationScope = useMemo(() => ({ supportedOnly }), [supportedOnly]);
  const currentCreationScope = useRef(creationScope); currentCreationScope.current = creationScope;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // #287 item 4: only the generated result shown here is enrolled. A confirmed cleanup or an opted-in expiry closes it;
  // links already shared stay valid, and the invoice, its registration and every saved record are untouched.
  // An expiry happens without user action, so it is announced; a confirmed cleanup reports through its own control.
  const [previewExpired, setPreviewExpired] = useState(false);
  useInvoicePreviewRetention(created, (reason) => {
    setCreated((current) => current === created ? undefined : current);
    setPreviewExpired(reason === 'expired');
  });

  if (app.session === undefined) {
    return (
      <section aria-labelledby="inv-h">
        <h2 id="inv-h">{t('create.title')}</h2>
        <Notice kind="info">{t('create.needKeys')}</Notice>
        <ControlTip message="home.seller.body"><button type="button" className="btn btn-primary" onClick={() => { app.setView('seller'); }}>
          {t('create.goSeller')}
        </button></ControlTip>
      </section>
    );
  }

  if (editor.status === 'available') {
    return (
      <section aria-labelledby="inv-h">
        <h2 id="inv-h">{t('create.title')}</h2>
        <p>{t('create.draft.available')}</p>
        <div className="actions">
          <ControlTip message="tips.resumeDraft"><button type="button" className="btn btn-primary" onClick={editor.resume}>{t('create.draft.resume')}</button></ControlTip>
          <ControlTip message="tips.deleteDraft"><button type="button" className="btn" onClick={editor.remove}>{t('create.draft.remove')}</button></ControlTip>
        </div>
      </section>
    );
  }
  if (editor.status === 'opening') return <ControlTip message="tips.draftStatus"><p role="status">{t('create.draft.opening')}</p></ControlTip>;

  const choices = tokenChoices(chainId);
  const FIAT_QUOTE_AVAILABLE = fiatQuoteAvailable(chainId, token, currency);
  // The terms shown and submitted, which are also what a saved draft may carry: retained full-profile state or a lost
  // feed never keeps fiat mode in this build, and the native coin never carries a gas-buffer policy (ADR-0024).
  const { amountMode: effectiveAmountMode, bufferMode: effectiveBufferMode } = shownTerms(draft, draftForm);
  const bufferChoicesAvailable = token !== 'native';
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
    const run = ++submissionRun.current;
    const submitted = draft;
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
      minimalMetadata,
      encrypt,
      ...(protectWithPassphrase ? { passphrase } : {}),
      ...(bufferPolicy === undefined ? {} : { bufferPolicy }),
    };
    const scope = creationScope;
    const current = (): boolean => mounted.current && currentCreationScope.current === scope && submissionRun.current === run;
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
        editor.finish(submitted);
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
    change({ items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  };

  return (
    <section aria-labelledby="inv-h">
      <h2 id="inv-h">{t('create.title')}</h2>
      <div className="panel">
        <p>{t('create.draft.hint')}</p>
        {editor.status === 'off'
          ? <ControlTip message="create.draft.hint"><button type="button" className="btn" onClick={editor.save}>{t('create.draft.keep')}</button></ControlTip>
          : <ControlTip message="tips.deleteDraft"><button type="button" className="btn" onClick={editor.remove}>{t('create.draft.remove')}</button></ControlTip>}
        {editor.status !== 'off' && <ControlTip message="tips.draftStatus"><p role="status">{t(DRAFT_MESSAGES[editor.status])}</p></ControlTip>}
      </div>
      <form onSubmit={onSubmit} className="stack" noValidate>
        <fieldset>
          <legend>{t('create.where.legend')}</legend>
          <Field label={t('create.chain')}>
            {(id) => (
              <ControlTip message="tips.invoiceNetwork"><select
                id={id}
                value={chainId}
                onChange={(e) => {
                  change({ chainId: Number(e.target.value), token: 'native' });
                }}
              >
                {services.chains.map((c) => (
                  <option key={c.chainId} value={c.chainId}>
                    {c.name}
                  </option>
                ))}
              </select></ControlTip>
            )}
          </Field>
          <ManifestBanner manifest={manifest} />
          {manifest?.status !== 'loaded' && manifest !== undefined && (
            <Notice kind="warn">{t('create.noManifest')}</Notice>
          )}
          <Field label={t('create.token')}>
            {(id) => (
              <ControlTip message="tips.invoiceAsset"><select id={id} value={token} onChange={(e) => { change({ token: e.target.value }); }}>
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select></ControlTip>
            )}
          </Field>
        </fieldset>

        <fieldset>
          <legend>{t('create.amount.legend')}</legend>
          <Field label={t('create.pricing')}>
            {(id) => (
              <ControlTip message="tips.pricing"><select id={id} value={effectiveAmountMode} onChange={(e) => { change({ amountMode: !supportedOnly && FIAT_QUOTE_AVAILABLE && e.target.value === 'fiat_quote' ? 'fiat_quote' : 'fixed_token' }); }}>
                <option value="fixed_token">{t('create.pricing.fixed')}</option>
                {!supportedOnly && <option value="fiat_quote" disabled={!FIAT_QUOTE_AVAILABLE}>
                  {FIAT_QUOTE_AVAILABLE ? t('create.pricing.fiat') : t('create.pricing.fiatUnavailable')}
                </option>}
              </select></ControlTip>
            )}
          </Field>
          {effectiveAmountMode === 'fixed_token' ? (
            <Field label={t('create.tokenAmount')} hint={t('create.tokenAmount.hint')}>
              {(id, d) => <ControlTip message="create.tokenAmount.hint"><input id={id} aria-describedby={d} inputMode="decimal" value={tokenAmount} onChange={(e) => { change({ tokenAmount: e.target.value }); }} /></ControlTip>}
            </Field>
          ) : (
            <Notice kind="info">
              {t('create.fiatNotice')}
            </Notice>
          )}
          <Field label={t('create.currency')}>{(id) => <ControlTip message="tips.currency"><input id={id} maxLength={3} value={currency} onChange={(e) => { change({ currency: e.target.value }); }} /></ControlTip>}</Field>
          <Field label={t('create.feePolicy')}>
            {(id) => (
              <ControlTip message="tips.feePayer"><select id={id} value={feePolicy} onChange={(e) => { change({ feePolicy: e.target.value as FeePolicy }); }}>
                <option value="seller_pays">{t('create.feePolicy.seller')}</option>
                <option value="payer_pays">{t('create.feePolicy.payer')}</option>
              </select></ControlTip>
            )}
          </Field>
        </fieldset>

        <fieldset>
          <legend>{t('create.items.legend')}</legend>
          <InvoiceMetadataChoice minimal={minimalMetadata} onChange={(minimal) => {
            submissionRun.current++;
            registrationRun.current++;
            setCreated(undefined);
            setRegistration(undefined);
            setError(undefined);
            change({ minimalMetadata: minimal });
          }} />
          {items.map((it, i) => (
            <div className="row" key={i}>
              {!minimalMetadata && <Field label={t('create.item.description', { n: String(i + 1) })}>{(id) => <ControlTip message="tips.itemText"><input id={id} value={it.description} maxLength={200} onChange={(e) => { setItem(i, { description: e.target.value }); }} /></ControlTip>}</Field>}
              <Field label={t('create.item.quantity', { n: String(i + 1) })}>{(id) => <ControlTip message="tips.quantity"><input id={id} inputMode="numeric" value={it.quantity} onChange={(e) => { setItem(i, { quantity: e.target.value }); }} /></ControlTip>}</Field>
              <Field label={t('create.item.unitPrice', { n: String(i + 1) })}>{(id) => <ControlTip message="tips.price"><input id={id} inputMode="decimal" value={it.unitPrice} onChange={(e) => { setItem(i, { unitPrice: e.target.value }); }} /></ControlTip>}</Field>
              {items.length > 1 && (
                <ControlTip message="tips.removeItem"><button type="button" className="btn" onClick={() => { change({ items: items.filter((_, idx) => idx !== i) }); }}>
                  {t('create.item.remove', { n: String(i + 1) })}
                </button></ControlTip>
              )}
            </div>
          ))}
          <ControlTip message="tips.addItem"><button type="button" className="btn" onClick={() => { change({ items: [...items, { ...emptyItem }] }); }} disabled={items.length >= 50}>
            {t('create.item.add')}
          </button></ControlTip>
          <Field label={t('create.taxRate')}>{(id) => <ControlTip message="tips.tax"><input id={id} inputMode="decimal" value={taxRate} onChange={(e) => { change({ taxRate: e.target.value }); }} /></ControlTip>}</Field>
        </fieldset>

        <fieldset>
          <legend>{t('create.validity.legend')}</legend>
          <Field label={t('create.expiryHours')}>{(id) => <ControlTip message="tips.expiry"><input id={id} type="number" min={1} max={2160} value={expiryHours} onChange={(e) => { change({ expiryHours: Number(e.target.value) }); }} /></ControlTip>}</Field>
          <Field label={t('create.quoteMinutes')}>{(id) => <ControlTip message="tips.quoteExpiry"><input id={id} type="number" min={1} max={1440} value={quoteMinutes} onChange={(e) => { change({ quoteMinutes: Number(e.target.value) }); }} /></ControlTip>}</Field>
          <Field label={t('create.slippage')}>{(id) => <ControlTip message="tips.slippage"><input id={id} type="number" min={0} max={10000} value={slippage} onChange={(e) => { change({ slippage: Number(e.target.value) }); }} /></ControlTip>}</Field>
          {!supportedOnly && (
            <>
              <Field label={t('create.buffer.label')} hint={t('create.buffer.hint', BUFFER_CAP_VALUES)}>
                {(id, d) => (
                  <ControlTip message="create.buffer.v2Notice"><select id={id} aria-describedby={d} value={effectiveBufferMode} onChange={(e) => { change({ bufferMode: e.target.value as BufferMode }); }}>
                    <option value="off">{t('create.buffer.off')}</option>
                    <option value="declined" disabled={!bufferChoicesAvailable}>{t('create.buffer.declined')}</option>
                    <option value="range" disabled={!bufferChoicesAvailable}>{t('create.buffer.range')}</option>
                  </select></ControlTip>
                )}
              </Field>
              {!bufferChoicesAvailable && <Notice kind="info">{t('create.buffer.nativeHint')}</Notice>}
              {effectiveBufferMode === 'range' && (
                <>
                  <Field label={t('create.buffer.min')}>{(id) => <ControlTip message="create.buffer.error.min"><input id={id} inputMode="numeric" autoComplete="off" value={bufferMin} onChange={(e) => { change({ bufferMin: e.target.value }); }} /></ControlTip>}</Field>
                  <Field label={t('create.buffer.max')}>{(id) => <ControlTip message="create.buffer.error.max"><input id={id} inputMode="numeric" autoComplete="off" value={bufferMax} onChange={(e) => { change({ bufferMax: e.target.value }); }} /></ControlTip>}</Field>
                </>
              )}
              <Notice kind="info">{t('create.buffer.v2Notice')}</Notice>
            </>
          )}
          {!minimalMetadata && <Field label={t('create.memo')}>{(id) => <ControlTip message="tips.memo"><textarea id={id} rows={2} maxLength={500} value={memo} onChange={(e) => { change({ memo: e.target.value }); }} /></ControlTip>}</Field>}
          <div className="check">
            <ControlTip message="create.encrypt.hint"><input id="enc" type="checkbox" checked={encrypt} disabled={protectWithPassphrase} onChange={(e) => { change({ encrypt: e.target.checked }); }} /></ControlTip>
            <label htmlFor="enc">{minimalMetadata ? t('create.metadata.bearer') : t('create.encrypt')}</label>
          </div>
          <p className="hint">{minimalMetadata ? t('create.metadata.bearerHint') : t('create.encrypt.hint')}</p>
          <div className="check">
            <ControlTip message="create.bearer.passphrase"><input id="passphrase-protect" type="checkbox" checked={protectWithPassphrase} onChange={(e) => { change({ protectWithPassphrase: e.target.checked }); }} /></ControlTip>
            <label htmlFor="passphrase-protect">{t('create.passphrase.protect')}</label>
          </div>
          {protectWithPassphrase && (
            <>
              <Field
                label={t('create.passphrase.label')}
                hint={`${passphrase !== '' && passphrase === suggested ? t('create.passphrase.hintSuggested', { words: GENERATED_PASSPHRASE_WORDS, bits: GENERATED_PASSPHRASE_BITS }) : t('create.passphrase.hintPlain')} ${t('create.passphrase.hintSend')}`}
              >
                {(id, d) => <ControlTip message="create.passphrase.hintSend"><input id={id} aria-describedby={d} type={passphrase !== '' && passphrase === suggested ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={passphrase} onChange={(e) => { setPassphrase(e.target.value); }} /></ControlTip>}
              </Field>
              <p><ControlTip message="tips.suggest"><button type="button" className="btn" onClick={() => { const next = generatePassphrase(); setSuggested(next); setPassphrase(next); setPassphraseAgain(''); }}>{t('create.passphrase.another')}</button></ControlTip></p>
              <Field label={t('create.passphrase.repeat')}>
                {(id) => <ControlTip message="tips.repeat"><input id={id} type="password" autoComplete="off" value={passphraseAgain} onChange={(e) => { setPassphraseAgain(e.target.value); }} /></ControlTip>}
              </Field>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>{t('create.matching.legend')}</legend>
          <div className="check">
            <ControlTip message="help.merchantRegistration"><input id="register-matching" aria-describedby="register-matching-help" type="checkbox" checked={registerForMatching} onChange={(e) => { setRegisterForMatching(e.target.checked); }} /></ControlTip>
            <label htmlFor="register-matching">{t('create.matching.label')}</label>
          </div>
          <p className="hint">{t('create.matching.hint')}</p>
          <ContextHelp id="register-matching-help" label={t('help.about', { control: t('create.matching.label') })}>{t('help.merchantRegistration')}</ContextHelp>
        </fieldset>

        <Notice kind="warn">{t('ledger.late.beforeCreate')}</Notice>
        <ControlTip message="tips.createInvoice"><button type="submit" className="btn btn-primary">{t('create.submit')}</button></ControlTip>
      </form>

      {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}

      {visibleCreated !== undefined && (
        <div className="result">
          <h3>{t('create.result.title')}</h3>
          <p>{t('reuse.invoiceMeta')}</p>
          <Notice kind="warn" title={t('create.bearer.title')}>
            {t('create.bearer.lead')} {visibleCreated.passphraseProtected ? t('create.bearer.passphrase') : visibleCreated.encrypted ? t('create.bearer.encrypted') : t('create.bearer.plain')} {t('create.bearer.copies')}
          </Notice>
          {registration?.kind === 'busy' && <Notice kind="info">{t('create.registration.busy')}</Notice>}
          {registration?.kind === 'ok' && <Notice kind="ok">{t('create.registration.ok')}</Notice>}
          {registration?.kind === 'error' && <Notice kind="warn">{t('create.registration.error', { message: displayMessage(registration.message, t) })}</Notice>}
          <Field label={t('create.link.label')}>{(id) => <ControlTip message="create.bearer.lead"><textarea id={id} readOnly rows={4} className="mono" value={visibleCreated.link} onFocus={(e) => { e.currentTarget.select(); }} /></ControlTip>}</Field>
          <p><CopyButton text={visibleCreated.link} label={t('create.link.copy')} autoClearAfterMs={app.settings.invoiceLinkClipboardDelaySec * 1_000} /></p>
          <DownloadInvoiceLink link={visibleCreated.link} />
          <PaymentRequestDownload fragment={visibleCreated.fragment} />
          {linkParts !== undefined && <p className="hint">{t('create.qr.multipartNote', { total: linkParts.length })}</p>}
          <QrFrame
            kind={visibleCreated.encrypted && !visibleCreated.passphraseProtected ? 'bearer' : 'shareable'}
            text={visibleCreated.link}
            caption={t('create.qr.caption')}
            {...(linkParts === undefined ? {} : { chunks: linkParts })}
          />
        </div>
      )}
      <ControlTip message="tips.previewStatus"><div aria-live="polite">
        {previewExpired && visibleCreated === undefined && <Notice kind="info">{t('retention.expired')}</Notice>}
      </div></ControlTip>
      {/* Outside the result, so focus and the outcome message survive the cleanup it performs. */}
      <MetadataRetentionControls />
    </section>
  );
}

function linkPartsFor(link: string): readonly string[] | undefined {
  try { return multipartIfNeeded(link); } catch { return undefined; }
}
