// W5 independent payment-state verifier: JSON-RPC node over the synthetic chain, served by Playwright request
// interception (the request never leaves the browser process), plus a deny-all guard for every other origin.
// Original work; the fake contract code bytes and addresses are the repository's public E2E fixture values.
import { keccak_256 } from '@noble/hashes/sha3.js';
import { CHAIN_ID_HEX } from './chain.mjs';

export const RPC_URL = 'https://rpc.e2e.test';
export const ROUTER = '0x1111111111111111111111111111111111111111';
const SWEEP = '0x2222222222222222222222222222222222222222';
const ANNOUNCER = '0x55649e01b5df198d18d95b5cc5051630cfd45564';
const FEE_RECIPIENT = '0x4444444444444444444444444444444444444444';
// keccak256 of these bytes equals the fixture manifest's bytecodeHashes (apps/web/e2e/fixtures/84532.json).
const CODE = { [ROUTER]: '0x60016000', [SWEEP]: '0x60026000', [ANNOUNCER]: '0x60036000' };

const enc = new TextEncoder();
const selector = (sig) => `0x${Buffer.from(keccak_256(enc.encode(sig))).toString('hex').slice(0, 8)}`;
const word = (h) => `0x${h.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
const SEL = {
  FEE_BPS: selector('FEE_BPS()'),
  FEE_RECIPIENT: selector('FEE_RECIPIENT()'),
  ANNOUNCER: selector('ANNOUNCER()'),
};
const hex = (n) => `0x${n.toString(16)}`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export class MockRpc {
  constructor(chain) {
    this.chain = chain;
    this.mode = 'up'; // 'up' | 'down'
    this.failAfter = null; // when a number: answer that many more requests, then go down (mid-scan fault)
    this.calls = []; // { method, at, mode }
    this.unknownMethods = new Set();
    this.blockedOrigins = []; // every off-origin request the guard refused
  }

  answer(method, params) {
    const c = this.chain;
    switch (method) {
      case 'eth_chainId':
        return CHAIN_ID_HEX;
      case 'net_version':
        return String(parseInt(CHAIN_ID_HEX, 16));
      case 'eth_blockNumber':
        return hex(c.head);
      case 'eth_getBlockByNumber': {
        const tag = params[0];
        const n = tag === 'latest' || tag === 'pending' || tag === 'safe' || tag === 'finalized' ? c.head : parseInt(tag, 16);
        return c.blockObject(n);
      }
      case 'eth_getBlockByHash': {
        const want = String(params[0]).toLowerCase();
        for (let n = c.head; n >= 0 && n > c.head - 10_000; n -= 1) if (c.hashOf(n) === want) return c.blockObject(n);
        return null;
      }
      case 'eth_getTransactionByHash':
        return c.txObject(params[0]);
      case 'eth_getTransactionReceipt':
        return c.receiptObject(params[0]);
      case 'eth_getTransactionCount':
        return hex(c.nonceOf(params[0], params[1]));
      case 'eth_getCode':
        return CODE[String(params[0]).toLowerCase()] ?? '0x';
      case 'eth_getBalance':
        return hex(10n ** 21n);
      case 'eth_gasPrice':
        return hex(1_000_000_000);
      case 'eth_maxPriorityFeePerGas':
        return hex(1_000_000);
      case 'eth_estimateGas':
        return hex(200_000);
      case 'eth_feeHistory':
        return { oldestBlock: hex(c.head), baseFeePerGas: [hex(1_000_000), hex(1_000_000)], gasUsedRatio: [0.5], reward: [[hex(1_000_000)]] };
      case 'eth_getLogs':
        return c.getLogs(params[0] ?? {});
      case 'eth_call': {
        const call = params[0] ?? {};
        const to = String(call.to ?? '').toLowerCase();
        const sel = String(call.data ?? call.input ?? '').slice(0, 10);
        if (to === ROUTER) {
          if (sel === SEL.FEE_BPS) return word((25).toString(16));
          if (sel === SEL.FEE_RECIPIENT) return word(FEE_RECIPIENT);
          if (sel === SEL.ANNOUNCER) return word(ANNOUNCER);
          return '0x'; // successful dry run of a router payment (no return data)
        }
        return '0x';
      }
      default:
        this.unknownMethods.add(method);
        throw Object.assign(new Error(`method ${method} not supported by W5 mock`), { code: -32601 });
    }
  }

  one(body) {
    this.calls.push({ method: body.method, at: Date.now(), mode: this.mode });
    try {
      return { jsonrpc: '2.0', id: body.id, result: this.answer(body.method, body.params ?? []) };
    } catch (e) {
      return { jsonrpc: '2.0', id: body.id, error: { code: e.code ?? -32603, message: String(e.message) } };
    }
  }

  /** Install the guard and the RPC route on a browser context. `origin` is the loopback app origin. */
  async install(context, origin) {
    // Registered first, so it runs LAST: anything not handled by a more specific route is refused and recorded.
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin || ['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
      this.blockedOrigins.push(url.origin);
      return route.abort('blockedbyclient');
    });
    await context.route(`${RPC_URL}/**`, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (this.failAfter !== null) {
        if (this.failAfter <= 0) {
          this.mode = 'down';
          this.failAfter = null;
        } else this.failAfter -= 1;
      }
      if (this.mode === 'down') {
        this.calls.push({ method: '(refused: rpc down)', at: Date.now(), mode: 'down' });
        return route.abort('connectionreset');
      }
      let parsed;
      try {
        parsed = JSON.parse(req.postData() ?? 'null');
      } catch {
        return route.fulfill({ status: 400, headers: CORS, body: 'bad json' });
      }
      const out = Array.isArray(parsed) ? parsed.map((b) => this.one(b)) : this.one(parsed);
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(out) });
    });
  }
}
