import { ARACHNID_DEPLOYER, CANONICAL_ANNOUNCER, ERC5564_SALT, computeCreate2Address, isChecksumAddress } from './address.js';
import type { ExtraChainEntry } from './chains.js';
import { isHexBytes } from './hex.js';

/** One offline invariant violation. */
export interface ManifestIssue {
  readonly chainId: number | null;
  readonly code:
    | 'DUPLICATE_CHAIN_ID'
    | 'BAD_CHAIN_ID'
    | 'ENABLED'
    | 'BAD_NATIVE_DECIMALS'
    | 'BAD_CONSTANT'
    | 'ZKSYNC_MISCLASSIFIED'
    | 'BAD_NUMBER'
    | 'INIT_CODE_HASH_MALFORMED'
    | 'CREATE2_MISMATCH';
  readonly message: string;
}

/** Options for {@link validateManifests}. */
export interface ManifestCheckOptions {
  /**
   * keccak256 of the ERC5564Announcer creation code. NOT bundled: the init code could not be
   * obtained as a built artifact (only Solidity source is on raw GitHub; the exact compiler settings
   * are unknown), so it is an input. When given, the CREATE2 address is recomputed and must equal
   * the canonical announcer.
   */
  readonly announcerInitCodeHash?: string;
}

/**
 * Checks the repository-wide constants (announcer/deployer checksum, salt shape) and, if an init
 * code hash is supplied, that CREATE2(Arachnid, ERC salt, hash) equals the canonical announcer.
 *
 * @security Pure and offline. A failing result means the constants or the supplied hash are wrong.
 * @param opts Options.
 * @returns Issues (empty when consistent).
 */
export function validateConstants(opts: ManifestCheckOptions = {}): readonly ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const bad = (m: string): void => void issues.push({ chainId: null, code: 'BAD_CONSTANT', message: m });
  if (!isChecksumAddress(CANONICAL_ANNOUNCER)) bad('announcer address checksum invalid');
  if (!isChecksumAddress(ARACHNID_DEPLOYER)) bad('deployer address checksum invalid');
  if (!isHexBytes(ERC5564_SALT) || ERC5564_SALT.length !== 66) bad('salt malformed');
  const h = opts.announcerInitCodeHash;
  if (h !== undefined) {
    if (!isHexBytes(h) || h.length !== 66) {
      issues.push({ chainId: null, code: 'INIT_CODE_HASH_MALFORMED', message: 'init code hash must be 32-byte hex' });
    } else if (computeCreate2Address(ARACHNID_DEPLOYER, ERC5564_SALT, h) !== CANONICAL_ANNOUNCER) {
      issues.push({ chainId: null, code: 'CREATE2_MISMATCH', message: 'CREATE2(Arachnid, ERC salt, hash) != canonical announcer' });
    }
  }
  return issues;
}

/**
 * Validates manifest invariants offline.
 *
 * @security Fail-closed policy: any `enabled` entry, duplicate id, or a chain whose bytecode model
 * and CREATE2 flavour disagree (zkSync must be `eravm` + `zksync-custom`, EVM chains must be
 * `evm` + `standard`) is reported.
 * @param entries Manifests.
 * @param opts Options (see {@link validateConstants}).
 * @returns Issues (empty when valid).
 */
export function validateManifests(entries: readonly ExtraChainEntry[], opts: ManifestCheckOptions = {}): readonly ManifestIssue[] {
  const issues: ManifestIssue[] = [...validateConstants(opts)];
  const seen = new Set<number>();
  for (const e of entries) {
    const add = (code: ManifestIssue['code'], message: string): void => void issues.push({ chainId: e.chainId, code, message });
    if (!Number.isSafeInteger(e.chainId) || e.chainId <= 0) add('BAD_CHAIN_ID', 'chainId must be a positive safe integer');
    if (seen.has(e.chainId)) add('DUPLICATE_CHAIN_ID', 'chainId appears more than once');
    seen.add(e.chainId);
    // Runtime guard: the type says `false`, data may come from JSON.
    if ((e.enabled as boolean) !== false) add('ENABLED', 'enabled must be false in this package');
    if ((e.nativeDecimals as number) !== 18) add('BAD_NATIVE_DECIMALS', 'nativeDecimals must be 18');
    const zkOk = e.bytecodeModel === 'eravm' ? e.create2 === 'zksync-custom' : e.create2 === 'standard';
    if (!zkOk) add('ZKSYNC_MISCLASSIFIED', 'bytecodeModel and create2 flavour disagree');
    for (const [k, v] of [['finalityDepth', e.finalityDepth], ['getLogsMaxRange', e.getLogsMaxRange], ['blockTimeMs', e.blockTimeMs]] as const) {
      if (v !== null && (!Number.isSafeInteger(v) || v <= 0)) add('BAD_NUMBER', `${k} must be null or a positive integer`);
    }
  }
  return issues;
}
