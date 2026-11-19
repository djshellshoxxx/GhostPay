# Independent historical tooling source review

Reviewer: history_census, separate from the implementation author. Reviewed the eight paths listed in `history-tooling-independent-review.json` against claim `74eaa0801f74104c3be5d5fb26366711a1af63e6` (base `0d0f4211f54131448212952da2b413dbb90ae243`). No blocking source finding. This review ran no tests, installation, image build or deployment.

## Preserved authority and gates

The nightly workflow retains its original trigger, global permissions and concurrency settings. Existing fuzz, dependency-audit, reproducibility and contract-analysis job bodies are byte-identical. Its original Slither command with `--fail-medium --exclude-informational --exclude-low` remains a failing step, before the supplementary `--fail-none --show-ignored-findings` report. The report cannot change the preceding failed outcome; no `continue-on-error` is introduced. Upload failure also remains a failure.

The two added nightly jobs execute existing examples, local IndexedDB/browser checks, and the existing payer-sponsor/external-pools Anvil suites. They have read-only contents permissions, no injected secrets, unchanged pinned setup actions, and a pinned Foundry toolchain. The additional Anvil job explicitly requires its binary and fixtures rather than silently skipping. Upstream circuits and other absent external artifacts remain outside that bounded addition.

Release workflow and Dependabot configuration are byte-identical to the base. The historical release-parity patch is held because it converts some existing mandatory native release checks into skips. The new recurring Docker Dependabot proposal is held separately; neither is imported implicitly through this recovery.

## Image pins and operational documentation

Five deploy source/test paths exactly match historical fd5c9009. Both immutable image-index digests were re-retrieved by the author from Docker Registry by tag and by digest. This reviewer recomputed all four saved response-body SHA-256 values and matched them to the selected pin and `docker-content-digest` metadata. This proves identity of the preserved public index bytes, not image execution or a vulnerability audit.

The selftest assertions check pinned defaults and agreement across Compose, environment example and Tor Dockerfile. Existing archive/attestation/confirmation protections remain. README updates preserve the newer tight-CSP section, keep HSTS guidance at the external HTTPS terminator, remove a new Dependabot-schedule claim, and accurately state that this recovery did not run Compose, build images or start containers.

## Evidence boundary

The complete author logs show the original nightly guard RED with one pass/four failures, then five passes, and selfhost RED with three missing-pin failures followed by `selfhost selftest: ok`. Those are inspected author results. This independent review does not rerun them or qualify scheduled jobs, external browsers, native analyzers, HSTS delivery or final combined hosted CI. Seven selected files are exact original blobs; the sole adapted file is README, whose full changed text was reviewed.

Final identity: all eight reviewed blobs were checked against implementation `cdcb2cd0bee094d5a28dc53e758ccb8be9a63fcf` and match exactly. Nightly source commit is `44e9fd14e07b3658aa8819ed2844d463dfa07515`.
