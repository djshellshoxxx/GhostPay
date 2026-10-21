import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chainlinkAggregatorAbi, erc20Abi, erc20MetadataAbi, erc2612PermitAbi, erc5564AnnouncerAbi, ghostPayRouterAbi, ghostPaySweepRelayerAbi } from './index.js';

const names = (abi: readonly { type: string; name?: string }[], type: string): string[] =>
  abi.filter((x) => x.type === type).map((x) => x.name ?? '').sort();

describe('generated ABIs', () => {
  it('router exposes the four payment methods, events and errors of CONTRACTS_SPEC', () => {
    expect(names(ghostPayRouterAbi, 'function')).toEqual(expect.arrayContaining(['payERC20', 'payERC20WithPermit', 'payNative', 'payERC20WithBuffer', 'FEE_BPS', 'FEE_RECIPIENT']));
    expect(names(ghostPayRouterAbi, 'event')).toContain('FeeCollected');
    for (const e of ['ZeroAddress', 'InvalidStealth', 'Expired', 'ZeroAmount', 'SlippageExceeded', 'InvalidEphemeralKey', 'InvalidMetadata', 'UnexpectedBalanceDelta', 'NativeTransferFailed', 'BufferTooLarge', 'BufferRequired', 'NoDirectETH']) {
      expect(names(ghostPayRouterAbi, 'error')).toContain(e);
    }
  });
  it('relayer, announcer, token and aggregator ABIs have the used members', () => {
    expect(names(ghostPaySweepRelayerAbi, 'function')).toEqual(expect.arrayContaining(['sweep', 'sweepWithPermit', 'nonceUsed', 'DOMAIN_SEPARATOR', 'SWEEP_TYPEHASH']));
    expect(names(erc5564AnnouncerAbi, 'event')).toEqual(['Announcement']);
    expect(names(erc20Abi, 'function')).toEqual(expect.arrayContaining(['transfer', 'balanceOf', 'approve']));
    expect(names(erc20MetadataAbi, 'function')).toEqual(expect.arrayContaining(['decimals', 'name', 'symbol']));
    expect(names(erc2612PermitAbi, 'function')).toEqual(['DOMAIN_SEPARATOR', 'nonces', 'permit']);
    expect(names(chainlinkAggregatorAbi, 'function')).toEqual(expect.arrayContaining(['decimals', 'latestRoundData']));
  });
  it('router payERC20 input order equals the Solidity source', () => {
    const src = readFileSync(fileURLToPath(new URL('../../contracts/src/GhostPayRouter.sol', import.meta.url)), 'utf8');
    expect(src).toMatch(/function payERC20\(\s*IERC20 token,\s*address stealth,\s*uint256 gross,\s*uint256 minNet,\s*uint256 deadline,\s*bytes calldata ephemeralPubKey,\s*bytes calldata metadata/);
    const f = ghostPayRouterAbi.find((x) => x.type === 'function' && x.name === 'payERC20');
    expect(f?.inputs.map((i) => i.name)).toEqual(['token', 'stealth', 'gross', 'minNet', 'deadline', 'ephemeralPubKey', 'metadata']);
  });
});
