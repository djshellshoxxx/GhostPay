#!/usr/bin/env node
// Test-only upstream sources, GPL verifier artifacts and local deployment fixtures never enter a release bundle.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pins = JSON.parse(readFileSync(new URL('./external-fixtures.pins.json', import.meta.url), 'utf8'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

export function verifyIntegrity(file, integrity) {
  if (!/^sha(256|512)-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) throw new Error('Unsupported integrity pin.');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected a regular fixture file: ${file}`);
  const [algorithm, expected] = integrity.split('-');
  const actual = createHash(algorithm).update(readFileSync(file)).digest('base64');
  if (actual !== expected) throw new Error(`Fixture checksum mismatch: ${file}`);
}

export function verifyCheckout(directory, revision) {
  if (run('git', ['rev-parse', 'HEAD'], directory) !== revision) throw new Error(`Wrong upstream revision: ${directory}`);
  if (run('git', ['status', '--porcelain', '--untracked-files=all', '--ignored=matching'], directory) !== '') throw new Error(`Upstream fixture checkout is not clean: ${directory}`);
}

function checkout(directory, source) {
  if (!existsSync(directory)) {
    run('git', ['clone', '--no-checkout', source.url, directory], root);
    run('git', ['checkout', '--detach', source.revision], directory);
  }
  verifyCheckout(directory, source.revision);
}

function packageSource(directory, pin) {
  mkdirSync(directory, { recursive: true });
  // Download into an isolated directory, verify the bytes BEFORE extracting, and refresh extracted files each run.
  const temp = mkdtempSync(join(directory, 'fetch-'));
  try {
    const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', pin.spec], temp));
    if (typeof packed.filename !== 'string' || basename(packed.filename) !== packed.filename) throw new Error('Invalid npm archive filename.');
    const archive = join(temp, packed.filename);
    verifyIntegrity(archive, pin.integrity);
    const entries = run('tar', ['tzf', archive], temp).split('\n');
    if (entries.some((entry) => !entry.startsWith('package/') || entry.split('/').includes('..'))) throw new Error('Unsafe npm archive path.');
    run('tar', ['xzf', archive, '--no-same-owner'], temp);
    rmSync(join(directory, 'package'), { recursive: true, force: true });
    renameSync(join(temp, 'package'), join(directory, 'package'));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  return join(directory, 'package');
}

export function verifyCircuitArtifacts(directory, manifestSource) {
  for (const circuit of ['commitment', 'withdraw']) {
    for (const kind of ['wasm', 'vkey', 'zkey']) {
      const filename = `${circuit}.${kind}`;
      // Read the existing runtime pins rather than inventing or updating a deployment manifest.
      const escaped = filename.replace('.', '\\.');
      const matches = [...manifestSource.matchAll(new RegExp(`'${escaped}': '([a-f0-9]{64})'`, 'g'))];
      if (matches.length !== 1) throw new Error(`Missing or ambiguous circuit pin: ${filename}`);
      verifyIntegrity(join(directory, filename), `sha256-${Buffer.from(matches[0][1], 'hex').toString('base64')}`);
    }
  }
}

function build(directory, source, remappings, fixtureName, fixtureSource) {
  mkdirSync(directory, { recursive: true });
  const solc = process.env.SOLC_BIN ?? '0.8.28';
  if (process.env.SOLC_BIN !== undefined && !/Version: 0\.8\.28\+/.test(run(solc, ['--version'], root))) throw new Error('The local fixture compiler must be Solc 0.8.28.');
  const config = `[profile.default]\nsrc = ${JSON.stringify(source)}\ntest = "no-tests"\nscript = "no-scripts"\nout = "out"\nlibs = []\nsolc = ${JSON.stringify(solc)}\noptimizer = true\noptimizer_runs = 10000\nbytecode_hash = "none"\ncbor_metadata = false\nremappings = ${JSON.stringify(Object.entries(remappings).map(([key, value]) => `${key}=${value}/`))}\n`;
  writeFileSync(join(directory, 'foundry.toml'), config);
  const fixture = join(directory, fixtureName);
  writeFileSync(fixture, fixtureSource);
  // Cached build output is not authenticated by a source pin. Rebuild even if Forge thinks it is current.
  process.stdout.write(`${run(process.env.FORGE_BIN ?? 'forge', ['build', '--force', '--root', directory, source, fixture], root)}\n`);
  return join(directory, 'out');
}

export function prepare() {
  const directory = join(root, '.integration-fixtures');
  mkdirSync(directory, { recursive: true });
  const pp = join(directory, 'privacy-pools-core');
  const rg = join(directory, 'railgun-contract');
  checkout(pp, pins['privacy-pools']);
  checkout(rg, pins.railgun);
  const dependencies = Object.fromEntries(Object.entries(pins.packages).map(([label, pin]) => [label, packageSource(join(directory, 'dependencies', label), pin)]));
  const ppSource = join(pp, 'packages/contracts/src');
  const ppOut = build(join(directory, 'privacy-pools-build'), ppSource, {
    '@oz/': dependencies['pp-oz'], '@openzeppelin/contracts/': dependencies['pp-oz'],
    '@oz-upgradeable/': dependencies['pp-oz-upgradeable'], 'lean-imt/': dependencies['lean-imt'],
    'poseidon/': dependencies.poseidon, 'poseidon-solidity/': dependencies.poseidon,
    'contracts/': join(ppSource, 'contracts'), 'interfaces/': join(ppSource, 'interfaces'),
  }, 'ProxyFixture.sol', '// SPDX-License-Identifier: MIT\npragma solidity 0.8.28;\nimport "@oz/proxy/ERC1967/ERC1967Proxy.sol";\n');
  const rgOut = build(join(directory, 'railgun-build'), join(rg, 'contracts/logic'), {
    '@openzeppelin/contracts/': dependencies['rg-oz'], '@openzeppelin/contracts-upgradeable/': dependencies['rg-oz-upgradeable'],
  }, 'TestToken.sol', '// SPDX-License-Identifier: MIT\npragma solidity 0.8.28;\nimport "@openzeppelin/contracts/token/ERC20/ERC20.sol";\ncontract TestToken is ERC20 { constructor() ERC20("Fixture", "FIX") {} function mint(address to, uint256 amount) external { _mint(to, amount); } }\n');
  const artifacts = join(directory, 'pp-artifacts');
  mkdirSync(artifacts, { recursive: true });
  for (const circuit of ['commitment', 'withdraw']) {
    copyFileSync(join(pp, `packages/circuits/build/${circuit}/${circuit}_js/${circuit}.wasm`), join(artifacts, `${circuit}.wasm`));
    for (const kind of ['vkey', 'zkey']) copyFileSync(join(pp, `packages/circuits/trusted-setup/final-keys/${circuit}.${kind}`), join(artifacts, `${circuit}.${kind}`));
  }
  verifyCircuitArtifacts(artifacts, readFileSync(join(root, 'packages/external-pools/src/manifest-data.ts'), 'utf8'));
  const result = { PP_CONTRACTS_OUT: ppOut, PP_ARTIFACT_DIR: artifacts, RG_CONTRACTS_OUT: rgOut };
  // JSON contains only local test paths, not chain addresses, keys or production trust roots.
  writeFileSync(join(directory, 'paths.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log('Prepared pinned local fixtures; no integration tests have run yet.');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { prepare(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
