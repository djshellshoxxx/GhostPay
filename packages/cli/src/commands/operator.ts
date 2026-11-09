import { findChain, validateManifest } from '@ghostpay/chain-adapters';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { configuration } from '@ghostpay/merchant-billing';
import { parseWebhookEvent } from '@ghostpay/merchant-hooks';
import { parseAccountState } from '@ghostpay/merchant-multisig';
import { parseSettingsExchange, type SharedSettings } from '@ghostpay/qr-exchange';
import { noPositionals, parseIntOption, requireValue } from '../args.js';
import { BUILD_INFO } from '../build-info.js';
import { Ctx, OUT_OPTS } from '../ctx.js';
import { CliError, usageError } from '../io.js';
import { OUTPUT_SCHEMA_VERSION, VERSION } from '../version.js';
import { doctorCommands } from './doctor.js';
import type { Command } from './types.js';

export const operatorCommands: readonly Command[] = [{
  path: ['diagnostics'], summary: 'export offline installation diagnostics without credentials or user records',
  usage: 'ghostpay diagnostics [--out REPORT] [--force] [--json]\n  Example: ghostpay diagnostics --out diagnostics.json --json\n  Reports package/output-schema/Node versions, build-time source revision and dirty state (null when unavailable), and offline cryptographic self-tests. No endpoint is contacted and no provider trust is established. Use diagnostics rpc with explicit --online for RPC health.',
  opts: { ...OUT_OPTS }, handler: async (ctx, a) => {
    noPositionals(a); let captured = '';
    const selftest = new Ctx({ ...ctx.io, stdout: text => { captured += text; } }, true);
    const code = await doctorCommands[0]!.handler(selftest, a);
    const report = { ...(JSON.parse(captured) as Record<string, unknown>), schemaVersion: OUTPUT_SCHEMA_VERSION,
      version: VERSION, nodeVersion: ctx.io.nodeVersion, buildInfo: BUILD_INFO, networkContacted: false, providerTrustEstablished: false };
    const wrote = await ctx.writeOut(a, JSON.stringify(report, null, 2) + '\n');
    ctx.out({ ...report, ...(wrote ? { out: a.values.get('out') } : {}) }, code === 0 ? 'Offline installation diagnostics passed.' : 'Offline installation diagnostics reported a failure.');
    return code;
  },
}, {
  path: ['config', 'validate'], summary: 'preflight an existing GhostPay configuration or exchange schema',
  usage: 'ghostpay config validate --kind subscription|merchant-account|deployment|webhook-event|settings --in FILE [--chain ID]\n  Example: ghostpay config validate --kind settings --in settings.json --json\n  Deployment validation requires --chain. Settings accepts only the existing ghostpay-settings v1 five-preference export. This checks schema and policy consistency only; it does not authenticate an operator policy, contact a provider, import browser settings or verify payment.',
  opts: { kind: 'value', in: 'value', chain: 'value' }, handler: async (ctx, a) => {
    noPositionals(a); const kind = requireValue(a, 'kind');
    if (!['subscription', 'merchant-account', 'deployment', 'webhook-event', 'settings'].includes(kind))
      throw usageError('CONFIG_KIND', 'choose a supported configuration kind from --help.');
    const text = await ctx.read(requireValue(a, 'in'));
    const chainId = kind === 'deployment' ? parseIntOption(requireValue(a, 'chain'), 'chain', 1, Number.MAX_SAFE_INTEGER) : undefined;
    let settings: SharedSettings | undefined;
    try {
      const raw = parseStrictJson(text);
      if (kind === 'subscription') configuration(raw);
      else if (kind === 'merchant-account') parseAccountState(text);
      else if (kind === 'webhook-event') parseWebhookEvent(JSON.stringify(raw));
      else if (kind === 'settings') settings = parseSettingsExchange(text);
      else {
        if (findChain(chainId as number) === undefined) throw new Error('unknown chain');
        validateManifest(raw, chainId as number);
      }
    } catch { throw new CliError('config', 'CONFIG_INVALID', 'configuration or exchange schema is invalid.'); }
    ctx.out({ ok: true, schemaVersion: OUTPUT_SCHEMA_VERSION, kind, configurationOnly: true, paymentVerified: false, networkContacted: false,
      ...(settings === undefined ? {} : { settings, applied: false, browserStorageChanged: false }) },
      `${kind} schema validated. No provider, payment or policy authority was authenticated.`);
    return 0;
  },
}];
