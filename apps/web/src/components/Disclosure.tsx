import { FEE_SCHEDULE } from '@ghostpay/chain-adapters';
import { useEffect, useState, type ReactNode } from 'react';
import type { MessageKey } from '../i18n/catalog';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { ManifestState } from '../lib/manifest';
import { useServices } from '../lib/services';
import { Mono } from './Common';
import { RichText } from './RichText';

const monoTags = { mono: (c: ReactNode): ReactNode => <bdi dir='ltr'><Mono>{c}</Mono></bdi>, strong: (c: ReactNode): ReactNode => <strong>{c}</strong> };

/** Loads the manifest state for one chain from the app origin. */
export function useManifest(chainId: number | undefined): ManifestState | undefined {
  const services = useServices();
  const [state, setState] = useState<{ chainId: number; value: ManifestState } | undefined>(undefined);
  useEffect(() => {
    if (chainId === undefined) return;
    let live = true;
    void services.loadManifest(chainId).then((value) => {
      if (live) setState({ chainId, value });
    });
    return () => {
      live = false;
    };
  }, [chainId, services]);
  return chainId !== undefined && state?.chainId === chainId ? state.value : undefined;
}

/** bps to a percent string without floating point, for example 25 -> `0.25`. */
export function bpsToPercent(bps: bigint): string {
  const whole = bps / 100n;
  const frac = (bps % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole.toString()}.${frac}`;
}

/**
 * Mandatory fee disclosure (FEE_SCHEDULE section 5). The recipient is read ONLY from the loaded manifest; when there
 * is none the text says payments are disabled on that chain.
 */
export function FeeDisclosure(props: { readonly manifest: ManifestState | undefined; readonly chainName?: string | undefined }): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const pct = bpsToPercent(FEE_SCHEDULE.ROUTER_FEE_BPS);
  const m = props.manifest;
  // Each state has its own whole-sentence key, so a translation can order the clauses naturally. All are security keys.
  let id: MessageKey;
  let values: Record<string, string>;
  if (m?.status === 'loaded') {
    id = m.trust === 'signed' ? 'disclosure.fee.signed' : m.trust === 'unsigned-dev' ? 'disclosure.fee.unsigned' : 'disclosure.fee.unavailable';
    values = { pct, recipient: m.manifest.feeRecipient };
  } else if (m === undefined) {
    id = 'disclosure.fee.loading';
    values = { pct };
  } else {
    id = 'disclosure.fee.none';
    values = { pct, chain: props.chainName ?? t('disclosure.thisChain') };
  }
  return (
    <p className="fee-disclosure">
      <RichText id={id} values={values} tags={monoTags} />
    </p>
  );
}

export const OBSERVERS: readonly { readonly who: string; readonly learns: string; readonly not: string }[] = [
  {
    who: 'Public chain analyst',
    learns:
      'Payer address, token, gross and net amounts, the fee flow to the fee recipient, router use, the announcement (stealth address, ephemeral key, view tag), timing, and the sweep source and destination if swept in the clear.',
    not: 'Seller identity from the stealth address alone; invoice contents.',
  },
  { who: 'Static host / CDN', learns: 'Client IP, user agent, which app files were fetched, timing.', not: 'The URL fragment, keys, invoice contents.' },
  { who: 'RPC provider', learns: 'Client IP, queried block ranges and addresses, submitted transactions.', not: 'Viewing or spending keys (never sent); invoice contents.' },
  { who: 'Relayer operator', learns: 'IP (hashed), the stealth address, destination, token, amount, fee, timing; can censor.', not: 'Keys.' },
  { who: 'Wallet provider', learns: 'Transaction requests, chain, connected addresses.', not: 'Keys of the stealth wallet.' },
  { who: 'Anyone holding the invoice link', learns: 'The entire invoice (it is a bearer link).', not: 'Seller keys.' },
  { who: 'Fee recipient (project owner)', learns: 'Aggregate fees on-chain only.', not: 'Payer or seller identity beyond public chain data.' },
];

/** Catalog key of row `index` (0-based) of {@link OBSERVERS}; disclosure.test.tsx keeps the English text in step. */
export const observerKey = (index: number, field: 'who' | 'learns' | 'not'): MessageKey => `disclosure.observer.${String(index + 1)}.${field}` as MessageKey;
/** Catalog key of entry `index` (0-based) of {@link LIMITS}. */
export const limitKey = (index: number): MessageKey => `disclosure.limit.${String(index + 1)}` as MessageKey;

export function ObserverTable(): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <div className="table-wrap" role="region" aria-label={t('about.learns')} tabIndex={0}>
      <table>
        <caption>{t('about.learns')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('disclosure.table.observer')}</th>
            <th scope="col">{t('disclosure.table.learns')}</th>
            <th scope="col">{t('disclosure.table.not')}</th>
          </tr>
        </thead>
        <tbody>
          {OBSERVERS.map((o, i) => (
            <tr key={o.who}>
              <th scope="row">{t(observerKey(i, 'who'))}</th>
              <td>{t(observerKey(i, 'learns'))}</td>
              <td>{t(observerKey(i, 'not'))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const LIMITS: readonly string[] = [
  'GhostPay does not hide the payer, the amount, the token, the time, or the router call. It hides which seller owns the one-time (stealth) address.',
  'A sweep from a stealth address to a known wallet links them on-chain. Sweeping through a relayer does not remove that link.',
  'An invoice link is a bearer secret: anyone who has the link (or its QR code) can read it. The signature only shows the link was not altered by someone without the signing key; it does not prove who the seller is.',
  'The optional delay is timing friction, not anonymity: no cover transactions are created and the final transaction is public.',
  'The optional gas buffer is a public native transfer in the same transaction as your payment and links the payer to the stealth address.',
  'This app runs entirely in your browser, but your browser, extensions, wallet, RPC provider and operating system are all trusted by it. It has had no external audit.',
];

/** The privacy limits in the language in effect (English for an unreviewed locale: they are security keys). */
export function useLimits(): readonly string[] {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  return LIMITS.map((_, i) => t(limitKey(i)));
}

function ChainFee(props: { readonly chainId: number; readonly name: string }): ReactNode {
  const manifest = useManifest(props.chainId);
  return (
    <li>
      <strong>{props.name}</strong>
      <FeeDisclosure manifest={manifest} chainName={props.name} />
      {manifest?.status === 'loaded' && (
        <p className="hint">
          <RichText id="disclosure.chainFee.contracts" values={{ router: manifest.manifest.router, relayer: manifest.manifest.sweepRelayer }} tags={monoTags} />
        </p>
      )}
    </li>
  );
}

/** One disclosure per enabled chain, each from that chain's own manifest. */
export function ChainFeeList(): ReactNode {
  const { chains } = useServices();
  return (
    <ul className="plain-list">
      {chains.map((c) => (
        <ChainFee key={c.chainId} chainId={c.chainId} name={c.name} />
      ))}
    </ul>
  );
}
