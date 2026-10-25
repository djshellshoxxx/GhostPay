import { ManifestBanner } from '../components/ManifestBanner';
import { FEEDS } from '@ghostpay/chain-adapters';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Invoice } from '@ghostpay/invoice-schema';
import { CopyButton, Field, Notice } from '../components/Common';
import { useManifest } from '../components/Disclosure';
import { QrFrame } from '../components/QrFrame';
import { userMessage } from '../lib/errors';
import { buildInvoiceLink, tokenChoices, type CreatedInvoice, type InvoiceForm, type LineItemInput } from '../lib/invoiceCreate';
import { registrationFromInvoice } from '../lib/reconciliationMatch';
import { createCurrentReconciliationVault } from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { useServices } from '../lib/services';
import { useApp } from '../state';

/** Fiat pricing needs a verified Chainlink feed (G-03). Hard-disabled until FEEDS is populated. */
const FIAT_QUOTE_AVAILABLE = FEEDS.length > 0;

const EMPTY_ITEM: LineItemInput = { description: '', quantity: '1', unitPrice: '' };

export function CreateInvoice(): ReactNode {
  const app = useApp();
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
  const [encrypt, setEncrypt] = useState(false);
  const [protectWithPassphrase, setProtectWithPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseAgain, setPassphraseAgain] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [created, setCreated] = useState<CreatedInvoice | undefined>(undefined);
  // Opt-in, off by default: keeps minimized invoice fields in the encrypted reconciliation vault for local matching.
  const [registerForMatching, setRegisterForMatching] = useState(false);
  const [registration, setRegistration] = useState<{ readonly kind: 'busy' | 'ok' } | { readonly kind: 'error'; readonly message: string } | undefined>(undefined);
  const registrationRun = useRef(0);
  const manifest = useManifest(chainId);

  if (app.session === undefined) {
    return (
      <section aria-labelledby="inv-h">
        <h2 id="inv-h">Create invoice</h2>
        <Notice kind="info">You need seller keys first.</Notice>
        <button type="button" className="btn btn-primary" onClick={() => { app.setView('seller'); }}>
          Go to Seller keys
        </button>
      </section>
    );
  }

  const choices = tokenChoices(chainId);

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
      (err: unknown) => { if (registrationRun.current === run) setRegistration({ kind: 'error', message: userMessage(err) }); },
    );
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setError(undefined);
    if (protectWithPassphrase && passphrase !== passphraseAgain) {
      setError('The passphrases do not match.');
      return;
    }
    const form: InvoiceForm = {
      chainId,
      token,
      currency: currency.trim().toUpperCase(),
      lineItems: items,
      taxRatePercent: taxRate,
      feePolicy,
      amountMode,
      tokenAmount,
      expiryHours,
      quoteTtlMinutes: quoteMinutes,
      maxSlippageBps: slippage,
      memo,
      encrypt,
      ...(protectWithPassphrase ? { passphrase } : {}),
    };
    buildInvoiceLink(form, services.baseUrl(), Math.floor(services.nowMs() / 1000)).then(
      (c) => {
        setCreated(c);
        registerCreated(c.invoice);
        setPassphrase('');
        setPassphraseAgain('');
        app.announce('Invoice link created.');
      },
      (err: unknown) => {
        setCreated(undefined);
        registrationRun.current++;
        setRegistration(undefined);
        setError(userMessage(err));
      },
    );
  };

  const setItem = (i: number, patch: Partial<LineItemInput>): void => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  return (
    <section aria-labelledby="inv-h">
      <h2 id="inv-h">Create invoice</h2>
      <form onSubmit={onSubmit} className="stack" noValidate>
        <fieldset>
          <legend>Where you are paid</legend>
          <Field label="Chain">
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
            <Notice kind="warn">Payments disabled on this chain: no deployment manifest is loaded. You can still create the invoice, but nobody can pay it from this app yet.</Notice>
          )}
          <Field label="Token">
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
          <legend>Amount</legend>
          <Field label="Pricing">
            {(id) => (
              <select id={id} value={amountMode} onChange={(e) => { setAmountMode(FIAT_QUOTE_AVAILABLE && e.target.value === 'fiat_quote' ? 'fiat_quote' : 'fixed_token'); }}>
                <option value="fixed_token">Fixed token amount</option>
                <option value="fiat_quote" disabled={!FIAT_QUOTE_AVAILABLE}>
                  {FIAT_QUOTE_AVAILABLE ? 'Fiat price, converted at payment time' : 'Fiat price (unavailable: no verified price feed)'}
                </option>
              </select>
            )}
          </Field>
          {amountMode === 'fixed_token' ? (
            <Field label="Token amount" hint="Decimal amount in the token's units, for example 25.50.">
              {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={tokenAmount} onChange={(e) => { setTokenAmount(e.target.value); }} />}
            </Field>
          ) : (
            <Notice kind="info">
              Payers convert the fiat total with a price feed at payment time. No feed is configured in this release, so such invoices cannot be paid from this app yet.
            </Notice>
          )}
          <Field label="Currency (ISO code)">{(id) => <input id={id} maxLength={3} value={currency} onChange={(e) => { setCurrency(e.target.value); }} />}</Field>
          <Field label="Who pays the 0.25 % checkout fee">
            {(id) => (
              <select id={id} value={feePolicy} onChange={(e) => { setFeePolicy(e.target.value as 'payer_pays' | 'seller_pays'); }}>
                <option value="seller_pays">Seller (deducted from the amount)</option>
                <option value="payer_pays">Payer (added on top)</option>
              </select>
            )}
          </Field>
        </fieldset>

        <fieldset>
          <legend>Line items</legend>
          {items.map((it, i) => (
            <div className="row" key={i}>
              <Field label={`Item ${String(i + 1)} description`}>{(id) => <input id={id} value={it.description} maxLength={200} onChange={(e) => { setItem(i, { description: e.target.value }); }} />}</Field>
              <Field label={`Item ${String(i + 1)} quantity`}>{(id) => <input id={id} inputMode="numeric" value={it.quantity} onChange={(e) => { setItem(i, { quantity: e.target.value }); }} />}</Field>
              <Field label={`Item ${String(i + 1)} unit price`}>{(id) => <input id={id} inputMode="decimal" value={it.unitPrice} onChange={(e) => { setItem(i, { unitPrice: e.target.value }); }} />}</Field>
              {items.length > 1 && (
                <button type="button" className="btn" onClick={() => { setItems((p) => p.filter((_, idx) => idx !== i)); }}>
                  Remove item {i + 1}
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn" onClick={() => { setItems((p) => [...p, { ...EMPTY_ITEM }]); }} disabled={items.length >= 50}>
            Add item
          </button>
          <Field label="Tax rate (%)">{(id) => <input id={id} inputMode="decimal" value={taxRate} onChange={(e) => { setTaxRate(e.target.value); }} />}</Field>
        </fieldset>

        <fieldset>
          <legend>Validity and notes</legend>
          <Field label="Invoice valid for (hours)">{(id) => <input id={id} type="number" min={1} max={2160} value={expiryHours} onChange={(e) => { setExpiryHours(Number(e.target.value)); }} />}</Field>
          <Field label="Price quote valid for (minutes)">{(id) => <input id={id} type="number" min={1} max={1440} value={quoteMinutes} onChange={(e) => { setQuoteMinutes(Number(e.target.value)); }} />}</Field>
          <Field label="Maximum slippage (basis points)">{(id) => <input id={id} type="number" min={0} max={10000} value={slippage} onChange={(e) => { setSlippage(Number(e.target.value)); }} />}</Field>
          <Field label="Memo (optional, shown to the payer)">{(id) => <textarea id={id} rows={2} maxLength={500} value={memo} onChange={(e) => { setMemo(e.target.value); }} />}</Field>
          <div className="check">
            <input id="enc" type="checkbox" checked={encrypt} disabled={protectWithPassphrase} onChange={(e) => { setEncrypt(e.target.checked); }} />
            <label htmlFor="enc">Encrypt line items and memo with a key included in the link</label>
          </div>
          <p className="hint">The decryption key is part of the link, so this only keeps details out of casual views. Use a passphrase below to keep the entire invoice encrypted.</p>
          <div className="check">
            <input id="passphrase-protect" type="checkbox" checked={protectWithPassphrase} onChange={(e) => { setProtectWithPassphrase(e.target.checked); }} />
            <label htmlFor="passphrase-protect">Protect the entire invoice with a passphrase</label>
          </div>
          {protectWithPassphrase && (
            <>
              <Field label="Invoice passphrase (at least 14 characters)" hint="Use several unrelated words. Send the passphrase to the payer through a different channel from the invoice link.">
                {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" value={passphrase} onChange={(e) => { setPassphrase(e.target.value); }} />}
              </Field>
              <Field label="Repeat invoice passphrase">
                {(id) => <input id={id} type="password" autoComplete="off" value={passphraseAgain} onChange={(e) => { setPassphraseAgain(e.target.value); }} />}
              </Field>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Local payment matching (optional)</legend>
          <div className="check">
            <input id="register-matching" type="checkbox" checked={registerForMatching} onChange={(e) => { setRegisterForMatching(e.target.checked); }} />
            <label htmlFor="register-matching">Register this invoice in my encrypted reconciliation vault for automatic local matching</label>
          </div>
          <p className="hint">Off by default. Only the invoice digest, nonce, chain, token, expected amount and validity window are stored, encrypted on this device with your viewing key; line items and memo are not. Matching happens on this device only: nothing about the invoice is added to the payment or its announcement. You can remove registrations in the Scan view.</p>
        </fieldset>

        <button type="submit" className="btn btn-primary">Create invoice link</button>
      </form>

      {error !== undefined && <Notice kind="error">{error}</Notice>}

      {created !== undefined && (
        <div className="result" aria-live="polite">
          <h3>Your invoice link</h3>
          <Notice kind="warn" title="Bearer link">
            Anyone who has this link or its QR code can pay it. {created.passphraseProtected ? 'The invoice contents are protected by a passphrase, which you must send separately; the passphrase cannot be recovered if lost.' : created.encrypted ? 'Anyone with the link can also read the invoice because its encryption key is inside the link.' : 'Anyone with the link can read the invoice.'} Phone photo backups, clipboards, chat previews and browser history may keep a copy. Do not post it publicly unless that is intended.
          </Notice>
          {registration?.kind === 'busy' && <Notice kind="info">Registering the invoice in your encrypted reconciliation vault…</Notice>}
          {registration?.kind === 'ok' && <Notice kind="ok">Invoice registered in your encrypted reconciliation vault for local matching.</Notice>}
          {registration?.kind === 'error' && <Notice kind="warn">The invoice link was created, but it could not be registered for local matching: {registration.message}</Notice>}
          <Field label="Link">{(id) => <textarea id={id} readOnly rows={4} className="mono" value={created.link} onFocus={(e) => { e.currentTarget.select(); }} />}</Field>
          <p><CopyButton text={created.link} label="Copy link" /></p>
          <QrFrame
            kind={created.encrypted && !created.passphraseProtected ? 'bearer' : 'shareable'}
            text={created.link}
            caption="QR code containing the invoice link"
          />
        </div>
      )}
    </section>
  );
}
