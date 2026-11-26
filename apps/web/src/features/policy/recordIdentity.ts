import { bytesToHex } from '@noble/hashes/utils.js';
import { decodeScheme2MetaAddress, type Hex, type PolicyRecord } from '@ghostpay/policy-scheme';

/** Records with equal policy terms can belong to different sellers. */
export function recordBelongsToSeller(record: PolicyRecord, spendingPublicKey: string, viewingPublicKey: string): boolean {
  const meta = decodeScheme2MetaAddress(record.metaAddress);
  return bytesToHex(meta.spendingPublicKey) === spendingPublicKey.replace(/^0x/i, '').toLowerCase()
    && bytesToHex(meta.viewingPublicKey) === viewingPublicKey.replace(/^0x/i, '').toLowerCase();
}

/** Never pair a match for the current seller with another seller's equal-hash recovery record. */
export function selectPolicyRecordForSeller(
  records: readonly PolicyRecord[], policyHash: Hex, spendingPublicKey: string, viewingPublicKey: string,
): PolicyRecord | undefined {
  return records.find((record) => record.policyHash === policyHash
    && recordBelongsToSeller(record, spendingPublicKey, viewingPublicKey));
}
