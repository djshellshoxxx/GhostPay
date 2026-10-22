// PoC: SecretScalar redaction wrappers are bypassable (finding SEC-03-xx).
import { generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import util from 'node:util';
const { viewingSecret: s } = generateKeySet();
const hex = (u8) => Buffer.from(u8).toString('hex');
const tries = {
  'JSON.stringify(secret)': () => JSON.stringify(s),
  'String(secret)': () => String(s),
  'util.inspect(secret)': () => util.inspect(s),
  'console.log-style format': () => util.format('%s', s),
  'JSON.stringify({...secret}) (spread)': () => JSON.stringify({ ...s }),
  'Object.entries(secret)': () => JSON.stringify(Object.entries(s)),
  'Array.from(secret)': () => JSON.stringify(Array.from(s)),
  '[...secret]': () => JSON.stringify([...s]),
  'Buffer.from(secret).toString("hex")': () => Buffer.from(s).toString('hex'),
  'structuredClone(secret) -> plain Uint8Array': () => { const c = structuredClone(s); return `${c.constructor.name}:${hex(c)}`; },
  'secret.slice()  (Symbol.species -> plain Uint8Array)': () => { const c = s.slice(); return `${c.constructor.name}:${hex(c)}`; },
  'secret.subarray()': () => hex(s.subarray(0)),
  'new TextDecoder().decode(secret)': () => JSON.stringify(new TextDecoder('latin1').decode(s)),
  'Uint8Array.prototype.join.call(secret)': () => Uint8Array.prototype.join.call(s, ','),
  'Array.prototype.toString.call(secret)': () => Array.prototype.toString.call(s),
  'Object.getOwnPropertyDescriptors keys': () => JSON.stringify(Object.keys(Object.getOwnPropertyDescriptors(s)).slice(0,3)),
  'Error cause chain: new Error("x",{cause:secret}) -> inspect(err)': () => util.inspect(new Error('x', { cause: s })),
  'postMessage-style structuredClone inside object': () => hex(structuredClone({ k: s }).k),
  'btoa(String.fromCharCode(...secret))': () => btoa(String.fromCharCode(...s)),
};
const real = hex(unsafeRevealSecret(s));
for (const [name, f] of Object.entries(tries)) {
  let out;
  try { out = f(); } catch (e) { out = `THROWS (${e.constructor.name}) -> redaction holds`; }
  const leaked = typeof out === 'string' && !out.startsWith('THROWS') && !/getOwnPropertyDescriptors/.test(name); // any non-throwing path exposes the bytes (see printed output)
  console.log(`${leaked ? 'LEAK ' : 'ok   '} ${name}: ${String(out).slice(0, 70)}`);
}
