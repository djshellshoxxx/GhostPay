# Independent recovery interoperability acceptance review

Date: 21 November 2026 UTC. Reviewer: `/root/journal_review`.
Reviewer branch: `audit/ghostpay-journal-review-20261120-9a4ab6`.

## Decision

**Approve the bounded test addition; no blocking finding.** The new test connects
the actual application export service's returned bytes to the unchanged standalone
decoder in a separate process, then passes only that decoder's returned scalar to
the wallet signing API. It uses production cryptographic defaults, checks the
expected address and an altered message, and verifies default output redaction and
wrong-chain refusal. Its scope and supplied execution evidence support the limited
interoperability claim recorded below.

This is a second independent source/evidence review, separate from both the test
author and the coordinator's earlier review. The reviewer ran no product tests,
performed no financial or external-system action, and changed no test or runtime
source. The supplied **one-test focused pass** remains the coordinator's execution;
the initial failed invocation remains a failure. This review does not qualify the
whole application or approve release, deployment or shared-target integration.

## Source pins and ownership

| Input | Exact identifier |
| --- | --- |
| Reviewed branch | `test/ghostpay-recovery-interoperability-20261120-9a4ab6` |
| Reviewed HEAD | `3ea86bf1c7c5f9155efed82b2e36264917e6b28c` |
| Existing PR #269 base | `683f8587b8de45448f14aab0539cb07a5f21bce3` |
| Authored test/evidence commit | `f9e5f9feecf8709e43784ae638a11752e775ae7a` |
| New test SHA-256 | `580c14f1549d2d35d07682a6e80fd669521008937afd984a20b63d46fcb55806` |
| Existing export service SHA-256 | `3993ddc825b5129447fdfca89d449ecd3db9eaa524e9cc5a682c324daea48d9f` |
| Existing standalone decoder SHA-256 | `889c3b2cfb25b997d5304bbf4349a5b8d7444467a6ff12e4db4c872673d8c888` |

The only application/test path added relative to the base is
`apps/web/src/lib/paymentKeyExport.interop.test.ts`. The other changed paths are
the additive ownership entry and scoped evidence. Existing export service,
standalone decoder, shared codec, fixtures, existing tests, configuration, package
manifests and lockfile remain unchanged. The reviewer independently matched all
18 original-source hashes in `RECOVERY_INTEROP_OWNERSHIP.json` to the reviewed
worktree, including the existing service, decoder, codec, fixtures and configuration.

`AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md` and the relevant claims were
read before edits. The reviewer appended a separate claim on the audit branch
before writing this report. The coordinator's frozen 111-PR ownership inventory
is historical context, not a fresh remote observation or an integration lease.
The earlier broad recovery owners retain their source ownership. Root owns report
integration, current-head reconciliation, qualification and publication.

## Application bytes, isolated decoder and signer

| Stage | Source finding |
| --- | --- |
| Real application export | The test loads the existing public synthetic seller fixture, awaits `exportKeystore` for a real reauthentication credential, then awaits `exportEncryptedPayment` for announcement `a1`. It checks the fixed filename/type, single-payment format, recorded identity and exact `eth_getCode` request. |
| Production encryption | Neither export call supplies a reduced `N`. The test checks the returned file's scrypt profile: `N=131072`, `r=8`, `p=1`, `dkLen=32`. The unchanged codec uses its real scrypt/AES-GCM path and fresh random salt/IV. No crypto, decoder, export or signer function is mocked. |
| Exact transfer of bytes | After clearing the seller session and checking it is empty, the test writes `file.text` as UTF-8 with file mode `0600` and compares the resulting bytes to `Buffer.from(file.text, 'utf8')`. No reserialization or saved ciphertext replaces the export output. |
| Unmodified separate decoder | The test copies the documented script, compares its bytes to the source script, and copies only its two noble dependencies into the temporary directory. Each invocation uses a new Node process with that directory as its working directory and an environment containing only an empty `PATH`. The decoder imports Node crypto/filesystem APIs and the two noble packages, with no GhostPay package import. |
| Filesystem independence | Each child uses the supported permission flag and permits filesystem reads from the temporary directory. A separate probe must receive `ERR_ACCESS_DENIED` when reading the original repository script. There is no fallback that silently drops permission enforcement. |
| Credential transport | The export passphrase is supplied through the child's standard input. It is absent from child arguments and environment. Captured output is held in memory. |
| Returned key to signer | The reveal result must contain exactly one payment with the fixture's address/public key and matching private scalar. The scalar equality assertion is Boolean. `privateKeyToAccount` receives `payment.privateKey` from the decoder output, not the expected fixture key. |
| Signature assertions | The returned account must have the expected address. The test awaits signing of a fixed public challenge, awaits address recovery and requires the expected address, then awaits verification of the same signature against an altered challenge and requires `false`. |

