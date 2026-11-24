import type { Page } from '@playwright/test';
import type { SentTx } from './flowMocks';

export interface WalletControls {
  readonly calls: string[];
  holdSend: boolean;
  pending: boolean;
  changeAccountOnRecheck: boolean;
  releaseSend(): void;
  changeAccount(next?: string): void;
  replaceProvider(): void;
}

/** An EIP-6963 wallet injected before any page script runs. */
export async function injectWallet(page: Page, state: { sent?: SentTx; sendCalls?: number }): Promise<void> {
  await page.exposeFunction('__recordTx', (tx: SentTx) => {
    state.sent = tx;
    state.sendCalls = (state.sendCalls ?? 0) + 1;
  });
  await page.addInitScript(() => {
    let account = '0x5555555555555555555555555555555555555555';
    const w = window as unknown as { __mutate?: boolean; __recordTx: (tx: unknown) => Promise<void>; __e2eWallet: WalletControls };
    const listeners = new Map<string, Set<() => void>>();
    let resolveSend: (() => void) | undefined;
    const calls: string[] = [];
    const controls: WalletControls = {
      calls,
      holdSend: false,
      pending: false,
      changeAccountOnRecheck: false,
      releaseSend: () => { resolveSend?.(); },
      changeAccount: (next = '0x6666666666666666666666666666666666666666') => {
        account = next;
        for (const listener of listeners.get('accountsChanged') ?? []) listener();
      },
      replaceProvider: () => {
        for (const listener of listeners.get('disconnect') ?? []) listener();
        announcedProvider = { ...provider };
      },
    };
    w.__e2eWallet = controls;
    const provider = {
      on: (event: string, listener: () => void): void => {
        const group = listeners.get(event) ?? new Set<() => void>();
        group.add(listener);
        listeners.set(event, group);
      },
      removeListener: (event: string, listener: () => void): void => { listeners.get(event)?.delete(listener); },
      request: async ({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> => {
        calls.push(method);
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return [account];
          case 'eth_chainId':
            return '0x14a34';
          case 'net_version':
            if (controls.changeAccountOnRecheck) {
              controls.changeAccountOnRecheck = false;
              controls.changeAccount();
            }
            return '84532';
          case 'eth_sendTransaction': {
            const tx = { ...(params?.[0] as Record<string, string>) };
            if (w.__mutate === true) tx['data'] = `${tx['data']?.slice(0, -2) ?? ''}ff`;
            await w.__recordTx(tx);
            if (controls.holdSend) {
              controls.pending = true;
              await new Promise<void>((resolve) => { resolveSend = resolve; });
              controls.pending = false;
            }
            return `0x${'9'.repeat(64)}`;
          }
          default:
            throw new Error(`unsupported ${method}`);
        }
      },
    };
    let announcedProvider = provider;
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: { info: { uuid: 'e2e-wallet', name: 'E2E Wallet', icon: '', rdns: 'test.e2e' }, provider: announcedProvider },
        }),
      );
    });
  });
}
