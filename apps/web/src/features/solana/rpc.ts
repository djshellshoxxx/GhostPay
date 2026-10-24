import { createHttpRpc, SolanaStealthError, toU64, type SolanaRpc } from '@ghostpay/solana-stealth';
import { DEVNET_GENESIS, MAINNET_GENESIS, TESTNET_GENESIS, type SolNetworkInfo } from './network';

/** An error whose message is written for the user and safe to display. */
export class SolViewError extends Error {
  public constructor(message: string) {
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
  if (typeof r !== 'string') throw new SolViewError('The server sent an unexpected answer.');
  if (r === MAINNET_GENESIS) throw new SolViewError('This server reports Solana mainnet. Mainnet is disabled.');
  const expected = net.genesisHash;
  if (expected === undefined ? PUBLIC_GENESIS.includes(r) : r !== expected) {
    throw new SolViewError(`This server is not on the network you selected (${net.label}).`);
  }
}

/** Lamport balance at finalized commitment. */
export async function getBalance(rpc: SolanaRpc, address: string, signal?: AbortSignal): Promise<bigint> {
  const r = await rpc.request('getBalance', [address, { commitment: 'finalized' }], signal);
  if (typeof r !== 'object' || r === null) throw new SolViewError('The server sent an unexpected answer.');
  return toU64((r as { value?: unknown }).value);
}

/** Submits a signed, base64 wire transaction. This package's library never sends; the view does, on request. */
export async function sendTransaction(rpc: SolanaRpc, wireBase64: string, signal?: AbortSignal): Promise<string> {
  const r = await rpc.request('sendTransaction', [wireBase64, { encoding: 'base64', preflightCommitment: 'finalized' }], signal);
  if (typeof r !== 'string' || r === '') throw new SolViewError('The server sent an unexpected answer.');
  return r;
}

const FRIENDLY: Readonly<Record<string, string>> = {
  INVALID_ADDRESS: 'That is not a valid Solana address.',
  INVALID_META_ADDRESS: 'That is not a valid Solana stealth address.',
  BAD_CHECKSUM: 'The address checksum does not match.',
  NETWORK_MISMATCH: 'That address is for a different Solana network.',
  TRANSPORT_FAILURE: 'The server could not be reached or refused the request.',
  RPC_ERROR: 'The server refused the request.',
  INVALID_RESPONSE: 'The server sent an answer this app cannot read.',
  INVALID_INPUT: 'One of the inputs is not valid.',
  INVALID_AMOUNT: 'The amount is not valid.',
  UNSUPPORTED: 'That range holds too many announcements to scan at once. Choose a later first slot.',
  ABORTED: 'Cancelled.',
};

export function solErrorMessage(e: unknown): string {
  if (e instanceof SolViewError) return e.message;
  if (e instanceof SolanaStealthError) return FRIENDLY[e.code] ?? e.message;
  return 'Something went wrong. Nothing was sent.';
}
