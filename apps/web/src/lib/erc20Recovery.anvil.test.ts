import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Address, type Hex } from '@ghostpay/chain-adapters';
import { encodeFunctionData, getAddress, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { stubJournalWindow } from '../test/locks';
import { AnvilWallet, KEYS, erc20AnvilAvailable, erc20AnvilRequired, startLocalChain, type LocalChain } from './erc20Anvil.testutil';
import { approveRouter, finalize, foreignRouterPayment, newSeller, payerSetup, prepareAndSend, approveIfNeeded, realNow, scanSeller, signedInvoice } from './erc20Flow.testutil';
import { exportEncryptedPayment, exportMasterBackup, exportPaymentArchive } from './paymentKeyExport';
import { quoteBuffer } from './pay';
import { receiptBindingForInvoice } from './receipts';
import { clearSession, exportKeystore, getSessionPublic, hasSession, withSessionSecrets } from './session';
import { checkDestination, deriveVerifiedSweepKey, directSweep, readBalance, reconcileDirectSweep } from './sweep';
import type { ScanMatch } from './scanClient';
import type { SecretExportCredential } from './keyVault';

// Sweep and recovery of ERC-20 held at stealth addresses, on a real local chain. The app's direct sweep is exercised
// with a real session; the recovery cases then drop every key from the app and rebuild spending power only from an
// exported backup file plus the standalone reference decoder (scripts/recovery/stealth-export-recover.mjs, a separate
// process that imports no GhostPay code), spending with an independent signer (viem, not GhostPay).
it('needs anvil and the compiled contracts when REQUIRE_ANVIL=1', () => {
  if (erc20AnvilRequired) expect(erc20AnvilAvailable, 'REQUIRE_ANVIL=1 needs anvil and packages/contracts/out (run forge build)').toBe(true);
});

const RECOVER = resolve(import.meta.dirname, '../../../../scripts/recovery/stealth-export-recover.mjs');
const N = 1 << 14; // scrypt cost of the test files only; production uses the codec default
const PASS = 'orbit-lantern-cobalt-meadow-violet';
const BACKUP_PASS = 'quartz-harbor-velvet-plume-aurora';
const erc20 = parseAbi(['function transfer(address,uint256) returns (bool)']);
const transferData = (to: Address, amount: bigint): Hex => encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [to, amount] });
/** A sweep destination the seller controls elsewhere; a fresh synthetic address per call. */
let counter = 0;
const destination = (): Address => getAddress(privateKeyToAccount(`0x${(0xc100 + (counter += 1)).toString(16).padStart(64, '0')}`).address);

