import { MAX_PLAUSIBLE_HEAD, parseQuantity, verifyClaimedPayment, type PaymentVerification } from '@ghostpay/chain-adapters';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { chainBoundary, MANIFEST_OPTS, ONLINE_OPTS, verifiedContext, type VerifiedContext } from '../payment-context.js';
import { assertExpectedPayment, parsePaymentObservation } from '../payment-input.js';
import { CliError } from '../io.js';
import type { Command } from './types.js';

/** Fresh read-only evidence for CLI display and reconciliation; never prints or persists a result. */
export async function verifyObservation(ctx: Ctx, a: Parsed, text: string, existingSession?: VerifiedContext) {
  return chainBoundary(async () => {
    const initial = parsePaymentObservation(text);
    assertExpectedPayment(initial);
    const session = existingSession ?? await verifiedContext(ctx, a, initial.chain);
    if (session.client.chainId !== initial.chain.chainId || session.manifest.chainId !== initial.chain.chainId)
      throw new CliError('config', 'CHAIN_MISMATCH', 'observation differs from the shared verified chain context.');
    const observation = parsePaymentObservation(text, session.manifest.router);
    const { claim, chain } = observation;
    const result = await verifyClaimedPayment({ chain, client: session.client, router: session.manifest.router,
      announcer: session.manifest.announcer, claim, ...(session.secondary === undefined ? {} : { secondaryClient: session.secondary }) });
    let status: string = result.status === 'received' ? result.final ? 'verified' : 'pending-finality'
      : result.status === 'unverified-announcement' ? 'announced' : 'unknown';
    if (result.confirmations === 0n && result.status === 'received') status = 'unknown';
    let transactionObserved = result.evidence.includes('receipt');
    if (result.status !== 'received' && result.status !== 'unverified-announcement' && session.stats.transportFailures === 0) {
      const canonical = await session.client.getBlock(claim.announcement.blockNumber);
      const head = await session.client.blockNumber();
      if (canonical !== null && head >= claim.announcement.blockNumber && canonical.hash !== claim.announcement.blockHash) status = 'reorganization-detected';
      else {
        const receipt = await session.client.request('eth_getTransactionReceipt', [claim.announcement.transactionHash]);
        if (typeof receipt === 'object' && receipt !== null && !Array.isArray(receipt)) {
          const rc = receipt as Record<string, unknown>;
          if (rc['transactionHash'] === claim.announcement.transactionHash && rc['blockHash'] === claim.announcement.blockHash &&
              parseQuantity(rc['blockNumber']) === claim.announcement.blockNumber && canonical?.hash === claim.announcement.blockHash && head >= claim.announcement.blockNumber) {
            if (rc['status'] === '0x0') status = 'failed';
            else if (rc['status'] === '0x1') { status = 'observed'; transactionObserved = true; }
          }
        }
      }
    }
    const tipNumber = await session.client.blockNumber();
    if (tipNumber > MAX_PLAUSIBLE_HEAD) throw new CliError('network', 'RPC_FAILURE', 'RPC reported an implausible head during final verification.');
    const canonicalTip = await session.client.getBlock(tipNumber);
    let confirmations = tipNumber >= claim.announcement.blockNumber ? tipNumber - claim.announcement.blockNumber + 1n : 0n;
    if (result.status === 'received') {
      const latestBlock = await session.client.getBlock(claim.announcement.blockNumber);
      let reorganized = latestBlock !== null && latestBlock.hash !== claim.announcement.blockHash;
      let available = latestBlock !== null && canonicalTip !== null;
      if (session.secondary !== undefined) {
        const otherHead = await session.secondary.blockNumber();
        if (otherHead > MAX_PLAUSIBLE_HEAD) throw new CliError('network', 'RPC_FAILURE', 'secondary RPC reported an implausible head during final verification.');
        const otherTip = await session.secondary.getBlock(otherHead);
        const otherBlock = await session.secondary.getBlock(claim.announcement.blockNumber);
        const otherConfirmations = otherHead >= claim.announcement.blockNumber ? otherHead - claim.announcement.blockNumber + 1n : 0n;
        if (otherConfirmations < confirmations) confirmations = otherConfirmations;
        reorganized ||= otherBlock !== null && otherBlock.hash !== claim.announcement.blockHash;
        available &&= otherTip !== null && otherBlock !== null;
      }
      if (reorganized) status = 'reorganization-detected';
      else if (!available || confirmations === 0n) status = 'unknown';
      else status = confirmations >= BigInt(chain.finalityDepth) ? 'verified' : 'pending-finality';
    }
    const ok = status === 'verified';
    const output = { ok, schemaVersion: 1, family: 'evm', chainId: chain.chainId, status, paymentVerified: ok,
      final: ok, transactionObserved,
      verificationScope: 'operator-pinned-testnet', evidenceSource: 'live-rpc',
      providers: session.secondary === undefined ? 1 : 2, providerTrustEstablished: false,
      confirmations: confirmations.toString(), evidence: result.evidence,
      ...(result.evidenceId === undefined ? {} : { evidenceId: result.evidenceId }),
      ...(result.evidenceBinding === undefined ? {} : { evidenceBinding: result.evidenceBinding }),
      reason: safeReason(result), manifestDigest: session.manifestDigest,
      networkFailure: session.stats.transportFailures > 0, checkedAt: ctx.io.nowSeconds(),
    };
    return { output, observation, verification: result, canonicalTip, client: session.client,
      ...(session.secondary === undefined ? {} : { secondary: session.secondary }), manifest: session.manifest };
  });
}

