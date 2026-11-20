#!/usr/bin/env node
// @ts-check
// Assemble an inert static-only onion deployment from the hosting kit's verified
// private copy. No subprocess, network request, service start, or identity access.
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { generateProfiles, openVerified } from '../../tools/portable-hosting-kit/src/cli.mjs';
import { defaultHostConfig, parseHostConfig } from '../../tools/portable-hosting-kit/src/config/host-config.mjs';

export const TOR_VERSION = '0.4.9.17';
export const TOR_SOURCE_SHA256 = 'ff372c41ee7013557fe5b7acd96c909950b27a7959c59fcb87c02591682fabe2';
const templates = fileURLToPath(new URL('./', import.meta.url));

const composeOverride = `# Apply LAST, after compose.yaml and tor/compose.tor.yml (Compose >= 2.24.4).
# This onion-only stack has no published host ports and no application backend.
services:
  web:
    ports: !reset []
    networks: !override [site_internal]
  tor:
    image: ghostpay-static-tor:${TOR_VERSION}
    depends_on:
      web:
        condition: service_healthy
    memswap_limit: 256m
    logging:
      driver: local
      options: { max-size: "1m", max-file: "2" }
`;

const startGuide = `# Static onion deployment (not started)

The source archive was checked against the expected SHA-256 supplied by the operator.
Its authenticity is only as strong as the independent channel that supplied that hash.
The hosting kit preserved site files and generated nginx policy from the artifact's
headers. No relayer, RPC forwarder, wallet, or private key is included.

Review \`host-config.json\` and all files under \`container/\`. In that directory use
all three Compose files in the stated order:

    docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml config
    docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml build --pull tor
    docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml run --rm --no-deps tor --check-runtime

The build pins Tor ${TOR_VERSION} source by SHA-256 and requires PoW/GPL support.
Debian dependencies are current at build time, so the image is not bit-reproducible.
No Docker image build or real Tor connection is implied by preparing these files.

After deployment authorization and review, start with:

    docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml up -d
    docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml exec tor cat /var/lib/tor/ghostpay/hostname

Only \`hostname\` is public. The named \`tor-data\` volume stores the onion identity.
Keep its encrypted backup outside this output tree and every web/build directory.
Preserve the Compose project name in \`container/compose.yaml\` during updates to
reuse the existing identity volume; do not use \`down --volumes\` for routine updates.
There are no host-published ports when all three files are used. The web container
joins only the internal site network; only Tor has a separate egress network.

Use current Tor Browser for the onion URL, check WebCrypto availability and record
the actual requests. Onion delivery does not verify wallet/RPC routing. Each origin
has separate browser storage. Missing transport or browser capabilities must fail
visibly, without redirecting users to a clearnet mirror.

Full runbook and source-pin provenance: GhostPay \`deploy/tor-static/README.md\`.
`;

/**
 * @param {{ archivePath: string, outDir: string, expectedArchiveSha256: string,
 *   hostConfig?: unknown, allowSubpath?: boolean }} options
 */
