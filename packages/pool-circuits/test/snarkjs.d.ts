// Minimal ambient types for the snarkjs 0.7.6 and ffjavascript 0.3.1 APIs used by the tests.
declare module 'snarkjs' {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasm: string,
      zkey: string,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(vkey: unknown, publicSignals: string[], proof: Groth16Proof): Promise<boolean>;
    exportSolidityCallData(proof: Groth16Proof, publicSignals: string[]): Promise<string>;
  };
  export const wtns: {
    calculate(
      input: Record<string, unknown>,
      wasm: string,
      out: { type: 'mem'; data?: Uint8Array },
    ): Promise<void>;
    exportJson(w: { type: 'mem'; data?: Uint8Array }): Promise<bigint[]>;
    check(r1cs: string, w: { type: 'mem'; data?: Uint8Array }): Promise<boolean>;
  };
}
declare module 'ffjavascript' {
  export function buildBn128(singleThread?: boolean): Promise<Bn128>;
  export interface FieldLike {
    e(x: bigint | string): Uint8Array;
    inv(x: Uint8Array): Uint8Array;
    toObject(x: Uint8Array): bigint;
  }
  export interface GroupLike {
    fromObject(o: bigint[] | bigint[][]): Uint8Array;
    toObject(p: Uint8Array): bigint[] | bigint[][];
    timesFr(p: Uint8Array, s: Uint8Array): Uint8Array;
    toAffine(p: Uint8Array): Uint8Array;
  }
  export interface Bn128 {
    Fr: FieldLike;
    G1: GroupLike;
    G2: GroupLike;
    terminate(): Promise<void>;
  }
}