async function verify(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const { output } = await verifyObservation(ctx, a, await ctx.read(requireValue(a, 'in')));
  const wrote = await ctx.writeOut(a, `${JSON.stringify(output, null, 2)}\n`);
  ctx.out({ ...output, ...(wrote ? { out: a.values.get('out') } : {}) }, `Payment status: ${output.status}. ${output.ok ? 'Canonical direct-payment evidence meets the configured finality depth.' : 'Payment is not confirmed.'}\nVerification is relative to the operator-pinned testnet deployment and configured providers.`);
  return output.networkFailure ? 4 : output.ok ? 0 : 1;
}

function safeReason(result: PaymentVerification): string | null {
  // The shared verifier's reasons are fixed source strings, not raw provider data.
  return result.reason ?? null;
}

export const paymentCommands: readonly Command[] = [{
  path: ['payment', 'inspect'],
  summary: 'inspect an untrusted EVM payment announcement offline',
  usage: 'ghostpay payment inspect --in observation.json [--json]\n  Input: version 1, family "evm", chainId, raw ERC-5564 log, optional expected {recipient, asset, amount}.\n  Example: ghostpay payment inspect --in observation.json --json\n  An announcement and transaction hash do not establish payment.',
  opts: { in: 'value' },
  handler: async (ctx, a) => {
    noPositionals(a);
    const observation = await chainBoundary(async () => parsePaymentObservation(await ctx.read(requireValue(a, 'in'))));
    const { chain, claim } = observation;
    ctx.out({ ok: true, schemaVersion: 1, family: 'evm', chainId: chain.chainId, status: 'announced', paymentVerified: false,
      transactionHash: claim.announcement.transactionHash, blockNumber: claim.announcement.blockNumber.toString(),
      recipient: claim.stealthAddress,
      declaredAsset: claim.metadata?.kind === 'native' ? 'native' : claim.metadata?.token ?? null,
      declaredAmount: claim.metadata?.netAmount.toString() ?? null,
      evidenceSource: 'untrusted-input',
    }, 'Announcement parsed. Payment remains unverified; neither its amount nor its transaction hash establishes payment.');
    return 0;
  },
}, ...(['verify', 'status'] as const).map((action): Command => ({
  path: ['payment', action],
  summary: action === 'verify' ? 'verify exact EVM payment evidence against live canonical RPC data' : 'refresh an EVM payment status with live verification',
  usage: `ghostpay payment ${action} --in observation.json --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt [--secondary-rpc-file second.txt] [--out report.json] [--json]\n  Alternatively use --release-key PUBLIC_KEY for an authenticated manifest signature.\n  Example: ghostpay payment ${action} --in observation.json --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt --json\n  Endpoint sources: --rpc-file PATH or --rpc-env NAME; optional --secondary-rpc-file PATH or --secondary-rpc-env NAME. Files must be private (0600 on POSIX); use named environment sources on Windows. HTTP is limited to explicit --allow-insecure-localhost. Only enabled testnets and direct scheme-1 router payments are supported. The expected recipient/asset/amount must come from the original request.`,
  opts: { in: 'value', ...MANIFEST_OPTS, ...ONLINE_OPTS, ...OUT_OPTS },
  handler: verify,
}))];
