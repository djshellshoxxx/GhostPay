/** Keys of the spec section-2 "NOT protected" list. All must be shown before first use (CT-UX-1). */
export const NOT_PROTECTED_KEYS = [
  'CT_NP_EDGES_PUBLIC',
  'CT_NP_WRAP_UNWRAP_PUBLIC',
  'CT_NP_DECRYPTORS',
  'CT_NP_OPERATOR_TRUST',
  'CT_NP_DECRYPT_METADATA',
  'CT_NP_ACL_PUBLIC',
  'CT_NP_ZERO_TRANSFER',
  'CT_NP_GAS_FUNDING_LINK',
  'CT_NP_SUPPLY_LEAK',
] as const;

/** Key of a NOT-protected copy entry. */
export type NotProtectedKey = (typeof NOT_PROTECTED_KEYS)[number];

/** UI copy keyed by `CTCopy` key. Wording follows CT-UX-3: no claim of anonymity or untraceability. */
export const CT_COPY: Readonly<Record<string, string>> = {
  CT_HIDES_AMOUNT_ONLY:
    'Amount hidden on-chain from the public. Visible to you, the seller and the encryption operator if it misbehaves. Who pays whom, when, and which token stays public.',
  CT_WRAP_PUBLIC:
    'Wrapping into the confidential token shows the wrapped amount on-chain. Wrap a round sum ahead of time, not the exact invoice amount.',
  CT_WRAP_EQUALS_GROSS: 'You are wrapping exactly the invoice amount. That makes the amount public. Wrap a larger round sum earlier.',
  CT_WRAP_NOT_ROUND: 'This wrap amount is not a round sum. A round denomination is harder to match to one invoice.',
  CT_UNWRAP_PUBLIC: 'Unwrapping shows the unwrapped amount on-chain and pays it out as a normal token transfer.',
  CT_TRUST_ZAMA:
    'Confidentiality depends on the Zama key-management and coprocessor operators. If enough of them collude or are compromised, amounts can be revealed.',
  CT_TRUST_FHENIX: 'Confidentiality depends on the Fhenix coprocessor network.',
  CT_TRUST_INCO_TEE: 'Confidentiality depends on trusted-hardware attestation by Inco.',
  CT_TESTNET_ONLY: 'Test network only. Test tokens have no value. Do not use real funds.',
  CT_OTHER_CHAIN: 'Different chain, not available in this build.',
  CT_M_NO_PRIVACY: 'Local simulation. Nothing is hidden. For development and tests only.',
  CT_NP_EDGES_PUBLIC:
    'Payer address, stealth address, token, time and the use of the router stay public. This hides how much, not who or when.',
  CT_NP_WRAP_UNWRAP_PUBLIC: 'Wrap and unwrap amounts are public on-chain.',
  CT_NP_DECRYPTORS:
    'The payer, the seller and the party that holds the stealth key can decrypt the amounts they are allowed on.',
  CT_NP_OPERATOR_TRUST: 'The encryption operator (key management and coprocessors) can reveal amounts if it misbehaves.',
  CT_NP_DECRYPT_METADATA:
    'Revealing an amount goes through a hosted relayer, which sees the stealth address, the handle, your network address and the time.',
  CT_NP_ACL_PUBLIC: 'Who is allowed to decrypt which value is recorded on-chain and should be assumed public.',
  CT_NP_ZERO_TRANSFER:
    'A payment can silently transfer 0 if the payer balance was too low. Only decrypting the received amount confirms payment.',
  CT_NP_GAS_FUNDING_LINK: 'Funding the stealth address with gas can link it to the funder.',
  CT_NP_SUPPLY_LEAK: 'The wrapped total supply is public; with few users, changes can reveal wrap amounts.',
};

/** Words the UI must not use about these options (CT-UX-3 and repo wording rule). */
const FORBIDDEN = /\b(anonymous(ly)?|anonymity|untraceable|unlinkable|private|privately|mix(er|ers|ing|ed)?|tumbl\w*)\b/i;

/**
 * Returns the first forbidden wording found in `text`, or `null`.
 * @param text UI copy to check.
 */
export function findForbiddenWording(text: string): string | null {
  const m = FORBIDDEN.exec(text);
  return m ? m[0] : null;
}
