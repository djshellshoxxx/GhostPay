#!/usr/bin/env node
// Makes the `npm sbom` CycloneDX output reproducible: replaces the random serialNumber with a UUID derived from
// the lockfile digest and the timestamp with SOURCE_DATE_EPOCH, and pretty-prints with stable key order as emitted.
// It also rewrites the absolute file: distribution URL of a verified repository-local vendored archive (verified
// against cwd/package-lock.json and the archive bytes) to the canonical relative form file:vendor/...
// Usage: normalize-sbom.mjs <sbom.json> <lockfile-sha256> <source-date-epoch>
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const [file, lockSha, epoch] = process.argv.slice(2);
if (!file || !/^[0-9a-f]{64}$/.test(lockSha ?? '') || !/^\d+$/.test(epoch ?? '')) {
  console.error('usage: normalize-sbom.mjs <sbom.json> <lockfile-sha256> <source-date-epoch>');
  process.exit(2);
}
const fail = (msg) => {
  console.error(`normalize-sbom: ${msg}`);
  process.exit(1);
};
const sbom = JSON.parse(readFileSync(file, 'utf8'));
const h = createHash('sha256').update(`ghostpay-sbom:${lockSha}`).digest('hex');
sbom.serialNumber = `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
if (sbom.metadata && typeof sbom.metadata === 'object') {
  sbom.metadata.timestamp = new Date(Number(epoch) * 1000).toISOString();
}

const isLocalFileUrl = (u) => typeof u === 'string' && /^file:/i.test(u);
const localPathOf = (u) => (u.startsWith('file://') ? fileURLToPath(u) : u.slice('file:'.length));

function components(list, out = []) {
  for (const c of Array.isArray(list) ? list : []) {
    if (c && typeof c === 'object') {
      out.push(c);
      components(c.components, out);
    }
  }
  return out;
}

const all = components(sbom.components);
if (sbom.metadata && sbom.metadata.component) components([sbom.metadata.component], all);
const candidates = [];
for (const c of all) {
  for (const ref of Array.isArray(c.externalReferences) ? c.externalReferences : []) {
    if (ref && ref.type === 'distribution' && isLocalFileUrl(ref.url)) candidates.push({ c, ref });
  }
}

if (candidates.length > 0) {
  const root = realpathSync(process.cwd());
  const lockPath = resolve(root, 'package-lock.json');
  if (!existsSync(lockPath)) fail('package-lock.json not found in cwd; cannot verify local archive reference');
  const lockBytes = readFileSync(lockPath);
  if (createHash('sha256').update(lockBytes).digest('hex') !== lockSha) {
    fail('supplied lockfile sha256 does not match cwd/package-lock.json');
  }
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const entries = Object.entries(lock.packages ?? {}).filter(
    ([k, e]) => k && e && typeof e.resolved === 'string' && e.resolved.startsWith('file:vendor/')
  );
  const seen = new Set();
  for (const { c, ref } of candidates) {
    let abs;
    try {
      abs = localPathOf(ref.url);
    } catch {
      fail(`unparseable local reference ${ref.url}`);
    }
    if (!isAbsolute(abs)) {
      if (ref.url.startsWith('file:vendor/') && !ref.url.startsWith('file://') && !ref.url.split('/').some((s) => s === '..' || s === '.' || s === '') && !ref.url.includes('\\')) {
        abs = resolve(root, abs);
      } else {
        fail(`unexpected non-absolute local reference ${ref.url}`);
      }
    }
    let real;
    try {
      real = realpathSync(abs);
    } catch {
      fail(`local reference does not exist: ${ref.url}`);
    }
    const rel = relative(root, real).split(sep).join('/');
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || !rel.startsWith('vendor/')) {
      fail(`local reference outside repository vendor directory: ${ref.url}`);
    }
    if (seen.has(c)) fail(`ambiguous local references for component ${c.name}@${c.version}`);
    seen.add(c);
    const matches = entries.filter(([k, e]) => e.resolved === `file:${rel}` && e.version === c.version && k.split('node_modules/').pop() === c.name);
    if (matches.length !== 1) fail(`no unique lock entry for local archive ${rel} (${matches.length} matches)`);
    const [, entry] = matches[0];
    if (c.purl && !c.purl.startsWith(`pkg:npm/${c.name}@`)) fail(`component identity mismatch for ${c.name}`);
    if (c.purl && c.purl !== `pkg:npm/${c.name}@${entry.version}`) fail(`component purl mismatch for ${c.name}`);
    if (all.filter((o) => o.name === c.name && o.version === c.version).length !== 1) {
      fail(`ambiguous component ${c.name}@${c.version}`);
    }
    const m = /^sha512-(.+)$/.exec(entry.integrity ?? '');
    if (!m) fail(`lock entry for ${rel} lacks sha512 integrity`);
    const bytes = readFileSync(real);
    const digest = createHash('sha512').update(bytes).digest();
    if (digest.toString('base64') !== m[1]) fail(`integrity mismatch for local archive ${rel}`);
    const hex = digest.toString('hex');
    const hashes = Array.isArray(c.hashes) ? c.hashes : [];
    const sbomHash = hashes.find((x) => x && /^sha-?512$/i.test(x.alg));
    if (!sbomHash || String(sbomHash.content).toLowerCase() !== hex) {
      fail(`component sha512 hash does not match local archive ${rel}`);
    }
    ref.url = `file:${rel}`;
  }
}
process.stdout.write(`${JSON.stringify(sbom, null, 2)}\n`);
