# F03 request-file implementation and qualification

Selected feature: signed-invoice file interchange. Implementation and fresh-worker source audits
are complete. Browser and exact-current-head CI qualification remain separate gates. This does
not complete the broader F03 reusable-request, wallet-URI or provider-abstraction program.

Draft PR: [#310](https://github.com/djshellshoxxx/GhostPay/pull/310).
Branch: `future/f03-private-payment-links`. Baseline: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.

## Source identity and durable audit checkpoints

Final product source is local `e543d25fc7f3b65460518f4b3df4c513d34a1215`, tree
`e96e7876585150032a26ccf0947ea724b070c3ee`. Its published equivalent is
`bd128598f1b4c5291dad5c003a4775ad47bbb888`, with the identical tree. Later commits contain
only ownership, audit, evidence and successor documentation unless explicitly recorded otherwise.

Git command-line writes were unavailable, so publication used the GitHub API with an expected-head
lease and no force update. API-created commits have different metadata and identities. Every
published source tree was checked against the local tree before moving the branch. Use this map
when reproducing an auditor's locally pinned command from a fresh remote clone:

| Checkpoint | Local commit in reports | Published equivalent | Exact tree |
| --- | --- | --- | --- |
| Initial scope and ownership | `4cd83af10a85769ba754d8073a4fd35d08500ea2` | `dd665344d6290c109d2292093e01903e4770adff` | `3face06325edad20121ee998da6254fe39b70967` |
| Initial implementation, before fresh audit | `f472030a1d9a993db1ba7a1a33f9a208c28ebf13` | `50376117f0239ccd2c3f047a1e4ce6430218a501` | `387690ae4248ed35da78b359e84ba09c9b7a25b4` |
| Independently failing lock regressions | `c4c85727de2198482c939f18ac0a8088c9f82da5` | `9329c6f4a367563d3b5cabaf2e0d8df0fffc9399` | `0585bbf3e8fef6251f1ee9fa5d3a3bb05c7c7518` |
| Lock repair | `d82744017594267d9511e46beaf19e5842fb8317` | `f3cd8a7803b07b7d8496c5c84f87f9ac6e3246bb` | `98058025f99c75327b7abc55a9587d5c9997d546` |
| Complete catalog fallbacks | `e543d25fc7f3b65460518f4b3df4c513d34a1215` | `bd128598f1b4c5291dad5c003a4775ad47bbb888` | `e96e7876585150032a26ccf0947ea724b070c3ee` |

The historical implementation and failing-regression equivalents are retained as ancestry of the
audit/evidence publication. They are historical snapshots; the branch's current tree contains
the repaired source. The final catalog change leaves the complete `apps/web/src` tree identical
to the lock repair: `b3259c56364053c6e736e8c3e3169fdd02c6c39e`. The invoice-schema package and
all TypeScript production/test files also remain unchanged by the catalog correction.

## Implemented behavior

A seller explicitly downloads `ghostpay-request.gpr.json` containing only `format`, `version`
and the exact original `#gpi=v1.` fragment. A payer selects the file locally, sees an uncommitted
preview, explicitly opens it, then follows the existing signature, signer, passphrase, supported
asset, expiry and payment-review path. Selecting a file does not connect a wallet or submit a
payment. Wrapping a request adds no encryption or merchant identity assurance.

The synchronous codec enforces strict closed JSON, duplicate/forbidden-key rejection, canonical
base64url, a 24 KiB file ceiling and the existing 16 KiB decoded envelope ceiling. Browser intake
checks declared and actual size, strict UTF-8 and stale-operation guards. Replacement, clearing,
disclosure closure, page hiding, unmount, session/scope/profile changes and application locks
discard pending or staged work. Existing QR and ordinary link review remain in use.

## Fresh audit outcomes and repairs

Three fresh workers independently reviewed the selected feature after the implementation freeze.
The ledger below records later gate outcomes; audit reports retain their own time-of-review evidence.

- [Standards](audits/STANDARDS.md): documented standards, maintainability, boundaries and substantive tests.
- [Specification](audits/SPEC.md): complete requirement-to-source/evidence traceability and independent regressions.
- [Defensive privacy/security](audits/PRIVACY_SECURITY.md): transport/authentication separation, disclosure,
  input handling, resource cleanup, implicit effects and asynchronous lifecycle boundaries.

The specification and privacy lanes independently confirmed the same medium finding: app lock
did not invalidate an import when seller-session identity stayed unchanged. Count this once.
The specification worker added four behavioral cases: pending read or staged preview, each with
an absent or retained seller session. All four failed before the repair and passed afterward.
The minimal repair subscribes the existing invalidation function to the existing app-lock signal
and unsubscribes on cleanup. All three lanes reviewed that repair; specification and privacy also
reviewed the final catalog correction independently of its author.

The full catalog checker separately found 45 missing entries: 15 new keys in each of Arabic,
Spanish and Japanese. Exact English fallbacks were added under the established unreviewed-locale
convention. All 2,253 existing messages in each locale, metadata, review state and security
digests are unchanged. These additions are not native-language translation or review evidence.

## Executed validation

Command/status/source records and captured logs are under [evidence](evidence/). These are local
execution records, not attestations or a substitute for independently rerunning gates. Readable
log copies have only trailing console padding and trailing empty lines normalized for Git's
whitespace guard. `console-log-normalization.json` lists the original/normalized hashes, and
`original-console-logs.tar.gz.b64` preserves the exact original bytes of every affected log.
Decode that file from base64, then open the gzip-compressed tar to inspect original captures.
Unlisted logs are unchanged. The labeled RED transcript remains distinct from direct captures.

| Gate | Actual result | Source/evidence |
| --- | --- | --- |
| Full invoice-schema suite with original coverage thresholds | **813/813 tests, 15/15 files; exit 0.** 335.28 seconds in Vitest, 336.06 seconds total. | Lock-repair source; `invoice-schema-full-coverage.json/.log`. Includes the 74 codec and 11 genuine signed-invoice interchange cases. |
| Package coverage | **98.05% statements, 97.68% branches, 100% functions, 99.29% lines.** Original thresholds remain 95/90/95/95. | Same full run. New `requestFile.ts`: 97.36% statements, 96.77% branches, 100% functions and lines. |
| Fresh auditor's complete focused DOM/QR/catalog suite | **114/114 passed, exit 0.** | Lock-repair source; `spec-combined-dom.json/.log`. |
| Lock regression demonstration | **4 failed before / 4 passed after.** Each focused selection skips 13 unrelated cases. | `spec-app-lock-red.log` is a labeled transcript of captured output; GREEN `.json/.log` are direct captures. No skipped case is counted as passing. |
| Independent actual QR raster decoding | **3/3 passed** in the implementation worker's run. | Historical author evidence in the audit handoff. Real signed plain, bearer and passphrase envelopes traverse an independent image decoder. This is not browser execution. |
| Typed lint for every changed TypeScript/TSX feature file | **Exit 0.** | Lock-repair source; `feature-lint.json/.log`. Catalog-only successor does not change those files. |
| Full web typecheck | **Exit 0**, 20.59 seconds at final catalog source. | `web-typecheck-catalog-final.json/.log`; earlier lock-repair source also passed in 19.25 seconds. |
| Invoice-schema typecheck and package build | **Both exit 0.** | `invoice-schema-typecheck.json/.log`, `invoice-schema-build.json/.log`. |
| Full and lean static Vite builds | **Both exit 0**, 2.55 and 1.38 seconds. | Final catalog source; `web-vite-full.json/.log`, `web-vite-lean.json/.log`. |
| Original post-build bundle scanner | **Both profiles exit 0**, 1.68 and 1.45 seconds. | `web-bundle-scan-full.json/.log`, `web-bundle-scan-lean.json/.log`. |
| Catalog completeness/template checker | **Exit 0; 4 catalogs, 0 errors, 454 warnings.** | Final catalog source; `locale-catalog-final.json/.log`. The previous 409 warning lines are unchanged; 45 new warnings identify the English fallbacks. |
| Secret scan | **Exit 0** for implementation and final staged audit/evidence paths. | `secret-scan.json/.log`, `final-secret-scan.json/.log`. |
| Final staged whitespace guard | **Exit 0.** | `final-whitespace.json/.log`; exact original affected console logs are retained in the archive described above. |

### Static build qualification

The ordinary full and lean npm build invocations each exited 137 with `Killed` before emitting
a Vite result. The logs contain no TypeScript diagnostic; those invocations are not passing builds.
A serial component-by-component retry passed the same full typecheck, Vite build and original
post-build bundle scanner at the final catalog source. The direct typecheck used a 1,280 MiB Node
heap; Vite/scanner used 1,024 MiB, with `RAYON_NUM_THREADS=2` for bounded native parallelism.
The failed npm runs used the lock-repair checkpoint; the successful component runs used the final
catalog checkpoint. Their only source difference is the separately documented locale fallback
repair. Runtime TypeScript, build configuration, release guards and validation thresholds were
unchanged, and no acceptance gate was relaxed.

`web-artifact-full.json` and `web-artifact-lean.json` retain path/size/SHA-256 inventories and the
lockfile hash for the emitted static output of each successful profile. These are local build
inventories, not browser evidence, reproducibility certification, signed release artifacts or
production deployment-manifest validation. The first profile's output was subsequently replaced
by the second build in the ordinary ignored `dist` directory.

### Earlier failures retained for provenance

The first package coverage attempt was interrupted with exit 130. Two 180-second attempts expired
with exit 124; the verbose direct attempt showed normal progress through expensive existing
passphrase cases. The successful full run allowed 900 seconds, used one worker and completed
without changing test timeouts, skips or coverage thresholds. A focused codec-only coverage run
had failed the package-wide thresholds because it did not exercise the rest of the package; it
was never counted as full qualification.

The first web typecheck exited 2 because a transitive test dependency, `@ghostpay/relayer-guard`,
had not been built in the isolated checkout. Building that workspace from the same source
resolved the missing-import cascade; the subsequent full web typecheck passed. The catalog's
original 45-error result and the two killed npm build invocations are retained separately.

## Outstanding qualification

Chromium exists locally but fails before page creation with `socket() failed: Operation not
permitted (1)` in its process-singleton initialization. No browser result, screenshot or browser
network trace is claimed. Six new Playwright cases were authored and collected; actual execution
belongs to the existing full/lean CI browser jobs on the exact current branch head. The authored
browser cases do not exhaust every lifecycle interleaving covered in DOM/source review.

At the retained product-status observation, workflows were queued or pending. Check their latest
actual status rather than
treating creation of a draft PR as a passing run. Whole-repository release, production manifest,
real wallet/provider, real payment, deployment and main-merge qualification are outside this
selected implementation. Follow [HANDOFF.md](HANDOFF.md) for the remaining worker task.
