#!/usr/bin/env node
// The post-build gate of `npm run build` (scripts/scan-bundle.mjs) for a build written to another output directory, as
// the devnet Playwright config does so it never replaces apps/web/dist. Same checks, same deployment validation.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanBundle } from '../../scripts/scan-bundle.mjs';
import { parseReleaseKeys, validateDeployments } from '../../scripts/validate-deployments.mjs';

const dist = process.argv[2];
if (dist === undefined) {
  console.error('usage: scan-dist.mjs <dist dir>');
  process.exit(2);
}
const root = fileURLToPath(new URL('../..', import.meta.url));
const deploymentDir = process.env['GHOSTPAY_DEPLOYMENTS_DIR'] === undefined ? resolve(root, 'deployments') : resolve(process.env['GHOSTPAY_DEPLOYMENTS_DIR']);
const problems = [
  ...await validateDeployments(deploymentDir, parseReleaseKeys(process.env['GHOSTPAY_RELEASE_PUBKEYS'])),
  ...scanBundle(resolve(dist), resolve(root, 'src'), resolve(root, 'vite.config.ts')),
];
if (problems.length > 0) {
  console.error('Devnet bundle scan FAILED:');
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
console.log('Devnet bundle scan passed.');
