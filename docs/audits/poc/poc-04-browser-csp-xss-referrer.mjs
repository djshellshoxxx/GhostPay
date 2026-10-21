// Drives the BUILT app (clean-room build of HEAD) in Chromium. Usage: node poc-04-browser-csp-xss-referrer.mjs <distDir>
import { chromium } from 'playwright';
import { startServer } from './static-server.mjs';
import { createInvoice, signInvoice, signerPublicKeyHex, encodeFragment } from '@ghostpay/invoice-schema';
import { generateKeySet, encodeMetaAddress } from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? '../../../apps/web/dist');
const seller = generateKeySet(); const signKey = secp256k1.utils.randomSecretKey();
const XSS = '<img src=x onerror="window.__pwned=1;alert(1)"><script>window.__pwned2=1</script>';
const inv = createInvoice({
  chainId: 84532, metaAddress: encodeMetaAddress(seller), fiat: { currency: 'USD', minorUnits: '1000' }, token: 'native',
  amountPolicy: { mode: 'fixed_token', tokenAmount: '1000000000000000' }, quote: { source: 'seller:fixed', timestamp: 1, expiresAt: 2, maxSlippageBps: 50 },
  expiresAt: 4102444800, lineItems: [{ description: XSS, quantity: '1', unitMinorUnits: '1000' }], tax: { rateBps: 0, minorUnits: '0' },
  feePolicy: 'payer_pays', memo: `javascript:alert(1) ${XSS} ‮evil`, signer: signerPublicKeyHex(signKey) });
const fragment = await encodeFragment(signInvoice(inv, signKey));
const report = (k, v) => console.log(`${k.padEnd(58)} ${v}`);

for (const mode of ['headers', 'meta']) {
  console.log(`\n===== serving mode: ${mode} =====`);
  const { srv, port, log } = await startServer(dist, mode);
  const origin = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  const external = []; const allReq = [];
  page.on('request', (r) => { allReq.push({ url: r.url(), ref: r.headers()['referer'] ?? null }); if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective}|${e.blockedURI}`)); });
  await page.goto(`${origin}/${fragment}`);
  await page.waitForSelector('h2');
  await page.waitForTimeout(800);
  report('URL after load (fragment auto-cleared?)', page.url().replace(origin, '').slice(0, 40) || '/');
  report('history.length / state', await page.evaluate(() => `${history.length} / ${JSON.stringify(history.state)}`));
  report('alert dialogs fired (XSS)', JSON.stringify(dialogs));
  report('window.__pwned / __pwned2', await page.evaluate(() => `${window.__pwned} / ${window.__pwned2}`));
  report('<img onerror> or <script> elements injected in DOM', await page.evaluate(() => document.querySelectorAll('img[onerror], main script').length));
  const bodyText = await page.locator('main').innerText();
  report('payload rendered as literal text', String(bodyText.includes('<img src=x onerror=')));
  report('review heading', await page.locator('h2').first().innerText());
  report('requests carrying "gpi" fragment text', allReq.filter((r) => /gpi/.test(r.url) || /gpi/.test(r.ref ?? '')).length);
  report('Referer headers sent on subrequests', JSON.stringify([...new Set(allReq.map((r) => r.ref))]));
  report('external (non-origin) requests during load/review', JSON.stringify(external));
  // CSP enforcement probes
  const probes = await page.evaluate(async () => {
    const out = {};
    // NOTE: eval/new Function are not probed: CDP evaluation bypasses the page's eval restriction, so the result would be meaningless.
    const s = document.createElement('script'); s.textContent = 'window.__inline=1'; document.body.appendChild(s); out.inlineScript = window.__inline === 1 ? 'EXECUTED' : 'blocked';
    const d = document.createElement('div'); d.innerHTML = '<img src=x onerror="window.__h=1">'; document.body.appendChild(d); await new Promise((r) => setTimeout(r, 100)); out.inlineHandler = window.__h === 1 ? 'EXECUTED' : 'blocked';
    try { await fetch('http://127.0.0.1:1/'); out.fetchHttp = 'allowed?'; } catch (e) { out.fetchHttp = 'rejected (' + e.message + ')'; }
    try { await fetch('https://example.invalid/', { mode: 'no-cors' }); out.fetchHttpsArbitrary = 'allowed by CSP (network fail only)'; } catch (e) { out.fetchHttpsArbitrary = 'rejected: ' + e.message; }
    try { new Worker('data:text/javascript,1'); out.dataWorker = 'created'; } catch (e) { out.dataWorker = 'blocked'; }
    const f = document.createElement('iframe'); f.src = 'https://example.invalid/'; document.body.appendChild(f); out.iframeSrc = 'appended (see csp log)';
    out.sw = String((await navigator.serviceWorker?.getRegistrations?.())?.length ?? 'n/a');
    return out;
  });
  for (const [k, v] of Object.entries(probes)) report('probe ' + k, v);
  report('CSP violations observed', JSON.stringify([...new Set(await page.evaluate(() => window.__csp))]));
  // Framing / clickjacking
  const other = await startServer(dist, 'meta');
  const fr = await ctx.newPage();
  await fr.goto(`http://127.0.0.1:${other.port}/attacker-page`); // 404 body is irrelevant; gives the attacker page a different origin
  await fr.setContent(`<iframe id=f src="${origin}/" width=600 height=400></iframe>`);
  await fr.waitForTimeout(1200);
  const framed = fr.frames().find((f) => f !== fr.mainFrame() && f.url().startsWith(origin));
  let canSee = false; try { canSee = !!framed && (await framed.locator('h1').count()) > 0; } catch {}
  report('app renders inside a cross-origin <iframe> (clickjacking)', String(canSee));
  other.srv.close();
  // Storage inspection after generating keys through the UI
  await page.goto(`${origin}/`);
  await page.locator('nav .nav-btn', { hasText: 'Seller keys' }).click();
  await page.getByRole('button', { name: 'Generate new keys' }).click();
  await page.waitForTimeout(300);
  const storage = await page.evaluate(async () => ({
    ls: JSON.stringify({ ...localStorage }).slice(0, 200), ss: JSON.stringify({ ...sessionStorage }), cookies: document.cookie,
    idb: JSON.stringify((await indexedDB.databases?.()) ?? []), html64: (document.body.innerHTML.match(/\b[0-9a-f]{64}\b/g) ?? []).length,
    hex66: (document.body.innerHTML.match(/\b0[23][0-9a-f]{64}\b/g) ?? []).length }));
  report('storage after key generation: localStorage', storage.ls);
  report('sessionStorage / cookies / IndexedDB dbs', `${storage.ss} / "${storage.cookies}" / ${storage.idb}`);
  report('64-hex strings in DOM (possible private keys)', storage.html64);
  await browser.close(); srv.close();
}
