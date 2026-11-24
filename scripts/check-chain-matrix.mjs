#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateChainMatrix } from './lib/chain-matrix.mjs';
import { CHAINS } from '../packages/chain-adapters/dist/config/chains.js';
import { TOKENS } from '../packages/chain-adapters/dist/config/tokens.js';
import { FEEDS } from '../packages/chain-adapters/dist/quote.js';
import { CANONICAL_ANNOUNCER } from '../packages/chain-adapters/dist/verify.js';
import { ERC6538_REGISTRY_ADDRESS } from '../packages/chain-adapters/dist/registry.js';
import { loadDeployment, MAX_MANIFEST_BYTES } from '../packages/chain-adapters/dist/deployments.js';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--release')) throw new Error('usage: node scripts/check-chain-matrix.mjs [--release]');
  const release = args[0] === '--release';
  const path = new URL('../packages/chain-adapters/config/matrix.json', import.meta.url);
  const info = await lstat(path);
  if (!info.isFile() || info.size > 1_048_576) throw new Error('matrix must be a regular file no larger than 1 MiB');
  const matrix = JSON.parse(await readFile(path, 'utf8'));
  const errors = validateChainMatrix(matrix, {
    chains: CHAINS, tokens: TOKENS, feeds: FEEDS,
    announcer: CANONICAL_ANNOUNCER, registry: ERC6538_REGISTRY_ADDRESS,
  }, { release });
  // Verified deployment evidence is tied to the exact checked-in manifest bytes.
  // The runtime verifier still authenticates the release signature and reads chain state.
  if (errors.length === 0) {
    for (const chain of matrix.chains) {
      if (chain.deployment.status !== 'verified') continue;
      const pin = chain.deployment.value;
      const manifestPath = new URL(`../${pin.manifest}`, import.meta.url);
      const stat = await lstat(manifestPath);
      if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) throw new Error(`${pin.manifest}: invalid manifest file`);
      const bytes = await readFile(manifestPath);
      if (createHash('sha256').update(bytes).digest('hex') !== pin.sha256) throw new Error(`${pin.manifest}: manifest checksum differs from matrix`);
      const manifest = loadDeployment(bytes.toString('utf8'), chain.chainId);
      if (manifest.signature === undefined) throw new Error(`${pin.manifest}: verified deployment must include a release signature`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Chain matrix ${release ? 'release readiness' : 'schema/configuration'} passed: ${CHAINS.length} chains, ${TOKENS.length} tokens, ${FEEDS.length} feeds (${fileURLToPath(path)}).`);
} catch (error) {
  console.error(`Chain matrix rejected: ${error instanceof Error ? error.message : 'invalid input'}`);
  process.exitCode = 1;
}
