# Security-note remediation — 2026-11-16

Baseline: `d26418c2539619fb75783a82886a96971142d226` (completion PR #164).
This patch addresses three specific prior findings; it does not claim a full independent audit.

| Prior finding | Confirmation and correction | Acceptance evidence |
| --- | --- | --- |
| Haiku round 1 F4: stale withdrawal snapshot in send finalizer | Reproduced: an existing cancellation attempt discovered during the final chain refresh disappears when the finalizer lists scopes from the earlier render. Keep the latest snapshot beside React state and read it in final cleanup. Session/deployment checks and the durable journal are unchanged. | Both successful-send and wallet-rejection regressions fail with the original finalizer and pass with the correction. |
| Haiku round 1 F5: out-of-range timestamp rendering | Reproduced `RangeError: Invalid time value` in `AccountPanel` for uint64-max execution times. Render supported times as ISO; retain exact bigint Unix seconds outside Date's range so recovery controls remain usable. | UI regression covers plan and pending-request dates; boundary tests cover both Date limits; 1,000 deterministic uint256 property cases preserve the exact value without throwing. |
| TDA-02: ephemeral relayer state accepted without a development mode | The old parser accepted explicitly ephemeral state with missing/unknown NODE_ENV, despite its development-only purpose. Require exactly `development` or `test`; deployments keep the durable file journal. | Regression rejects missing, empty, production, staging, mixed-case and whitespace mode values; accepts development/test; durable-file parsing remains valid in every mode. |

Verification executed on this task branch:

- Relayer `config.test.ts`, `ops.test.ts`, `runtime.test.ts`: **155 passed** with one worker.
- Policy new regression/time tests: **6 passed**, including 1,000 generated cases.
- Existing policy session/payment guard tests: **12 passed**.
- RED checks: original snapshot finalizer fails both retained-attempt assertions; original date renderer throws; original relayer parser accepts a forbidden missing mode.
- No contract, ABI, signing, payment authorization, release, or deployment policy is changed.

## Triage limits and remaining notes

- High backup-gate TDA-01 / PAGES-02-R2 is corrected by the separately qualified Pages stack; final integration must retain that correction.
- Haiku F1 scanner string/comment confusion is already corrected in the baseline (`e77172cf`).
- Haiku F7 (paymaster inverted validity windows) and F10 (missing disabled-chain test assertion) remain outside this patch and require separate disposition.
- Haiku F2/F3/F13 describe static-scanner limitations; static scanning alone is not proof of runtime egress safety. Keep the separate CSP/browser acceptance gates.
- Haiku F6 (optional genesis scan), F9 (fixed devnet fixture metadata), F11 (unused test configuration), and F12 (explicit simulated backend) are not promoted to exploitable vulnerabilities by this review. They require context-specific disposition rather than an unverified security claim.
- TDA-03 allow-all operator policy remains explicit configurable behavior; this patch does not invent a deny-list business policy.
