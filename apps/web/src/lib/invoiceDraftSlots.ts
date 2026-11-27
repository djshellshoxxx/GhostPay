/**
 * Tab storage slot names of the opt-in Create invoice drafts, and removal of them without any seller keys. A leaf module
 * (it imports nothing), so `session.ts` can remove drafts when keys are cleared without a cycle through `invoiceDraft.ts`.
 */

/** v3: `<prefix><HKDF(viewing key, seller id)>`. The name cannot be derived from the public meta-address and signer key. */
export const DRAFT_SLOT_PREFIX = 'ghostpay.invoice-draft.v3.';

/**
 * v2 named a slot from the meta-address and the invoice-signing key, both public, so anyone able to read tab storage could
 * confirm that this profile belongs to that seller and holds a draft. A v2 record is never read or migrated: it is deleted
 * when a Create invoice view opens for a loaded seller, and when the seller keys are cleared. (v1 belongs to the unmerged
 * #604 format; this build neither reads, overwrites nor deletes it.)
 */
export const LEGACY_DRAFT_SLOT_PREFIX = 'ghostpay.invoice-draft.v2.';

/** Removes every tab storage entry whose name `matches`. Names are snapshotted first: indexes shift after each removal. */
function removeMatching(matches: (name: string) => boolean): void {
  try {
    const storage = globalThis.sessionStorage;
    const names: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i);
      if (name !== null && matches(name)) names.push(name);
    }
    for (const name of names) {
      try { storage.removeItem(name); } catch { /* best effort: the record stays as ciphertext */ }
    }
  } catch {
    /* No tab storage, or the browser refused it: nothing to remove here. */
  }
}

/** Deletes legacy (v2) draft records without reading them. */
export function purgeLegacyInvoiceDrafts(): void {
  removeMatching((name) => name.startsWith(LEGACY_DRAFT_SLOT_PREFIX));
}

/** Deletes every draft record of this tab, current and legacy, without needing the seller keys that sealed them. */
export function purgeInvoiceDrafts(): void {
  removeMatching((name) => name.startsWith(DRAFT_SLOT_PREFIX) || name.startsWith(LEGACY_DRAFT_SLOT_PREFIX));
}
