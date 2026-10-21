#!/usr/bin/env node
// Builds deployments/<chainId>.json from a forge broadcast file plus on-chain reads, validates it against
// deployments/schema.json (built-in minimal 2020-12 subset validator) and the chain-adapters validator.
//
// Usage: node scripts/testnet/make-manifest.mjs --rpc <url> [--broadcast <run-latest.json>]
//          [--policy-broadcast <run-latest.json>] [--out <file>] [--copy-web] [--commit <40hex>] [--dry]
//   env fallback: RPC_URL. Default broadcast: packages/contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json
// Exit codes: 0 ok, 1 usage/validation failure.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, keccak256, parseAbi, getAddress } from 'viem';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA_PATH = resolve(ROOT, 'deployments/schema.json');

export function validateAgainstSchema(value, schema, root = schema, path = '$') {
  const errs = [];
  const resolveRef = (s) => {
    if (s.$ref === undefined) return s;
    const name = s.$ref.replace('#/$defs/', '');
    return root.$defs[name];
  };
  const s = resolveRef(schema);
  const t = s.type;
  if (t === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: not an object`];
    for (const k of s.required ?? []) if (!(k in value)) errs.push(`${path}.${k}: missing`);
    for (const [k, v] of Object.entries(value)) {
      const sub = s.properties?.[k];
      if (sub === undefined) {
        if (s.additionalProperties === false) errs.push(`${path}.${k}: unknown key`);
        continue;
      }
      errs.push(...validateAgainstSchema(v, sub, root, `${path}.${k}`));
    }
    for (const [k, deps] of Object.entries(s.dependentRequired ?? {})) {
      if (k in value) for (const d of deps) if (!(d in value)) errs.push(`${path}.${d}: required when ${k} present`);
    }
  } else if (t === 'integer') {
    if (!Number.isSafeInteger(value)) errs.push(`${path}: not an integer`);
    else {
      if (s.minimum !== undefined && value < s.minimum) errs.push(`${path}: below minimum`);
      if (s.maximum !== undefined && value > s.maximum) errs.push(`${path}: above maximum`);
    }
  } else if (t === 'string') {
    if (typeof value !== 'string') errs.push(`${path}: not a string`);
    else {
      if (s.pattern !== undefined && !new RegExp(s.pattern).test(value)) errs.push(`${path}: pattern mismatch`);
      if (s.format === 'date-time' && Number.isNaN(Date.parse(value))) errs.push(`${path}: bad date-time`);
    }
  }
  return errs;
}

function arg(name, argv) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function pickTx(broadcast, contractName) {
  const txs = (broadcast.transactions ?? []).filter((t) => t.contractName === contractName && t.transactionType === 'CREATE');
  if (txs.length !== 1) throw new Error(`expected exactly one CREATE of ${contractName} in broadcast, found ${txs.length}`);
  return txs[0];
}

export async function buildManifest({ rpc, broadcastPath, policyBroadcastPath, commit }) {
  const pub = createPublicClient({ transport: http(rpc) });
  const chainId = await pub.getChainId();
  const bPath = broadcastPath ?? resolve(ROOT, `packages/contracts/broadcast/Deploy.s.sol/${chainId}/run-latest.json`);
  if (!existsSync(bPath)) throw new Error(`broadcast file not found: ${bPath}`);
  const b = JSON.parse(readFileSync(bPath, 'utf8'));
  if (b.chain !== undefined && Number(b.chain) !== chainId) throw new Error(`broadcast chain ${b.chain} != rpc chain ${chainId}`);
  const rtx = pickTx(b, 'GhostPayRouter');
  const stx = pickTx(b, 'GhostPaySweepRelayer');
  const router = getAddress(rtx.contractAddress);
  const sweepRelayer = getAddress(stx.contractAddress);

  const codeHash = async (a) => {
    const code = await pub.getCode({ address: a });
    if (code === undefined || code === '0x') throw new Error(`no code at ${a} on chain ${chainId}`);
    return keccak256(code);
  };
  const routerAbi = parseAbi([
    'function FEE_RECIPIENT() view returns (address)',
    'function ANNOUNCER() view returns (address)',
    'function FEE_BPS() view returns (uint256)',
  ]);
  const rd = (fn) => pub.readContract({ address: router, abi: routerAbi, functionName: fn });
  const [feeRecipient, announcer, feeBps] = await Promise.all([rd('FEE_RECIPIENT'), rd('ANNOUNCER'), rd('FEE_BPS')]);

  const receipt = await pub.getTransactionReceipt({ hash: rtx.hash });
  const block = await pub.getBlock({ blockNumber: receipt.blockNumber });
  const meta = JSON.parse(readFileSync(resolve(ROOT, 'packages/contracts/out/GhostPayRouter.sol/GhostPayRouter.json'), 'utf8'));
  const solcVersion = meta.metadata?.compiler?.version;
  if (typeof solcVersion !== 'string') throw new Error('cannot read solc version from forge artifact (run forge build)');
  const sha = commit ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

  const m = {
    chainId,
    announcer: getAddress(announcer),
    router,
    sweepRelayer,
    feeRecipient: getAddress(feeRecipient),
    feeBps: Number(feeBps),
    deployTx: { router: rtx.hash, sweepRelayer: stx.hash },
    solcVersion,
    commit: sha,
    bytecodeHashes: { router: await codeHash(router), sweepRelayer: await codeHash(sweepRelayer) },
    date: new Date(Number(block.timestamp) * 1000).toISOString(),
  };

  if (policyBroadcastPath !== undefined) {
    const pb = JSON.parse(readFileSync(policyBroadcastPath, 'utf8'));
    const itx = pickTx(pb, 'PolicyAccount');
    const ftx = pickTx(pb, 'PolicyAccountFactory');
    const impl = getAddress(itx.contractAddress);
    const factory = getAddress(ftx.contractAddress);
    const fAbi = parseAbi([
      'function FEE_TOKEN() view returns (address)',
      'function FLAT_FEE() view returns (uint256)',
      'function FEE_RECIPIENT() view returns (address)',
    ]);
    const fr = (fn) => pub.readContract({ address: factory, abi: fAbi, functionName: fn });
    m.policyImplementation = impl;
    m.policyFactory = factory;
    m.policyFeeToken = getAddress(await fr('FEE_TOKEN'));
    m.policyFlatFee = (await fr('FLAT_FEE')).toString();
    m.policyFeeRecipient = getAddress(await fr('FEE_RECIPIENT'));
    m.deployTx.policyImplementation = itx.hash;
    m.deployTx.policyFactory = ftx.hash;
    m.bytecodeHashes.policyImplementation = await codeHash(impl);
    m.bytecodeHashes.policyFactory = await codeHash(factory);
  }
  return m;
}

export async function validateAll(manifest) {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const errs = validateAgainstSchema(manifest, schema);
  if (errs.length > 0) throw new Error(`schema validation failed:\n  ${errs.join('\n  ')}`);
  // Second opinion: the validator the app and relayer actually use.
  const { validateManifest } = await import('@ghostpay/chain-adapters');
  validateManifest(JSON.parse(JSON.stringify(manifest)), manifest.chainId);
}

async function main() {
  const argv = process.argv.slice(2);
  const rpc = arg('rpc', argv) ?? process.env.RPC_URL;
  if (rpc === undefined) {
    console.error('usage: make-manifest.mjs --rpc <url> [--broadcast f] [--policy-broadcast f] [--out f] [--copy-web] [--commit sha] [--dry]');
    process.exit(1);
  }
  const m = await buildManifest({
    rpc,
    broadcastPath: arg('broadcast', argv),
    policyBroadcastPath: arg('policy-broadcast', argv),
    commit: arg('commit', argv),
  });
  await validateAll(m);
  const text = `${JSON.stringify(m, null, 2)}\n`;
  if (argv.includes('--dry')) {
    process.stdout.write(text);
    return;
  }
  const out = arg('out', argv) ?? resolve(ROOT, `deployments/${m.chainId}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.error(`wrote ${out}`);
  if (argv.includes('--copy-web')) {
    const dst = resolve(ROOT, `apps/web/public/deployments/${m.chainId}.json`);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(out, dst);
    console.error(`copied ${dst}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`make-manifest: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