The service inspection confirms that this path performs its existing credential
authorization, EOA-code check and verified derivation before encryption. The only
injected RPC is the existing in-memory `codeRpc` fixture; it answers `eth_getCode`
and records calls. The global `fetch` replacement throws on use, and the test
requires zero calls. There is no transaction construction, broadcast request,
network wallet client or live balance query in the new test.

The decoder's `decryptKeypairFile` uses the file's KDF profile, authenticated
decryption, scalar range checks, and a check that the scalar controls the recorded
public key and address. Its CLI awaits that work before emitting its result. The
exporter and decoder use separate envelope implementations; this is not a claim
that every cryptographic primitive or dependency is independently implemented.

## Assertions, key handling and cleanup

The reference fixture's chain is `11155111`. The default decoder invocation uses
that expected chain and must exit zero with the expected single-payment identity.
Its output must omit the `privateKey` field; the combined stdout/stderr is also
checked against the known public fixture's private-key markers.

The mismatch invocation deliberately expects chain `1`, even with explicit reveal
enabled. It must exit **1**, produce **empty stdout**, and report the decoder's
`error: wrongChain:` category without any of the checked private-key markers in
stderr. This checks the recorded chain identifier and refusal/redaction behavior.
It does not check a live chain or authenticate a chain endpoint.

The explicit reveal invocation must exit zero, and its stderr is checked for the
same markers. Only its captured stdout carries the recovered payment scalar for
the subsequent in-memory assertions and signing. The new test contains no explicit
key logging or write of recovered plaintext keys to disk; the fixture credentials
and keys are public test data. The supplied passing log contains only runner
summary output. These marker checks are bounded assertions about known fixture
material, not a general guarantee about every possible diagnostic or secret.

The temporary directory is removed in `finally`, including ordinary assertion or
decoder failures. `afterEach` clears the seller session and restores stubbed
globals. The main successful flow also checks the session remains empty after
signing. Export, signing, address recovery and altered-message verification are
all awaited; child processes are synchronous and their errors/statuses are
asserted. Each child has a 15-second timeout and a 1 MiB output bound. The existing
60-second test timeout is unchanged, with no skip or weakened fallback path.

These cleanup guarantees apply to normal control flow and exception unwinding.
An abrupt process termination cannot be treated as proof that `finally` executed.
Captured stdout, the parsed private-key string and the signer object also remain
ordinary process memory; clearing the application session does not prove erasure
of every JavaScript copy. The test appropriately establishes recovery independent
of the loaded seller session, without claiming secure erasure or arbitrary-state
loss recovery.

Filesystem isolation is explicitly exercised. The `fetch` stub belongs to the
parent test process, and the copied decoder's inspected path has no network
operation. This should not be described as an independent network-sandbox or
operating-system isolation assessment.

## Evidence integrity and execution outcomes

All evidence below is under
`docs/consolidation/autonomous-20261120-9a4ab6/` in the reviewed recovery branch.
The reviewer performed read-only hashing, JSON/gzip decoding and Git-object
comparison, without executing the acceptance test or standalone decoder.

