# Audit: ux-intake

Scope: `packages/ux-intake` (specs qr-scan, deep-link-share, nl-amount). Self-audit by the implementer; no independent review.

## Threat model
Attacker controls: QR contents, shared text/URLs, deep links, pasted amounts, other nearby QR codes shown to the camera, and (for amounts) look-alike Unicode. Attacker does not control the app code or the allowed-host list. Goals: redirect payment (address/asset/amount substitution), steal the invoice bearer key (ADR-0005), open-redirect victims, crash/slow the parser.

## Findings
| # | Severity | Finding | Evidence | Status |
| - | - | - | - | - |
| 1 | High (design) | Shared invoice links in a Web Share Target GET query put the bearer fragment on the wire / in server logs | `parseShareTarget` returns `fragment-in-query` warning | Mitigated by warning + wiring plan (service-worker handled route, `replaceState`). Residual: depends on deployment |
| 2 | High | Raw fragment lives in result objects (`InvoiceLinkPayload.fragment`) and would leak if the object is logged | by construction | Documented; `safeDisplay` and `redactForLog` provided; wiring forbids logging objects. Not enforceable in a library |
| 3 | Medium | Host look-alikes (`host.evil`, `host@evil`, trailing dot, IDN) | tests in payload/deeplink | Fixed: exact-match allowlist plus non-ASCII rejection |
| 4 | Medium | Open redirect via `next/redirect/...` | tests (`//evil`, `https://`, `javascript:`, `%2f`, dot segments) | Fixed: only allowlisted same-origin paths, else whole link rejected. Redirect param list is a denylist of names; unknown names are ignored, so an app that reads another param as a target must use `safeRedirectTarget` |
| 5 | Medium | Chunk hijack/mix from a second QR | tests: mismatch, conflict, TTL | Mitigated; frames carry no MAC, so integrity depends on the final payload's signature (invoice) or on user address confirmation (URI/address). A hostile QR can still DoS a transfer |
| 6 | Medium | Ambiguous `1,234` read as 1.234 or 1234 (1000x error) | tests, property | Fixed: rejected without locale; locale enforced with it |
| 7 | Medium | Homoglyph asset symbols / digits | tests (Cyrillic, Greek, fullwidth, Arabic-Indic) | Fixed: mixed-script and non-ASCII rejected before allowlist lookup |
| 8 | Low | EVM mixed-case checksum not verified (no keccak dependency allowed) | `checksumUnverified` flag | Open: callers should verify EIP-55 with core-crypto |
| 9 | Low | Bech32 length/witness-version rules are only partially checked (checksum, HRP, case, max length) | address.ts | Open: chain adapter must validate fully |
| 10 | Low | `URL` parsing differences between runtimes (percent-encoded hostnames normalise) | not exercised cross-runtime | Unverified; exact post-normalisation hostname match limits impact |
| 11 | Low | `ghostpay:` amount is a decimal string not bound to asset decimals | `amount` kept as string | Callers must scale with asset decimals (`nl-amount` or ux-links) |
| 12 | Info | English-only number words; no lakh grouping; no currency symbols | spec | By design |

## Resource bounds
Scan 4096 chars; joined 22 358; share query 24 406; 16 frames; 32 share tokens; NL input 128 chars; digits 30. Parsers are linear; regexes are anchored and unnested (no quantified groups over overlapping classes). fast-check fuzzed 500 random strings for the amount parser without a throw.

## Unverified
- No real-camera or real-browser testing; no cross-browser `URL`/share-target behaviour test.
- Bech32 vectors are the published BIP173/BIP350 ones; no other chain vectors checked.
- Compatibility with the final `parseFragment` was checked only by mirrored constants (`#gpi=v1.`, 16 KiB), not by importing it (no new deps allowed).
- No ReDoS tooling run beyond reasoning and fuzzing.
