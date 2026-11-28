// @vitest-environment jsdom
// Seeded fuzz of the encrypted invoice-draft codec (#717/#728): random valid drafts at and beyond their limits, and
// malformed, truncated, bit-flipped, extended, re-keyed and re-slotted ciphertext. A fixed-seed local PRNG builds every
// case; expected values come from the generator, never from a production read. Synthetic text only.
//
// Invariants: a sealed record round-trips exactly and carries no form text at rest (not in the string, not in the decoded
// bytes); every damaged, foreign or wrong-key record is refused (or, for the few encodings that decode to the same bytes,
// opens to exactly the original, never to other data); nothing but an Error is ever thrown; oversized or invalid drafts
// are refused at seal time; the validator never throws and anything it accepts survives a JSON round trip unchanged;
// salts and nonces are never reused across records; the same seed gives the same verdicts.
import { base64urlnopad } from '@scure/base';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankDraft, draftSlot, openDraft, sealDraft, validDraft, type InvoiceDraft } from './invoiceDraft';
import { clearSession, importSession } from './session';
import { generateWaivedSession } from '../test/keys';

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)] as T;

beforeEach(() => { clearSession(); });
afterEach(() => { clearSession(); });

const WORDS = ['alpha', 'ledger', 'Rechnung', '支払い', 'café', 'invoice', 'q3-retainer', '💸', 'über', 'n°'];
/** Text that is distinctive enough to search for in ciphertext: a unique tag plus words. */
const text = (r: Rand, tag: string, max: number): string => {
  const out = `${tag}-${pick(r, WORDS)}-${pick(r, WORDS)}-${String(int(r, 1000, 9999))}`;
  return out.slice(0, max);
};
const TOKENS = ['native', `0x${'a'.repeat(40)}`, `0x${'0123456789abcdef'.repeat(3).slice(0, 40)}`];

function randomDraft(r: Rand, tag: string): InvoiceDraft {
  const minimal = r() < 0.2;
  const items = Array.from({ length: int(r, 1, r() < 0.2 ? 50 : 4) }, (_, i) => ({
    description: minimal ? '' : text(r, `${tag}d${String(i)}`, 200), quantity: String(int(r, 1, 99)), unitPrice: `${String(int(r, 0, 5000))}.${String(int(r, 10, 99))}`,
  }));
  return {
    ...blankDraft(pick(r, [84532, 11155111, 31337])), token: pick(r, TOKENS), currency: pick(r, ['USD', 'EUR', 'JPY']), items,
    taxRate: String(int(r, 0, 25)), feePolicy: pick(r, ['payer_pays', 'seller_pays'] as const), amountMode: pick(r, ['fixed_token', 'fiat_quote'] as const),
    tokenAmount: `${tag}${String(int(r, 100_000, 999_999))}`.slice(0, 100), expiryHours: int(r, 1, 720), quoteMinutes: int(r, 1, 120),
    slippage: int(r, 1, 500), minimalMetadata: minimal, memo: minimal ? '' : text(r, `${tag}m`, 500), bufferMode: pick(r, ['off', 'declined', 'range'] as const),
    bufferMin: `${String(int(r, 0, 99))}`, bufferMax: `${String(int(r, 100, 999))}`, encrypt: r() < 0.5, protectWithPassphrase: r() < 0.5,
  };
}

/** Every distinctive string a draft contains; none may be visible in the record. */
function secretsOf(d: InvoiceDraft): string[] {
  return [d.memo, d.tokenAmount, ...d.items.flatMap((i) => [i.description])].filter((s) => s.length >= 6);
}
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

const hex = (n: number): string => n.toString(16).padStart(64, '0');
const SEEDS = [717, 728, 20261127];

