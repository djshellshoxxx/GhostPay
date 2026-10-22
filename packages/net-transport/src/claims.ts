import type { ProfileId } from './profile.js';

/**
 * Normative user-facing text per profile (NP-C-1). Single source: the UI must render these strings and
 * must not paraphrase them into stronger claims. Copied from
 * `docs/remote/privacy-specs/network-privacy.md` section 2 ("NOT protected").
 *
 * @security Never use "anonymous", "untraceable" or "mix" wording of our own. The one Nym sentence
 * contains the upstream word "mixing" verbatim because it is a quotation of the spec.
 */
export interface ProfileLabel {
  /** Profile id. */
  readonly id: ProfileId;
  /** Short title. */
  readonly title: string;
  /** One-line "hides" statement. */
  readonly hides: string;
  /** Statements that must be shown as "does NOT hide". */
  readonly doesNotHide: readonly string[];
  /** Trust assumption shown in the option help (NP-C-2); empty when none beyond the destination. */
  readonly trust: readonly string[];
  /** Shown behind an experimental toggle (NP-N-1). */
  readonly experimental: boolean;
  /** Labelled secondary / best-effort (NP-I2P-1). */
  readonly secondary: boolean;
}

/** Shown once per session when any non-direct profile is selected (NP-C-3). */
export const FIRST_USE_NOTICE = 'This hides your IP from the server, not what you send or what is on-chain.';

/** Required text for the `tor-browser` profile (NP-B-4). */
export const TOR_BROWSER_NOTICE = 'You are responsible for using Tor Browser; this page cannot verify it.';

/** Statements true for EVERY profile, including `direct`. */
export const COMMON_NOT_HIDDEN: readonly string[] = Object.freeze([
  'On-chain data is unchanged by any overlay: payer, amount, token, timing, router use, ERC-5564 announcement.',
  'The relayer still sees owner, destination, amount, token, timing in the body; quote and sweep share the tuple. Hiding the IP does not hide content.',
  'Tor/Nym/I2P hide the network origin from the destination; they do not hide the request from the destination. A malicious RPC still sees addresses it is asked about.',
  'Timing correlation: announcement at block N followed by sweep request at N+k is not hidden by any transport.',
  'Wallet extension traffic goes to the wallet\'s own RPC outside GhostPay\'s control.',
]);

const L = (x: ProfileLabel): ProfileLabel => Object.freeze({ ...x, doesNotHide: Object.freeze([...x.doesNotHide]), trust: Object.freeze([...x.trust]) });

/** Labels for all profiles. */
export const PROFILE_LABELS: Readonly<Record<ProfileId, ProfileLabel>> = Object.freeze({
  direct: L({
    id: 'direct',
    title: 'Direct',
    hides: 'Nothing: your RPC/relayer sees your IP.',
    doesNotHide: COMMON_NOT_HIDDEN,
    trust: [],
    experimental: false,
    secondary: false,
  }),
  'tor-browser': L({
    id: 'tor-browser',
    title: 'Tor Browser (you run it)',
    hides: 'Depends entirely on you running this page inside Tor Browser; GhostPay cannot check that.',
    doesNotHide: [
      TOR_BROWSER_NOTICE,
      'A browser that is not Tor Browser cannot be forced onto Tor by the page.',
      'Tor exit sees destination host and SNI, not TLS content.',
      ...COMMON_NOT_HIDDEN,
    ],
    trust: ['Tor network and exit operator'],
    experimental: false,
    secondary: false,
  }),
  'tor-socks': L({
    id: 'tor-socks',
    title: 'Tor via local SOCKS5h proxy',
    hides: 'Your IP from the RPC/relayer; host names are resolved by the proxy, not locally.',
    doesNotHide: ['Tor exit sees destination host and SNI, not TLS content.', ...COMMON_NOT_HIDDEN],
    trust: ['Local Tor proxy you run', 'Tor network and exit operator'],
    experimental: false,
    secondary: false,
  }),
  onion: L({
    id: 'onion',
    title: 'Onion service',
    hides: 'Your IP from an onion-hosted RPC/relayer, and the host from your local network.',
    doesNotHide: [
      'An onion address check proves the address is well-formed, not that the service is the one you intended.',
      'A mirror is never labelled verified here.',
      ...COMMON_NOT_HIDDEN,
    ],
    trust: ['Tor network', 'Operator of the onion service'],
    experimental: false,
    secondary: false,
  }),
  'i2p-outproxy': L({
    id: 'i2p-outproxy',
    title: 'I2P outproxy (secondary, best-effort)',
    hides: 'Your IP from the destination.',
    doesNotHide: [
      'The outproxy operator sees the destination and, for plain HTTP, the content.',
      'Stream isolation is not claimed for this profile.',
      ...COMMON_NOT_HIDDEN,
    ],
    trust: ['I2P router you run', 'Outproxy operator'],
    experimental: false,
    secondary: true,
  }),
  'nym-mixfetch': L({
    id: 'nym-mixfetch',
    title: 'Nym browser fetch (experimental)',
    hides: 'Your IP from the destination.',
    doesNotHide: [
      'Nym: mixing "does not protect against the server you are talking to"; per-request exit rotation not available in SDKs, so a destination can group requests.',
      'Stream isolation is not claimed for this profile.',
      ...COMMON_NOT_HIDDEN,
    ],
    trust: ['Nym entry gateway and exit (IPR) operators'],
    experimental: true,
    secondary: false,
  }),
  'nym-socks5': L({
    id: 'nym-socks5',
    title: 'Nym SOCKS5 client (experimental)',
    hides: 'Your IP from the destination.',
    doesNotHide: [
      'Nym: mixing "does not protect against the server you are talking to"; per-request exit rotation not available in SDKs, so a destination can group requests.',
      'Stream isolation is not claimed for this profile.',
      ...COMMON_NOT_HIDDEN,
    ],
    trust: ['Nym entry gateway and exit operators', 'Local Nym SOCKS5 client you run'],
    experimental: true,
    secondary: false,
  }),
  ohttp: L({
    id: 'ohttp',
    title: 'Oblivious HTTP (experimental)',
    hides: 'Your IP from the gateway and the request content from the relay, if relay and gateway do not collude.',
    doesNotHide: [
      'Relay and gateway collusion defeats the split; if one operator runs both there is no protection.',
      'The gateway sees the request.',
      'Public RPC providers rarely host gateways; this is practical for the GhostPay relayer or your own node.',
      ...COMMON_NOT_HIDDEN,
    ],
    trust: ['Non-collusion of OHTTP relay and gateway'],
    experimental: true,
    secondary: false,
  }),
});

/** Scan source labels (NP-L-1, NP-C-2, spec 2). */
export const SCAN_MODE_LABELS = Object.freeze({
  range: 'Full range download; the view tag is checked locally. The RPC sees which block ranges you ask for.',
  'indexer-tor': 'Public-log indexer reached through your transport profile. The indexer sees your requests, not your keys.',
  pir2: 'Two-server PIR: hides which page you fetch only if the two servers do not collude. Teaching-grade PoC; if one operator runs both there is no privacy.',
  'light-client': 'Verifies answers, does not hide queries.',
} as const);

/** RPC mode labels. */
export const RPC_MODE_LABELS = Object.freeze({
  single: 'One RPC URL of your choice; it sees every read.',
  quorum: 'At least two RPC URLs compared; detects a lying RPC, does not hide queries from either.',
  'own-node': 'Your own node (loopback or onion URL); no third-party RPC sees queries.',
  'light-client': 'Verifies answers, does not hide queries from the execution RPC.',
} as const);
