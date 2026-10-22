import { FEE_SCHEDULE } from '@ghostpay/chain-adapters';
import { useEffect, useState, type ReactNode } from 'react';
import type { ManifestState } from '../lib/manifest';
import { useServices } from '../lib/services';
import { Mono } from './Common';

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
  const pct = bpsToPercent(FEE_SCHEDULE.ROUTER_FEE_BPS);
  const m = props.manifest;
  return (
    <p className="fee-disclosure">
      GhostPay charges {pct} % on payments made through its checkout contract. The fee goes to{' '}
      {m?.status === 'loaded' ? (
        <>
          <Mono>{m.manifest.feeRecipient}</Mono> (shown from the deployment manifest
          {m.trust === 'signed' ? ', whose signature was verified by a release key built into this app' : m.trust === 'unsigned-dev' ? ', which is unsigned and permitted only as a testnet development manifest' : ', with signature status unavailable'})
        </>
      ) : m === undefined ? (
        <>the address in the deployment manifest (loading…)</>
      ) : (
        <>
          the address in the deployment manifest, but {props.chainName === undefined ? 'this chain' : props.chainName} has none loaded: <strong>payments disabled on this chain</strong>
        </>
      )}
      . Paying the stealth address directly costs no GhostPay fee.
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

export function ObserverTable(): ReactNode {
  return (
    <div className="table-wrap" role="region" aria-label="Who learns what" tabIndex={0}>
      <table>
        <caption>Who learns what</caption>
        <thead>
          <tr>
            <th scope="col">Observer</th>
            <th scope="col">Learns</th>
            <th scope="col">Does not learn</th>
          </tr>
        </thead>
        <tbody>
          {OBSERVERS.map((o) => (
            <tr key={o.who}>
              <th scope="row">{o.who}</th>
              <td>{o.learns}</td>
              <td>{o.not}</td>
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

function ChainFee(props: { readonly chainId: number; readonly name: string }): ReactNode {
  const manifest = useManifest(props.chainId);
  return (
    <li>
      <strong>{props.name}</strong>
      <FeeDisclosure manifest={manifest} chainName={props.name} />
      {manifest?.status === 'loaded' && (
        <p className="hint">
          Router <Mono>{manifest.manifest.router}</Mono>, sweep relayer <Mono>{manifest.manifest.sweepRelayer}</Mono>.
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
