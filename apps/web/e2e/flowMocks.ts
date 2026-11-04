import type { BrowserContext, Page, Route } from '@playwright/test';
import { keccak256, toBytes } from 'viem';
import { FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT, FAKE_ROUTER, FAKE_SWEEP_RELAYER, fakeManifestJson } from '../src/test/fakeManifest';
import { ORIGIN } from './helpers';

// Shared fake manifest + mock JSON-RPC network for e2e specs (moved verbatim from flows.spec.ts, exports only added).

/** Tiny fake runtime code per contract; the served manifest carries their real keccak256 so the on-chain read-back passes. */
export const FAKE_CODE: Record<string, `0x${string}`> = {
  [FAKE_ROUTER]: '0x60016000',
  [FAKE_SWEEP_RELAYER]: '0x60026000',
  [FAKE_ANNOUNCER.toLowerCase()]: '0x60036000',
};
export const word = (hex: string): string => `0x${hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
export const SEL = (sig: string): string => keccak256(toBytes(sig)).slice(0, 10);
/** Manifest served to the app: bytecodeHashes match FAKE_CODE so the fail-closed on-chain verification succeeds. */
export function e2eManifestJson(chainId: number): string {
  const m = JSON.parse(fakeManifestJson(chainId)) as { bytecodeHashes: Record<string, string> };
  m.bytecodeHashes = {
    router: keccak256(FAKE_CODE[FAKE_ROUTER] as `0x${string}`),
    sweepRelayer: keccak256(FAKE_CODE[FAKE_SWEEP_RELAYER] as `0x${string}`),
  };
  return JSON.stringify(m);
}
export const RPC = 'https://rpc.e2e.test';
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export interface SentTx {
  from: string;
  to: string;
  data: string;
  value: string;
}

/** Serves the (test-only, fake) manifest and a tiny JSON-RPC node; everything else off-origin stays blocked. */
export async function mockNetwork(
  context: BrowserContext,
  state: {
    sent?: SentTx;
    logs?: unknown[];
    /** Optional canonical tx/receipt fixture, used only by the verified-ERC20 scan scenario. */
    evidence?: { txHash: string; transaction: unknown; receipt: unknown };
  },
): Promise<{ requests: string[] }> {
  const requests: string[] = [];
  // Specific routes below run first; any unexpected off-origin request is refused before leaving the browser.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === ORIGIN || ['data:', 'blob:', 'about:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  await context.route('**/deployments/84532.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: e2eManifestJson(84532) }),
  );
  await context.route(`${RPC}/**`, async (route: Route) => {
    const req = route.request();
    requests.push(req.url());
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = JSON.parse(req.postData() ?? '{}') as { id: number; method: string; params: unknown[] };
    const reply = (result: unknown): Promise<void> =>
      route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
      });
    switch (body.method) {
      case 'eth_chainId':
        return reply('0x14a34');
      case 'eth_blockNumber':
        return reply('0x1f4');
      case 'eth_getBlockByNumber': {
        const n = parseInt(String(body.params[0]), 16);
        const h = (x: number): string => `0x${x.toString(16).padStart(64, '0')}`;
        return reply({ number: `0x${n.toString(16)}`, hash: h(n), parentHash: h(n - 1) });
      }
      case 'eth_getLogs': {
        const f = body.params[0] as {
          fromBlock: string;
          toBlock: string;
          address?: string | string[];
          topics?: (string | string[] | null)[];
        };
        const from = parseInt(f.fromBlock, 16);
        const to = parseInt(f.toBlock, 16);
        const wantAddresses =
          f.address === undefined ? undefined : (Array.isArray(f.address) ? f.address : [f.address]).map((a) => a.toLowerCase());
        return reply(
          (state.logs ?? []).filter((raw) => {
            const l = raw as { blockNumber: string; address: string; topics: string[] };
            const n = parseInt(l.blockNumber, 16);
            if (n < from || n > to) return false;
            if (wantAddresses !== undefined && !wantAddresses.includes(l.address.toLowerCase())) return false;
            return (f.topics ?? []).every((want, i) => {
              if (want === null || want === undefined) return true;
              return (Array.isArray(want) ? want : [want]).some((w) => w.toLowerCase() === l.topics[i]?.toLowerCase());
            });
          }),
        );
      }
      case 'eth_getTransactionByHash':
        if (state.evidence !== undefined) {
          return reply(String(body.params[0]).toLowerCase() === state.evidence.txHash.toLowerCase() ? state.evidence.transaction : null);
        }
        return reply(
          state.sent === undefined
            ? null
            : {
                hash: body.params[0],
                from: state.sent.from,
                to: state.sent.to,
                input: state.sent.data,
                value: state.sent.value,
                chainId: '0x14a34',
              },
        );
      case 'eth_getTransactionReceipt':
        if (state.evidence !== undefined) {
          return reply(String(body.params[0]).toLowerCase() === state.evidence.txHash.toLowerCase() ? state.evidence.receipt : null);
        }
        return reply(
          state.sent === undefined ? null : { status: '0x1', blockNumber: '0x1f5', to: state.sent.to },
        );
      case 'eth_gasPrice':
        return reply('0x3b9aca00');
      case 'eth_getCode':
        return reply(FAKE_CODE[String(body.params[0]).toLowerCase()] ?? '0x');
      case 'eth_call': {
        const call = body.params[0] as { to: string; data: string };
        const sel = call.data.slice(0, 10);
        if (call.to.toLowerCase() === FAKE_ROUTER) {
          if (sel === SEL('FEE_RECIPIENT()')) return reply(word(FAKE_FEE_RECIPIENT));
          if (sel === SEL('ANNOUNCER()')) return reply(word(FAKE_ANNOUNCER));
          if (sel === SEL('FEE_BPS()')) return reply(word((25).toString(16)));
        }
        return reply(null);
      }
      default:
        return reply(null);
    }
  });
  return { requests };
}

export async function configureRpc(page: Page): Promise<void> {
  await page.addInitScript((rpc) => {
    window.localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': rpc } }));
  }, RPC);
}
