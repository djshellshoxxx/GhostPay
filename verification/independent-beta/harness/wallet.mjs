// W5 independent payment-state verifier: mock EIP-1193 / EIP-6963 wallet.
// Original work. The browser shim forwards every request to the Node controller through one Playwright binding, so a
// single wallet (like one extension) serves both tabs, and every request is recorded with the tab that made it.
// Behaviour of each eth_sendTransaction is scripted by the scenario; nothing here inspects GhostPay internals.

export const ACCOUNT_A = '0x5555555555555555555555555555555555555555';
export const ACCOUNT_B = '0x6666666666666666666666666666666666666666';
export const OTHER_CHAIN = '0xaa36a7'; // Sepolia: a different EVM chain than the invoice's 84532.

/** Methods that can move funds or authorize spending: each one is a "wallet handoff". */
export const FUND_MOVING = new Set([
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'eth_signTypedData_v4',
  'eth_signTypedData',
  'eth_sign',
  'personal_sign',
  'wallet_sendCalls',
]);

/** Browser-side shim, serialized into an init script. Keep it free of closures over Node values. */
function browserShim() {
  const listeners = new Map();
  const provider = {
    isW5Mock: true,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
    },
    removeListener(event, fn) {
      listeners.get(event)?.delete(fn);
    },
    async request({ method, params }) {
      const reply = await window.__w5wallet({ method, params: params ?? [] });
      if (reply.ok) return reply.result;
      const err = new Error(reply.error.message);
      err.code = reply.error.code;
      throw err;
    },
  };
  // Node calls this through page.evaluate to deliver wallet events to this tab's listeners.
  window.__w5emit = (event, arg) => {
    for (const fn of [...(listeners.get(event) ?? [])]) {
      try {
        fn(arg);
      } catch {
        // A listener error must not stop delivery to other listeners (matches common wallet behaviour).
      }
    }
    return (listeners.get(event) ?? new Set()).size;
  };
  const announce = () =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({
          info: Object.freeze({ uuid: 'w5-mock-wallet', name: 'E2E Wallet', icon: '', rdns: 'test.e2e' }),
          provider,
        }),
      }),
    );
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
}

export const BROWSER_SHIM = `(${browserShim.toString()})();`;

/**
 * Node-side wallet. `chain` is the SyntheticChain; `rng` supplies transaction hashes; `tabOf(page)` names the tab.
 * Scenario code sets `nextSend` to choose the behaviour of the next eth_sendTransaction:
 *   ok                    broadcast, reply with the hash
 *   hang-broadcast        broadcast, never reply (until release())
 *   hang-nobroadcast      do not broadcast, never reply (until release())
 *   error-after-broadcast broadcast, reply with a non-4001 error (outcome unknown to the page)
 *   reject                user rejection, code 4001, nothing broadcast
 */
export class WalletController {
  constructor({ chain, rng, tabOf, intentOf, pageIdOf, docOf, onDelivered }) {
    this.chain = chain;
    this.rng = rng;
    this.tabOf = tabOf;
    this.intentOf = intentOf;
    this.pageIdOf = pageIdOf;
    // docOf(page) = how many documents this page has loaded. A reply reaches the app only if the document that made
    // the request is still the page's current document (harness fix H5: navigation, not just close, loses a reply).
    this.docOf = docOf;
    this.onDelivered = onDelivered; // (hash) => void, called when a hash reply reaches a still-open page
    this.account = ACCOUNT_A;
    this.chainId = '0x14a34';
    this.nextSend = 'ok';
    this.requests = []; // every request, in order
    this.handoffs = []; // fund-moving requests only
    this.held = []; // { resolve, hash, handoff }
    this.seq = 0;
  }

  async handle(page, { method, params }) {
    const tab = this.tabOf(page);
    const rec = { seq: (this.seq += 1), tab, method, at: Date.now(), account: this.account, chainId: this.chainId };
    this.requests.push(rec);
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return { ok: true, result: [this.account] };
      case 'eth_chainId':
        return { ok: true, result: this.chainId };
      case 'net_version':
        return { ok: true, result: String(parseInt(this.chainId, 16)) };
      case 'wallet_switchEthereumChain': {
        // A real wallet would prompt; the harness user declines so a chain change can only come from the scenario.
        return { ok: false, error: { code: 4001, message: 'User rejected the chain switch (W5 mock)' } };
      }
      case 'eth_sendTransaction':
        return this.send(page, tab, params, rec);
      default:
        if (FUND_MOVING.has(method)) {
          const handoff = { ...rec, intent: this.intentOf(tab), params, behaviour: 'refused-signing' };
          this.handoffs.push(handoff);
          return { ok: false, error: { code: 4001, message: 'W5 mock refuses signing requests' } };
        }
        return { ok: false, error: { code: 4200, message: `W5 mock: unsupported ${method}` } };
    }
  }

  async send(page, tab, params, rec) {
    const tx = { ...(params?.[0] ?? {}) };
    const behaviour = this.nextSend;
    this.nextSend = 'ok';
    const hash = this.rng.hash32();
    const handoff = { ...rec, intent: this.intentOf(tab), pageId: this.pageIdOf(page), doc: this.docOf(page), params: tx, behaviour, hash: undefined, replied: false };
    this.handoffs.push(handoff);
    const broadcast = behaviour !== 'reject' && behaviour !== 'hang-nobroadcast';
    if (broadcast) {
      this.chain.submit(hash, { ...tx, from: tx.from ?? this.account });
      handoff.broadcastHash = hash;
    }
    switch (behaviour) {
      case 'reject':
        handoff.replied = true;
        return { ok: false, error: { code: 4001, message: 'User rejected the request.' } };
      case 'error-after-broadcast':
        handoff.replied = true;
        return { ok: false, error: { code: -32603, message: 'Internal JSON-RPC error.' } };
      case 'hang-broadcast':
      case 'hang-nobroadcast':
        return new Promise((resolve) => {
          this.held.push({
            handoff,
            resolve: () => {
              handoff.replied = true;
              handoff.hash = hash;
              handoff.repliedAt = Date.now();
              handoff.deliveredToOpenPage = !page.isClosed() && this.docOf(page) === handoff.doc;
              if (handoff.deliveredToOpenPage) this.onDelivered(hash);
              if (!broadcast) this.chain.submit(hash, { ...tx, from: tx.from ?? this.account });
              resolve({ ok: true, result: hash });
            },
          });
        });
      default:
        handoff.replied = true;
        handoff.hash = hash;
        handoff.repliedAt = Date.now();
        handoff.deliveredToOpenPage = !page.isClosed() && this.docOf(page) === handoff.doc;
        if (handoff.deliveredToOpenPage) this.onDelivered(hash);
        return { ok: true, result: hash };
    }
  }

  /** Deliver every held reply (the "late wallet response"). Replies to closed pages are lost, as in a real browser. */
  releaseHeld() {
    const held = this.held.splice(0);
    for (const h of held) h.resolve();
    return held.map((h) => h.handoff);
  }

  async emit(pages, event, arg) {
    for (const p of pages) {
      if (p.isClosed()) continue;
      await p.evaluate(([e, a]) => window.__w5emit?.(e, a), [event, arg]).catch(() => undefined);
    }
  }

  async switchAccount(pages) {
    this.account = this.account === ACCOUNT_A ? ACCOUNT_B : ACCOUNT_A;
    await this.emit(pages, 'accountsChanged', [this.account]);
  }

  async switchChain(pages) {
    this.chainId = this.chainId === '0x14a34' ? OTHER_CHAIN : '0x14a34';
    await this.emit(pages, 'chainChanged', this.chainId);
  }
}
