// Prove one witness JSON with the INSECURE DEV CEREMONY keys and print verifier calldata JSON.
// Usage: node scripts/prove.mjs withdraw|ragequit <input.json>     (e.g. from forge via ffi)
// Output: {"pA":[..],"pB":[[..],[..]],"pC":[..],"pubSignals":[..]} (decimal strings)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as snarkjs from 'snarkjs';
import { toVerifierCalldata } from '../dist/index.js';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const [kind, file] = process.argv.slice(2);
const c = { withdraw: ['withdraw32', 9], ragequit: ['commitment', 4] }[kind];
if (!c || !file) { console.error('usage: prove.mjs withdraw|ragequit <input.json>'); process.exit(2); }
const input = JSON.parse(readFileSync(file, 'utf8'));
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, join(PKG, `build/${c[0]}_js/${c[0]}.wasm`), join(PKG, `build/${c[0]}_final.zkey`));
process.stdout.write(JSON.stringify(toVerifierCalldata(proof, publicSignals, c[1])));
process.exit(0);
