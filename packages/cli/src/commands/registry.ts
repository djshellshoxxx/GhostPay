import { ERC6538_REGISTRY, buildLookupCall, lookupMetaAddress, verifyRegistry } from '@ghostpay/chain-adapters';
import { noPositionals, requireValue } from '../args.js';
import { OUT_OPTS } from '../ctx.js';
import { failError } from '../io.js';
import { chainBoundary, configuredChain, ONLINE_OPTS, rpcSession } from '../payment-context.js';
import type { Command } from './types.js';

export const registryCommands: readonly Command[] = [{
  path: ['registry', 'lookup'], summary: 'read a public ERC-6538 scheme-1 entry with explicit bounded RPC consent',
  usage: 'ghostpay registry lookup --chain ID --registrant ADDRESS --online (--rpc-file FILE | --rpc-env NAME) [--secondary-rpc-file FILE | --secondary-rpc-env NAME] [--allow-insecure-localhost] [--out REPORT] [--force] [--json]\n  Example: ghostpay registry lookup --chain 11155111 --registrant 0x1111111111111111111111111111111111111111 --online --rpc-env TESTNET_RPC --json\n  Uses the GUI registry code-presence and getter probe on enabled testnets. The runtime code hash is not independently pinned. A stored entry does not prove real-world identity, exclusive key ownership or payment. No registration or clearing transaction is signed or sent.',
  opts: { chain: 'value', registrant: 'value', ...ONLINE_OPTS, ...OUT_OPTS },
  handler: async (ctx, a) => chainBoundary(async () => {
    noPositionals(a);
    const chain = configuredChain(a, true);
    const registrant = requireValue(a, 'registrant');
    const preview = buildLookupCall(registrant).preview;
    const session = await rpcSession(ctx, a, chain);
    await verifyRegistry(session.client);
    const metaAddress = await lookupMetaAddress(session.client, registrant);
    if (session.secondary !== undefined) {
      await verifyRegistry(session.secondary);
      if (await lookupMetaAddress(session.secondary, registrant) !== metaAddress)
        throw failError('PROVIDER_DISAGREEMENT', 'configured providers disagree about the registry entry.');
    }
    const report = { ok: true, schemaVersion: 1, chainId: `eip155:${chain.chainId}`, registry: ERC6538_REGISTRY,
      registrant: preview.registrant, schemeId: '1', registered: metaAddress !== undefined, metaAddress: metaAddress ?? null,
      registryBehaviorChecked: true, registryCodePinned: false, identityVerified: false, paymentVerified: false,
      providerTrustEstablished: false, providers: session.secondary === undefined ? 1 : 2, checkedAt: ctx.io.nowSeconds() };
    const wrote = await ctx.writeOut(a, JSON.stringify(report, null, 2) + '\n');
    ctx.out({ ...report, ...(wrote ? { out: a.values.get('out') } : {}) },
      `${metaAddress === undefined ? 'No scheme-1 entry is registered.' : `Registered scheme-1 meta-address: ${metaAddress}`}\nRegistry behavior was checked through the configured providers. Registry code, seller identity and payment remain independently unverified.`);
    return 0;
  }),
}];
