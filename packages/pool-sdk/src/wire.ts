import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { assertPoolChain } from './chain.js';
import { fail } from './errors.js';
import { inField } from './field.js';
import type { Withdrawal } from './withdrawal.js';

/** On-chain proof struct layout (INTERFACE.md section 4: G2 coordinates already swapped). */
export interface WithdrawProofCalldata {
  readonly pA: readonly [bigint, bigint];
  readonly pB: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  readonly pC: readonly [bigint, bigint];
  readonly pubSignals: readonly bigint[];
}

/** snarkjs Groth16 proof JSON. */
export interface SnarkjsProof {
  readonly pi_a: readonly string[];
  readonly pi_b: readonly (readonly string[])[];
  readonly pi_c: readonly string[];
}

const DEC = /^(0|[1-9][0-9]{0,77})$/;

function big(s: unknown, name: string): bigint {
  if (typeof s !== 'string' || !DEC.test(s)) return fail('INVALID_INPUT', `${name} is not a decimal string`);
  return BigInt(s);
}

function field(s: unknown, name: string): bigint {
  const v = big(s, name);
  if (!inField(v)) fail('INVALID_INPUT', `${name} not in field`);
  return v;
}

/**
 * Converts a snarkjs proof to the contract layout (`pB` coordinates swapped).
 *
 * @param n Expected number of public signals (9 withdraw, 4 ragequit).
 */
export function toCalldataProof(proof: SnarkjsProof, publicSignals: readonly string[], n: number): WithdrawProofCalldata {
  const { pi_a: a, pi_b: b, pi_c: c } = proof;
  if (a.length < 2 || b.length < 2 || c.length < 2 || publicSignals.length !== n) fail('INVALID_INPUT', 'malformed proof');
  const b0 = b[0];
  const b1 = b[1];
  /* c8 ignore next */
  if (b0 === undefined || b1 === undefined || b0.length < 2 || b1.length < 2) fail('INVALID_INPUT', 'malformed proof');
  return {
    pA: [field(a[0], 'pi_a0'), field(a[1], 'pi_a1')],
    pB: [
      [field(b0[1], 'pi_b00'), field(b0[0], 'pi_b01')],
      [field(b1[1], 'pi_b10'), field(b1[0], 'pi_b11')],
    ],
    pC: [field(c[0], 'pi_c0'), field(c[1], 'pi_c1')],
    pubSignals: publicSignals.map((s, i) => field(s, `signal${String(i)}`)),
  };
}

/** JSON wire form of a {@link Withdrawal} (all integers as decimal strings). */
export interface WithdrawalWire {
  recipient: string;
  relayer: string;
  relayerFee: string;
  feeTo: string;
  deadline: string;
  aspPublisher: string;
  announce: string;
}

/** JSON wire form of a proof. */
export interface ProofWire {
  pA: string[];
  pB: string[][];
  pC: string[];
  pubSignals: string[];
}

/** Serialises a withdrawal for the relayer API. */
export function withdrawalToWire(w: Withdrawal): WithdrawalWire {
  return { recipient: w.recipient, relayer: w.relayer, relayerFee: w.relayerFee.toString(), feeTo: w.feeTo, deadline: w.deadline.toString(), aspPublisher: w.aspPublisher, announce: w.announce };
}

/** Serialises a proof for the relayer API. */
export function proofToWire(p: WithdrawProofCalldata): ProofWire {
  return { pA: p.pA.map(String), pB: p.pB.map((r) => r.map(String)), pC: p.pC.map(String), pubSignals: p.pubSignals.map(String) };
}

function addr(v: unknown, name: string): Address {
  if (typeof v !== 'string' || !isAddress(v, { strict: false })) return fail('INVALID_INPUT', `${name} is not an address`);
  return getAddress(v);
}

/** Strict parse of an untrusted {@link WithdrawalWire}. @throws PoolSdkError `INVALID_INPUT`. */
export function parseWithdrawalWire(v: unknown): Withdrawal {
  if (typeof v !== 'object' || v === null) return fail('INVALID_INPUT', 'withdrawal is not an object');
  const o = v as Record<string, unknown>;
  const announce = o['announce'];
  if (typeof announce !== 'string' || !/^0x([0-9a-fA-F]{2}){0,2048}$/.test(announce)) return fail('INVALID_INPUT', 'announce is not hex');
  return {
    recipient: addr(o['recipient'], 'recipient'),
    relayer: addr(o['relayer'], 'relayer'),
    relayerFee: big(o['relayerFee'], 'relayerFee'),
    feeTo: addr(o['feeTo'], 'feeTo'),
    deadline: big(o['deadline'], 'deadline'),
    aspPublisher: addr(o['aspPublisher'], 'aspPublisher'),
    announce: announce as Hex,
  };
}

/** Strict parse of an untrusted {@link ProofWire} with `n` public signals. @throws PoolSdkError `INVALID_INPUT`. */
export function parseProofWire(v: unknown, n: number): WithdrawProofCalldata {
  if (typeof v !== 'object' || v === null) return fail('INVALID_INPUT', 'proof is not an object');
  const o = v as Record<string, unknown>;
  const pA = o['pA'];
  const pB = o['pB'];
  const pC = o['pC'];
  const ps = o['pubSignals'];
  if (!Array.isArray(pA) || pA.length !== 2 || !Array.isArray(pC) || pC.length !== 2 || !Array.isArray(pB) || pB.length !== 2 || !Array.isArray(ps) || ps.length !== n) {
    return fail('INVALID_INPUT', 'proof has wrong shape');
  }
  const row = (r: unknown, name: string): [bigint, bigint] => {
    if (!Array.isArray(r) || r.length !== 2) return fail('INVALID_INPUT', `${name} has wrong shape`);
    return [field(r[0], name), field(r[1], name)];
  };
  return { pA: row(pA, 'pA'), pB: [row(pB[0], 'pB0'), row(pB[1], 'pB1')], pC: row(pC, 'pC'), pubSignals: ps.map((s, i) => field(s, `signal${String(i)}`)) };
}

/** Throws unless `chainId` is allowed; re-exported for relayer parsers. */
export function parseChainId(v: unknown): number {
  if (typeof v !== 'number') return fail('WRONG_CHAIN', 'chainId must be a number');
  assertPoolChain(v);
  return v;
}

/** Parses a pool address field. */
export function parseAddress(v: unknown, name: string): Address {
  return addr(v, name);
}
