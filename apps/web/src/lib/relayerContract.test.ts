import { eip712DomainSeparator, erc20MetadataAbi, erc2612PermitAbi, loadDeployment, type Address } from '@ghostpay/chain-adapters';
import { deriveStealthPayment, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { encodeFunctionResult } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// Cross-app wire contract (R04-1): the web client is run against the relayer's REAL request parsers and its REAL HTTP
// server (apps/relayer test harness, with a scripted chain instead of an RPC). If either side changes the request or
// response format alone, this suite fails.
import { parseQuoteRequest, parseSweepRequest } from '../../../relayer/src/validate';
import { CHAIN_ID, FEE_TO, NOW_SEC, STRANGER, SWEEP_CONTRACT, USDC, startHarness, type Harness } from '../../../relayer/src/harness.testutil';
import { fakeManifestJson } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { RelayerRefusedError, requestQuote, submitSweep, type FetchFn } from './relayerClient';
import { clearSession, generateSession } from './session';
import { getSweepQuote, relayedSweep, type SweepTarget } from './sweep';

const DEST = '0x6666666666666666666666666666666666666666' as Address;
const AMOUNT = 100_000_000n; // 100 USDC: the relayer's gas-based fee stays under the published cap.

/** Web-side deployment manifest for the harness relayer's chain, contract and fee recipient. */
const manifest = loadDeployment(
  JSON.stringify({ ...(JSON.parse(fakeManifestJson(CHAIN_ID)) as Record<string, unknown>), sweepRelayer: SWEEP_CONTRACT, feeRecipient: FEE_TO }),
  CHAIN_ID,
);

/** Answers the reads buildPermit makes for USDC on the harness chain. */
const permitRpc = mockRpc(CHAIN_ID, (_m, params) => {
  const data = (params[0] as { data: string }).data;
  if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
  if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 0n });
  return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: CHAIN_ID, verifyingContract: USDC });
});

let target: SweepTarget & { token: Address };
let h: Harness;
let posted: { path: string; body: unknown }[];
/** Real HTTP to the harness relayer; records every body the web client sends. */
const recordingFetch: FetchFn = (url, init) => {
  posted.push({ path: new URL(url).pathname, body: JSON.parse(typeof init.body === 'string' ? init.body : '') });
  return fetch(url, init);
};

beforeEach(async () => {
  const pub = generateSession();
  const p = deriveStealthPayment(pub.metaAddress);
  const hex = (b: Uint8Array): `0x${string}` => `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
  const announcement: PublicAnnouncement = { schemeId: 1n, stealthAddress: p.stealthAddress, ephemeralPublicKey: hex(p.ephemeralPublicKey), metadata: hex(p.viewTag) };
  target = { chainId: CHAIN_ID, token: USDC, owner: p.stealthAddress, announcement };
  h = await startHarness();
  posted = [];
});
afterEach(async () => {
  clearSession();
  await h.stop();
});

describe('web relayer client vs the real relayer (wire contract)', () => {
  it('quote: the body the web sends is accepted by parseQuoteRequest and the relayer answer parses', async () => {
    const view = await getSweepQuote(h.url, target, DEST, AMOUNT, NOW_SEC, manifest.feeRecipient, recordingFetch);
    expect(posted.map((x) => x.path)).toEqual(['/v1/quote']);
    expect(parseQuoteRequest(posted[0]?.body)).toEqual({ chainId: CHAIN_ID, token: USDC, owner: target.owner, destination: DEST, amount: AMOUNT });
    expect(view.quote.feeTo).toBe(FEE_TO);
    expect(view.quote.fee > 0n && view.quote.fee < AMOUNT).toBe(true);
    expect(view.quote.expiresAt).toBeGreaterThan(NOW_SEC);
    expect(view.net).toBe(AMOUNT - view.quote.fee);
  });

  it('sweep: relayedSweep posts a body parseSweepRequest accepts, bound to the chain, and the relayer broadcasts it', async () => {
    const { quote } = await getSweepQuote(h.url, target, DEST, AMOUNT, NOW_SEC, manifest.feeRecipient, recordingFetch);
    const txHash = await relayedSweep({
      target, manifest, destination: DEST, amount: AMOUNT, quote, relayerUrl: h.url, rpc: permitRpc,
      nowSeconds: () => NOW_SEC, fetchFn: recordingFetch, randomNonce: () => 42n,
    });
    expect(posted.map((x) => x.path)).toEqual(['/v1/quote', '/v1/sweep']);
    const parsed = parseSweepRequest(posted[1]?.body);
    expect(parsed.chainId).toBe(CHAIN_ID);
    expect(parsed.sweep).toMatchObject({ token: USDC, owner: target.owner, destination: DEST, feeTo: FEE_TO, amount: AMOUNT, fee: quote.fee, nonce: 42n });
    expect(parsed.permit?.value).toBe(AMOUNT);
    expect(parsed.quoteToken).toBe(quote.quoteToken);
    // The relayer's success answer is parsed into the hash of the transaction it actually sent.
    expect(h.fake.sent).toHaveLength(1);
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('errors: a relayer refusal keeps its status and class, and pre-broadcast classes are recognised', async () => {
    const other = STRANGER; // not a token the harness relayer supports
    const err: unknown = await requestQuote(h.url, { chainId: CHAIN_ID, token: other, owner: target.owner, destination: DEST, amount: AMOUNT }, recordingFetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RelayerRefusedError);
    expect((err as RelayerRefusedError).status).toBe(422);
    expect((err as RelayerRefusedError).code).toBe('token_not_supported');
    expect((err as RelayerRefusedError).beforeBroadcast).toBe(true);

    // A sweep posted after the relayer's clock passed the quote expiry: refused before broadcast, nothing sent.
    const { quote } = await getSweepQuote(h.url, target, DEST, AMOUNT, NOW_SEC, manifest.feeRecipient, recordingFetch);
    const late: unknown = await relayedSweep({
      target, manifest, destination: DEST, amount: AMOUNT, quote, relayerUrl: h.url, rpc: permitRpc,
      nowSeconds: () => NOW_SEC, fetchFn: recordingFetch, randomNonce: () => 43n,
      onBeforeHandoff: () => { h.clock.ms = (quote.expiresAt + 1) * 1000; },
    }).catch((e: unknown) => e);
    expect(late).toBeInstanceOf(RelayerRefusedError);
    expect((late as RelayerRefusedError).code).toBe('quote_expired');
    expect((late as RelayerRefusedError).beforeBroadcast).toBe(true);
    expect(h.fake.sent).toHaveLength(0);
  });

  it('errors: a malformed body gets the relayer 400 envelope, read as a pre-broadcast refusal', async () => {
    const err: unknown = await submitSweep(h.url, { sweep: {}, sweepSig: '0x', quoteToken: 'x' } as never, recordingFetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RelayerRefusedError);
    expect((err as RelayerRefusedError).status).toBe(400);
    expect((err as RelayerRefusedError).code).toMatch(/^invalid_/);
    expect((err as RelayerRefusedError).beforeBroadcast).toBe(true);
  });
});
