# Security audit and finding dispositions

Scope: lean EVM Pages candidate `73124433c08c8ef6835f11d03709060c6eea7a3f`, reviewed product checkpoint `35978ab796b7c476eb35dd9ed634ca4ff86ff9b9`. This is an AI-assisted engineering review with independent agent reproduction. It is **not the external independent audit required by release policy**.

## Reproduced and corrected in this candidate

Severity below is a provisional engineering assessment of the demonstrated behavior, not a claim of a deployed exploit.

| Finding | Severity | Root cause and correction | Evidence |
| --- | --- | --- | --- |
| Obsolete Sweep review retained local signing authority | Low | The reproduced helper defect retained local key derivation/signing after review revocation; the handoff guard prevented the tested external broadcast. Session validity alone did not establish the current destination/quote/balance review. Compose caller review with the existing session guard before derivation, asynchronous continuations, signatures and handoff | Original helper: 11 failed/3 controls; corrected: 14 passed; independent replay 14 passed. `1d8445b6...`, component `04ded6b5...` |
| Fresh native balance silently changed authorized sweep amount | Medium | Native helper ignored reviewed `amount` and signed from a new whole balance. Require exact equality before fee work/signing/journal; reject increases and decreases | Original: 4 failed/1 control; final helper/destination selection 131 passed. Independent native selection 5 passed/14 deselected. `3f6fcb84...` |
| Stale quote/balance callbacks and errors | Medium | Pending operations could outlive scope changes. Preserve endpoint grants and add operation generations, review scope and guarded error publication | #272 semantic merge; 70-case baseline 25 failed/45 controls; corrected component 71 passed after added entry test |
| Session locked before component authorization escaped error handling | Low | Session guard capture occurred outside existing try/finally. Move it inside without weakening authority | Actual suspension: 1 failing test and unhandled rejection reproduced; final component passed 71. Independent selected test passed. `89ec593b...` |
| Invalid/decreasing authority clock could leave a grant usable | Low | Nonfinite values bypassed comparisons; rollback behind latest observation was incompletely checked. Validate every sample and permanently revoke invalid grants | Original: 9 failed/4 controls, 93 deselected; complete authority file 106 passed. `676093a3...` |
| Invoice wait expiry could move backward with wall clock | Low | Wall clock rollback could extend wait-state expiry. Retain a monotonic elapsed-time floor | #274 original suite 13 passed; independent 34-case before/after and nonfinite probes. Final Pay validation retained |

The fixes keep original session checks, network grants, quote checks, secret wiping, destination-reuse checks and accepted/uncertain transport outcomes. A UI change after transport begins must not erase a submitted or uncertain transaction. Secret exports use a fresh exact-endpoint, chain, address and method grant after authentication; they do not revive cancelled scan authority. Public-record export remains local.

Evidence: [payment-export qualification](../handoffs/final-payment-export-20261119/QUALIFICATION.md), [payment-export receipts](../handoffs/final-payment-export-20261119/RESULTS.json), [helper audit and scope](../handoffs/sweep-review-authority-20261119/README.md), [helper receipts](../handoffs/sweep-review-authority-20261119/receipt.json), [independent source review](combined-source-review.json).

## Findings and gates still open

| Item | Open status and required evidence |
| --- | --- |
| Native fee consent | Direct UI still needs explicit gas/fee preview and binding/reconfirmation behavior qualified before testnet acceptance. Balance equality does not complete fee review |
| GP-PAGES-01 | Shared origin permits other same-origin project sites to reach GhostPay browser boundaries. Dedicated domain/account and owner hosting decision required; a URL subpath is not isolation |
| Historical Mythril findings | Preserve 11 reported records: 3 Medium and 8 Low. Current exact-source strict analysis/disposition remains unqualified. No scanner suppression or owner exception was introduced |
| CodeQL High reports | Two historical High reports have source repairs and bounded review, but complete current-head hosted clearance has not been obtained. Do not translate repair presence into zero open High alerts |
| Dependency audit | Current production audit: zero reported vulnerabilities. Full development graph: 17 Low advisory entries, zero Moderate/High/Critical; these are dependency entries, not 17 independently demonstrated product exploits |
| Browser/storage/privacy | Complete final-source malicious-input, corrupt-storage, cross-tab, suspension, camera/clipboard, accessibility and no-unwanted-network acceptance remains unexecuted |
| External independent review | Unavailable; agent review does not satisfy this release gate |

Read the retained [PR255 strict-gate source review](../consolidation/master-20261118/PR255_GATE_SOURCE_REVIEW.md), [preserved Mythril evidence](../consolidation/master-20261118/preserved-mythril-findings.json), [Mythril re-evaluation limits](../audits/mythril-reevaluation-20261118.md), and [bounded CodeQL reconciliation](../consolidation/CODEQL_RECONCILIATION_2026-11-19.md). Findings remain open until source-pinned evidence and required approvals resolve them.

## Security-tool evidence and limits

The coordinator executed Foundry: 490 tests passed, zero failed/skipped, including the configured fuzz/invariant suites. The inspected secret scan, pinned-Action check and no-`tx.origin` check passed. A current production audit found no advisories. These passes neither close symbolic-analysis findings nor certify the whole application.

Current Slither and subsequent analyzer receipts belong in [TEST_RESULTS.md](TEST_RESULTS.md) with exact source/compiler/configuration and exit status. A partial compile, timeout, missing target, excluded detector or stale output cannot be recorded as a complete analyzer pass. No security gate or coverage threshold was weakened in this work.

## Privacy and custody limits

Stealth addresses reduce routine address reuse; they do not provide complete anonymity. The blockchain reveals transaction amounts/timing and relationships, RPC operators observe queries and submitted transactions, receipt validation can identify matched payment addresses, and sweeping to a familiar wallet links addresses. ERC-20 gas funding adds a visible funding link. Tor Browser reachability and real private-network routing are unqualified.

JavaScript cannot promise complete removal of all engine-managed copies of secrets. Relevant byte buffers are disposed where possible; vault/session revocation must enforce authority even when garbage collection is outside application control. Never log decrypted backups, raw keys or private signing material as test evidence. Existing sanitized RED receipts retain numeric crypto call counts and public synthetic transaction data.

### Fresh configured Slither result

Slither 0.11.6 passed against 34 contracts with 64 detectors and zero reported results under the unchanged repository Medium/High gate. Compiler: solc 0.8.28, optimizer 200, Cancun. All 36 compiler input files matched committed candidate bytes. The missing-AST and dynamic-test-helper collection failures are retained separately. This configured gate excludes Low/Informational results and retains existing source suppressions; it does not establish absence of all vulnerabilities or close the strict Mythril gate.

## Publication provenance

Implementation commit identities above refer to preserved local development history. The GitHub connector preserves each tree and ordered parent history while normalizing commit metadata. `PUBLICATION_MAP.json` maps implementation commits to their published identities. Fresh publication, artifact and hosted-check records will be appended after final qualification.
