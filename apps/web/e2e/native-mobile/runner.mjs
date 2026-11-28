// Serve a temporary, loopback-only copy. The shipped bundle and its CSP remain intact.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import qr from 'qrcode-generator';
import { createInvoice, encodeFragment, serializePaymentRequestFile, signInvoice } from '@ghostpay/invoice-schema';

const [dist, browser, command, ...args] = process.argv.slice(2);
if (!command || !args.some(v => v.includes('{url}'))) throw new Error('Expected dist browser command and {url} argument.');
const scratch = await mkdtemp(join(tmpdir(), 'ghostpay-mobile-'));
const nonce = randomUUID();
const reportPath = '/' + nonce;
const testUrl = 'http://127.0.0.1:4178/mobile-qa.html';
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json' };
let resolveResult;
const result = new Promise(resolve => { resolveResult = resolve; });
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, testUrl).pathname;
    if (req.method === 'POST' && path === reportPath) {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 12000) throw Error('Report too large'); }
      const parsed = JSON.parse(body);
      res.writeHead(204).end();
      resolveResult(parsed);
      return;
    }
    if (req.method !== 'GET' || !/^\/[a-zA-Z0-9_./-]*$/.test(path) || path.includes('..')) { res.writeHead(404).end(); return; }
    const file = path === '/' ? 'index.html' : path.slice(1);
    const bytes = await readFile(join(scratch, file));
    res.writeHead(200, { 'Content-Type': mime[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream' }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
let child;
try {
  await cp(dist, scratch, { recursive: true });
  const html = await readFile(join(scratch, 'index.html'), 'utf8');
  await writeFile(join(scratch, 'mobile-qa.html'), html.replace('</body>', '<script type="module" src="./journey.js"></script></body>'));
  await cp(new URL('./journey.js', import.meta.url), join(scratch, 'journey.js'));
  const vector = JSON.parse(await readFile(new URL('../../../../test-vectors/seller-keystore-v1.json', import.meta.url)));
  const text = vector.files.valid.text;
  const makeQr = value => {
    const image = qr(0, 'L');
    image.addData(value, 'Byte');
    image.make();
    return image.createDataURL(5);
  };
  const now = Math.floor(Date.now() / 1000);
  const invoice = createInvoice({
    chainId: 84532, metaAddress: vector.seller.metaAddress, signer: vector.seller.signer,
    fiat: { currency: 'USD', minorUnits: '100' }, token: 'native',
    amountPolicy: { mode: 'fixed_token', tokenAmount: '1000000000000000' },
    quote: { source: 'synthetic', timestamp: now, expiresAt: now + 900, maxSlippageBps: 0 },
    expiresAt: now + 900, feePolicy: 'payer_pays', memo: 'Native QA sample',
    lineItems: [], tax: { rateBps: 0, minorUnits: '0' },
  });
  const key = Buffer.from(vector.seller.signingPrivateKey.slice(2), 'hex');
  const fragment = await encodeFragment(signInvoice(invoice, key));
  key.fill(0);
  await writeFile(join(scratch, 'qa-fixture.json'), JSON.stringify({
    text, qr: makeQr(text), pass: vector.passphrase, identity: vector.seller.metaAddress,
    invoiceQr: makeQr(fragment), request: serializePaymentRequestFile(fragment), reportPath,
  }));
  server.listen(4178, '127.0.0.1');
  await once(server, 'listening');
  child = spawn(command, args.map(v => v.replace('{url}', testUrl)), { stdio: 'inherit' });
  const launchFailure = new Promise((_, reject) => {
    child.on('error', reject);
    child.on('exit', code => { if (code) reject(Error('Browser launcher exited ' + code)); });
  });
  const evidence = await Promise.race([result, launchFailure, delay(150000, null, { ref: false }).then(() => { throw Error('Browser did not report within 150 seconds'); })]);
  console.log(JSON.stringify({ browser, evidence }, null, 2));
  const expected = { safari: /Version\/.*Safari\//, chrome: /Android.*Chrome\//, firefox: /Android.*Firefox\//, fennec: /FxiOS\//, desktop: /Mozilla\// }[browser];
  if (!expected?.test(evidence.userAgent) || evidence.ok !== true) throw Error('Native journey or browser identity check failed.');
} finally {
  child?.kill();
  server.close();
  await rm(scratch, { recursive: true, force: true });
}
