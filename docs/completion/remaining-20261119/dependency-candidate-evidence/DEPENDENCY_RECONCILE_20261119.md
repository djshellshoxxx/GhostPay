# PR #210 reconciliation with current main — 2026-11-19

Worker: `backlog_ci`; coordinator owns independent review and publication.
Local branch: `chatgpt/ghostpay-dependency-reconcile-20261119`.

## Exact source and resolution

| Source | Commit |
| --- | --- |
| Original dependency update #210 | `4d19655a2e5d93ad9378803cd4163245168aca24` |
| Paired alignment and coverage repair #236 | `defdaa308a2d05ab407af7e42f8dc457cf52d103` |
| GitHub-confirmed #236 merge into #210 | `7fab4b92f90d65dd8d3e992eaca2483187f544a7` |
| Current main incorporated here | `e454de6abfefda70d82784fafc1d8949b277c334` |

The dependency candidate and current main conflict only in
`docs/ai/ACTIVE_WORK.md`. Resolution preserves the two dependency-work claims and
every byte of main's existing registry. Main's runtime files, tests, workflows
and other documentation merge without conflict and remain unchanged relative to
that main source. The inherited privacy, checkpoint, signer and idle-clock work
is preserved without implementation edits.

All **74 tracked package manifests** and `package-lock.json` remain byte-identical to
the reviewed paired #210 head. No lock regeneration, dependency update, cast,
test change or gate change was needed. The resulting dependency artifacts are:

- Root manifest Git blob: `12156705352eb7ddfaaab7b3190e60feefbb9f92`.
- Lockfile Git blob: `875e90c613d4bdc1ca53c564944b1a734b3ffd31`.

Machine evidence in `evidence/dependency-reconcile-20261119/source-proof.json`
records the resolved index tree, permitted difference from main, byte comparisons
and sole conflict. That tree is the implementation checkpoint before this
handoff and qualification evidence are added.

## Paired update review and audit

Independent source review of #236 over exact #210 passed. The nine direct #210
version changes are minor or patch updates. The #236 repair adds no unique
package/version/tarball/integrity tuple, removes 333 duplicate lock records, adds
three identical root coverage records and preserves all 30 platform records.
It retains the existing 0xbow-specific viem override policy and places the
already-used coverage provider alongside the hoisted test runner.

Fresh lock-only audits at **2026-11-19 07:06:22 UTC**, using the identical
manifests and lock retained here, both exit **0** at the high-severity threshold:
the complete graph has **17 low, 0 moderate, 0 high and 0 critical** findings;
production has **0** findings. The old PR narrative containing 14 high findings
is historical. Low findings remain recorded; no advisory suppression or major
migration was added. Exact audit responses and lock proof are preserved beside
the reconciliation evidence.

## Qualification and publication boundary

The generated package map is current, all **111** action references on this
branch are pinned, and the repository secret scan and staged diff check pass.
The coordinator and the workflow worker independently reviewed the resolved
index and reported **PASS**. Their reviews confirm the source identities and
that main's complete work registry is preserved as an exact suffix.

| Executed check | Result |
| --- | --- |
| Fresh `npm ci --ignore-scripts --no-audit --no-fund --maxsockets=2 --prefer-offline --fetch-timeout=15000 --fetch-retries=0`, Node 22.23.4 / npm 11.9.0 | Exit 0, 721 packages installed; lock SHA256 unchanged. No copied dependency tree or lifecycle scripts. |
| `npm run test:dependency-tooling` | Exit 0; 5 passed, 0 failed, 0 skipped. Existing Mocha serialization, discovery, workers, reporting and solc temporary-file checks ran unchanged. |
| Installed viem resolution | GhostPay, Zama and Privacy Pools resolve the same viem 2.57.19 module. |
| Installed Vitest/coverage resolution | Both versions are 5.1.0; the coverage provider resolves from Vitest's location and its actual module import passes. |
| `npm ls --all --omit=dev`, executor npm 11.9.0 | Exit 1, reporting the original upstream viem, underscore and ws ranges instead of their existing root overrides. This failed diagnostic is retained. |
| The identical tree check with official npm 10.9.9 | Exit 0 on the same installed tree, with no repository, lock, package or gate changes. |

The [official Node release index](https://nodejs.org/dist/index.json) identifies
npm 10.9.9 as bundled with the Node 22.23.4 runtime used here. That npm package
was obtained separately, with its published SHA512 integrity verified, solely
for the read-only tree check. The changed result with only the CLI changed,
together with [npm's workspace override report](https://github.com/npm/cli/issues/9514),
supports a tool-version reporting difference for the npm 11.9.0 failure. No
override was removed or broadened to obtain the passing result. The exact
diagnostic output, commands, CLI provenance and import-check source are retained
in the evidence directory.

The final remote recheck still reported #210 at `7fab4b92` and main at `e454de6a`.
The coordinator must recheck those heads again immediately before publication,
publish this reconciliation as a normal forward update to the existing #210
branch, and obtain fresh CI on its actual resulting head before any main merge.
No previous #210 failure is relabelled by #236's successful checks or by local
results. This worker performs no remote branch update, GitHub merge, deployment
or release.

## Coordinator prepublication refresh

Immediately before publication, main advanced to
`ffd982a7aea2856c186b40ef236a39720a1b81f5` through #214. The coordinator stopped
the unpublished update and incorporated that head with another ordinary merge.
Its sole delta from the previously checked main is the historical documentation
file `docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md`; no runtime, dependency, test or
workflow changed. All dependency qualification above still identifies its actual
earlier source, and the new hosted run must qualify the final published tree.
The 74 manifest files and lock remain the exact reviewed #210 pair. No historical
audit entry is treated as a fresh current-source check.
