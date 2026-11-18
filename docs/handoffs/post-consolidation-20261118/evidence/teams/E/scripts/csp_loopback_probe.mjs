// Team E: does the shipped meta CSP let the page reach a loopback http JSON-RPC proxy (scan "local-proxy" mode)?
// Usage: node csp_loopback_probe.mjs <wtRoot> <siteDir> <outJson>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [wt, site, out] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(join(wt, 'node_modules/playwright-core/index.mjs')).href);
const PORT = 47125;
const BASE = `http://localhost:${String(PORT)}/GhostPay/`;
const server = spawn(process.execPath, [join(wt, 'scripts/pages/serve-pages.mjs'), site, '--port', String(PORT), '--base', '/GhostPay/'], { stdio: 'ignore' });
let hits = 0;
const proxy = createServer((req, res) => {
  hits++;
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' });
  res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0xaa36a7' }));
});
await new Promise((r) => proxy.listen(47126, '127.0.0.1', r));
await new Promise((r) => setTimeout(r, 1000));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
const result = {};
try {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  result.probe = await page.evaluate(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective} ${e.blockedURI}`));
    const tryFetch = async (u) => {
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' });
        return `status ${String(r.status)}`;
      } catch (e) { return `error ${String(e)}`; }
    };
    const loopHttp = await tryFetch('http://127.0.0.1:47126/');
    await new Promise((r) => setTimeout(r, 300));
    return { loopHttp, violations, csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') };
  });
} finally {
  await browser.close();
  server.kill();
  proxy.close();
}
result.proxyHits = hits;
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 1));
