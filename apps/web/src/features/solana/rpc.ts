import { SOURCE_TRANSLATOR } from '../../i18n/source';
import type { MessageKey } from '../../i18n/catalog';
import type { Translator } from '../../i18n/translator';
import { UserFacingError, userMessage, type MessageDescriptor } from '../../lib/errors';
import { createHttpRpc, SolanaStealthError, toU64, type SolanaRpc } from '@ghostpay/solana-stealth';
import { DEVNET_GENESIS, MAINNET_GENESIS, TESTNET_GENESIS, type SolNetworkInfo } from './network';

/** An error whose message is written for the user and safe to display. */
export class SolViewError extends UserFacingError {
  public constructor(message: string | MessageDescriptor) {
    super(message);
    this.name = 'SolViewError';
  }
}

const PUBLIC_GENESIS: readonly string[] = [MAINNET_GENESIS, DEVNET_GENESIS, TESTNET_GENESIS];

/** JSON-RPC client over the injected fetch (the app's only network path). Throws on a bad URL. */
export function createRpc(url: string, fetchFn: (url: string, init: RequestInit) => Promise<Response>): SolanaRpc {
  return createHttpRpc({
    url: url.trim(),
    fetch: (input, init) => fetchFn(input instanceof Request ? input.url : String(input), init ?? {}),
  });
}

/**
 * Refuses any server that is not on the selected network. Mainnet is refused whatever was
 * selected; a local validator must not be a public cluster in disguise.
 */
export async function checkNetwork(rpc: SolanaRpc, net: SolNetworkInfo, signal?: AbortSignal): Promise<void> {
  const r = await rpc.request('getGenesisHash', [], signal);
  if (typeof r !== 'string') throw new SolViewError({ key: 'sol.error.response' });
  if (r === MAINNET_GENESIS) throw new SolViewError({ key: 'sol.error.mainnet' });
  const expected = net.genesisHash;
  if (expected === undefined ? PUBLIC_GENESIS.includes(r) : r !== expected) {
    throw new SolViewError({ key: 'sol.error.network', values: { network: net.label } });
  }
}

/** Lamport balance at finalized commitment. */
export async function getBalance(rpc: SolanaRpc, address: string, signal?: AbortSignal): Promise<bigint> {
  const r = await rpc.request('getBalance', [address, { commitment: 'finalized' }], signal);
  if (typeof r !== 'object' || r === null) throw new SolViewError({ key: 'sol.error.response' });
  return toU64((r as { value?: unknown }).value);
}

/** Submits a signed, base64 wire transaction. This package's library never sends; the view does, on request. */
export async function sendTransaction(rpc: SolanaRpc, wireBase64: string, signal?: AbortSignal): Promise<string> {
  const r = await rpc.request('sendTransaction', [wireBase64, { encoding: 'base64', preflightCommitment: 'finalized' }], signal);
  if (typeof r !== 'string' || r === '') throw new SolViewError({ key: 'sol.error.response' });
  return r;
}

const FRIENDLY: Readonly<Record<string, MessageKey>> = {
  INVALID_SCALAR: 'sol.error.invalidScalar',
  INVALID_POINT: 'sol.error.invalidPoint',
  INVALID_META_ADDRESS: 'sol.error.invalidMetaAddress',
  BAD_CHECKSUM: 'sol.error.badChecksum',
  UNSUPPORTED_VERSION: 'sol.error.unsupportedVersion',
  NETWORK_MISMATCH: 'sol.error.networkMismatch',
  INVALID_SEED: 'sol.error.invalidSeed',
  DERIVED_KEY_INVALID: 'sol.error.derivedKeyInvalid',
  INVALID_ANNOUNCEMENT: 'sol.error.invalidAnnouncement',
  INVALID_ADDRESS: 'sol.error.invalidAddress',
  INVALID_AMOUNT: 'sol.error.invalidAmount',
  BELOW_RENT_EXEMPT: 'sol.error.belowRentExempt',
  INVALID_INPUT: 'sol.error.invalidInput',
  CHAIN_MISMATCH: 'sol.error.chainMismatch',
  CHAIN_DISABLED: 'sol.error.chainDisabled',
  RNG_UNAVAILABLE: 'sol.error.rngUnavailable',
  RNG_FAILURE: 'sol.error.rngFailure',
  TRANSPORT_FAILURE: 'sol.error.transportFailure',
  INVALID_RESPONSE: 'sol.error.invalidResponse',
  RPC_ERROR: 'sol.error.rpcError',
  ABORTED: 'sol.error.aborted',
  UNSUPPORTED: 'sol.error.unsupported',
  SIGNER_NOT_REQUIRED: 'sol.error.signerNotRequired',
  SIGNATURE_INVALID: 'sol.error.signatureInvalid',
};

export function solErrorMessage(e: unknown, t: Translator['t'] = SOURCE_TRANSLATOR.t): string {
  if (e instanceof SolViewError) return userMessage(e, t);
  if (e instanceof SolanaStealthError) return t(FRIENDLY[e.code] ?? 'error.unknown');
  return t('error.unknown');
}

// i18n-use: sol.error.response sol.error.mainnet sol.error.network sol.error.invalidScalar sol.error.invalidPoint sol.error.invalidMetaAddress sol.error.badChecksum sol.error.unsupportedVersion sol.error.networkMismatch sol.error.invalidSeed sol.error.derivedKeyInvalid sol.error.invalidAnnouncement sol.error.invalidAddress sol.error.invalidAmount sol.error.belowRentExempt sol.error.invalidInput sol.error.chainMismatch sol.error.chainDisabled sol.error.rngUnavailable sol.error.rngFailure sol.error.transportFailure sol.error.invalidResponse sol.error.rpcError sol.error.aborted sol.error.unsupported sol.error.signerNotRequired sol.error.signatureInvalid