- Both `RECOVERY_INTEROP_test_initial.json` and
  `RECOVERY_INTEROP_test_heap128.json` pin seven source/configuration hashes. All
  seven match the reviewed worktree in both records. The new test hash also
  matches `RECOVERY_INTEROP_ARTIFACTS.json` and the task's supplied hash.
- All six `*.log.artifact.json` wrappers decode to their recorded UTF-8 byte
  counts and SHA-256 values. They also reproduce the original raw log blobs from
  commit `f9e5f9feecf8709e43784ae638a11752e775ae7a` byte for byte. The artifact
  index and build/test/final-check metadata links agree with those hashes.
- The compressed dependency proof has SHA-256
  `f1cadbe615c3845746ab911336ba1c8499adea67d45ad1d4ad9a148453933952`.
  Decompression yields 332,768 bytes with SHA-256
  `dfcb97113b13daa6a0ea256b4c227a27d6beaee7488e1e403cdd20162b297334`,
  matching the index and both execution records. This verifies the supplied
  dependency record's integrity; the reviewer did not reinstall or independently
  rebuild its entire dependency tree.

| Supplied check | Recorded outcome and interpretation |
| --- | --- |
| Invoice-schema package build | Exit 0 under the original package build command. This is a package build, not a whole-web build. |
| First focused invocation, heap 384 MiB | Exit 1; one test was collected, but its worker received SIGKILL before an assertion outcome. This is retained as a failed invocation; its cause is not established. |
| Same focused test, heap 128 MiB | Exit 0; **one file and one test passed**, using the same source hash, configuration, production KDF and assertions. No additional pass is inferred. |
| Existing secret scan | Exit 0 as recorded, with its existing exclusions. This is supplied evidence, not a reviewer-run scan. |
| Authored source/document whitespace | Exit 0 as recorded. The original unrestricted staged check separately returned exit 2 for terminal blank lines in original process logs. |
| Lossless log-wrapper follow-up | Original log bytes and the failed unrestricted whitespace record are preserved. Formatting the logs as JSON wrappers changes no application/test behavior. |

The recorded passing command is:

```sh
NODE_OPTIONS=--max-old-space-size=128 node ../../node_modules/vitest/vitest.mjs run src/lib/paymentKeyExport.interop.test.ts --maxWorkers=1 --fileParallelism=false --coverage.enabled=false
```

It ran from `apps/web` under recorded Node `v24.22.3` and Vitest `5.1.0`, from
`2026-11-20T23:51:42.385816+00:00` to
`2026-11-20T23:51:47.527777+00:00`. The passing log SHA-256 is
`9f9eef2eb50a369b276dd35b2f24305f0d675d617a348a0377a6e24396d612e7`;
the retained failed log SHA-256 is
`67d042361ad3a49149babec3f9f843ade49595beceb0f8f1acd4182014ddfb2c`.
Historical recovery or Foundry outcomes were not rerun or counted as new passes.
The reviewer also checked the complete reviewed base-to-HEAD diff with
`git diff --check`: exit 0. The recovery worktree remained clean at the pinned HEAD.

## Qualification boundary

This test adds useful local byte/key interoperability evidence for one synthetic
scheme-1 EVM EOA, one encrypted single-payment export and one recorded chain. It
does not execute a browser download, third-party wallet UI import, device restore,
master/archive recovery, live-chain spend, transaction confirmation/finality,
retention guarantee or recovery from arbitrary lost state. The injected EOA-code
answer is a fixture rather than a live observation.

Full-web tests and coverage, whole-web typecheck, typed lint, broad build/bundle
checks, the complete standalone decoder suite, browser acceptance and final-head
hosted gates remain outside this focused result. The original tests, configuration,
thresholds and applicable gates are preserved. No blocking correction is requested
within the new test's stated scope; the coordinator retains those remaining gates
and the decision to publish the bounded contribution for review.
