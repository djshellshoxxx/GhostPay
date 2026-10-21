import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Which circuit to prove. */
export type CircuitKind = 'withdraw' | 'commitment';

/** Number of public signals per circuit (packages/pool-circuits/INTERFACE.md). */
export const PUBLIC_SIGNAL_COUNT: Readonly<Record<CircuitKind, number>> = Object.freeze({ withdraw: 9, commitment: 4 });

/** Ceremony labels the prover accepts (SP-CIR-7). */
export type CeremonyLabel = 'INSECURE-LOCAL' | 'TESTNET-CEREMONY';

/** Error codes of the prover. */
export type ProverErrorCode = 'WRONG_CHAIN' | 'ARTIFACT_HASH' | 'ARTIFACT_LABEL' | 'ARTIFACT_LOAD' | 'PROVE_FAILED' | 'BAD_PROOF' | 'BAD_REQUEST';

/** Typed prover error; messages never contain witness data. */
export class ProverError extends Error {
  public readonly code: ProverErrorCode;

  public constructor(code: ProverErrorCode, message: string) {
    super(message);
    this.name = 'ProverError';
    this.code = code;
  }
}

/** Where to find the circuit files and what they must hash to. */
export interface ProverArtifacts {
  /** `https:`, `http:` (loopback), `file:` URL or absolute path. */
  readonly wasmUrl: string;
  readonly zkeyUrl: string;
  /** Lower-case hex SHA-256 of the files. Mandatory. */
  readonly sha256: { readonly wasm: string; readonly zkey: string };
  /** Every artifact set must carry a ceremony label. */
  readonly label: CeremonyLabel;
}

/** snarkjs Groth16 proof JSON. */
export interface Groth16Proof {
  readonly pi_a: string[];
  readonly pi_b: string[][];
  readonly pi_c: string[];
  readonly protocol?: string;
  readonly curve?: string;
}

/** Proof plus public signals. */
export interface ProveResult {
  readonly proof: Groth16Proof;
  readonly publicSignals: string[];
}

/** Swappable Groth16 engine (the default wraps snarkjs; tests inject a stub). */
export interface Groth16Engine {
  fullProve(input: Record<string, unknown>, wasm: Uint8Array, zkey: Uint8Array): Promise<{ proof: unknown; publicSignals: string[] }>;
  verify(vkey: unknown, publicSignals: readonly string[], proof: unknown): Promise<boolean>;
}

/** Byte loader (swappable for tests and workers). */
export type ArtifactLoader = (url: string) => Promise<Uint8Array>;

const TESTNETS = [31337, 11155111, 84532];

function assertChain(chainId: number): void {
  if (!Number.isSafeInteger(chainId) || !TESTNETS.includes(chainId)) throw new ProverError('WRONG_CHAIN', `chain ${String(chainId)} is not a supported testnet`);
}

/** Default engine: snarkjs, loaded lazily so importing this package costs nothing until a proof is needed. */
export const snarkjsEngine: Groth16Engine = {
  async fullProve(input, wasm, zkey) {
    const { groth16 } = await import('snarkjs');
    return groth16.fullProve(input, { type: 'mem', data: wasm }, { type: 'mem', data: zkey });
  },
  async verify(vkey, signals, proof) {
    const { groth16 } = await import('snarkjs');
    return groth16.verify(vkey, signals, proof);
  },
};

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/**
 * Default loader: `https:`, loopback `http:`, `file:` and absolute paths.
 *
 * @security Refuses remote plain `http`. Content is hash-checked by the caller regardless of source.
 */
export const defaultLoader: ArtifactLoader = async (url) => {
  try {
    if (url.startsWith('/') || url.startsWith('file:')) {
      const { readFile } = await import('node:fs/promises');
      const path = url.startsWith('file:') ? new URL(url) : url;
      return new Uint8Array(await readFile(path));
    }
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.test(u.hostname))) throw new Error('scheme');
    const res = await fetch(u);
    if (!res.ok) throw new Error('status');
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    throw new ProverError('ARTIFACT_LOAD', 'could not load circuit artifact');
  }
};

/** Constant-time-ish lower-case hex compare of two digests (public data, but avoids early exit habits). */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Options shared by {@link prove} and {@link loadArtifacts}. */
export interface ProverOptions {
  readonly loader?: ArtifactLoader;
  readonly engine?: Groth16Engine;
}

/** Verified circuit bytes. */
export interface LoadedArtifacts {
  readonly wasm: Uint8Array;
  readonly zkey: Uint8Array;
  readonly label: CeremonyLabel;
}

/**
 * Loads and hash-verifies circuit artifacts (SP-SDK-5, SP-CIR-7).
 *
 * @throws ProverError `ARTIFACT_LABEL` without a known ceremony label, `ARTIFACT_HASH` on a SHA-256
 *   mismatch, `ARTIFACT_LOAD` on I/O failure.
 * @security The hashes are the trust anchor (published in the circuits package `SHA256SUMS`). A mismatch
 *   means the files are not the ones the on-chain verifier was generated from; refuse to prove with them.
 */
