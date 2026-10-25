/**
 * Browser-safe subset (`@ghostpay/net-transport/browser`). The package root also exports the Node SOCKS5h / HTTP CONNECT
 * agents, which import `node:net`; a web bundle must import only this entry. Nothing here opens a connection on import.
 */
export { NetTransportError } from './errors.js';
export type { NetTransportErrorCode } from './errors.js';
export { NET_PRIVACY_TESTNET_ONLY, ALLOWED_EVM_CHAIN_IDS, assertTestnet } from './guard.js';
export type { NetworkRef } from './guard.js';
export { validateOnionUrl, isValidV3OnionHost } from './onion.js';
export type { OnionUrlOptions } from './onion.js';
export { createFetchTransport } from './fetchTransport.js';
export type { FetchLike, FetchTransportOptions } from './fetchTransport.js';
export { transportToFetch } from './fetchAdapter.js';
export type { ToFetchOptions } from './fetchAdapter.js';
export { PROFILE_LABELS, FIRST_USE_NOTICE, TOR_BROWSER_NOTICE, COMMON_NOT_HIDDEN } from './claims.js';
export type { ProfileLabel } from './claims.js';
export type { ProfileId } from './profile.js';