/** Runs the standalone decoder in a clean process: empty environment, passphrase on stdin, nothing from GhostPay. */
function standalone(file: string, extra: readonly string[] = []): { readonly status: number | null; readonly json: Record<string, unknown> | undefined; readonly stderr: string } {
  const directory = mkdtempSync(join(tmpdir(), 'gp-erc20-recover-'));
  try {
    const path = join(directory, 'backup.json');
    writeFileSync(path, file, { mode: 0o600 });
    const run = spawnSync(process.execPath, [RECOVER, path, ...extra, '--reveal-private-keys'], { cwd: directory, env: {}, input: `${BACKUP_PASS}\n`, timeout: 60_000 });
    let json: Record<string, unknown> | undefined;
    try { json = JSON.parse(run.stdout.toString()) as Record<string, unknown>; } catch { json = undefined; }
    return { status: run.status, json, stderr: run.stderr.toString() };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const announcementJson = (match: ScanMatch): string => JSON.stringify({
  schemeId: String(match.announcement.schemeId), stealthAddress: match.announcement.stealthAddress,
  ephemeralPublicKey: match.announcement.ephemeralPublicKey, metadata: match.announcement.metadata,
});

describe.skipIf(!erc20AnvilAvailable)('ERC-20 sweep and backup recovery on a real local chain', () => {
  let local: LocalChain;
  beforeAll(async () => { local = await startLocalChain(); }, 120_000);
  afterAll(() => { local?.stop(); });
  beforeEach(() => { stubJournalWindow(vi.stubGlobal); newSeller(); });
  afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

  const credential = async (): Promise<SecretExportCredential> => ({ kind: 'keystore', text: await exportKeystore(PASS, { N }), passphrase: PASS });

  /** Pays exactly the invoice through the app with a quoted gas buffer, so the stealth address can pay for its own sweep. */
  async function bufferedPayment(): Promise<{ readonly match: ScanMatch; readonly net: bigint; readonly buffer: bigint; readonly parsed: Awaited<ReturnType<typeof signedInvoice>> }> {
    const parsed = await signedInvoice(local);
    const wallet = new AnvilWallet(local, KEYS.payer);
    const setup = await payerSetup(local, parsed, wallet);
    await approveIfNeeded(setup);
    const net = 99_750_000n;
    const quote = await quoteBuffer(local.rpc, realNow(), { token: local.usdc, from: wallet.account, amount: net });
    const { built, result } = await prepareAndSend(setup, quote);
    expect(result.receipt?.status).toBe('success');
    expect(built.preview.method).toBe('payERC20WithBuffer');
    await finalize(local);
    const [match] = await scanSeller(local);
    expect(match).toMatchObject({ receipt: 'verified', viaRouter: true, stealthAddress: built.preview.stealth });
    return { match: match!, net, buffer: quote.bufferWei, parsed };
  }

  it('direct sweep of a buffered payment: the stealth address pays its own gas, the destination receives exactly the net, a second sweep is impossible', async () => {
    const { match, net, buffer, parsed } = await bufferedPayment();
    const stealth = match.stealthAddress;
    // A buffered payment is still one router payment of exactly the invoice net: the receipt binds to it as usual.
    const binding = withSessionSecrets((s) => receiptBindingForInvoice(parsed, match, getSessionPublic()!.signerPublicKey, s.keys, realNow()));
    expect(binding).toMatchObject({ asset: local.usdc.toLowerCase(), amountMinorUnits: net.toString(), stealthAddress: stealth.toLowerCase() });
    expect(await local.balanceOf(local.usdc, stealth)).toBe(net);
    expect(await local.ethBalance(stealth)).toBe(buffer);
    const dest = destination();
    expect(checkDestination(dest.toLowerCase(), stealth, local.manifest)).toBe(dest);
    const target = { chainId: local.chainId, token: local.usdc, owner: stealth, announcement: match.announcement };
    expect(await readBalance(local.rpc, stealth, local.usdc)).toBe(net);

    const swept = await directSweep({ target, manifest: local.manifest, destination: dest, amount: net, rpc: local.rpc });
    expect(swept.sent).toBe(net);
    expect(swept.attempt).toMatchObject({ status: 'submitted', asset: local.usdc, amount: net, destination: dest, owner: stealth });
    // Handed to the node, not yet shown as mined by the app: "submitted" is all it may claim until a receipt exists.
    await local.mine(1);
    expect((await reconcileDirectSweep(local.rpc, swept.attempt)).status).toBe('included');
    expect(await local.balanceOf(local.usdc, dest)).toBe(net);
    expect(await local.balanceOf(local.usdc, stealth)).toBe(0n);
    // The buffer paid for it: what is left is dust below the buffer, never negative and never a second token transfer.
    expect(await local.ethBalance(stealth)).toBeLessThan(buffer);
    expect(await readBalance(local.rpc, stealth, local.usdc)).toBe(0n);
    await expect(directSweep({ target, manifest: local.manifest, destination: dest, amount: net, rpc: local.rpc })).rejects.toThrow();
    expect(await local.balanceOf(local.usdc, dest)).toBe(net);
  });

  it('direct sweep without gas at the stealth address is refused before anything is signed; after a plain top-up it sweeps exactly once', async () => {
    const parsed = await signedInvoice(local);
    const setup = await payerSetup(local, parsed, new AnvilWallet(local, KEYS.payer));
    await approveIfNeeded(setup);
    const { built } = await prepareAndSend(setup);
    await finalize(local);
    const [match] = await scanSeller(local);
    const stealth = match!.stealthAddress;
    expect(stealth).toBe(built.preview.stealth);
    const net = await local.balanceOf(local.usdc, stealth);
    expect(net).toBe(99_750_000n);
    expect(await local.ethBalance(stealth)).toBe(0n);
    const dest = destination();
    const target = { chainId: local.chainId, token: local.usdc, owner: stealth, announcement: match!.announcement };
    await expect(directSweep({ target, manifest: local.manifest, destination: dest, amount: net, rpc: local.rpc })).rejects.toThrow(/no native coin for gas/);
    expect(await local.nonce(stealth)).toBe(0);
    expect(await local.balanceOf(local.usdc, stealth)).toBe(net);
    await local.send(KEYS.payer3, { to: stealth, value: 10n ** 16n });
    await local.mine(1);
    const swept = await directSweep({ target, manifest: local.manifest, destination: dest, amount: net, rpc: local.rpc });
    await local.mine(1);
    expect((await reconcileDirectSweep(local.rpc, swept.attempt)).status).toBe('included');
    expect(await local.balanceOf(local.usdc, dest)).toBe(net);
    expect(await local.balanceOf(local.usdc, stealth)).toBe(0n);
  });

  it('a stealth key cannot be derived without the seller keys: with the session dropped the app cannot sweep', async () => {
    const { match } = await bufferedPayment();
    clearSession();
    expect(hasSession()).toBe(false);
    expect(() => deriveVerifiedSweepKey({ chainId: local.chainId, token: local.usdc, owner: match.stealthAddress, announcement: match.announcement })).toThrow(/load or generate/i);
  });

  it('single encrypted payment backup + standalone decoder: the recovered key sweeps a buffered payment with no other funding', async () => {
    const { match, net } = await bufferedPayment();
    const file = await exportEncryptedPayment(match, await credential(), BACKUP_PASS, { rpc: local.rpc, N });
    expect(file.filename).toBe('ghostpay-stealth-keypair.json');
    // The backup holds no plaintext key and says nothing about the token or amount.
    expect(file.text.toLowerCase()).not.toContain(local.usdc.slice(2).toLowerCase());
    clearSession();
    expect(hasSession()).toBe(false);

    const recovered = standalone(file.text, ['--expected-chain', String(local.chainId)]);
    expect(recovered.status, recovered.stderr).toBe(0);
    const [payment] = recovered.json?.['payments'] as { stealthAddress: string; privateKey: Hex }[];
    expect(payment?.stealthAddress.toLowerCase()).toBe(match.stealthAddress.toLowerCase());
    const signer = privateKeyToAccount(payment!.privateKey);
    expect(signer.address.toLowerCase()).toBe(match.stealthAddress.toLowerCase());
    const dest = destination();
    const hash = await local.send(payment!.privateKey, { to: local.usdc, data: transferData(dest, net) });
    await local.mine(1);
    expect(((await local.raw('eth_getTransactionReceipt', [hash])) as { status: string }).status).toBe('0x1');
    expect(await local.balanceOf(local.usdc, dest)).toBe(net);
    expect(await local.balanceOf(local.usdc, match.stealthAddress)).toBe(0n);
  });

  it('master backup and seller keystore + the on-chain announcement recover keys that sweep unfunded payments; the all-discovered archive agrees', async () => {
    await approveRouter(local, KEYS.payer2, local.usdc, 200_000_000n);
    const first = await foreignRouterPayment(local, KEYS.payer2, local.usdc, 100_000_000n);
    const second = await foreignRouterPayment(local, KEYS.payer2, local.usdc, 100_000_000n);
    await finalize(local);
    const matches = await scanSeller(local);
    expect(matches).toHaveLength(2);
    const byHash = (hash: Hex): ScanMatch => matches.find((m) => m.announcement.transactionHash?.toLowerCase() === hash)!;
    const viaMaster = byHash(first.hash);
    const viaKeystore = byHash(second.hash);
    const cred = await credential();
    const master = await exportMasterBackup(cred, BACKUP_PASS, { N });
    const keystore = await exportKeystore(BACKUP_PASS, { N });
    const archive = await exportPaymentArchive(matches, 'all-discovered', cred, BACKUP_PASS, { rpc: local.rpc, N });
    clearSession();
    expect(hasSession()).toBe(false);

    const keyFrom = (run: ReturnType<typeof standalone>, match: ScanMatch): Hex => {
      expect(run.status, run.stderr).toBe(0);
      const [item] = run.json?.['announcements'] as { owned: boolean; stealthAddress: string; privateKey: Hex }[];
      expect(item).toMatchObject({ owned: true });
      expect(item?.stealthAddress.toLowerCase()).toBe(match.stealthAddress.toLowerCase());
      return item!.privateKey;
    };
    const masterKey = keyFrom(standalone(master.text, ['--scan-announcement', announcementJson(viaMaster)]), viaMaster);
    const keystoreKey = keyFrom(standalone(keystore, ['--scan-announcement', announcementJson(viaKeystore)]), viaKeystore);
    const archived = standalone(archive.text, ['--expected-chain', String(local.chainId)]);
    expect(archived.status, archived.stderr).toBe(0);
    const archiveKeys = new Map((archived.json?.['payments'] as { stealthAddress: string; privateKey: Hex }[]).map((p) => [p.stealthAddress.toLowerCase(), p.privateKey]));
    expect(archiveKeys.get(viaMaster.stealthAddress.toLowerCase())).toBe(masterKey);
    expect(archiveKeys.get(viaKeystore.stealthAddress.toLowerCase())).toBe(keystoreKey);

    const net = 99_750_000n;
    for (const [key, match] of [[masterKey, viaMaster], [keystoreKey, viaKeystore]] as const) {
      expect(privateKeyToAccount(key).address.toLowerCase()).toBe(match.stealthAddress.toLowerCase());
      expect(await local.balanceOf(local.usdc, match.stealthAddress)).toBe(net);
      // No native coin yet: the recovered key cannot move the tokens, and nothing changes on chain.
      await expect(local.send(key, { to: local.usdc, data: transferData(destination(), net) })).rejects.toThrow();
      expect(await local.balanceOf(local.usdc, match.stealthAddress)).toBe(net);
      await local.send(KEYS.payer3, { to: match.stealthAddress, value: 10n ** 16n });
      await local.mine(1);
      const dest = destination();
      await local.send(key, { to: local.usdc, data: transferData(dest, net) });
      await local.mine(1);
      expect(await local.balanceOf(local.usdc, dest)).toBe(net);
      expect(await local.balanceOf(local.usdc, match.stealthAddress)).toBe(0n);
    }
  });

  it('a backup for one chain, a wrong passphrase and a tampered file are all refused by the standalone decoder', async () => {
    const { match } = await bufferedPayment();
    const file = await exportEncryptedPayment(match, await credential(), BACKUP_PASS, { rpc: local.rpc, N });
    const wrongChain = standalone(file.text, ['--expected-chain', '1']);
    expect(wrongChain.status).toBe(1);
    expect(wrongChain.json).toBeUndefined();
    expect(wrongChain.stderr).toMatch(/wrongChain|different chain/);
    const directory = mkdtempSync(join(tmpdir(), 'gp-erc20-recover-bad-'));
    try {
      const path = join(directory, 'backup.json');
      writeFileSync(path, file.text);
      const bad = spawnSync(process.execPath, [RECOVER, path, '--reveal-private-keys'], { cwd: directory, env: {}, input: 'not the passphrase\n', timeout: 60_000 });
      expect(bad.status).toBe(1);
      expect(bad.stdout.toString()).toBe('');
      const tampered = JSON.parse(file.text) as { ciphertext: string };
      tampered.ciphertext = `${tampered.ciphertext.slice(0, -4)}AAAA`;
      writeFileSync(path, JSON.stringify(tampered));
      const flipped = spawnSync(process.execPath, [RECOVER, path, '--reveal-private-keys'], { cwd: directory, env: {}, input: `${BACKUP_PASS}\n`, timeout: 60_000 });
      expect(flipped.status).toBe(1);
      expect(flipped.stdout.toString()).toBe('');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
