// Does the invoice fragment survive in Chromium's on-disk History database after the app calls history.replaceState?
// Usage: node poc-10-history-db-leak.mjs <distDir>   (needs python3+sqlite3 to read the DB)
import { chromium } from 'playwright';
import { startServer } from './static-server.mjs';
import { createInvoice, signInvoice, signerPublicKeyHex, encodeFragment } from '@ghostpay/invoice-schema';
import { generateKeySet, encodeMetaAddress } from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const dist = path.resolve(process.argv[2]);
const seller = generateKeySet(); const k = secp256k1.utils.randomSecretKey();
const inv = createInvoice({ chainId: 84532, metaAddress: encodeMetaAddress(seller), fiat: { currency: 'USD', minorUnits: '1' }, token: 'native', amountPolicy: { mode: 'fixed_token', tokenAmount: '1' },
  quote: { source: 'seller:fixed', timestamp: 1, expiresAt: 2, maxSlippageBps: 0 }, expiresAt: 4102444800, lineItems: [], tax: { rateBps: 0, minorUnits: '0' }, feePolicy: 'payer_pays', memo: 'SECRET-MEMO-MARKER', signer: signerPublicKeyHex(k) });
const frag = await encodeFragment(signInvoice(inv, k));
const { srv, port } = await startServer(dist, 'headers');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-hist-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox'] });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/${frag}`); await page.waitForSelector('h2'); await page.waitForTimeout(1500);
console.log('address bar after load:', page.url());
await page.goto(`http://127.0.0.1:${port}/?other`); await page.waitForTimeout(500);
await ctx.close(); srv.close();
const db = path.join(dir, 'Default', 'History');
if (!fs.existsSync(db)) { console.log('History DB not written in this headless build -> NOT RUNNABLE here'); process.exit(0); }
const out = execFileSync('python3', ['-c', `import sqlite3,sys;c=sqlite3.connect('file:${db}?mode=ro&immutable=1',uri=True);print([r[0] for r in c.execute("select url from urls")])`]).toString();
console.log('urls in History DB:', out.slice(0, 600));
console.log(out.includes('#gpi=') ? 'RESULT: full invoice fragment IS persisted in the browser history database' : 'RESULT: fragment not found in History DB');
