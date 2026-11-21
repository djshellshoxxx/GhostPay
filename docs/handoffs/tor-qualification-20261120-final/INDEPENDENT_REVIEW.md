# Independent Tor source and release review

Reviewer: `tor_independent_final_review`, separate from the implementation and privacy/functional workers.

Reviewed integration source: **`d2e61d2c96128ae6f9c97fc3f347518e5d38a079`**.
Main input: `aec179910c39081d820396409ff3139ff2264132`.
Tor donor: PR #320, `e8010bbe002331ee0cb37dc6b16dfd91c8b8647d`, which preserves PR #308 by ancestry.
Security contribution: `c1e68241a515a1432a909b134b981ed3e50b8b8b`, integrated as `715af32a`.
Browser contribution: `fc2a3aa9b18380ed7a9fde0b5d17a0423e4037d7`.

## Verdict

**Source review: PASS.** No unresolved introduced critical or high-severity source defect was identified in the reviewed changes. The three findings below have been corrected in the frozen source. This clears the source for its remaining exact-head qualification; it does not mark unexecuted checks passed.

**Release qualification: NOT READY at this review.** The new hosted browser and actual offline-container checks remain required, alongside real Tor Browser/onion/network/payment acceptance. The live integration record was still held at generation 11; neither expiry nor this review releases its owner. The user has authorized merging completed work, so no additional general merge-approval request is required, but failing/unverified required checks and unresolved writer ownership remain material integration blockers.

## Reconciliation and architecture

An independent Git blob comparison verified that the 17 paths changed on main since the common base and the donor's 39 changed paths overlap only in `docs/ai/ACTIVE_WORK.md`. Before the new security contribution, all other main blobs were preserved exactly; donor blobs were preserved except for the deliberately extended browser runner. At the frozen source, every security-contribution product blob matches `c1e68241`, and the browser runner matches `fc2a3aa9` exactly. Registry changes are additive.

The changes preserve the static browser application, optional Tor hosting, existing HTTPS/Pages paths, client-side keys and non-custodial payment architecture. They add no relayer, production backend, external tracker, dependency-version change, wallet/network authority, contract change or deployment activation. Existing CSP, artifact authentication requirements and failure gates remain intact.

## Findings and corrections

| ID | Severity | Finding | Correction and verification |
|---|---|---|---|
| IR-01 | Medium | The new container readiness check used `readlink /proc/1/exe`. Tor's default debugger-attachment protection can deny that observation to a non-root process without ptrace capability, causing a false timeout. | Replaced with read-only `/proc/1/comm` plus retained-process, network-mode and identity assertions. Tor hardening and dropped capabilities remain unchanged. A separate benign same-UID undumpable-process probe confirmed executable-link access fails while `comm` stays readable. Actual Tor/container execution remains a hosted gate. |
| IR-02 | Low | The new container runner initially overwrote a report path, conflicting with preservation of earlier evidence. | It now reserves the report using exclusive `open(..., 'wx')` before any Docker activity. An independent check verified an existing report is refused with `EEXIST` and its bytes remain unchanged. Cleanup errors are recorded separately from the initial failure. |
| IR-03 | Medium | The initial workflow checked only the normal three-file Compose model; the operator's fourth offline identity override was not parsed by Docker Compose. | The frozen workflow additionally parses the actual four-file model and requires Tor's `network_mode` to be `none`, with no attached networks or published ports. Original normal-network assertions remain. Execution of this new gate is pending hosted CI. |

The Tor protection behavior above is documented in the [Tor manual, DisableDebuggerAttachment](https://manpages.debian.org/unstable/tor/tor.1.en.html). The local process probe verified the operating-system permission mechanism; it was not a Tor runtime test.

## Identity and container review

Normal startup requires a configured hostname and complete private identity files before it can connect. Initialization is explicit, refuses an existing identity directory, and cannot replace a missing identity for an already configured origin. The guard checks private ownership/modes, refuses symlinks and hardlinked identity files, and serializes identity operations with a private directory lock.

Verification does not trust `hostname` alone: it copies both key files into a private temporary directory and lets Tor load them with `DisableNetwork 1`, numeric loopback targets and no listener/control endpoint. It compares Tor's derived hostname with the configured pin and rejects any repair/replacement of the copied keys. The live identity remains untouched. Temporary material is removed by the cleanup trap, and initialization stages its result on the same volume before a no-clobber rename.

The offline Compose override and real-container acceptance both deny networking. The runtime image remains non-root, read-only and capability-restricted. Its build context excludes identities and backups; report generation excludes raw Docker output and identity bytes. Operator instructions cover explicit initialization, pinning, retained-volume reuse, encrypted backups, a separate restore test, and verification that all identity writers stopped before clearing a stale empty operation lock.

The container runner distinguishes restart/recreation with the same image from qualification of a changed Tor binary. It retains separate real-Tor bootstrap and browser gates. Source inspection and deterministic doubles do not establish actual Tor key-loader behavior.

## Browser acceptance review

The extended runner uses the actual packaged static artifact and existing UI flows. Selectors and envelope fields match the existing recovery/passphrase e2e helpers and source. It tests encrypted backup export/verification, signed passphrase-protected invoice-link transfer, wrong-passphrase refusal, restoration in an independent context, encrypted vault reload/unlock and absence of fixture passphrases from web storage.

Cross-origin storage assertions remain in one original browser context. The narrow viewport is labelled mobile layout only. Off-origin requests and WebSocket attempts remain denied; service workers are blocked in the fixture. Only the exact intentional integrity-request refusal diagnostic can be ignored, without suppressing later unrelated console or page errors. Synthetic encrypted downloads are deleted and excluded from reports. The runner explicitly excludes invoice-file UI, real mobile devices, Tor Browser routing, external wallets and payment recovery guarantees from its claims.

## Independent execution

All commands below were executed by this reviewer. The final focused run used the frozen source above; its production helpers match the previously reviewed snapshot.

| Command/check | Observed result |
|---|---|
| `node --test --test-concurrency=1 scripts/tor/identity.test.mjs scripts/tor/hosting-config.test.mjs` | **25 passed, 0 failed, 2 skipped**, 27 total. Skips explicitly name unavailable Docker Compose and `GHOSTPAY_REAL_TOR_BIN`. |
| `node --check scripts/tor/browser-acceptance.mjs` | Passed. |
| `node --check scripts/tor/identity-container.mjs` | Passed. |
| Existing container-report path refusal | Passed; nonzero `EEXIST`, earlier report unchanged. |
| Git blob/provenance comparisons | Passed with the intended registry, browser, identity and workflow differences above. |
| `git diff --check e8010bbe..HEAD` | Passed for the new contribution. |

Raw independent focused-test output is retained as `independent/final-identity-recipe.log` in the coordinator's evidence collection. The interim snapshot is separately retained and is not substituted for the final 25-pass result.

`git diff --check origin/main` additionally reports whitespace already present in four preserved donor raw logs: `tor-kit-lint-final.txt`, `tor-kit-typecheck-final.txt`, `tor-vite-build.txt`, and `tor-web-tests.txt`. These historical evidence bytes were not rewritten. This is distinct from the clean new-source contribution.

## Remaining gates

Require the exact new candidate's applicable CI and CodeQL, extended ordinary-browser acceptance, generated offline Compose parse and real-container identity/lifecycle results. Real Tor Browser connectivity, onion service bootstrap, external routing/privacy observations and payment interruption/reconnection remain separate unverified requirements. Invoice expiry and encrypted-key restoration must not be presented as automatic refunds or universal stuck-fund recovery. Resolve the existing integration writer's held record before shared-target changes.
