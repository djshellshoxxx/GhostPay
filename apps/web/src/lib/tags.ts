import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';

/**
 * Feature 4: encrypted local client tags.
 *
 * - Keys: HKDF-SHA-256 over the viewing key with a random per-profile salt and distinct `info` strings produce a
 *   non-extractable AES-256-GCM key and a separate non-extractable HMAC-SHA-256 key. The viewing key is never used as a
 *   key directly.
 * - Records: AES-GCM with a fresh 96-bit IV per write; the AAD binds the schema version, chain id, record id AND lookup
 *   token, so ciphertext cannot be spliced from one record into another (S3-16), and `find` also checks that the decrypted
 *   address is the one asked for. METADATA IS IN THE CLEAR: record count, chain id, record id, lookup token, IV and the
 *   created/updated times are readable by anything that can read this origin's IndexedDB; only the payload is encrypted. The lookup token is
 *   HMAC(chainId || stealth address), so no raw address or unkeyed hash is stored.
 * - The unlocked CryptoKeys live in this object only; `lock()` drops them. Nothing is sent over the network.
 */
export interface TagPayload {
  readonly stealthAddress: string;
  /** `blockHash:logIndex` of the announcement (the scanner does not retain transaction hashes). */
  readonly announcementId: string;
  readonly logIndex: number;
  readonly clientLabel: string;
  readonly invoiceLabel?: string;
  readonly notes?: string;
}

export interface EncryptedTagRecord {
  readonly schemaVersion: 1 | 2;
  readonly chainId: number;
  readonly recordId: string;
  /** Hex HMAC token. */
  readonly lookupKey: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Key generation that encrypted this record (absent on records written before rotation existed: version 1). Not part of the AAD. */
  readonly keyVersion?: number;
}

export interface ProfileMeta {
  /** Key generation of the current salt (absent means 1). Incremented by `rotateKeys`. */
  readonly keyVersion?: number;
  /** Hex, public, random. */
  readonly salt: string;
  /** Encrypted constant that proves a key is the right one without needing any record. */
  readonly check: { readonly iv: string; readonly ciphertext: string };
}

export interface TagStore {
  getMeta(): Promise<ProfileMeta | undefined>;
  setMeta(m: ProfileMeta): Promise<void>;
  put(r: EncryptedTagRecord): Promise<void>;
  getByLookup(chainId: number, lookupKey: string): Promise<EncryptedTagRecord | undefined>;
  getAll(): Promise<readonly EncryptedTagRecord[]>;
  delete(recordId: string): Promise<void>;
  clear(): Promise<void>;
  /**
   * Atomically applies puts, deletes and an optional profile-meta replacement: all of it commits or none of it does
   * (one transaction). Used by archive import and key rotation so a failure never leaves a partial write.
   */
  applyBatch(batch: { readonly puts: readonly EncryptedTagRecord[]; readonly deleteIds: readonly string[]; readonly meta?: ProfileMeta }): Promise<void>;
}

/** A decrypted tag with the (non-secret) timestamps needed for backup and merge. */
export interface TagSnapshotEntry {
  readonly chainId: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly payload: TagPayload;
}

export interface TagImportPreview {
  readonly mode: 'merge' | 'replace';
  /** Distinct tags in the archive. */
  readonly total: number;
  /** Tags that do not exist locally. */
  readonly added: number;
  /** Local tags overwritten (merge: the archive copy is newer; replace: always). */
  readonly updated: number;
  /** Merge only: tags in conflict where the local copy is as new or newer and is kept. */
  readonly keptLocal: number;
  /** Local tags deleted by a replace. */
  readonly removed: number;
}

const INFO_AES = utf8ToBytes('GhostPay/local-tags/v1/aes-gcm');
const INFO_HMAC = utf8ToBytes('GhostPay/local-tags/v1/hmac');
const CHECK_PLAINTEXT = utf8ToBytes('ghostpay-tag-profile-ok');
const MAX_LABEL = 200;
const MAX_NOTES = 2000;

async function deriveKeys(viewingKey: Uint8Array, salt: Uint8Array): Promise<{ aes: CryptoKey; hmac: CryptoKey }> {
  const base = await subtle().importKey('raw', viewingKey as Uint8Array<ArrayBuffer>, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const s = salt as Uint8Array<ArrayBuffer>;
  const aes = await subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: s, info: INFO_AES as Uint8Array<ArrayBuffer> }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const hmac = await subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: s, info: INFO_HMAC as Uint8Array<ArrayBuffer> }, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
  return { aes, hmac };
}

function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (s === undefined) throw new UserFacingError('This browser has no Web Crypto support.');
  return s;
}