export async function loadArtifacts(a: ProverArtifacts, opts: ProverOptions = {}): Promise<LoadedArtifacts> {
  if (a.label !== 'INSECURE-LOCAL' && a.label !== 'TESTNET-CEREMONY') throw new ProverError('ARTIFACT_LABEL', 'artifacts must be labelled INSECURE-LOCAL or TESTNET-CEREMONY');
  const load = opts.loader ?? defaultLoader;
  const [wasm, zkey] = await Promise.all([load(a.wasmUrl), load(a.zkeyUrl)]);
  if (!sameHex(bytesToHex(sha256(wasm)), a.sha256.wasm.toLowerCase())) throw new ProverError('ARTIFACT_HASH', 'wasm hash mismatch');
  if (!sameHex(bytesToHex(sha256(zkey)), a.sha256.zkey.toLowerCase())) throw new ProverError('ARTIFACT_HASH', 'zkey hash mismatch');
  return { wasm, zkey, label: a.label };
}

/** Parameters of {@link prove}. */
export interface ProveRequest {
  readonly kind: CircuitKind;
  readonly chainId: number;
  /** Witness input (decimal strings). Contains note secrets: never log. */
  readonly inputs: Record<string, unknown>;
  readonly artifacts: ProverArtifacts;
  /** If given, the output public signals must equal these decimal strings (client-side SP-CIR-5 check). */
  readonly expectedSignals?: readonly string[];
}

function isProof(p: unknown): p is Groth16Proof {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return Array.isArray(o['pi_a']) && Array.isArray(o['pi_b']) && Array.isArray(o['pi_c']);
}

/**
 * Generates a Groth16 proof locally. Nothing leaves the process: witnesses and secrets stay in memory.
 *
 * @throws ProverError `WRONG_CHAIN`, artifact errors, `PROVE_FAILED` (unsatisfied constraint or engine
 *   error; the message carries no witness data), `BAD_PROOF` (unexpected output shape or signals).
 * @security Runs in the caller's process (Web Worker or Node). Error messages deliberately omit inputs.
 */
export async function prove(req: ProveRequest, opts: ProverOptions = {}): Promise<ProveResult> {
  assertChain(req.chainId);
  if (req.kind !== 'withdraw' && req.kind !== 'commitment') throw new ProverError('BAD_REQUEST', 'unknown circuit');
  const { wasm, zkey } = await loadArtifacts(req.artifacts, opts);
  const engine = opts.engine ?? snarkjsEngine;
  let out: { proof: unknown; publicSignals: string[] };
  try {
    out = await engine.fullProve(req.inputs, wasm, zkey);
  } catch {
    throw new ProverError('PROVE_FAILED', 'proof generation failed (inputs violate a circuit constraint or artifacts are invalid)');
  }
  if (!isProof(out.proof) || out.publicSignals.length !== PUBLIC_SIGNAL_COUNT[req.kind]) throw new ProverError('BAD_PROOF', 'prover output has an unexpected shape');
  if (req.expectedSignals !== undefined && (req.expectedSignals.length !== out.publicSignals.length || req.expectedSignals.some((s, i) => s !== out.publicSignals[i]))) {
    throw new ProverError('BAD_PROOF', 'public signals differ from the request');
  }
  return { proof: out.proof, publicSignals: out.publicSignals };
}

/**
 * Verifies a proof against a verification key (cheap pre-check used by the relayer).
 *
 * @returns False for an invalid proof or any engine error (fail closed).
 */
export async function verify(kind: CircuitKind, vkey: unknown, proof: Groth16Proof, publicSignals: readonly string[], opts: ProverOptions = {}): Promise<boolean> {
  if (publicSignals.length !== PUBLIC_SIGNAL_COUNT[kind]) return false;
  try {
    return await (opts.engine ?? snarkjsEngine).verify(vkey, publicSignals, proof);
  } catch {
    return false;
  }
}

/** Message protocol for the Web Worker entry (`worker.ts`). */
export type WorkerRequest = { readonly id: number; readonly req: ProveRequest };
/** Worker reply. `error` carries only a code and a message without witness data. */
export type WorkerResponse = { readonly id: number; readonly ok: true; readonly result: ProveResult } | { readonly id: number; readonly ok: false; readonly code: ProverErrorCode | 'UNKNOWN' };

/** Handles one worker message; shared by the worker entry and tests. */
export async function handleWorkerRequest(m: WorkerRequest, opts: ProverOptions = {}): Promise<WorkerResponse> {
  try {
    return { id: m.id, ok: true, result: await prove(m.req, opts) };
  } catch (e) {
    return { id: m.id, ok: false, code: e instanceof ProverError ? e.code : 'UNKNOWN' };
  }
}

/**
 * Stops snarkjs/ffjavascript worker threads so a Node process can exit.
 *
 * @remarks ffjavascript keeps `curve_bn128` on `globalThis`.
 */
export async function terminateProver(): Promise<void> {
  const c = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  if (c?.terminate !== undefined) await c.terminate();
}
