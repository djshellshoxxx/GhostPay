# Audit: ux-core

Scope: `packages/ux-core/src/{errors,netstate,store,palette,theme}.ts`. Pure logic; reviewed by reading and by adversarial tests (118 tests, 100% statements/lines, 97.9% branches).

## Threat model
Attackers: a malicious invoice link or RPC/relayer response (hostile strings and numbers), a stored-data tamperer (local malware, other tab, corrupt storage), an imported theme/JSON file, a web page script able to focus elements. Assets: user keys, payment correctness, privacy (no leakage of URLs/addresses), UI integrity (no CSS/HTML injection).

## Findings
| # | Sev | Area | Finding | Evidence | Status |
| - | - | - | - | - | - |
| 1 | High | store | Secrets could be placed in key names or values by a careless caller. | Key names/ids/property names screened; tests `no secrets in keys or values` (`privateKey`, `0x`+40 hex id, 32-hex id, `__proto__`). | Fixed by design. Limitation: screening is heuristic; a secret under an innocuous property name is not detected. |
| 2 | High | store | Ciphertext swap / version rollback between records. | AAD binds ns, collection, id, version; tests `swapping ciphertext`, version tamper -> `DECRYPT`. | Fixed. |
| 3 | High | store | Newer-version data overwritten or deleted by an old build. | `FUTURE_VERSION` on read; `put` refuses; test `future version`. | Fixed. |
| 4 | Med | theme | CSS injection through token values, ids or `cssFile`. | Strict regexes, fixed template, property test (500 runs) asserts output matches template; payload matrix. | Fixed. |
| 5 | Med | errors | Prototype-key lookup (`__proto__`, `constructor`) selecting a wrong entry. | `Object.hasOwn`; test with those codes. | Fixed. |
| 6 | Med | errors | Overclaiming "Nothing was sent". | `retrySafe: yes` requires pre-sign entry AND caller-proven `phase: prepare`; matrix test. | Fixed; depends on callers passing `phase` honestly. |
| 7 | Med | netstate | Hostile latency/timestamp (NaN, negative) forging "reachable" or bogus skew. | Downgraded to `bad-response`; test `rejects hostile probe data`. | Fixed. |
| 8 | Med | palette | Shortcut firing in text fields or hijacking browser keys. | `isTypingTarget` fails closed; reserved list; tests. | Fixed; reserved list is not exhaustive per browser. |
| 9 | Low | store | Names, counts, sizes visible to local attacker even when sealed. | By design. | Documented. |
| 10 | Low | store | `putMany` rollback is best effort on non-transactional backends. | Test `rollback survives a failing restore`. | Accepted; IDB transaction in Layer B. |
| 11 | Low | store | `list()` of a large collection decrypts everything serially. | Code review. | Accepted; add paging in Layer B if needed. |
| 12 | Info | theme | Cypher/hc colours are unverified against the real cypher stylesheet. | Tokens are new values chosen to pass AA. | Open: reconcile with docs/remote/pages-theme/theme.css. |

## Fixes made during build
- Removed `+` as a key in shortcuts (ambiguous parsing) so `mod++` is invalid.
- `hasUnsafeChar` replaces a control-character regex (lint) when validating titles.
- Backend error messages are never read; classification uses `name`/`code` only.

## Unverified / not built
- No browser run: `isTypingTarget` and key handling are tested with structural fakes, not real DOM events, IME or Safari/Firefox differences.
- `deriveSealKey`/AES-GCM run on Node WebCrypto only; browser behaviour is expected to match but is untested here.
- `fromWebStorage` against a real `localStorage` and IndexedDB backend (Layer B) not built or tested.
- Error catalog wording is English only, unreviewed by a human editor; `docAnchor` slugs do not yet exist in docs/user/troubleshooting.md (that file has no matching headings).
- Probe runner (fetch, timeouts, wallet/worker/secure-context checks) is wiring-session work.
- Bundle scan and e2e network log not run (no apps/web changes made).
- Contrast uses sRGB WCAG 2.x only (no APCA, no alpha colours).
