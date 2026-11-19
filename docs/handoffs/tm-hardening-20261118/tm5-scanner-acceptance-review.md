# TM5 configured CSP scanner integration — independent acceptance review

Reviewer: `acceptance_review`, fourth independent coverage/integration role.
Date: 2026-11-19.
Repository: `/workspace/scratch/88088facfb13/GhostPay`.
Reviewed base HEAD: `f0c15de9b381ac8a13ed3c76781d7fad8b236391`, with the five-file
TM5 scanner integration delta identified by the hashes below. The coordinator
owns the subsequent commit, publication and final qualification identity.

## Disposition

**No unresolved source blocker identified in this narrow correction.** The
configured origin exception is confined to the exact source-list tokens of the
single enforcing, early, direct-head CSP meta element in `index.html`. It does
not add configured endpoints to the global host allowlist or exempt application
JavaScript, CSS, unrelated markup, resource attributes, or other CSP directives.

Both existing full and lean tight Vite artifacts now pass the unchanged
`apps/web/e2e/devnet/scan-dist.mjs` entrypoint with the explicit strict CSP
environment. Before this correction, the coordinator's corresponding logs
failed on the two expected `https://rpc.example.invalid` and
`wss://rpc.example.invalid` policy literals. This is an actual integration
correction, rather than qualification inferred from a minimal fixture alone.

This review approves the inspected source boundary for the authorized reviewable
continuation. It does not establish final-head build, browser, typed-check or
release readiness. Existing owner decisions and inherited failed gates remain
unchanged.

## Source findings

- `scanBundle` obtains its expected origins from explicit caller options or the
  same validated build environment as `apply-csp`. It never derives an allowlist
  from artifact contents. Invalid direct configuration and invalid tight-policy
  settings fail with fixed diagnostics. Explicit empty configuration preserves
  the previous broad-development scanner behavior and grants no new host
  exception. Existing `ownOrigin` handling remains separate and unchanged.
- Configured scanning first invokes `checkCspDist`. Therefore stale, broad,
  missing or duplicate `connect-src` directives, unexpected decoded origins,
  stale headers, and absent or non-enforcing meta policies produce failures
  independently of the raw hostname regex.
- `readMetaPolicies` uses inert JSDOM parsing and source locations. Only actual
  direct children of `head` count. The policy must precede other non-meta
  elements. Late duplicate policies are now counted and rejected instead of
  disappearing from the cardinality check. No scripts execute and no resource
  loading is enabled by the parser.
- A maskable content value requires a complete, quoted attribute source span,
  with all parsed attributes accounting for the entire start tag and no
  duplicate or unparsed attribute gaps. The raw content must equal the decoded
  policy. Encoded values and malformed syntax do not acquire the exception.
- The masking range covers only the origin suffix of the already validated
  `connect-src` directive. Source-list tokens must match the canonical configured
  origins after splitting exclusively on ASCII whitespace. Other original
  source bytes remain visible to the existing hostname scan.
- Browser reviewer self-review caught that the shared semantic checker uses
  JavaScript's broader `\s` normalization. The final narrow masking guard closes
  that gap without changing the shared CSP helper. Independent NBSP, vertical
  tab, U+2028, BOM and em-space probes all reject; ordinary ASCII tabs still pass.
- Existing inline-code, remote-resource, JavaScript sink, worker-network,
  source-map, deployment, lean-module and source-tree checks remain active.
  The change adds no workflow, dependency, transport, recovery, contract or
  custody behavior. It does not change the inherited dependency-closure
  allowlists or their owner approval requirements.
- The new regression file is included automatically by the existing
  `scripts/tests/*.test.mjs` wildcard in `.github/workflows/ci.yml`. No CI wiring
  or assertion removal is required to execute it.

## Independent execution evidence

The reviewer wrote a standalone evidence probe, without editing product source:

```sh
node /workspace/scratch/88088facfb13/tm-evidence/acceptance-csp-bundle-probes.mjs
```

