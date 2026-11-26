// W5 independent payment-state verifier: contract model for the synthetic chain (milestone 2).
// Original work. Implements GhostPayRouter.payNative and the ERC-5564 announcer exactly as docs/CONTRACTS_SPEC.md §1
// specifies (rules, events, order). The ABI fragment below is written from that specification, not imported from
// production code; its selector is checked against the known on-chain selector at load time.
import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, keccak256, toFunctionSelector, toHex } from 'viem';
import { ROUTER } from './rpc.mjs';

export const ANNOUNCER = '0x55649e01b5df198d18d95b5cc5051630cfd45564';
export const FEE_RECIPIENT = '0x4444444444444444444444444444444444444444';
export const NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const FEE_BPS = 25n;
const BPS = 10_000n;

export const ROUTER_ABI = [
  {
    type: 'function',
    name: 'payNative',
    stateMutability: 'payable',
    inputs: [
      { name: 'stealth', type: 'address' },
      { name: 'minNet', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'ephemeralPubKey', type: 'bytes' },
      { name: 'metadata', type: 'bytes' },
    ],
    outputs: [],
  },
];
const PAY_NATIVE = toFunctionSelector('function payNative(address,uint256,uint256,bytes,bytes)');
if (PAY_NATIVE !== '0xb0c02fa3') throw new Error(`harness: payNative selector ${PAY_NATIVE} does not match the deployed interface`);
export const ANNOUNCEMENT_TOPIC = keccak256(toHex('Announcement(uint256,address,address,bytes,bytes)'));
export const FEE_COLLECTED_TOPIC = keccak256(toHex('FeeCollected(address,uint256)'));
const word = (h) => `0x${String(h).replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;

/** Decode a payNative call, or null if the data is not one. */
export function decodePayNative(data) {
  if (typeof data !== 'string' || !data.toLowerCase().startsWith(PAY_NATIVE)) return null;
  try {
    const { args } = decodeFunctionData({ abi: ROUTER_ABI, data });
    const [stealth, minNet, deadline, ephemeralPubKey, metadata] = args;
    return { stealth: stealth.toLowerCase(), minNet, deadline, ephemeralPubKey: ephemeralPubKey.toLowerCase(), metadata: metadata.toLowerCase() };
  } catch {
    return null;
  }
}

/** Re-encode a payNative call with a different deadline (a direct router call by the payer's own tooling, S37). */
export function withDeadline(data, deadline) {
  const d = decodePayNative(data);
  if (d === null) throw new Error('harness: not a payNative call');
  return encodeFunctionData({ abi: ROUTER_ABI, functionName: 'payNative', args: [d.stealth, d.minNet, BigInt(deadline), d.ephemeralPubKey, d.metadata] });
}

/** Spec rules for payNative; returns the revert reason or null. */
function validate(d, gross, timestamp) {
  if (BigInt(timestamp) > d.deadline) return 'Expired';
  if (/^0x0{40}$/.test(d.stealth) || d.stealth === ROUTER || d.stealth === FEE_RECIPIENT) return 'InvalidStealth';
  if (gross <= 0n) return 'ZeroAmount';
  const fee = (gross * FEE_BPS) / BPS;
  const net = gross - fee;
  if (!(net >= d.minNet && net > 0n)) return 'SlippageExceeded';
  if (!/^0x0[23][0-9a-f]{64}$/.test(d.ephemeralPubKey)) return 'InvalidEphemeralKey';
  const m = d.metadata.slice(2);
  if (m.length !== 57 * 2) return 'InvalidMetadata';
  if (m.slice(2, 10) !== 'eeeeeeee' || `0x${m.slice(10, 50)}` !== NATIVE_TOKEN || BigInt(`0x${m.slice(50, 114)}`) !== net) return 'InvalidMetadata';
  return null;
}

/**
 * The executor the SyntheticChain calls for each mined transaction. Returns { revert } or the emitted logs:
 * FeeCollected(token = 0xEeee…, fee) from the router, then Announcement(1, stealth, caller = router, eph, meta)
 * from the announcer (the router calls the announcer last, per the specification's native path).
 */
export function routerExecutor(params, { timestamp }) {
  if (String(params.to ?? '').toLowerCase() !== ROUTER) return [];
  const d = decodePayNative(params.data ?? params.input);
  if (d === null) return { revert: 'UnknownSelector' };
  const gross = BigInt(params.value ?? '0x0');
  const reason = validate(d, gross, timestamp);
  if (reason !== null) return { revert: reason };
  const fee = (gross * FEE_BPS) / BPS;
  return [
    { address: ROUTER, topics: [FEE_COLLECTED_TOPIC, word(NATIVE_TOKEN)], data: word(fee.toString(16)) },
    {
      address: ANNOUNCER,
      topics: [ANNOUNCEMENT_TOPIC, word('1'), word(d.stealth), word(ROUTER)],
      data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [d.ephemeralPubKey, d.metadata]),
    },
  ];
}
