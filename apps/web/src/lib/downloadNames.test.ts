import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAYMENT_REQUEST_FILE_NAME } from '@ghostpay/invoice-schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DOWNLOAD_NAMES, neutralDownloadName } from './downloadNames';
import { QR_KINDS, QR_KIND_ORDER } from './qrKinds';
import { STEALTH_EXPORT_FILENAMES } from './stealthExport';

const FALLBACKS = ['json', 'svg', 'gpa', 'txt', 'csv', 'pdf', 'png', 'zip', 'bin'].map((extension) => `export.${extension}`);
const OUTPUTS = new Set<string>([...DOWNLOAD_NAMES, ...FALLBACKS]);
const ADDRESS = `0x${'ab'.repeat(20)}`;
const HASH = `0x${'cd'.repeat(32)}`;

describe('neutral download names (#286 item 5)', () => {
  it('keeps every fixed name, and no fixed name carries a digit, a hex run or a path separator', () => {
    expect(new Set(DOWNLOAD_NAMES).size).toBe(DOWNLOAD_NAMES.length);
    for (const name of DOWNLOAD_NAMES) {
      expect(neutralDownloadName(name)).toBe(name);
      // Lower-case words joined by single hyphens: room for a category, none for a value.
      if (name === PAYMENT_REQUEST_FILE_NAME) expect(name).toBe('ghostpay-request.gpr.json');
      else expect(name).toMatch(/^ghostpay(?:-[a-z]+)+\.(?:json|svg|gpa|txt)$/);
    }
  });

  it('includes the documented fixed request-file name', () => {
    expect(PAYMENT_REQUEST_FILE_NAME).toBe('ghostpay-request.gpr.json');
    expect(DOWNLOAD_NAMES).toContain(PAYMENT_REQUEST_FILE_NAME);
  });

  it('lists every stealth export name of the formats specification and every QR kind download', () => {
    for (const name of Object.values(STEALTH_EXPORT_FILENAMES)) expect(DOWNLOAD_NAMES).toContain(name);
    expect(Object.keys(QR_KINDS).sort()).toEqual([...QR_KIND_ORDER].sort());
    for (const kind of QR_KIND_ORDER) expect(DOWNLOAD_NAMES).toContain(`ghostpay-${kind}-qr.svg`);
  });

  it('replaces a name assembled from payment values with export plus an allowed extension', () => {
    expect(neutralDownloadName(`ghostpay-policy-${HASH.slice(2, 10)}-${HASH.slice(2)}.json`)).toBe('export.json');
    expect(neutralDownloadName('ghostpay-tags-20260105.gpa')).toBe('export.gpa');
    expect(neutralDownloadName(`receipt-${ADDRESS}-87129.03251.JSON`)).toBe('export.json');
    expect(neutralDownloadName(`${ADDRESS}.exe`)).toBe('export.bin');
    expect(neutralDownloadName('')).toBe('export.bin');
    expect(neutralDownloadName('.json')).toBe('export.json');
  });

  it('accepts a fixed name only exactly: no case, whitespace, path or suffix variant passes through', () => {
    for (const name of ['GHOSTPAY-KEYSTORE.JSON', ' ghostpay-keystore.json', 'ghostpay-keystore.json ', '../ghostpay-keystore.json',
      'C:\\ghostpay-keystore.json', 'ghostpay-keystore.json\u0000.txt', 'ghostpay-keystore.json.exe', 'ghostpay-keystore\u200b.json']) {
      expect(neutralDownloadName(name), JSON.stringify(name)).not.toBe(name);
      expect(neutralDownloadName(name)).toMatch(/^export\./);
    }
  });

  it('never throws and returns export.bin for a value that is not a string', () => {
    for (const value of [undefined, null, 1, 1n, {}, [], Symbol('x'), () => 'ghostpay-keystore.json', new String('ghostpay-keystore.json')]) {
      expect(neutralDownloadName(value)).toBe('export.bin');
    }
  });

  it('fuzz: any requested name maps into the fixed output set and leaks no part of an unlisted request', () => {
    const secret = fc.oneof(
      fc.constantFrom(ADDRESS, HASH, '87129.03251', 'invoice-winter-sample', 'hunter2'),
      fc.stringMatching(/^0x[0-9a-f]{40}$/),
      fc.string({ unit: 'grapheme', minLength: 1, maxLength: 40 }),
    );
    const requested = fc.oneof(
      { weight: 3, arbitrary: fc.tuple(fc.constantFrom('', 'ghostpay-', 'receipt-', 'ghostpay-keystore'), secret, fc.constantFrom('', '.json', '.svg', '.GPA', '.txt', '.exe', '.json.exe'))
        .map(([prefix, value, extension]) => prefix + value + extension) },
      { weight: 1, arbitrary: fc.constantFrom(...DOWNLOAD_NAMES) },
      { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 300 }) },
      { weight: 1, arbitrary: fc.anything() },
    );
    fc.assert(fc.property(requested, (name) => {
      const out = neutralDownloadName(name);
      expect(OUTPUTS.has(out)).toBe(true);
      if (typeof name === 'string' && (DOWNLOAD_NAMES as readonly string[]).includes(name)) expect(out).toBe(name);
      else expect(out.startsWith('export.')).toBe(true);
    }), { numRuns: 3000, seed: 20261125 });
  });
});

describe('every download call site requests a fixed name', () => {
  const src = fileURLToPath(new URL('..', import.meta.url));
  const files = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === 'test' ? [] : files(path);
    return /\.tsx?$/.test(entry) && !/\.(test|spec|testutil)\.|\.test\.|testutil/.test(entry) ? [path] : [];
  });
  // First argument of each downloadText/downloadBlob call outside tests and the helper itself.
  const calls = files(src).flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    const file = relative(src, path).replaceAll('\\', '/');
    if (file === 'components/Common.tsx') return [];
    return [...text.matchAll(/\bdownload(?:Text|Blob)\(\s*([^,]+),/g)].map((m) => `${file}: ${m[1]!.trim()}`);
  });

  it('uses only allowlisted literals or reviewed fixed-name sources', () => {
    const literal = /: '([^']*)'$/;
    const reviewed = new Set([
      // QR_KIND_ORDER names, checked above.
      'components/QrFrame.tsx: `ghostpay-${props.kind}-qr.svg`',
      // STEALTH_EXPORT_FILENAMES, checked above.
      'components/StealthExportPayment.tsx: file.filename',
      // exportArchive returns the fixed ghostpay-tags.gpa (tagArchive.test.ts).
      'components/TagArchive.tsx: out.filename',
      // Fixed request-file constant, pinned and allowlisted above; the real helper is covered by its component test.
      'components/PaymentRequestDownload.tsx: PAYMENT_REQUEST_FILE_NAME',
    ]);
    // Exact, so that a new call site, or one the pattern stops matching after a rewrite, has to be looked at here.
    expect(calls).toHaveLength(15);
    for (const call of calls) {
      const name = literal.exec(call)?.[1];
      if (name !== undefined) expect(DOWNLOAD_NAMES, call).toContain(name);
      else expect(reviewed.has(call), `${call}: review the name source and add it here`).toBe(true);
    }
  });
});
