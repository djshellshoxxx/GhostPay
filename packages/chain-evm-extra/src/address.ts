import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, isHexBytes } from './hex.js';

/** Canonical ERC-5564 announcer (ERC text, ethereum/ERCs erc-5564.md). */
export const CANONICAL_ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';
/** Arachnid deterministic CREATE2 deployer named by ERC-5564. */
export const ARACHNID_DEPLOYER = '0x4e59b44847b379578588920cA78FbF26c0B4956C';
/** CREATE2 salt named by ERC-5564 for the announcer deployment. */
export const ERC5564_SALT = '0xd0103a290d760f027c9ca72675f5121d725397fb2f618f05b6c44958b25b4447';

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * EIP-55 checksum encoding.
 *
 * @param addr 20-byte hex address in any case.
 * @returns Checksummed address.
 * @throws {Error} When `addr` is not a 20-byte hex address.
 */
export function toChecksumAddress(addr: string): string {
  if (!ADDR_RE.test(addr)) throw new Error('invalid address');
  const lower = addr.slice(2).toLowerCase();
  const h = bytesToHex(keccak_256(new TextEncoder().encode(lower))).slice(2);
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    const c = lower.charAt(i);
    out += parseInt(h.charAt(i), 16) >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

/**
 * Strict EIP-55 check: mixed-case input must match the checksum exactly.
 *
 * @security Rejects all-lowercase and all-uppercase forms too, so a manifest address is always
 * typo-protected.
 * @param addr Candidate.
 * @returns Whether `addr` is a correctly checksummed address.
 */
export function isChecksumAddress(addr: string): boolean {
  return ADDR_RE.test(addr) && toChecksumAddress(addr) === addr;
}

/**
 * Standard EVM CREATE2: `keccak256(0xff ++ deployer ++ salt ++ initCodeHash)[12:]`.
 *
 * @security Valid ONLY for the EVM bytecode model. zkSync Era (EraVM) uses a different formula and
 * MUST NOT be passed here; `verifyChain` rejects it.
 * @param deployer 20-byte deployer address.
 * @param salt 32-byte salt.
 * @param initCodeHash 32-byte keccak256 of the creation code (caller-supplied, never guessed).
 * @returns Checksummed derived address.
 * @throws {Error} On malformed inputs.
 */
export function computeCreate2Address(deployer: string, salt: string, initCodeHash: string): string {
  if (!ADDR_RE.test(deployer)) throw new Error('invalid deployer');
  if (!isHexBytes(salt) || salt.length !== 66) throw new Error('invalid salt');
  if (!isHexBytes(initCodeHash) || initCodeHash.length !== 66) throw new Error('invalid init code hash');
  const buf = new Uint8Array(1 + 20 + 32 + 32);
  buf[0] = 0xff;
  buf.set(hexToBytes(deployer), 1);
  buf.set(hexToBytes(salt), 21);
  buf.set(hexToBytes(initCodeHash), 53);
  return toChecksumAddress(bytesToHex(keccak_256(buf).slice(12)));
}
