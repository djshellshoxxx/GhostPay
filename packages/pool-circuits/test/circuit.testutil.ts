import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as snarkjs from 'snarkjs';

export const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
/** POOL_CIRCUITS_BUILD overrides the build dir (used by the local circuit-mutation run, see DEVIATIONS.md). */
const BUILD = process.env.POOL_CIRCUITS_BUILD ?? join(PKG, 'build');
export const art = {
  withdrawWasm: join(BUILD, 'withdraw32_js/withdraw32.wasm'),
  withdrawZkey: join(PKG, 'build/withdraw32_final.zkey'),
  withdrawR1cs: join(PKG, 'build/withdraw32.r1cs'),
  withdrawVkey: join(PKG, 'vkeys/withdraw32.vkey.json'),
  ragequitWasm: join(BUILD, 'commitment_js/commitment.wasm'),
  ragequitZkey: join(PKG, 'build/commitment_final.zkey'),
  ragequitR1cs: join(PKG, 'build/commitment.r1cs'),
  ragequitVkey: join(PKG, 'vkeys/commitment.vkey.json'),
};

const require_ = process.env.REQUIRE_CIRCUITS === '1';
function have(...files: string[]): boolean {
  const ok = files.every((f) => existsSync(f));
  if (!ok && require_)
    throw new Error(`REQUIRE_CIRCUITS=1 but missing: ${files.filter((f) => !existsSync(f)).join(', ')}`);
  return ok;
}
export const HAVE_WASM = have(art.withdrawWasm, art.ragequitWasm);
export const HAVE_ZKEY = have(art.withdrawZkey, art.ragequitZkey, art.withdrawVkey, art.ragequitVkey);
export const HAVE_VKEY = have(art.withdrawVkey, art.ragequitVkey);
export const SKIP_NOTE =
  'circuit artefacts missing: run `npm run build:circuits -w @ghostpay/pool-circuits` (REQUIRE_CIRCUITS=1 turns this skip into a failure)';

export function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

/** Full witness vector (index 0 = 1, then outputs, then public inputs, then private). Throws on a failed constraint. */
export async function witness(wasm: string, input: object): Promise<bigint[]> {
  const w: { type: 'mem'; data?: Uint8Array } = { type: 'mem' };
  await snarkjs.wtns.calculate(input as Record<string, unknown>, wasm, w);
  return snarkjs.wtns.exportJson(w);
}

/** Resolves true iff witness generation fails (some constraint is violated). */
export async function rejects(wasm: string, input: object): Promise<boolean> {
  const log = console.log;
  const err = console.error;
  console.log = (): void => undefined;
  console.error = (): void => undefined;
  try {
    await witness(wasm, input);
    return false;
  } catch {
    return true;
  } finally {
    console.log = log;
    console.error = err;
  }
}
