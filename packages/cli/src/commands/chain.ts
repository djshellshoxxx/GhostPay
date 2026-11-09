import { CHAINS, MAX_PLAUSIBLE_HEAD, tokensForChain } from '@ghostpay/chain-adapters';
import { decodeMetaAddress as decodeEvmMeta, encodeMetaAddress as encodeEvmMeta } from '@ghostpay/core-crypto';
import { CHAIN_PARAMS, HeaderChain, decodeSilentPaymentAddress, type HeaderCheckpoint, type HeaderNetwork, type SerializedHeaderChain } from '@ghostpay/btc-silent-payments';
import { ENABLED_SOLANA_CHAINS, decodeAnnouncementMemo, decodeMetaAddress as decodeSolanaMeta, encodeMetaAddress as encodeSolanaMeta } from '@ghostpay/chain-solana';
import { parseTronAddress } from '@ghostpay/chain-tron';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { noPositionals, requireValue } from '../args.js';
import { OUT_OPTS } from '../ctx.js';
import { chainBoundary, configuredChain, MANIFEST_OPTS, manifestTrust, ONLINE_OPTS, readManifest, rpcSession, verifiedContext } from '../payment-context.js';
import { CliError, failError, usageError } from '../io.js';
import { record } from '../payment-input.js';
import type { Command } from './types.js';

