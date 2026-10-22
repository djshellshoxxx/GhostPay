/**
 * Heuristic detector for secret-shaped free text (viewing/spending keys, seeds, xprv).
 * Returns reason codes; empty array = nothing suspicious. Heuristic, not a guarantee.
 * @security Never include the matched text in logs or errors.
 */
export function detectSecretLikeText(text: string): string[] {
  const reasons: string[] = [];
  if (/(?:^|[^0-9a-fA-F])(?:0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/.test(text)) reasons.push('hex-256');
  if (/\b[xyztuv]prv[1-9A-HJ-NP-Za-km-z]{20,}/.test(text)) reasons.push('extended-private-key');
  if (/\bst:[a-z0-9]+:0x[0-9a-fA-F]{40,}/.test(text)) reasons.push('stealth-meta-address');
  if (/\b(?:private|secret|spending|viewing|view|scan)[ _-]?key\b/i.test(text)) reasons.push('key-word');
  if (/\b(?:seed phrase|mnemonic|recovery phrase|secret recovery)\b/i.test(text)) reasons.push('seed-word');
  if (/^\s*(?:[a-z]{3,8}\s+){11,}[a-z]{3,8}\s*$/.test(text)) reasons.push('mnemonic-shaped');
  return reasons;
}