Result: **exit 0; 56 checks passed, 0 failed**. These are **54 synthetic cases and
2 existing actual-artifact scans**, not 56 application/browser tests.

The probes cover positive canonical output, ASCII separators and UTF-16 source
offsets; exact masking boundaries in other directives/attributes/body/comments;
JavaScript/CSS/worker/resource restrictions; duplicate attributes and policies;
comment/template/noscript/script/body/malformed-head policies; early-resource
ordering; entity-encoded matching and differing policy values; extra or broad
origins; non-ASCII separators; inline-code gates; stale headers; and invalid or
missing caller configuration. Both actual-artifact API scans also include the
application source tree and Vite configuration checks.

An initial probe run returned 55 passes and one reviewer-harness mismatch:
the remote-script case correctly rejected the artifact, but its diagnostic
matcher expected `remote <script>` rather than the existing `remote script`.
Only the reviewer probe matcher was corrected. The initial output is preserved
as `acceptance-csp-bundle-probes-initial.log`; it is not a product regression or
an unqualified green result. The final output is
`acceptance-csp-bundle-probes.log` and includes all reviewed source hashes.

The reviewer separately executed the real scanner entrypoint for each artifact:

```sh
GHOSTPAY_CONNECT_ORIGINS='https://rpc.example.invalid,wss://rpc.example.invalid' \
GHOSTPAY_REQUIRE_TIGHT_CSP=1 \
node apps/web/e2e/devnet/scan-dist.mjs /workspace/scratch/88088facfb13/tm-evidence/isolated-full-tight

GHOSTPAY_CONNECT_ORIGINS='https://rpc.example.invalid,wss://rpc.example.invalid' \
GHOSTPAY_REQUIRE_TIGHT_CSP=1 \
node apps/web/e2e/devnet/scan-dist.mjs /workspace/scratch/88088facfb13/tm-evidence/isolated-lean-tight
```

Both exited **0**, reporting `Devnet bundle scan passed.` These entrypoint runs
include deployment validation as well as bundle, application-source and Vite
checks. Logs are `acceptance-artifact-full-bundle-scan.log` and
`acceptance-artifact-lean-bundle-scan.log`. They reuse the existing coordinator
artifacts; this reviewer did not rebuild either profile.

The reviewer also inspected the implementer's
`bundle-csp-final-green.log`: the existing CSP suite plus new bundle integration
suite report **79 passed, 0 failed/cancelled/skipped**. That suite execution is
attributed to the implementer, not repeated by this reviewer. The implementer's
`bundle-csp-separator-red.log` preserves the failing-first NBSP case. Scoped
`git diff --check` passed on the tracked source delta.

No additional application test suite, typecheck, lint, compiler, browser,
dependency installation or build was run by this reviewer. Fresh isolated
artifacts and final hosted qualification remain coordinator work. Counts above
overlap in what they cover and should not be summed as unique application
coverage.

## Frozen reviewed source

All hashes were read before the independent probes and rechecked after them.
The scanner hash matches the coordinator's requested final snapshot.

| File | SHA-256 |
|---|---|
| `apps/web/scripts/scan-bundle.mjs` | `26736f6b00fc1933ed491c575803f6bc1b5a96739f02e3b11f49bf6b788fcec1` |
| `apps/web/scripts/scan-bundle.d.mts` | `86903d7a3a577f7fb4f501079de7f93976111516d8af3bc341b878427d11e560` |
| `apps/web/scripts/apply-csp.mjs` | `914a80cab61dbe0a3f203a6cd2b6b305de63ebe224a0dd2979c969e52dea7139` |
| `apps/web/scripts/apply-csp.d.mts` | `80305a634d1cbe1863d35b4e46df6243ff2fbaaafe35e0f2563e5475b0ee65b5` |
| `scripts/tests/privacy-csp-bundle.test.mjs` | `0d184d94dd418d5b897e1436815f1e1859c152ab3cc888dd5e6e45dd442418a8` |