describe('invoice draft codec, seeded', () => {
  for (const seed of SEEDS) {
    it(`seed ${String(seed)}: 40 random drafts round-trip, hide their text, and refuse every damaged record`, async () => {
      const r = prng(seed);
      const seller = importSession({ spendingKeyHex: hex(seed + 1), viewingKeyHex: hex(seed + 2), signingKeyHex: hex(seed + 3) });
      const otherSlot = draftSlot(seller);
      let refused = 0;
      let sameAsOriginal = 0;
      const salts = new Set<string>();
      const ivs = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const draft = randomDraft(r, `s${String(i)}t`);
        expect(validDraft(draft)).toBe(true);
        const raw = await sealDraft(otherSlot, draft);
        // Round trip, exactly.
        expect(await openDraft(otherSlot, raw)).toEqual(draft);
        // Nothing at rest in clear: not in the string, not in the decoded bytes.
        const [saltHex, body] = raw.split('.') as [string, string];
        const bytes = base64urlnopad.decode(body);
        for (const secret of secretsOf(draft)) {
          expect(raw).not.toContain(secret);
          expect(contains(bytes, utf8(secret))).toBe(false);
        }
        // Fresh salt and nonce per record.
        expect(salts.has(saltHex)).toBe(false);
        salts.add(saltHex);
        const iv = Buffer.from(bytes.slice(0, 12)).toString('hex');
        expect(ivs.has(iv)).toBe(false);
        ivs.add(iv);

        const attempt = async (mutated: string, label: string): Promise<void> => {
          try {
            const opened = await openDraft(otherSlot, mutated);
            // Only an encoding of the very same bytes may open, and then to exactly the original.
            expect(opened, label).toEqual(draft);
            sameAsOriginal++;
          } catch (e) {
            expect(e, label).toBeInstanceOf(Error);
            refused++;
          }
        };
        // Truncations (every prefix class), extensions and splices.
        for (const cut of new Set([0, 1, 31, 32, 33, 34, 40, int(r, 35, raw.length - 2), raw.length - 1, raw.length - 2])) {
          await attempt(raw.slice(0, cut), `truncate ${String(cut)}`);
        }
        await attempt(`${raw}A`, 'extend one char');
        await attempt(`${raw}AAAA`, 'extend four chars');
        await attempt(raw.replace('.', '..'), 'double dot');
        await attempt(`${raw.slice(33)}.${raw.slice(0, 32)}`, 'swapped halves');
        // Bit flips: all of the salt hex, and a spread of body positions including the last (padding-bit) character.
        const flips = [0, 5, 31, 33, 34, 40, 45, int(r, 46, raw.length - 2), raw.length - 1];
        for (const at of flips) {
          const ch = raw[at] as string;
          const alphabet = at < 32 ? '0123456789abcdef' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
          const replacement = alphabet[(alphabet.indexOf(ch) + int(r, 1, alphabet.length - 1)) % alphabet.length] as string;
          if (at === 32) continue; // the separator
          await attempt(`${raw.slice(0, at)}${replacement}${raw.slice(at + 1)}`, `flip ${String(at)}`);
        }
        // A slot that is not the loaded seller's is refused even with an intact record.
        await expect(openDraft(`${otherSlot}x`, raw)).rejects.toThrow();
      }
      // Most damage is refused; whatever opened was the original bytes.
      expect(refused).toBeGreaterThan(40 * 12);
      expect(sameAsOriginal).toBeLessThan(40 * 3);
    }, 120_000);
  }

  it('refuses records sealed for a different seller key, and never opens without loaded keys', async () => {
    const r = prng(5);
    const first = importSession({ spendingKeyHex: hex(1), viewingKeyHex: hex(2), signingKeyHex: hex(3) });
    const slotA = draftSlot(first);
    const raw = await sealDraft(slotA, randomDraft(r, 'ka'));
    // Same signing key and meta address slot but a different viewing key is a different seller (the record key derives from it).
    const second = importSession({ spendingKeyHex: hex(1), viewingKeyHex: hex(9), signingKeyHex: hex(3) });
    expect(draftSlot(second)).not.toBe(slotA);
    await expect(openDraft(slotA, raw)).rejects.toThrow();
    await expect(openDraft(draftSlot(second), raw)).rejects.toThrow();
    clearSession();
    await expect(openDraft(slotA, raw)).rejects.toThrow();
    await expect(sealDraft(slotA, randomDraft(r, 'kb'))).rejects.toThrow();
  });

  it('refuses invalid and oversized drafts at seal time and keeps the largest legal draft working', async () => {
    const r = prng(9);
    const session = generateWaivedSession();
    const slot = draftSlot(session);
    // The largest the validator allows: 50 items at 200 + 100 + 100 characters, memo 500, in four-byte characters.
    const wide = '💸'.repeat(100);
    const big: InvoiceDraft = {
      ...blankDraft(84532), memo: '💸'.repeat(250), items: Array.from({ length: 50 }, () => ({ description: wide, quantity: '💸'.repeat(50), unitPrice: '💸'.repeat(50) })),
      tokenAmount: '💸'.repeat(50), taxRate: '💸'.repeat(50),
    };
    // 200 UTF-16 units per description: within the validator (length is in UTF-16 units), so it must round trip.
    expect(validDraft(big)).toBe(true);
    const raw = await sealDraft(slot, big);
    expect(raw.length).toBeLessThanOrEqual(256 * 1024);
    expect(await openDraft(slot, raw)).toEqual(big);
    // One past each limit is refused before any key is used.
    const refusals: [string, unknown][] = [
      ['51 items', { ...big, items: [...big.items, { description: '', quantity: '1', unitPrice: '1' }] }],
      ['201-char description', { ...big, items: [{ description: 'x'.repeat(201), quantity: '1', unitPrice: '1' }] }],
      ['501-char memo', { ...big, memo: 'm'.repeat(501) }],
      ['101-char amount', { ...big, tokenAmount: '9'.repeat(101) }],
      ['million-char memo', { ...blankDraft(84532), memo: 'm'.repeat(1_000_000) }],
      ['lone surrogate token', { ...blankDraft(84532), token: '\ud800' }],
      ['null', null], ['array', []], ['string', 'x'], ['proto', JSON.parse('{"__proto__": {"x": 1}}')],
    ];
    for (const [name, value] of refusals) {
      expect(validDraft(value), name).toBe(false);
      await expect(sealDraft(slot, value as InvoiceDraft), name).rejects.toThrow();
    }
    void r;
  }, 60_000);

  for (const seed of SEEDS) {
    it(`seed ${String(seed)}: 600 mutated drafts never throw from validDraft and an accepted one survives JSON unchanged`, () => {
      const r = prng(seed);
      let accepted = 0;
      const junk: unknown[] = [undefined, null, NaN, Infinity, -0, 1e21, '', 'x'.repeat(5000), [], {}, [[]], true, 0, -1, 2 ** 53, '\u0000', '__proto__', { a: 1 }, () => 1, Symbol('s').toString()];
      for (let i = 0; i < 600; i++) {
        const base = randomDraft(r, 'v') as unknown as Record<string, unknown>;
        const mutated: Record<string, unknown> = { ...base };
        const keys = Object.keys(base);
        for (let m = int(r, 0, 3); m > 0; m--) {
          const key = pick(r, keys);
          switch (int(r, 0, 4)) {
            case 0: mutated[key] = pick(r, junk); break;
            case 1: delete mutated[key]; break;
            case 2: mutated[pick(r, ['extra', '__proto__', 'constructor', 'passphrase', 'link', 'toString'])] = pick(r, junk); break;
            case 3: if (Array.isArray(mutated['items'])) mutated['items'] = (mutated['items'] as unknown[]).map((it) => (r() < 0.5 ? pick(r, junk) : it)); break;
            default: if (Array.isArray(mutated['items'])) mutated['items'] = [...(mutated['items'] as unknown[]), pick(r, junk)]; break;
          }
        }
        let verdict: boolean;
        expect(() => { verdict = validDraft(mutated); }).not.toThrow();
        verdict = validDraft(mutated);
        if (verdict) {
          accepted++;
          // What the validator accepts is plain data: it survives JSON unchanged and has exactly the draft keys.
          expect(JSON.stringify(JSON.parse(JSON.stringify(mutated)))).toBe(JSON.stringify(mutated));
          expect(Object.keys(mutated).sort()).toEqual(Object.keys(blankDraft(1)).sort());
        }
      }
      expect(accepted).toBeGreaterThan(30);
    });
  }

  it('is deterministic: the same seed gives the same verdicts and shapes', async () => {
    const run = async (seed: number): Promise<string[]> => {
      const r = prng(seed);
      const session = generateWaivedSession();
      const slot = draftSlot(session);
      const out: string[] = [];
      for (let i = 0; i < 6; i++) {
        const draft = randomDraft(r, 'det');
        const raw = await sealDraft(slot, draft);
        const cut = raw.slice(0, int(r, 1, raw.length - 1));
        out.push(`${JSON.stringify(draft)}|${raw.length}|${await openDraft(slot, cut).then(() => 'open', () => 'refused')}`);
      }
      return out;
    };
    // Sessions differ per run; compare drafts and verdicts, not ciphertext.
    expect(await run(31)).toEqual(await run(31));
  });
});
