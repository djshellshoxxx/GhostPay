#!/usr/bin/env node
// Publishes the embed SDK under an immutable, content-addressed file name and writes its SRI string (S3-10).
// dist/ghostpay-embed-v1.<sha256 prefix>.js  is the file merchants should pin; dist/ghostpay-embed-v1.js stays as a
// documented MOVING alias. dist/embed-sri.json records the SHA-384 SRI value to publish in the release notes.
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function emitEmbedSri(distDir) {
  const alias = join(distDir, 'ghostpay-embed-v1.js');
  if (!existsSync(alias)) throw new Error('dist/ghostpay-embed-v1.js is missing');
  const bytes = readFileSync(alias);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const integrity = `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
  const file = `ghostpay-embed-v1.${sha256.slice(0, 12)}.js`;
  copyFileSync(alias, join(distDir, file));
  const record = { file, alias: 'ghostpay-embed-v1.js', integrity, sha256 };
  writeFileSync(join(distDir, 'embed-sri.json'), `${JSON.stringify(record, null, 2)}\n`);
  const headers = join(distDir, '_headers');
  if (existsSync(headers)) {
    appendFileSync(headers, `\n# Immutable, content-addressed copy of the embed SDK (pin this one with its SRI value).\n/${file}\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n  Cache-Control: public, max-age=31536000, immutable\n`);
  }
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = emitEmbedSri(fileURLToPath(new URL('../dist', import.meta.url)));
  console.log(`embed SDK: ${r.file}\n  integrity="${r.integrity}" crossorigin="anonymous"`);
}
