# Audit: ux-guide

## Threat model
Assets: recovery phrase, user's send safety. Adversaries: tampered local storage, malicious payment links/clipboard malware (address swap, address poisoning, homoglyph/zero-width addresses), UI shortcuts that skip backup.

## Findings
| # | Sev | Finding | Evidence | Status |
|---|-----|---------|----------|--------|
| 1 | High | Persisted onboarding blob could smuggle secrets or skip backup | `parseState` exact key set, enum-only strings, consistency checks; tests in onboarding.test.ts | Fixed |
| 2 | High | Address poisoning (lookalike of known address) | `findLookalike` + warning requiring ack; tests | Mitigated (warning, not blocker) |
| 3 | High | Invisible/homoglyph characters in address | `isCleanAddress` ASCII 0x21-0x7e, tests with U+200B, U+0410 | Fixed |
| 4 | Med | Float math on amounts | all amounts BigInt digit strings, 40-digit test | Fixed |
| 5 | Med | Prototype-key answers (`toString`) | hasOwnProperty guards, tests | Fixed |
| 6 | Med | Quiz brute-force by retry | positions cleared on failure, forced re-review after 3 | Fixed |
| 7 | Low | Warnings are user-ackable; habituation risk | by design | Accepted |

## Unverified
- Host-supplied `valid` (checksum/network) is trusted; correctness is the chain adapter's job.
- RNG quality of host `pick`; localStorage handling and secret zeroing in the web app not implemented/tested here.
- Lookalike heuristic (4+4 chars) is a heuristic and misses other spoof shapes. i18n strings absent.
- Accessibility and actual UX comprehension untested with users.
