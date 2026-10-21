# Audit: ux-receipts

## Threat model
Assets: keys (never touched), payment metadata, user linkability. Adversaries: malicious receipt sender (forgery, hostile strings, oversize), receipt recipient (deanonymization via over-disclosure), shoulder/clipboard leaks, UI caller misusing verdicts.

## Findings
| # | Sev | Finding | Evidence | Status |
|---|-----|---------|----------|--------|
| 1 | High (inherent) | Digest is not a signature; anyone can forge a self-consistent receipt | test "forged-but-consistent..." | Mitigated by wording: verdict `self_consistent_unverified`, caveat `digest_not_signature`, only ChainVerifier can yield `chain_confirmed` |
| 2 | Med | Key material entering a receipt via record or memo | FORBIDDEN_FIELD tests, SECRET_LIKE_MEMO tests | Fixed: strict allow-list, key-like names flagged, secret-shaped memo refused (heuristic) |
| 3 | Med | Hostile memo/strings (bidi, control, zero-width) in imported receipts | parse + render tests | Fixed: rejected at parse, replaced at render |
| 4 | Med | Truncated addresses are matchable (0x+4 hex head, 4 hex tail = ~32 bits) | warning truncated_address_matchable | Warned; not preventable |
| 5 | Med | Tx hash + full address links to on-chain history | warnings txhash_links_onchain (high) | Warned; UI should confirm |
| 6 | Low | Oversize/malformed input | 8 KiB cap, strict parse, no value echo in errors | Fixed |
| 7 | Low | Verifier lookup leaks tx hash to RPC | documented on ChainVerifier | Wiring: opt-in |
| 8 | Low | Chain facts compare symbol not contract address | verify.ts | Open: adapter should map to asset identity |

## Fixes applied
Allow-list parsing, depth/size limits, SecureContext-free WebCrypto with explicit NO_WEBCRYPTO error, no clock/network/randomness inside the package (nowMs injected).

## Unverified
- Secret-memo detector is heuristic (false negatives possible, e.g. base64 keys, split keys).
- No real ChainVerifier implementation tested; only fakes.
- Address validation is generic alphanumeric (20..128), not per-chain checksum.
- Not run in a browser; WebCrypto exercised on Node only.
- Redaction of selective fields is by omission; there is no per-field commitment, so a discloser cannot later prove a withheld field against the same digest.