function rand(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** AAD of the profile check record. */
function aad(chainId: number): Uint8Array<ArrayBuffer> {
  return utf8ToBytes(`GhostPay/tag/v1|${String(chainId)}`);
}

/** AAD of a tag record: binds position (chain, record id, lookup token) to the ciphertext. */
function recordAad(chainId: number, recordId: string, lookupKey: string): Uint8Array<ArrayBuffer> {
  return utf8ToBytes(`GhostPay/tag/v2|${String(chainId)}|${recordId}|${lookupKey}`);
}

export function validatePayload(p: TagPayload): TagPayload {
  const label = p.clientLabel.trim();
  if (label === '' || label.length > MAX_LABEL) throw new UserFacingError(`Client label must be 1 to ${String(MAX_LABEL)} characters.`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(p.stealthAddress)) throw new UserFacingError('Invalid stealth address.');
  if (!/^0x[0-9a-fA-F]{64}:\d{1,9}$/.test(p.announcementId)) throw new UserFacingError('Invalid announcement id.');
  if (!Number.isInteger(p.logIndex) || p.logIndex < 0) throw new UserFacingError('Invalid log index.');
  if ((p.invoiceLabel?.length ?? 0) > MAX_LABEL || (p.notes?.length ?? 0) > MAX_NOTES) throw new UserFacingError('Label or notes too long.');
  return {
    stealthAddress: p.stealthAddress.toLowerCase(),
    announcementId: p.announcementId.toLowerCase(),
    logIndex: p.logIndex,
    clientLabel: label,
    ...(p.invoiceLabel === undefined || p.invoiceLabel === '' ? {} : { invoiceLabel: p.invoiceLabel }),
    ...(p.notes === undefined || p.notes === '' ? {} : { notes: p.notes }),
  };
}

export class TagVault {
  private aes: CryptoKey | undefined;
  private hmac: CryptoKey | undefined;
  /** Bumped by every state change (unlock, lock, write, import, rotation); a staged preview is valid for one revision only. */
  private revision = 0;
  private readonly previews = new WeakMap<TagImportPreview, { readonly revision: number; readonly puts: readonly EncryptedTagRecord[]; readonly deleteIds: readonly string[] }>();

  public constructor(
    private readonly store: TagStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  public get unlocked(): boolean {
    return this.aes !== undefined && this.hmac !== undefined;
  }

  /** Derives keys from the viewing key (consumed and zeroized). Creates the profile on first use. */
  public async unlock(viewingKey: Uint8Array): Promise<void> {
    try {
      const meta = await this.store.getMeta();
      const salt = meta === undefined ? rand(32) : hexToBytes(meta.salt);
      const { aes, hmac } = await deriveKeys(viewingKey, salt);
      if (meta === undefined) {
        const iv = rand(12);
        const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(0), tagLength: 128 }, aes, CHECK_PLAINTEXT));
        await this.store.setMeta({ salt: bytesToHex(salt), check: { iv: bytesToHex(iv), ciphertext: bytesToHex(ct) } });
      } else {
        try {
          await subtle().decrypt({ name: 'AES-GCM', iv: hexToBytes(meta.check.iv) as Uint8Array<ArrayBuffer>, additionalData: aad(0), tagLength: 128 }, aes, hexToBytes(meta.check.ciphertext));
        } catch {
          throw new UserFacingError('These tags were created with a different viewing key.');
        }
      }
      this.revision++;
      this.aes = aes;
      this.hmac = hmac;
    } finally {
      viewingKey.fill(0);
    }
  }

  public lock(): void {
    this.revision++;
    this.aes = undefined;
    this.hmac = undefined;
  }

  private keys(): { aes: CryptoKey; hmac: CryptoKey } {
    if (this.aes === undefined || this.hmac === undefined) throw new UserFacingError('Tags are locked. Unlock them first.');
    return { aes: this.aes, hmac: this.hmac };
  }

  private async token(chainId: number, stealthAddress: string): Promise<string> {
    const { hmac } = this.keys();
    const mac = await subtle().sign('HMAC', hmac, utf8ToBytes(`${String(chainId)}|${stealthAddress.toLowerCase()}`));
    return bytesToHex(new Uint8Array(mac));
  }

  public async save(chainId: number, payload: TagPayload): Promise<void> {
    const { aes } = this.keys();
    const clean = validatePayload(payload);
    const lookupKey = await this.token(chainId, clean.stealthAddress);
    const existing = await this.store.getByLookup(chainId, lookupKey);
    const iv = rand(12);
    const recordId = existing?.recordId ?? bytesToHex(rand(16));
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: recordAad(chainId, recordId, lookupKey), tagLength: 128 }, aes, utf8ToBytes(JSON.stringify(clean))));
    const t = this.now();
    const keyVersion = (await this.store.getMeta())?.keyVersion ?? 1;
    this.revision++;
    await this.store.put({
      schemaVersion: 2,
      chainId,
      recordId,
      lookupKey,
      iv: bytesToHex(iv),
      ciphertext: bytesToHex(ct),
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
      keyVersion,
    });
  }

  private async open(r: EncryptedTagRecord): Promise<TagPayload> {
    const { aes } = this.keys();
    let plain: Uint8Array | undefined;
    try {
      if (r.schemaVersion !== 1 && r.schemaVersion !== 2) throw new Error('unsupported tag schema');
      plain = new Uint8Array(await subtle().decrypt({
        name: 'AES-GCM', iv: hexToBytes(r.iv) as Uint8Array<ArrayBuffer>,
        additionalData: r.schemaVersion === 1 ? aad(r.chainId) : recordAad(r.chainId, r.recordId, r.lookupKey),
        tagLength: 128,
      }, aes, hexToBytes(r.ciphertext)));
      const payload = validatePayload(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)) as TagPayload);
      // Old records bound only the chain. Verify their address against the keyed lookup token before upgrading.
      if (await this.token(r.chainId, payload.stealthAddress) !== r.lookupKey) throw new Error('tag lookup mismatch');
      if (r.schemaVersion === 1) {
        const iv = rand(12);
        const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv,
          additionalData: recordAad(r.chainId, r.recordId, r.lookupKey), tagLength: 128 }, aes, plain as Uint8Array<ArrayBuffer>);
        await this.store.put({ ...r, schemaVersion: 2, iv: bytesToHex(iv), ciphertext: bytesToHex(new Uint8Array(ciphertext)) });
      }
      return payload;
    } catch {
      throw new UserFacingError('A stored tag could not be decrypted (damaged or from another key).');
    } finally {
      plain?.fill(0);
    }
  }

  public async find(chainId: number, stealthAddress: string): Promise<TagPayload | undefined> {
    const rec = await this.store.getByLookup(chainId, await this.token(chainId, stealthAddress));
    if (rec === undefined) return undefined;
    const payload = await this.open(rec);
    // Defence in depth: the record found under this token must really be about this address.
    if (payload.stealthAddress !== stealthAddress.toLowerCase()) throw new UserFacingError('A stored tag does not belong to this address and was ignored.');
    return payload;
  }

  public async list(chainId?: number): Promise<readonly TagPayload[]> {
    const all = await this.store.getAll();
    const out: TagPayload[] = [];
    for (const r of all) {
      if (chainId !== undefined && r.chainId !== chainId) continue;
      out.push(await this.open(r));
    }
    return out;
  }

  public async remove(chainId: number, stealthAddress: string): Promise<boolean> {
    const rec = await this.store.getByLookup(chainId, await this.token(chainId, stealthAddress));
    if (rec === undefined) return false;
    this.revision++;
    await this.store.delete(rec.recordId);
    return true;
  }

  /** Decrypts one record without the schema-1 upgrade write; shared by backup and rotation. */
  private async peek(r: EncryptedTagRecord, keys: { aes: CryptoKey; hmac: CryptoKey }): Promise<TagPayload> {
    try {
      if (r.schemaVersion !== 1 && r.schemaVersion !== 2) throw new Error('unsupported tag schema');
      const plain = new Uint8Array(await subtle().decrypt({
        name: 'AES-GCM', iv: hexToBytes(r.iv) as Uint8Array<ArrayBuffer>,
        additionalData: r.schemaVersion === 1 ? aad(r.chainId) : recordAad(r.chainId, r.recordId, r.lookupKey),
        tagLength: 128,
      }, keys.aes, hexToBytes(r.ciphertext)));
      try {
        const payload = validatePayload(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)) as TagPayload);
        const mac = bytesToHex(new Uint8Array(await subtle().sign('HMAC', keys.hmac, utf8ToBytes(`${String(r.chainId)}|${payload.stealthAddress}`))));
        if (mac !== r.lookupKey) throw new Error('tag lookup mismatch');
        return payload;
      } finally {
        plain.fill(0);
      }
    } catch {
      throw new UserFacingError('A stored tag could not be decrypted (damaged or from another key).');
    }
  }

  /** True when `viewingKey` (consumed and zeroized) is the key this profile was created with. Changes no state. Used as re-authentication. */
  public async verifyKey(viewingKey: Uint8Array): Promise<boolean> {
    try {
      const meta = await this.store.getMeta();
      if (meta === undefined) return false;
      const { aes } = await deriveKeys(viewingKey, hexToBytes(meta.salt));
      await subtle().decrypt({ name: 'AES-GCM', iv: hexToBytes(meta.check.iv) as Uint8Array<ArrayBuffer>, additionalData: aad(0), tagLength: 128 }, aes, hexToBytes(meta.check.ciphertext));
      return true;
    } catch {
      return false;
    } finally {
      viewingKey.fill(0);
    }
  }

  /** Every tag, decrypted, with timestamps. Requires an unlocked vault. All-or-nothing: any damaged record fails the whole call. */
  public async snapshot(): Promise<readonly TagSnapshotEntry[]> {
    const keys = this.keys();
    const revision = this.revision;
    const out: TagSnapshotEntry[] = [];
    for (const r of await this.store.getAll()) out.push({ chainId: r.chainId, createdAt: r.createdAt, updatedAt: r.updatedAt, payload: await this.peek(r, keys) });
    if (revision !== this.revision) throw new UserFacingError('Tags changed while reading them. Try again.');
    return out;
  }

  /** Key generation of the current profile (1 until the first rotation). */
  public async keyVersion(): Promise<number> {
    return (await this.store.getMeta())?.keyVersion ?? 1;
  }

  /**
   * Dry run of an import: computes what would change and stages it. Nothing is written. Merge keeps the newest `updatedAt`
   * (ties keep the local copy); replace makes the local set equal to the archive. The preview is valid only until the
   * next state change (write, lock, unlock, import, rotation).
   */
  public async previewImport(entries: readonly TagSnapshotEntry[], mode: 'merge' | 'replace'): Promise<TagImportPreview> {
    const { aes } = this.keys();
    const revision = this.revision;
    const incoming = new Map<string, TagSnapshotEntry>();
    for (const e of entries) {
      if (!Number.isInteger(e.chainId) || e.chainId < 0) throw new UserFacingError('Invalid chain id in archive.');
      const payload = validatePayload(e.payload);
      const k = `${String(e.chainId)}|${payload.stealthAddress}`;
      const prev = incoming.get(k);
      if (prev === undefined || e.updatedAt > prev.updatedAt) incoming.set(k, { ...e, payload });
    }
    const existing = await this.store.getAll();
    const byLookup = new Map(existing.map((r) => [`${String(r.chainId)}|${r.lookupKey}`, r]));
    const keyVersion = await this.keyVersion();
    const puts: EncryptedTagRecord[] = [];
    const keep = new Set<string>();
    let added = 0; let updated = 0; let keptLocal = 0;
    for (const e of incoming.values()) {
      const lookupKey = await this.token(e.chainId, e.payload.stealthAddress);
      const local = byLookup.get(`${String(e.chainId)}|${lookupKey}`);
      if (local !== undefined) keep.add(local.recordId);
      if (mode === 'merge' && local !== undefined && local.updatedAt >= e.updatedAt) { keptLocal++; continue; }
      if (local === undefined) added++; else updated++;
      const recordId = local?.recordId ?? bytesToHex(rand(16));
      const iv = rand(12);
      const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: recordAad(e.chainId, recordId, lookupKey), tagLength: 128 }, aes, utf8ToBytes(JSON.stringify(e.payload))));
      puts.push({ schemaVersion: 2, chainId: e.chainId, recordId, lookupKey, iv: bytesToHex(iv), ciphertext: bytesToHex(ct), createdAt: local === undefined ? e.createdAt : Math.min(local.createdAt, e.createdAt), updatedAt: e.updatedAt, keyVersion });
    }
    const deleteIds = mode === 'replace' ? existing.filter((r) => !keep.has(r.recordId)).map((r) => r.recordId) : [];
    if (revision !== this.revision) throw new UserFacingError('Tags changed while preparing the import. Preview again.');
    const preview: TagImportPreview = Object.freeze({ mode, total: incoming.size, added, updated, keptLocal, removed: deleteIds.length });
    this.previews.set(preview, { revision, puts, deleteIds });
    return preview;
  }

  /** Commits a staged preview in one atomic store transaction. Rejects stale previews and locked vaults. */
  public async applyImport(preview: TagImportPreview): Promise<void> {
    this.keys();
    const staged = this.previews.get(preview);
    if (staged === undefined || staged.revision !== this.revision) throw new UserFacingError('Tags changed since the preview. Preview the import again.');
    this.previews.delete(preview);
    this.revision++;
    await this.store.applyBatch({ puts: staged.puts, deleteIds: staged.deleteIds });
  }

  /**
   * Replaces the profile salt and re-encrypts every tag under fresh keys (key version + 1). `viewingKey` (consumed) must
   * be the profile's key. All new records and the new profile meta commit in ONE store transaction, so a crash or failure
   * at any point leaves the old, fully readable state (there is no half-rotated state to resume). Rotating tag keys does
   * not protect data exposed before the rotation, and it does not replace the viewing key itself. Older archives stay
   * readable with their own passphrase.
   */
  public async rotateKeys(viewingKey: Uint8Array): Promise<number> {
    const old = this.keys();
    const revision = this.revision;
    try {
      const meta = await this.store.getMeta();
      if (meta === undefined) throw new UserFacingError('There is no tag profile to rotate.');
      const probe = await deriveKeys(viewingKey, hexToBytes(meta.salt));
      try {
        await subtle().decrypt({ name: 'AES-GCM', iv: hexToBytes(meta.check.iv) as Uint8Array<ArrayBuffer>, additionalData: aad(0), tagLength: 128 }, probe.aes, hexToBytes(meta.check.ciphertext));
      } catch {
        throw new UserFacingError('That is not the viewing key of these tags.');
      }
      const salt = rand(32);
      const fresh = await deriveKeys(viewingKey, salt);
      const keyVersion = (meta.keyVersion ?? 1) + 1;
      const puts: EncryptedTagRecord[] = [];
      for (const r of await this.store.getAll()) {
        const payload = await this.peek(r, old);
        const lookupKey = bytesToHex(new Uint8Array(await subtle().sign('HMAC', fresh.hmac, utf8ToBytes(`${String(r.chainId)}|${payload.stealthAddress}`))));
        const iv = rand(12);
        const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: recordAad(r.chainId, r.recordId, lookupKey), tagLength: 128 }, fresh.aes, utf8ToBytes(JSON.stringify(payload))));
        puts.push({ ...r, schemaVersion: 2, lookupKey, iv: bytesToHex(iv), ciphertext: bytesToHex(ct), keyVersion });
      }
      const checkIv = rand(12);
      const check = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: checkIv, additionalData: aad(0), tagLength: 128 }, fresh.aes, CHECK_PLAINTEXT));
      if (revision !== this.revision) throw new UserFacingError('Tags changed during rotation. Nothing was changed; try again.');
      this.revision++;
      await this.store.applyBatch({ puts, deleteIds: [], meta: { salt: bytesToHex(salt), keyVersion, check: { iv: bytesToHex(checkIv), ciphertext: bytesToHex(check) } } });
      this.aes = fresh.aes;
      this.hmac = fresh.hmac;
      return keyVersion;
    } finally {
      viewingKey.fill(0);
    }
  }

  /** Deletes every tag and the profile, and locks. Works while locked. */
  public async wipe(): Promise<void> {
    this.lock();
    await this.store.clear();
  }
}

