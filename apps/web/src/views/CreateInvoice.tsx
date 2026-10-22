import { ManifestBanner } from '../components/ManifestBanner';
import { FEEDS } from '@ghostpay/chain-adapters';
import { useState, type FormEvent, type ReactNode } from 'react';
import { CopyButton, Field, Notice } from '../components/Common';
import { useManifest } from '../components/Disclosure';
import { QrView } from '../components/QrView';
import { userMessage } from '../lib/errors';
import { buildInvoiceLink, tokenChoices, type CreatedInvoice, type InvoiceForm, type LineItemInput } from '../lib/invoiceCreate';
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
  const [error, setError] = useState<string | undefined>(undefined);
  const [created, setCreated] = useState<CreatedInvoice | undefined>(undefined);
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

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setError(undefined);
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
    };
    buildInvoiceLink(form, services.baseUrl(), Math.floor(services.nowMs() / 1000)).then(
      (c) => {
        setCreated(c);
        app.announce('Invoice link created.');
      },
      (err: unknown) => {
        setCreated(undefined);
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
            <input id="enc" type="checkbox" checked={encrypt} onChange={(e) => { setEncrypt(e.target.checked); }} />
            <label htmlFor="enc">Encrypt line items and memo inside the link</label>
          </div>
          <p className="hint">The decryption key is part of the link, so anyone holding the link can still read everything. Encryption only keeps the text out of casual views of the link.</p>
        </fieldset>

        <button type="submit" className="btn btn-primary">Create invoice link</button>
      </form>

      {error !== undefined && <Notice kind="error">{error}</Notice>}

      {created !== undefined && (
        <div className="result" aria-live="polite">
          <h3>Your invoice link</h3>
          <Notice kind="warn" title="Bearer link">
            Anyone who has this link or its QR code can read the invoice{created.encrypted ? ' (the encryption key is inside it)' : ''} and can pay it. Phone photo backups, clipboards, chat previews and browser history may keep a copy. Do not post it publicly unless that is intended.
          </Notice>
          <Field label="Link">{(id) => <textarea id={id} readOnly rows={4} className="mono" value={created.link} onFocus={(e) => { e.currentTarget.select(); }} />}</Field>
          <p><CopyButton text={created.link} label="Copy link" /></p>
          <QrView text={created.link} caption="QR code containing the invoice link" />
        </div>
      )}
    </section>
  );
}