export const chainCommands: readonly Command[] = [{
  path: ['chain', 'list'], summary: 'list configured chains and their actual support gates',
  usage: 'ghostpay chain list [--json]\n  Example: ghostpay chain list --json\n  Enabled testnets are development support, not qualified production deployments.', opts: {},
  handler: (ctx, a) => {
    noPositionals(a);
    const chains = [
      ...CHAINS.map((chain) => ({ family: 'evm', chainId: `eip155:${chain.chainId}`, numericChainId: chain.chainId,
        name: chain.name, enabled: chain.enabled, testnet: chain.testnet, finalityDepth: chain.finalityDepth,
        productionReady: false, verification: 'direct-router-scheme-1-with-pinned-deployment' })),
      ...ENABLED_SOLANA_CHAINS.map((chainId) => ({ family: 'solana', chainId, enabled: true, testnet: true,
        productionReady: false, verification: 'public-address-and-announcement-inspection' })),
      { family: 'bitcoin', chainId: 'btc-mainnet', enabled: false, testnet: false, productionReady: false, verification: 'pinned-header-chain-only' },
      { family: 'bitcoin', chainId: 'btc-regtest', enabled: true, testnet: true, productionReady: false, verification: 'pinned-header-chain-only' },
      { family: 'bitcoin', chainId: 'btc-testnet4', enabled: true, testnet: true, productionReady: false, verification: 'pinned-header-chain-only' },
      { family: 'bitcoin', chainId: 'btc-signet', enabled: true, testnet: true, productionReady: false, verification: 'pinned-header-chain-only-no-signet-signatures' },
      { family: 'tron', chainId: 'tron-nile', enabled: false, testnet: true, productionReady: false, verification: 'public-address-inspection-only' },
    ];
    ctx.out({ ok: true, schemaVersion: 1, chains }, chains.map((chain) => `${chain.chainId}: ${chain.verification}; production ready: no`).join('\n'));
    return Promise.resolve(0);
  },
}, {
  path: ['chain', 'assets'], summary: 'inspect configured native currency and allowlisted tokens',
  usage: 'ghostpay chain assets --chain CHAIN_ID [--json]\n  Example: ghostpay chain assets --chain 11155111 --json\n  This static table does not authenticate a deployment or override disabled chains.', opts: { chain: 'value' },
  handler: async (ctx, a) => chainBoundary(() => {
    noPositionals(a);
    const chain = configuredChain(a);
    const assets = [{ asset: 'native', symbol: chain.nativeSymbol, decimals: chain.nativeDecimals },
      ...tokensForChain(chain.chainId).map((token) => ({ asset: token.address, symbol: token.symbol, decimals: token.decimals, permit: token.permit }))];
    ctx.out({ ok: true, schemaVersion: 1, chainId: `eip155:${chain.chainId}`, enabled: chain.enabled, assets },
      assets.map((asset) => `${asset.symbol}: ${asset.asset}; decimals ${asset.decimals}`).join('\n'));
    return 0;
  }),
}, {
  path: ['chain', 'recipient', 'inspect'], summary: 'validate public EVM/Solana meta-addresses, Bitcoin silent addresses or TRON addresses',
  usage: 'ghostpay chain recipient inspect --family evm|bitcoin|solana|tron --in recipient.txt [--network mainnet|testnet] [--json]\n  Example: ghostpay chain recipient inspect --family bitcoin --network testnet --in recipient.txt --json\n  Validation checks format and checksums only. It proves neither recipient identity nor payment.',
  opts: { family: 'value', in: 'value', network: 'value' },
  handler: async (ctx, a) => chainBoundary(async () => {
    noPositionals(a);
    const family = requireValue(a, 'family');
    const text = (await ctx.read(requireValue(a, 'in'))).trim();
    if (text.length > 2048) throw failError('INVALID_INPUT', 'public recipient exceeds its size limit.');
    const network = a.values.get('network');
    if (network !== undefined && (family !== 'bitcoin' || (network !== 'mainnet' && network !== 'testnet')))
      throw usageError('BAD_NETWORK', '--network applies to Bitcoin and must be mainnet or testnet.');
    let canonical: string;
    let detectedNetwork: string | undefined;
    if (family === 'evm') canonical = encodeEvmMeta(decodeEvmMeta(text));
    else if (family === 'solana') canonical = encodeSolanaMeta(decodeSolanaMeta(text));
    else if (family === 'tron') canonical = parseTronAddress(text);
    else if (family === 'bitcoin') {
      const parsed = decodeSilentPaymentAddress(text, network);
      if (parsed.version !== 0) throw new CliError('unsupported', 'UNSUPPORTED_VERSION', 'only currently supported Bitcoin silent-payment version 0 is actionable.');
      canonical = text;
      detectedNetwork = parsed.network;
    } else throw new CliError('unsupported', 'UNSUPPORTED_FAMILY', 'supported public recipient families: evm, bitcoin, solana, tron.');
    ctx.out({ ok: true, schemaVersion: 1, family, valid: true, canonical, network: detectedNetwork ?? null,
      identityVerified: false, paymentVerified: false }, `${family} public recipient format is valid. Recipient identity and payment are not established.\n${canonical}`);
    return 0;
  }),
}, {
  path: ['chain', 'solana', 'announcement', 'inspect'], summary: 'decode a public Solana announcement memo without claiming payment evidence',
  usage: 'ghostpay chain solana announcement inspect --in memo.txt [--json]\n  Example: ghostpay chain solana announcement inspect --in memo.txt --json\n  Validates the existing announcement encoding and point. Metadata is opaque; no network, recipient ownership, transfer or finality is checked.',
  opts: { in: 'value' },
  handler: async (ctx, a) => chainBoundary(async () => {
    noPositionals(a);
    const announcement = decodeAnnouncementMemo((await ctx.read(requireValue(a, 'in'))).trim());
    const ephemeralPublicKey = Buffer.from(announcement.ephemeralPublicKey).toString('hex');
    const metadataHex = Buffer.from(announcement.metadata).toString('hex');
    ctx.out({ ok: true, schemaVersion: 1, family: 'solana', valid: true, status: 'announced',
      ephemeralPublicKey, viewTag: announcement.viewTag, metadataHex, paymentVerified: false, networkUsed: false },
    `Solana announcement encoding is valid; view tag ${announcement.viewTag}, ${announcement.metadata.length} opaque metadata bytes. Payment remains unverified.`);
    return 0;
  }),
}, {
  path: ['chain', 'bitcoin', 'headers', 'verify'], summary: 'revalidate a Bitcoin header chain against a separately pinned checkpoint',
  usage: 'ghostpay chain bitcoin headers verify --in headers.json --checkpoint checkpoint.json --network mainnet|testnet4|signet|regtest [--json]\n  Example: ghostpay chain bitcoin headers verify --in headers.json --checkpoint checkpoint.json --network regtest --json\n  The checkpoint must come from a trusted independent source. Valid headers do not prove transaction inclusion, scripts, signet signatures or that a provider supplied the heaviest public chain. At most 4096 headers per file.',
  opts: { in: 'value', checkpoint: 'value', network: 'value' },
  handler: async (ctx, a) => chainBoundary(async () => {
    noPositionals(a);
    const network = requireValue(a, 'network');
    if (!Object.hasOwn(CHAIN_PARAMS, network)) throw usageError('BAD_NETWORK', '--network must be mainnet, testnet4, signet or regtest.');
    const checkpoint = parseCheckpoint(parseStrictJson(await ctx.read(requireValue(a, 'checkpoint'))));
    const raw = record(parseStrictJson(await ctx.read(requireValue(a, 'in'))), ['version', 'network', 'checkpoint', 'headers']);
    if (raw['version'] !== 1) throw new CliError('unsupported', 'UNSUPPORTED_VERSION', 'unsupported Bitcoin header snapshot version.');
    if (raw['network'] !== network) throw failError('NETWORK_MISMATCH', 'header snapshot network differs from --network.');
    if (!Array.isArray(raw['headers']) || raw['headers'].length > 4096 || raw['headers'].some((h: unknown) => typeof h !== 'string' || !/^[0-9a-f]{160}$/.test(h)))
      throw failError('INVALID_INPUT', 'header snapshot requires at most 4096 canonical 80-byte hex headers.');
    parseCheckpoint(raw['checkpoint']);
    const chain = HeaderChain.fromJSON(raw as unknown as SerializedHeaderChain, {
      checkpoint, params: CHAIN_PARAMS[network as HeaderNetwork], now: ctx.io.nowSeconds,
    });
    ctx.out({ ok: true, schemaVersion: 1, network, headersValid: true, headers: raw['headers'].length,
      tipHeight: chain.tipHeight, tipHash: chain.tipHash, cumulativeWork: chain.tipWork.toString(),
      transactionsVerified: false, signetSignaturesVerified: false, canonicalNetworkEstablished: false },
    `Header chain valid relative to the supplied checkpoint; tip height ${chain.tipHeight}. Transactions and network-wide canonicality are not established.`);
    return 0;
  }),
}, {
  path: ['chain', 'deployment', 'inspect'], summary: 'validate a deployment manifest and inspect optional trust pins offline',
  usage: 'ghostpay chain deployment inspect --chain CHAIN_ID --in deployment.json [--manifest-digest 0xDIGEST] [--release-key PUBLIC_KEY] [--json]\n  Example: ghostpay chain deployment inspect --chain 11155111 --in deployment.json --json\n  Schema validation and a signature do not establish that contracts exist or that a payment occurred.',
  opts: { chain: 'value', in: 'value', 'manifest-digest': 'value', 'release-key': 'multi' },
  handler: async (ctx, a) => chainBoundary(async () => {
    noPositionals(a);
    const chain = configuredChain(a);
    const manifest = await readManifest(ctx, requireValue(a, 'in'), chain.chainId);
    const trust = manifestTrust(manifest, a, false);
    ctx.out({ ok: true, schemaVersion: 1, chainId: `eip155:${chain.chainId}`, enabled: chain.enabled,
      manifestDigest: trust.digest, manifestTrusted: trust.trusted, signature: trust.signature.status,
      deploymentVerified: false, paymentVerified: false, productionReady: false, policyEnabled: false,
      router: manifest.router, announcer: manifest.announcer, sweepRelayer: manifest.sweepRelayer, feeBps: manifest.feeBps },
    `Manifest schema valid; supplied trust pin: ${trust.trusted ? 'matches' : 'none'}. Deployed contracts and payment have not been verified.`);
    return 0;
  }),
}, {
  path: ['chain', 'deployment', 'verify'], summary: 'read back pinned testnet deployment code and contract parameters',
  usage: 'ghostpay chain deployment verify --chain CHAIN_ID --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt [--secondary-rpc-file second.txt] [--json]\n  Example: ghostpay chain deployment verify --chain 11155111 --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt\n  --release-key PUBLIC_KEY may replace the digest for signed manifests. --rpc-env NAME and --secondary-rpc-env NAME replace the corresponding endpoint files. No feature is activated and no transaction is signed.',
  opts: { chain: 'value', ...MANIFEST_OPTS, ...ONLINE_OPTS },
  handler: async (ctx, a) => chainBoundary(async () => {
    noPositionals(a);
    const chain = configuredChain(a, true);
    const context = await verifiedContext(ctx, a, chain);
    ctx.out({ ok: true, schemaVersion: 1, chainId: `eip155:${chain.chainId}`, manifestDigest: context.manifestDigest,
      deploymentVerified: true, paymentVerified: false, productionReady: false, policyEnabled: false,
      providers: context.secondary === undefined ? 1 : 2, providerTrustEstablished: false },
    'Testnet deployment code and parameters match the operator-pinned manifest through the configured RPC providers. No payment has been verified.');
    return 0;
  }),
}];