/** In-memory `TagStore` (tests, and a safe fallback when IndexedDB is unavailable: tags then last for the tab only). */
export class MemoryTagStore implements TagStore {
  private meta: ProfileMeta | undefined;
  private readonly records = new Map<string, EncryptedTagRecord>();
  public getMeta(): Promise<ProfileMeta | undefined> {
    return Promise.resolve(this.meta);
  }
  public setMeta(m: ProfileMeta): Promise<void> {
    this.meta = m;
    return Promise.resolve();
  }
  public put(r: EncryptedTagRecord): Promise<void> {
    this.records.set(r.recordId, r);
    return Promise.resolve();
  }
  public getByLookup(chainId: number, lookupKey: string): Promise<EncryptedTagRecord | undefined> {
    for (const r of this.records.values()) if (r.chainId === chainId && r.lookupKey === lookupKey) return Promise.resolve(r);
    return Promise.resolve(undefined);
  }
  public getAll(): Promise<readonly EncryptedTagRecord[]> {
    return Promise.resolve([...this.records.values()]);
  }
  public applyBatch(b: { readonly puts: readonly EncryptedTagRecord[]; readonly deleteIds: readonly string[]; readonly meta?: ProfileMeta }): Promise<void> {
    for (const id of b.deleteIds) this.records.delete(id);
    for (const r of b.puts) this.records.set(r.recordId, r);
    if (b.meta !== undefined) this.meta = b.meta;
    return Promise.resolve();
  }
  public delete(recordId: string): Promise<void> {
    this.records.delete(recordId);
    return Promise.resolve();
  }
  public clear(): Promise<void> {
    this.meta = undefined;
    this.records.clear();
    return Promise.resolve();
  }
}
