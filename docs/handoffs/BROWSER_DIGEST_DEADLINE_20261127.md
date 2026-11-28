# Browser self-check digest deadline — 2026-11-27 Pacific

## Source and observed failure

- Base main: `b890a76603b924829fdbe2b4fb2c5626f0cf4e36`.
- Exact original runtime blob: `fc72b8dc6e5a809300a9a827f00e6aa5ca4867bc`. Reconstructed file was verified using git hash-object.
- Original tests blob: `d83e7b95954993c071d2c2223c0e9912e2b7adb7`.
- Ownership claim: `639ee777a54ded06c3c3ab649742987534813c8b`; all 152 open PR changed-file lists returned no overlap on the two runtime/test paths. Previous browser self-check claims #703/#719 merged. No other branch changed.
- Regression-first commit: `07f9e7870ba49c7b6cb9b73b79fae5734d3e0104`; test blob `9fc03143022d7dfb727f730d1b5b5316fb3f2b05`.
- Minimal fix commit: `77ffd7dd5cd0def7d747263befb456d4d19824a7`; repaired blob `6b24d96c70942b79c034f925213dcc09c0aeb937`, identical to isolated tested source.

The local browser capability diagnostics await the SHA-256 provider without a deadline before running storage probes. A synthetic never-settling digest leaves the returned promise pending even after 5,000 ms. A late correct reply also leaves the diagnostic pending at the same deadline. The footer only updates checks when the whole promise settles, so startup can remain in the running state or a resumed page can retain an older report. This is a reproduced failure-injection case, not a measured incidence in a real browser or a demonstrated payment failure.

The repair applies the existing five-second phase deadline to the digest and reports fail if it expires. Normal successful/rejected/absent digest semantics and existing IndexedDB budgets are unchanged. No payment, key, network, deployed system or archived feature work.

## Executed evidence

Node 22.16.0, TypeScript 5.8.3; original and repaired full runtime files compiled in isolation with:
```
tsc browserChecks.ts --target ES2022 --module commonjs --lib ES2022,DOM --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --outDir before
tsc fixed/browserChecks.ts --target ES2022 --module commonjs --lib ES2022,DOM --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --outDir after
CHECK_MODULE=./before/browserChecks.js node --test reproduce.cjs
CHECK_MODULE=./after/browserChecks.js node --test reproduce.cjs
```
Node test mock timers with a native WebCrypto known-answer control; no repository dependencies or network. Original 5/7 passed, two failures explicitly at 5,000 ms; corrected 7/7 passed. Controls: native SHA-256 with storage cleanup, wrong digest, rejection, synchronous throw, missing digest. New cases: stalled digest produces failed status and storage round trip, late correct digest cannot change failure. These are **isolated source-equivalent tests**, not execution of the committed Vitest suite. Native Git remote lookup failed with DNS resolution error; repo Vitest, lint, full typecheck/build and browser verification remain outstanding.

## Integration

Base check-runs endpoint observed 32 successful checks; generation-77 integration lease released at inspection. PR #390 is already merged; five historical exact-head workflows successful, no formal GitHub review found. No main merge, lease claim, real funds or deployment. Before any integration: exact candidate CI including browser qualification, independent review, renewed source/ownership census and proper integration-lock acquisition. Do not waive unrelated release security gates.