function parseCheckpoint(value: unknown): HeaderCheckpoint {
  const cp = record(value, ['height', 'hash', 'headerHex', 'previousHeaders'], ['height', 'hash', 'headerHex']);
  if (typeof cp['height'] !== 'number' || !Number.isSafeInteger(cp['height']) || cp['height'] < 0 ||
      typeof cp['hash'] !== 'string' || !/^[0-9a-f]{64}$/.test(cp['hash']) ||
      typeof cp['headerHex'] !== 'string' || !/^[0-9a-f]{160}$/.test(cp['headerHex'])) throw failError('INVALID_INPUT', 'invalid pinned checkpoint.');
  const previous = cp['previousHeaders'] ?? [];
  if (!Array.isArray(previous) || previous.length > 10 || previous.some((h: unknown) => typeof h !== 'string' || !/^[0-9a-f]{160}$/.test(h)))
    throw failError('INVALID_INPUT', 'invalid checkpoint ancestry.');
  return { height: cp['height'], hash: cp['hash'], headerHex: cp['headerHex'], previousHeaders: previous as string[] };
}

export const diagnosticsRpcCommands: readonly Command[] = [{
  path: ['diagnostics', 'rpc'], summary: 'check RPC reachability, chain identity and current block without trusting the provider',
  usage: 'ghostpay diagnostics rpc --chain CHAIN_ID --online --rpc-file rpc.txt [--secondary-rpc-file second.txt] [--out report.json] [--json]\n  Example: ghostpay diagnostics rpc --chain 11155111 --online --rpc-file rpc.txt --json\n  Use --rpc-env NAME and --secondary-rpc-env NAME instead of the corresponding files on Windows. Endpoint files must be private (0600 on POSIX). Add --allow-insecure-localhost only for loopback HTTP. A responding endpoint is not proof of a trustworthy provider.',
  opts: { chain: 'value', ...ONLINE_OPTS, ...OUT_OPTS },
  handler: async (ctx, a) => chainBoundary(async () => {
    noPositionals(a);
    const chain = configuredChain(a);
    const session = await rpcSession(ctx, a, chain);
    const head = await session.client.blockNumber();
    if (head > MAX_PLAUSIBLE_HEAD) throw new CliError('network', 'RPC_FAILURE', 'RPC reported an implausible head.');
    const block = await session.client.getBlock(head);
    if (block === null) throw new CliError('network', 'RPC_FAILURE', 'RPC did not return its current block.');
    let providersAgree: boolean | null = null;
    if (session.secondary !== undefined) {
      const otherHead = await session.secondary.blockNumber();
      if (otherHead < head || otherHead > MAX_PLAUSIBLE_HEAD) providersAgree = false;
      else providersAgree = (await session.secondary.getBlock(head))?.hash === block.hash;
    }
    const output = { ok: providersAgree !== false, schemaVersion: 1, reachable: true, chainMatches: true,
      chainId: `eip155:${chain.chainId}`, head: head.toString(), providerTrustEstablished: false,
      providers: session.secondary === undefined ? 1 : 2, providersAgree, checkedAt: ctx.io.nowSeconds() };
    const wrote = await ctx.writeOut(a, `${JSON.stringify(output, null, 2)}\n`);
    ctx.out({ ...output, ...(wrote ? { out: a.values.get('out') } : {}) },
      `RPC reachable on ${chain.name}, head ${head}. Provider trust is not established.${providersAgree === false ? ' Providers disagree or the secondary is stale.' : ''}`);
    return output.ok ? 0 : 1;
  }),
}];
