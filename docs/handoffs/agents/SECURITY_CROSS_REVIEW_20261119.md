# Concurrent security-source and documentation review — 2026-11-19

Reviewer: `contract_security`, independent of the #255 implementation and the
coordinator's documentation change. This is a source comparison, not an external
audit or approval to merge, suppress findings, deploy or release.

## Concurrent #255 adds stronger behavior

The live GitHub metadata was checked twice and remained at
[#255](https://github.com/djshellshoxxx/GhostPay/pull/255), head
`ea47fa75eabb0be2045081ffeb120fc2bfae67ab`, base
`e454de6abfefda70d82784fafc1d8949b277c334`, open and draft. The prose body cites an
earlier published source; this review uses the actual current head. Source files
were read from that exact Git object. Their SHA-256 hashes are in the
[machine record](SECURITY_CROSS_REVIEW_20261119.json).

The comparison guard is our #217 recovery through
`cff088d69c0f2731722894ee8835164b3ec8b221`. Our current-report observational packet
is commit `5fadb4ff709701bff2a5f08fac548d24c2de42ad`. The concurrently owned work
should remain with its author; no duplicate implementation was made here.

| Area | Our recovered or reviewed behavior | Stronger #255 behavior |
|---|---|---|
| Nonzero-fee acknowledgment | Token-specific acknowledgment, Solidity checksum enforcement | Adds a digest of domain, actual chain ID, token, current token runtime codehash, flat fee and recipient; checked before broadcast. |
| Shell preflight | Offline token identity/shape and fee bounds; Solidity rechecks EIP-55 | Nonzero fees require RPC and `cast`; exact token/recipient EIP-55 spelling and read-only chain/codehash/configuration verification. Zero-fee preflight remains offline. |
| Freeze evidence | Current finding/source review plus historical native counterevidence | Adds permanent tests for fee-switch and broken-view freezes of prefunded undeployed accounts, rollback and inability of another factory to recover the original address. |
| Analyzer evidence | Complete hosted aggregate report and observational per-finding trace/source review | Captures all five targets' stdout, stderr, return codes, source/configuration inventory and the selected native compiler identity. |
| Strict runner | Any issue or reported tool failure fails | Also rejects duplicate JSON keys and missing/incomplete internal-timeout/exception/report telemetry. |
| Disposition helper | Existing candidate checker remains unwired; our JSON is observational | New schema binds source closure, runtime bytecode, toolchain, compiler settings and finding location, with exact-record/source/configuration-scoped owner-approval evidence. It remains unwired. |

The production `packages/contracts/src` tree is identical to coordinator source
`854fa4c7`: `dabfd36a98424a4184ee7e267e12815763d1157f`. The vendored-library tree
also matches: `b10191d543360a5c102e269cca72883b4303d8c7`. The deployment-script
helper is not a change to deployed Factory authority. The cached-solc integrity
guard is already identical in our integration, so that part is not new recovery
work for this lane. P3 withdrawal-signature/rotation limitations are documented;
there is no new destination/type-hash protocol fix.

The configuration digest cannot prove token safety. A proxy's runtime codehash
can stay unchanged across upgrades or storage-controlled behavior changes. It
also does not bind the newly created implementation address. Token suitability,
implementation verification and any production economic-risk acceptance remain
separate decisions. The strict runner still requires zero findings. The offline
checker explicitly requires authenticated owner approval to be verified outside
the helper; an authored approval field is not proof of its author.

### Concrete integration notes

The #255 shell still uses a generic `else` that prints `FLAT_FEE is 0` for a
missing or malformed fee after an earlier failure. Our `cff088d6` change prints
that message only for a numeric all-zero value. An independent offline probe ran
both scripts with missing and `bad` fees: **all four runs failed with exit 1**,
but only #255 printed the misleading zero-fee message. This is a diagnostic
regression, not a permission or deployment bypass. Preserve the numeric-zero
condition when the authorized integrator reconciles these files. The
[raw comparison](SECURITY_CROSS_REVIEW_20261119_DIAGNOSTIC.json) retains source
hashes and exact stdout/stderr.

Our token-only offline success fixtures will need intentional adaptation to the
new configuration requirement when #255 is integrated. Preserve their missing,
malformed, wrong-token, zero-fee, large-number and newline cases; do not simply
retain their old expectation that a nonzero-fee deployment can pass offline.
Preserve the latest surrounding README and runbook content during that merge.

The `198aa5ba` report is still evidence for that exact earlier analysis. It lacks
the new capture sidecars/toolchain identities and must not be relabeled as a
qualified #255 campaign or mechanically converted into owner-approved records.
The inspected PR reports earlier local qualification, but still marks fresh
current-source analysis/coverage/hosted work pending. This reviewer did not rerun
its native suites or symbolic campaign and grants no final sign-off on those.

## Independent documentation review: PASS

Coordinator commit `854fa4c777107a3966ada0252e6c80bb7796571c` changes the SDK
README, registry ADR, chain-adapters README and an embed-path comment. The four
changes match the inspected implementation; no blocking mismatch was found.

- SDK root exports and private/UNLICENSED package metadata match the guide. The
  builders, parser trust result, encrypted bearer-fragment semantics and injected
  clock behavior are described accurately. Merchant client creation does not
  fetch, start timers or read storage; calls are the explicit network boundary.
- `verify.ts` and verification spec R3 make an expired quote a warning while an
  expired invoice blocks. `pay.ts` separately blocks an expired fiat quote at
  review and the final pre-sign/pre-submit guard. The README preserves that
  distinction instead of claiming a verification verdict authorizes payment.
- Delegation helpers exist and freeze the typed-data request, require separate
  caller-owned signing/verification callbacks, and never broadcast. The v1 web
  publish flow remains direct registration only.
- ENS resolution uses the selected Ethereum/Sepolia RPC, the configured resolver,
  an empty gateway list and no CCIP interpreter. Unsupported/offchain paths fail;
  runtime code hashes are not independently pinned. The ADR retains these limits
  and distinguishes the original direct-registration fixture from real deployment
  or delegated-domain qualification.
- `deploy/nginx/security-headers-embed.conf` exists. The RPC validator accepts
  HTTPS/WSS and opted-in local HTTP/WS while the fetch transport only accepts
  HTTP(S). Quote age is capped by a supplied trusted heartbeat plus 300 seconds,
  and the web path requires valid heartbeat metadata before a quote read.

This was source review of documentation; no new runtime tests were necessary or
claimed for the four comment/documentation edits.

## Existing experimental model inventory

Both `scripts/experimental/policy-recovery/model.test.mjs` and
`scripts/experimental/milestone-escrow/model.test.mjs` already exist, with their
models and explicit authority/custody limits. The current CI Node invocation
enumerates `scripts/testnet`, `regtest`, `tests`, `agent` and `recovery` test files;
it does not enumerate these experimental subdirectories. Root `npm test` only
runs workspaces. This is a potential narrow CI-owner wiring task, not a reason
to invent new contract recovery or custody authority. No such authority was
implemented or approved by this review.
