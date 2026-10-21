import type { Eip1193Provider } from '../lib/wallet';

export interface RecordedCall {
  readonly method: string;
  readonly params: unknown;
}

export interface MockWalletOptions {
  readonly account?: string;
  readonly chainId?: number;
  /** eth_accounts differs from eth_requestAccounts. */
  readonly lieAboutAccounts?: boolean;
  /** net_version differs from eth_chainId. */
  readonly lieAboutChain?: boolean;
  /** Mutates calldata before "broadcasting". */
  readonly mutateTx?: (tx: Record<string, unknown>) => Record<string, unknown>;
  readonly rejectSend?: boolean;
  /** Signature returned by eth_signTypedData_v4. */
  readonly typedDataSignature?: string;
  readonly failSwitch?: boolean;
}

export const MOCK_ACCOUNT = '0x5555555555555555555555555555555555555555';

/** Controllable EIP-1193 wallet. `sent` holds what was really "broadcast" (after any mutation). */
export class MockWallet implements Eip1193Provider {
  public readonly calls: RecordedCall[] = [];
  public sent: Record<string, unknown> | undefined;
  public chainId: number;
  public constructor(private readonly o: MockWalletOptions = {}) {
    this.chainId = o.chainId ?? 84532;
  }
  public get account(): string {
    return this.o.account ?? MOCK_ACCOUNT;
  }
  public request(args: { readonly method: string; readonly params?: readonly unknown[] | object }): Promise<unknown> {
    this.calls.push({ method: args.method, params: args.params });
    switch (args.method) {
      case 'eth_requestAccounts':
        return Promise.resolve([this.account]);
      case 'eth_accounts':
        return Promise.resolve([this.o.lieAboutAccounts === true ? '0x6666666666666666666666666666666666666666' : this.account]);
      case 'eth_chainId':
        return Promise.resolve(`0x${this.chainId.toString(16)}`);
      case 'net_version':
        return Promise.resolve(this.o.lieAboutChain === true ? '1' : String(this.chainId));
      case 'wallet_switchEthereumChain': {
        if (this.o.failSwitch === true) return Promise.reject(Object.assign(new Error('no'), { code: 4902 }));
        const p = (args.params as [{ chainId: string }])[0];
        this.chainId = parseInt(p.chainId, 16);
        return Promise.resolve(null);
      }
      case 'eth_sendTransaction': {
        if (this.o.rejectSend === true) return Promise.reject(Object.assign(new Error('user rejected'), { code: 4001 }));
        const tx = (args.params as [Record<string, unknown>])[0];
        this.sent = this.o.mutateTx === undefined ? tx : this.o.mutateTx(tx);
        return Promise.resolve(`0x${'9'.repeat(64)}`);
      }
      case 'eth_signTypedData_v4':
        return Promise.resolve(this.o.typedDataSignature ?? `0x${'1'.repeat(130)}`);
      default:
        return Promise.reject(new Error(`unexpected ${args.method}`));
    }
  }
}
