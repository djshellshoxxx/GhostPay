import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parseFragment } from '@ghostpay/invoice-schema';
import { preview } from 'vite';
import { configureRpc, createPagesInvoice, PAGES_BASE } from './devnet/pages';
import { generateKeys, openFresh } from './helpers';
import { CORS, RPC } from './flowMocks';

// Real TLS for site bytes. Only the explicitly selected RPC is an intercepted fixture.
// The Tor setting is tested in ordinary Chromium so this cannot certify Tor routing.
test('HTTPS invoice review and selected RPC health check with the Tor Browser scan preference', async ({ browser }) => {
  const dir = mkdtempSync(join(tmpdir(), 'ghostpay-test-tls-'));
  try {
    const key = join(dir, 'key.pem');
    const cert = join(dir, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert], { stdio: 'ignore' });
    const server = await preview({ configFile: false, base: PAGES_BASE, root: fileURLToPath(new URL('../', import.meta.url)),
      preview: { host: '127.0.0.1', port: 0, https: { key: readFileSync(key), cert: readFileSync(cert) } } });
    try {
      const address = server.httpServer.address();
      if (!address || typeof address === 'string') throw new Error('Expected a loopback TCP listener');
      const origin = 'https://127.0.0.1:' + String(address.port);
      const base = origin + PAGES_BASE;
      const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
      try {
        const unexpected: string[] = [];
        const methods: string[] = [];
        let chainId = '0x14a34';
        await context.routeWebSocket('**/*', (socket) => { unexpected.push('websocket'); return socket.close(); });
        await context.route('**/*', async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin === origin && url.pathname.startsWith(PAGES_BASE)) return route.continue();
          if (url.href === RPC + '/' && request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
          if (url.href === RPC + '/' && request.method() === 'POST') {
            const body = request.postDataJSON() as { id: number; method: string };
            methods.push(body.method);
            return route.fulfill({ headers: CORS, json: { jsonrpc: '2.0', id: body.id, result: chainId } });
          }
          unexpected.push(request.resourceType());
          return route.abort();
        });
        const page = await context.newPage();
        await page.goto(base);
        expect(await page.evaluate(() => window.isSecureContext && !!crypto.subtle)).toBe(true);
        await generateKeys(page);
        const description = 'Synthetic compatibility invoice';
        const link = await createPagesInvoice(page, base, { description });
        expect((await parseFragment(new URL(link).hash)).verification.signatureValid).toBe(true);
        await openFresh(page, link);
        await expect(page.getByRole('heading', { name: 'Review payment' })).toBeVisible();
        await expect(page.getByText(description, { exact: true })).toBeVisible();
        expect(methods).toEqual([]);

        const settings = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' });
        await settings.click();
        await page.getByLabel('Scan transport').selectOption('tor-browser');
        await page.getByRole('button', { name: 'Save scan privacy' }).click();
        await expect(page.getByText('Scan privacy settings saved. They apply to the next scan.')).toBeVisible();
        await page.reload();
        await settings.click();
        await expect(page.getByLabel('Scan transport')).toHaveValue('tor-browser');
        expect(methods).toEqual([]);
        await configureRpc(page, RPC);
        expect(methods).toEqual(['eth_chainId']);
        chainId = '0x1';
        await page.getByRole('button', { name: 'Test primary RPC for Base Sepolia' }).click();
        await expect(page.getByText('Failed: the endpoint is unreachable or reports a different chain.')).toBeVisible();
        expect(methods).toEqual(['eth_chainId', 'eth_chainId']);
        expect(unexpected).toEqual([]);
      } finally {
        await context.close();
      }
    } finally {
      await server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
