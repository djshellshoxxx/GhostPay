import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';

/**
 * Feature 4: encrypted local client tags.
 *
 * - Keys: HKDF-SHA-256 over the viewing key with a random per-profile salt and distinct `info` strings produce a
 *   non-extractable AES-256-GCM key and a separate non-extractable HMAC-SHA-256 key. The viewing key is never used as a
 *   key directly.
 * - Records: AES-GCM with a fresh 96-bit IV per write; AAD binds the schema version and chain id. The lookup token is
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
  readonly schemaVersion: 1;
  readonly chainId: number;
  readonly recordId: string;
  /** Hex HMAC token. */
  readonly lookupKey: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ProfileMeta {
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
}

const INFO_AES = utf8ToBytes('GhostPay/local-tags/v1/aes-gcm');
const INFO_HMAC = utf8ToBytes('GhostPay/local-tags/v1/hmac');
const CHECK_PLAINTEXT = utf8ToBytes('ghostpay-tag-profile-ok');
const MAX_LABEL = 200;
const MAX_NOTES = 2000;

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

function aad(chainId: number): Uint8Array<ArrayBuffer> {
  return utf8ToBytes(`GhostPay/tag/v1|${String(chainId)}`);
}

function validatePayload(p: TagPayload): TagPayload {
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
      const base = await subtle().importKey('raw', viewingKey as Uint8Array<ArrayBuffer>, 'HKDF', false, ['deriveKey', 'deriveBits']);
      const aes = await subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: INFO_AES as Uint8Array<ArrayBuffer> }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const hmac = await subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: INFO_HMAC as Uint8Array<ArrayBuffer> }, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
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
      this.aes = aes;
      this.hmac = hmac;
    } finally {
      viewingKey.fill(0);
    }
  }

  public lock(): void {
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

  private saveQueue: Promise<void> = Promise.resolve();

  /** Saves are serialised so two concurrent saves for one address cannot both miss the existing record. */
  public save(chainId: number, payload: TagPayload): Promise<void> {
    const run = this.saveQueue.then(() => this.saveNow(chainId, payload));
    this.saveQueue = run.catch(() => undefined);
    return run;
  }

  private async saveNow(chainId: number, payload: TagPayload): Promise<void> {
    const { aes } = this.keys();
    const clean = validatePayload(payload);
    const lookupKey = await this.token(chainId, clean.stealthAddress);
    const existing = await this.store.getByLookup(chainId, lookupKey);
    const iv = rand(12);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(chainId), tagLength: 128 }, aes, utf8ToBytes(JSON.stringify(clean))));
    const t = this.now();
    await this.store.put({
      schemaVersion: 1,
      chainId,
      recordId: existing?.recordId ?? bytesToHex(rand(16)),
      lookupKey,
      iv: bytesToHex(iv),
      ciphertext: bytesToHex(ct),
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
    });
  }

  private async open(r: EncryptedTagRecord): Promise<TagPayload> {
    const { aes } = this.keys();
    try {
      const plain = await subtle().decrypt({ name: 'AES-GCM', iv: hexToBytes(r.iv) as Uint8Array<ArrayBuffer>, additionalData: aad(r.chainId), tagLength: 128 }, aes, hexToBytes(r.ciphertext));
      return validatePayload(JSON.parse(new TextDecoder().decode(plain)) as TagPayload);
    } catch {
      throw new UserFacingError('A stored tag could not be decrypted (damaged or from another key).');
    }
  }

  public async find(chainId: number, stealthAddress: string): Promise<TagPayload | undefined> {
    const rec = await this.store.getByLookup(chainId, await this.token(chainId, stealthAddress));
    return rec === undefined ? undefined : this.open(rec);
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
    await this.store.delete(rec.recordId);
    return true;
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
