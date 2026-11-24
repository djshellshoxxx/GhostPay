#!/usr/bin/env node
// Makes the `npm sbom` CycloneDX output reproducible: replaces the random serialNumber with a UUID derived from
// the lockfile digest and the timestamp with SOURCE_DATE_EPOCH, and pretty-prints with stable key order as emitted.
// `npm sbom` names the root component after the checkout DIRECTORY (e.g. "GhostPay" on a GitHub runner, "ghostpay"
// in a fresh clone), which made the SBOM depend on where the tree was checked out; the root component name is set to
// the root package.json name instead.
// Usage: normalize-sbom.mjs <sbom.json> <lockfile-sha256> <source-date-epoch> [root-package-name]
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [file, lockSha, epoch, rootName] = process.argv.slice(2);
if (!file || !/^[0-9a-f]{64}$/.test(lockSha ?? '') || !/^\d+$/.test(epoch ?? '')
  || (rootName !== undefined && !/^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/.test(rootName))) {
  console.error('usage: normalize-sbom.mjs <sbom.json> <lockfile-sha256> <source-date-epoch> [root-package-name]');
  process.exit(2);
}
const sbom = JSON.parse(readFileSync(file, 'utf8'));
const h = createHash('sha256').update(`ghostpay-sbom:${lockSha}`).digest('hex');
sbom.serialNumber = `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
if (sbom.metadata && typeof sbom.metadata === 'object') {
  sbom.metadata.timestamp = new Date(Number(epoch) * 1000).toISOString();
  if (rootName && sbom.metadata.component && typeof sbom.metadata.component === 'object') {
    sbom.metadata.component.name = rootName;
  }
}
process.stdout.write(`${JSON.stringify(sbom, null, 2)}\n`);
