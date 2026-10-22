import { PluginError } from './errors.js';

/** Maximum request body a plugin may send, in UTF-16 code units. */
export const MAX_REQUEST_BODY = 64 * 1024;
/** Maximum response body handed back to a plugin. */
export const MAX_RESPONSE_BODY = 1024 * 1024;
/** Maximum keys per plugin in storage. */
export const MAX_STORAGE_KEYS = 64;
/** Maximum value length per key. */
export const MAX_STORAGE_VALUE = 16 * 1024;

/** Host-provided network transport. The plugin never sees it directly. */
export interface NetworkPort {
  fetch(request: {
    readonly url: string;
    readonly method: 'GET' | 'POST';
    readonly body?: string;
  }): Promise<{ readonly status: number; readonly body: string }>;
}

/** Host-provided key/value store. Keys are namespaced before reaching it. */
export interface StoragePort {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Network API exposed to a plugin that was granted network access. */
export interface PluginNetwork {
  readonly fetch: (
    url: string,
    init?: { method?: 'GET' | 'POST'; body?: string },
  ) => Promise<{ status: number; body: string }>;
}

/** Storage API exposed to a plugin that was granted storage. Methods do not use `this`. */
export interface PluginStorage {
  readonly get: (key: string) => Promise<string | undefined>;
  readonly set: (key: string, value: string) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
}

/**
 * What a hook receives. Absent members mean "not granted": deny-by-default.
 * Every member stops working once the hook returns or times out.
 */
export interface PluginContext {
  readonly pluginId: string;
  /** Host clock, unix milliseconds. */
  now(): number;
  readonly network?: PluginNetwork;
  readonly storage?: PluginStorage;
}

/** Handle used by the registry to revoke a context. */
export interface ContextHandle {
  readonly context: PluginContext;
  revoke(): void;
}

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const INDEX_KEY = '~index';

function namespaced(pluginId: string, key: string): string {
  return `plugin/${pluginId}/${key}`;
}

function checkUrl(raw: unknown, hosts: ReadonlySet<string>): string {
  if (typeof raw !== 'string' || raw.length > 2048) throw new PluginError('PERMISSION', 'network.url');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new PluginError('PERMISSION', 'network.url');
  }
  // https only, exact host match, default port, no credentials.
  if (
    u.protocol !== 'https:' ||
    u.username !== '' ||
    u.password !== '' ||
    u.port !== '' ||
    !hosts.has(u.hostname)
  ) {
    throw new PluginError('PERMISSION', 'network.url');
  }
  return u.href;
}

async function readIndex(port: StoragePort, pluginId: string): Promise<string[]> {
  const raw = await port.get(namespaced(pluginId, INDEX_KEY));
  if (raw === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PluginError('LIMIT', 'storage.index');
  }
  if (!Array.isArray(parsed) || !parsed.every((k) => typeof k === 'string' && KEY_RE.test(k))) {
    throw new PluginError('LIMIT', 'storage.index');
  }
  return parsed as string[];
}

/**
 * Builds a capability-scoped context for one hook invocation.
 *
 * @param pluginId Validated plugin id.
 * @param grants Effective grants (manifest request intersected with host grant).
 * @param ports Host ports; a grant without a port still yields no API.
 * @param clock Injected clock.
 * @returns Context and a revoke function.
 * @security Trust boundary. Network: https, exact allowlisted host, default port,
 * no credentials, bounded bodies. Storage: per-plugin namespace, key regex, size
 * and key-count quota. This is capability discipline, not a JS isolation boundary:
 * code in the same realm can still reach globals (see audit).
 */
export function createContext(
  pluginId: string,
  grants: { readonly network: readonly string[]; readonly storage: boolean },
  ports: { readonly network?: NetworkPort | undefined; readonly storage?: StoragePort | undefined },
  clock: () => number,
): ContextHandle {
  let active = true;
  const guard = (): void => {
    if (!active) throw new PluginError('PERMISSION', 'revoked');
  };
  const ctx: { pluginId: string; now: () => number; network?: PluginNetwork; storage?: PluginStorage } = {
    pluginId,
    now: () => {
      guard();
      return clock();
    },
  };

  const netPort = ports.network;
  if (grants.network.length > 0 && netPort !== undefined) {
    const hosts = new Set(grants.network);
    ctx.network = Object.freeze({
      fetch: async (url: string, init?: { method?: 'GET' | 'POST'; body?: string }) => {
        guard();
        const href = checkUrl(url, hosts);
        const method = init?.method ?? 'GET';
        if (method !== 'GET' && method !== 'POST') throw new PluginError('PERMISSION', 'network.method');
        const body = init?.body;
        if (
          body !== undefined &&
          (typeof body !== 'string' || body.length > MAX_REQUEST_BODY || method === 'GET')
        ) {
          throw new PluginError('LIMIT', 'network.body');
        }
        const res = await netPort.fetch(
          body === undefined ? { url: href, method } : { url: href, method, body },
        );
        guard(); // a late response after revoke is not delivered
        if (typeof res.body !== 'string' || res.body.length > MAX_RESPONSE_BODY)
          throw new PluginError('LIMIT', 'network.response');
        return { status: res.status, body: res.body };
      },
    });
  }

  const store = ports.storage;
  if (grants.storage && store !== undefined) {
    const key = (k: unknown): string => {
      if (typeof k !== 'string' || !KEY_RE.test(k)) throw new PluginError('PERMISSION', 'storage.key');
      return k;
    };
    // Index updates are read-modify-write: serialize mutations so concurrent calls
    // from one plugin cannot lose index entries or overshoot the key quota.
    let tail: Promise<unknown> = Promise.resolve();
    const serial = <T>(op: () => Promise<T>): Promise<T> => {
      const next = tail.then(op, op);
      tail = next.catch(() => undefined);
      return next;
    };
    ctx.storage = Object.freeze({
      get: async (k: string) => {
        guard();
        return store.get(namespaced(pluginId, key(k)));
      },
      set: async (k: string, v: string) => {
        guard();
        const kk = key(k);
        if (typeof v !== 'string' || v.length > MAX_STORAGE_VALUE)
          throw new PluginError('LIMIT', 'storage.value');
        return serial(async () => {
          guard();
          const index = await readIndex(store, pluginId);
          if (!index.includes(kk)) {
            if (index.length >= MAX_STORAGE_KEYS) throw new PluginError('LIMIT', 'storage.keys');
            index.push(kk);
            await store.set(namespaced(pluginId, INDEX_KEY), JSON.stringify(index.sort()));
          }
          guard();
          await store.set(namespaced(pluginId, kk), v);
        });
      },
      delete: async (k: string) => {
        guard();
        const kk = key(k);
        return serial(async () => {
          guard();
          const index = await readIndex(store, pluginId);
          await store.delete(namespaced(pluginId, kk));
          if (index.includes(kk)) {
            await store.set(namespaced(pluginId, INDEX_KEY), JSON.stringify(index.filter((x) => x !== kk)));
          }
        });
      },
    });
  }

  return {
    context: Object.freeze(ctx),
    revoke: () => {
      active = false;
    },
  };
}
