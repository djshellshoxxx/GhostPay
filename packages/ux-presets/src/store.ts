import { open, resolveKey, seal, type CryptoLike, type KeyMaterial } from './seal.js';
import { DECRYPT_FAILED_MESSAGE } from './seal.js';
import { err, ok, type Preset, type Result } from './types.js';
import { presetFromJson, presetToJson, validatePreset } from './validate.js';

export const MAX_PRESETS = 200;
export const MAX_PLAINTEXT_BYTES = 1024 * 1024;
export const DEFAULT_SLOT = 'presets';
const PLAINTEXT_VERSION = 1;

/** Injected persistence. Values are opaque ASCII strings; the adapter never sees plaintext. */
export interface StorageAdapter {
  get(slot: string): Promise<string | null>;
  put(slot: string, value: string): Promise<void>;
}

export interface PresetStoreOptions {
  readonly storage: StorageAdapter;
  /** AES-256-GCM CryptoKey, or exactly 32 derived key bytes. No password KDF here. */
  readonly key: KeyMaterial;
  /** Storage slot; bound into the AAD. Default `presets`. */
  readonly slot?: string;
  /** WebCrypto implementation; defaults to `globalThis.crypto`. */
  readonly crypto?: CryptoLike;
}

export interface PresetStore {
  list(): Promise<Result<readonly Preset[]>>;
  get(id: string): Promise<Result<Preset>>;
  /** Insert or replace by id (validated). */
  save(preset: Preset): Promise<Result<Preset>>;
  remove(id: string): Promise<Result<true>>;
}

interface Loaded {
  readonly revision: number;
  readonly presets: readonly Preset[];
}

const failOpen = () => err<never>('decrypt-failed', DECRYPT_FAILED_MESSAGE);

function decode(bytes: Uint8Array): Loaded | null {
  try {
    if (bytes.length > MAX_PLAINTEXT_BYTES) return null;
    const doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return null;
    const d = doc as Record<string, unknown>;
    if (Object.keys(d).length !== 3 || d.v !== PLAINTEXT_VERSION) return null;
    const rev = d.revision;
    if (typeof rev !== 'number' || !Number.isSafeInteger(rev) || rev < 0) return null;
    if (!Array.isArray(d.presets) || d.presets.length > MAX_PRESETS) return null;
    const seen = new Set<string>();
    const presets: Preset[] = [];
    for (const item of d.presets as unknown[]) {
      const p = presetFromJson(item);
      if (!p.ok || seen.has(p.value.id)) return null;
      seen.add(p.value.id);
      presets.push(p.value);
    }
    return { revision: rev, presets };
  } catch {
    return null;
  }
}

function encode(l: Loaded): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify(
      { v: PLAINTEXT_VERSION, revision: l.revision, presets: l.presets.map((p) => presetToJson(p)) },
      (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
    ),
  );
}

/**
 * Create an encrypted preset store (one AES-256-GCM blob per slot).
 *
 * @security
 * - Confidentiality and integrity: AES-256-GCM, random 96-bit IV per write,
 *   versioned AAD binding format version + slot.
 * - Uniform failure: wrong key, tampering, truncation, swapped slot, bad
 *   version and malformed plaintext all yield `decrypt-failed` with one message.
 * - A failed open never triggers a write, so a wrong key cannot clobber data.
 * - Rollback is detected only within this store instance (revision counter
 *   must not decrease); an attacker with storage write access can still
 *   restore an older valid blob across sessions or delete the blob.
 * - Operations are serialized, so concurrent calls cannot lose updates.
 */
export async function createPresetStore(options: PresetStoreOptions): Promise<Result<PresetStore>> {
  const c: CryptoLike = options.crypto ?? (globalThis.crypto as CryptoLike);
  const slot = options.slot ?? DEFAULT_SLOT;
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(slot)) return err('invalid-context', 'invalid slot');
  const k = await resolveKey(options.key, c);
  if (!k.ok) return k;
  const key = k.value;
  const { storage } = options;
  let lastRevision = -1;
  let queue: Promise<unknown> = Promise.resolve();

  const serialize = <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  async function load(): Promise<Result<Loaded>> {
    let blob: string | null;
    try {
      blob = await storage.get(slot);
    } catch {
      return err('storage-failed', 'storage unavailable');
    }
    if (blob === null) return ok({ revision: Math.max(lastRevision, 0), presets: [] });
    const pt = await open(key, c, slot, blob);
    if (!pt.ok) return pt;
    const l = decode(pt.value);
    if (l === null || l.revision < lastRevision) return failOpen();
    lastRevision = l.revision;
    return ok(l);
  }

  async function persist(presets: readonly Preset[], base: number): Promise<Result<true>> {
    const next: Loaded = { revision: base + 1, presets };
    const bytes = encode(next);
    if (bytes.length > MAX_PLAINTEXT_BYTES) return err('limit-exceeded', 'preset store too large');
    const blob = await seal(key, c, slot, bytes);
    try {
      await storage.put(slot, blob);
    } catch {
      return err('storage-failed', 'storage unavailable');
    }
    lastRevision = next.revision;
    return ok(true);
  }

  return ok({
    list: () =>
      serialize(async () => {
        const l = await load();
        return l.ok ? ok(l.value.presets) : l;
      }),
    get: (id) =>
      serialize(async () => {
        const l = await load();
        if (!l.ok) return l;
        const p = l.value.presets.find((x) => x.id === id);
        return p ? ok(p) : err('not-found', 'preset not found');
      }),
    save: (preset) =>
      serialize(async () => {
        const v = validatePreset(preset);
        if (!v.ok) return v;
        const l = await load();
        if (!l.ok) return l;
        const exists = l.value.presets.some((x) => x.id === v.value.id);
        if (!exists && l.value.presets.length >= MAX_PRESETS)
          return err('limit-exceeded', 'too many presets');
        const presets = exists
          ? l.value.presets.map((x) => (x.id === v.value.id ? v.value : x))
          : [...l.value.presets, v.value];
        const w = await persist(presets, l.value.revision);
        return w.ok ? ok(v.value) : w;
      }),
    remove: (id) =>
      serialize(async () => {
        const l = await load();
        if (!l.ok) return l;
        if (!l.value.presets.some((x) => x.id === id)) return err('not-found', 'preset not found');
        return persist(
          l.value.presets.filter((x) => x.id !== id),
          l.value.revision,
        );
      }),
  });
}