export async function prepareStaticTor(options) {
  if (!options || typeof options.archivePath !== 'string' || typeof options.outDir !== 'string') {
    throw new Error('archivePath and outDir are required');
  }
  if (typeof options.expectedArchiveSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(options.expectedArchiveSha256)) {
    throw new Error('An independent expected archive SHA-256 is required');
  }
  const host = parseHostConfig(options.hostConfig ?? {
    ...defaultHostConfig('onion'), mirrorLabel: 'ghostpay-onion',
  });
  if (host.transport !== 'onion') throw new Error('The static Tor recipe requires an onion host configuration');
  if (host.basePath !== '/' && options.allowSubpath !== true) {
    throw new Error('A subpath requires --allow-subpath and an origin serving only GhostPay');
  }
  const archivePath = resolve(options.archivePath);
  const archiveStat = await lstat(archivePath);
  if (!archiveStat.isFile()) throw new Error('The archive must be a regular file, not a symlink or directory');
  const verificationOptions = { 'expect-sha256': options.expectedArchiveSha256 };
  const verified = await openVerified(archivePath, verificationOptions);
  try {
    if (!verified.manifest.content.files.some((file) => file.path === '_headers')) {
      throw new Error('The static Tor artifact must include its matching _headers policy');
    }
  } finally {
    await verified.cleanup();
  }
  const requestedOut = resolve(options.outDir);
  try {
    await lstat(requestedOut);
    throw new Error('Output already exists; prepare each release in a new directory');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(requestedOut), { recursive: true });
  const parent = await realpath(dirname(requestedOut));
  const outDir = join(parent, basename(requestedOut));
  // Only this freshly created staging directory is removed on failure. Existing
  // deployment directories and identity volumes are never modified or replaced.
  const stage = await mkdtemp(join(parent, '.ghostpay-tor-'));
  try {
    const profileDir = join(stage, 'profiles');
    const result = await generateProfiles({
      target: archivePath,
      outDir: profileDir,
      host,
      with: ['container', 'tor'],
      // Re-check the archive hash when creating the generation copy, so changing
      // the original after the policy check cannot change the exported artifact.
      o: { ...verificationOptions, 'tor-instance': 'container', 'hs-dir': '/var/lib/tor/ghostpay' },
    });
    const torDir = join(profileDir, 'container', 'tor');
    // Replace the kit's distro-package Dockerfile with the source-pinned recipe.
    // torrc, nginx policy, static bytes, networks and volume contract remain reused.
    for (const name of ['Dockerfile', '.dockerignore', 'tor-start.sh', 'runtime-check.sh']) {
      await copyFile(join(templates, name), join(torDir, name));
    }
    await writeFile(join(profileDir, 'container', 'compose.onion.yaml'), composeOverride, { flag: 'wx', mode: 0o644 });
    await writeFile(join(profileDir, 'START.md'), startGuide, { flag: 'wx', mode: 0o644 });
    await writeFile(join(torDir, 'README-TOR.md'), [
      '# Tor sidecar for the static-only recipe', '',
      'Read ../../START.md before activation. Run Compose from the parent container/ directory.',
      'The final compose.onion.yaml override is REQUIRED; it removes published ports and the web egress network.',
      '',
      '    docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml config',
      '',
      'Use all three files, in that order, for build, run, up, exec and down commands.',
      'The identity stays in the tor-data volume, outside this directory. Do not delete that volume during updates.',
      'No image build, network connection or service activation is implied by file generation.', '',
    ].join('\n'), { mode: 0o644 });
    // Refuse a concurrent non-empty destination. No existing deployment is removed.
    await rename(profileDir, outDir);
    return { outDir, archiveSha256: options.expectedArchiveSha256, torVersion: TOR_VERSION, started: false, warnings: result.warnings };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    archive: { type: 'string' }, out: { type: 'string' }, 'expect-sha256': { type: 'string' },
    config: { type: 'string' }, 'allow-subpath': { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node deploy/tor-static/prepare.mjs --archive SITE.zip --expect-sha256 HEX --out NEW_DIRECTORY [--config host.json] [--allow-subpath]');
    return;
  }
  if (positionals.length || !values.archive || !values.out || !values['expect-sha256']) {
    throw new Error('Required: --archive SITE.zip --expect-sha256 HEX --out NEW_DIRECTORY');
  }
  const hostConfig = values.config ? JSON.parse(await readFile(resolve(values.config), 'utf8')) : undefined;
  const result = await prepareStaticTor({
    archivePath: values.archive, outDir: values.out, expectedArchiveSha256: values['expect-sha256'],
    hostConfig, allowSubpath: values['allow-subpath'],
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Static Tor preparation failed: ${error instanceof Error ? error.message : 'unknown failure'}`);
    process.exitCode = 1;
  });
}
