// Test-only declaration: witness calculation used by `circuit.witness.test.ts`.
declare module 'snarkjs' {
  export const wtns: {
    calculate(input: Record<string, unknown>, wasm: string, out: { type: 'mem' }): Promise<void>;
    exportJson(w: { type: 'mem' }): Promise<bigint[]>;
  };
}
