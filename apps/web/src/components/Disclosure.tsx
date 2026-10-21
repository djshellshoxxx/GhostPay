import { FEE_SCHEDULE } from '@ghostpay/chain-adapters';
import { useEffect, useState, type ReactNode } from 'react';
import { deploymentProblem, type DeploymentCheck } from '../lib/deployment';
import type { ManifestState, SignatureStatus } from '../lib/manifest';
import { useApp } from '../state';
import { useServices } from '../lib/services';
import { Mono } from './Common';

/** Looks up the manifest compiled into this bundle for one chain. */
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

/**
 * Reads the bundled manifest back from the chain through the user's RPC. `undefined` while there is no manifest to check,
 * `'checking'` while reading. Payments, scanning and sweeping are gated on `verified`.
 */
export function useDeploymentCheck(manifest: ManifestState | undefined): { readonly check: DeploymentCheck | 'checking' | undefined; readonly recheck: () => void } {
  const app = useApp();
  const [result, setResult] = useState<{ key: string; value: DeploymentCheck } | undefined>(undefined);
  const [nonce, setNonce] = useState(0);
  const m = manifest?.status === 'loaded' ? manifest.manifest : undefined;
  const key = m === undefined ? '' : `${String(m.chainId)}|${app.rpcHosts(m.chainId).join(',')}|${String(nonce)}`;
  useEffect(() => {
    if (m === undefined) return;
    let live = true;
    void app.checkDeployment(m).then((value) => {
      if (live) setResult({ key, value });
    });
    return () => {
      live = false;
    };
  }, [app.checkDeployment, m, key]);
  if (m === undefined) return { check: undefined, recheck: () => undefined };
  return { check: result?.key === key ? result.value : 'checking', recheck: () => { setNonce((n) => n + 1); } };
}

/** One honest sentence about the manifest signature. */
export function signatureSentence(sig: SignatureStatus | undefined): string {
  if (sig === 'valid') return 'signed by a release key that is built into this app';
  if (sig === 'unverifiable') return 'carries a signature this build cannot check (no release key is built in)';
  return 'an unsigned manifest (no release key is built in, so there is no signature to check)';
}

/** bps to a percent string without floating point, for example 25 -> `0.25`. */
export function bpsToPercent(bps: bigint): string {
  const whole = bps / 100n;
  const frac = (bps % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole.toString()}.${frac}`;
}

/**
 * Mandatory fee disclosure (FEE_SCHEDULE section 5). The recipient shown is the one READ FROM THE CHAIN once the deployment
 * check has passed; before that it is labelled as the bundled, not yet verified, manifest value.
 */
export function FeeDisclosure(props: {
  readonly manifest: ManifestState | undefined;
  readonly check?: DeploymentCheck | 'checking' | undefined;
  readonly chainName?: string | undefined;
}): ReactNode {
  const pct = bpsToPercent(FEE_SCHEDULE.ROUTER_FEE_BPS);
  const m = props.manifest;
  const c = props.check;
  return (
    <p className="fee-disclosure">
      GhostPay charges {pct} % on payments made through its checkout contract. The fee goes to{' '}
      {m?.status === 'loaded' ? (
        c !== undefined && c !== 'checking' && c.status === 'verified' ? (
          <>
            <Mono>{c.verified.feeRecipient}</Mono> (read from the router contract on-chain and equal to the bundled manifest; the manifest is {signatureSentence(m.signature)})
          </>
        ) : (
          <>
            <Mono>{m.manifest.feeRecipient}</Mono> (from the manifest bundled with this app, <strong>not yet verified on-chain</strong>; the manifest is {signatureSentence(m.signature)})
          </>
        )
      ) : m === undefined ? (
        <>the address in the deployment manifest (loading…)</>
      ) : (
        <>
          the address in the deployment manifest, but {props.chainName === undefined ? 'this chain' : props.chainName} has none usable: <strong>payments disabled on this chain</strong>
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
  'A sweep from a stealth address to your wallet is public. The payer knows the one-time address they paid, so the payer can follow the funds to your destination and see whatever else arrives there. Sweeping through a relayer does not remove that link.',
  'An invoice link is a bearer secret: anyone who has the link (or its QR code) can read it. The signature only shows the link was not altered by someone without the signing key; it does not prove who the seller is.',
  'The optional delay is timing friction, not anonymity: no cover transactions are created and the final transaction is public.',
  'The optional gas buffer is a public native transfer in the same transaction as your payment and links the payer to the stealth address.',
  'Opening an invoice link by clicking it or scanning a QR code navigates the browser to it, and some browsers keep that address (including the secret part) in their history database even though this page removes it from the address bar. Paste the link into the Pay page, or use a private window.',
  'Your RPC provider sees which addresses you scan, check and sweep, together with your IP address. Use your own node or Tor-aware access if that matters to you.',
  'This app runs entirely in your browser, but your browser, extensions, wallet, RPC provider and operating system are all trusted by it. It has had no external audit.',
];

function ChainFee(props: { readonly chainId: number; readonly name: string }): ReactNode {
  const manifest = useManifest(props.chainId);
  const { check } = useDeploymentCheck(manifest);
  const verified = check !== undefined && check !== 'checking' && check.status === 'verified' ? check.verified : undefined;
  const problem = manifest?.status === 'loaded' ? deploymentProblem(check) : undefined;
  return (
    <li>
      <strong>{props.name}</strong>
      <FeeDisclosure manifest={manifest} check={check} chainName={props.name} />
      {manifest?.status === 'loaded' && (
        <p className="hint">
          {verified === undefined ? 'Bundled manifest (unverified): router ' : 'Router (verified on-chain) '}
          <Mono>{verified?.router ?? manifest.manifest.router}</Mono>, sweep relayer <Mono>{verified?.sweepRelayer ?? manifest.manifest.sweepRelayer}</Mono>.
          {problem !== undefined && ` ${problem}`}
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
