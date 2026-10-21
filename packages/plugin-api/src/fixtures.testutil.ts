import type { PluginManifest } from './manifest.js';
import type { PrivacySettings } from './privacy.js';
import type { InvoiceView, PluginHooks, PluginModule } from './registry.js';
import type { NetworkPort, StoragePort } from './sandbox.js';

export const DEFAULTS: PrivacySettings = { delaySeconds: 600, relay: true, batchSize: 8 };

/** Fake invoice facts (test data only). */
export const INVOICE: InvoiceView = {
  chainId: '8453',
  asset: 'eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  amount: '250000000',
  expiresAt: 1_767_312_000,
};

export function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    apiVersion: 1,
    id: 'org.example.delay',
    name: 'Example delay',
    version: '1.2.3',
    capabilities: ['privacy:delay'],
    permissions: { network: [], storage: false, downgrade: false },
    ...overrides,
  };
}

export function plugin(m: Partial<PluginManifest>, hooks: PluginHooks): PluginModule {
  return { manifest: manifest(m), hooks };
}

export class MemoryStorage implements StoragePort {
  public readonly data = new Map<string, string>();
  public get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.data.get(key));
  }
  public set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }
  public delete(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }
}

export class FakeNetwork implements NetworkPort {
  public readonly calls: { url: string; method: string; body?: string }[] = [];
  public responseBody = '{"ok":true}';
  public fetch(req: {
    url: string;
    method: 'GET' | 'POST';
    body?: string;
  }): Promise<{ status: number; body: string }> {
    this.calls.push({ ...req });
    return Promise.resolve({ status: 200, body: this.responseBody });
  }
}

export function never(): Promise<never> {
  return new Promise<never>(() => undefined);
}
