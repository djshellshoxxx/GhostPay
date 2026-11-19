# Repository status snapshot

[Home](Home.md) · [User Guide](User-Guide.md) · [Developer Guide](Developer-Guide.md) · [Verification and Release Gates](Verification-and-Release-Gates.md)

## Consolidation snapshot — 18 November 2026 Pacific / 19 November UTC

The inspected main commit is [`ffd982a7aea2856c186b40ef236a39720a1b81f5`](https://github.com/djshellshoxxx/GhostPay/commit/ffd982a7aea2856c186b40ef236a39720a1b81f5).
This dated snapshot supersedes the older current-main and unmerged-branch statements
retained in the Wiki and continuation ledgers. Recheck live heads and workflow results
before the next integration; a dated status page is not a branch lock or release approval.

### Work already integrated

| Change | Merged PR | Main commit |
| --- | --- | --- |
| Browser transport isolation | [#241](https://github.com/djshellshoxxx/GhostPay/pull/241) | [`5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`](https://github.com/djshellshoxxx/GhostPay/commit/5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929) |
| Beta acceptance log retention | [#237](https://github.com/djshellshoxxx/GhostPay/pull/237) | [`58d89b39b27a66454ebf392bcd35d5c68b57b2f8`](https://github.com/djshellshoxxx/GhostPay/commit/58d89b39b27a66454ebf392bcd35d5c68b57b2f8) |
| Qualified idle-clock, invoice-signer and private-checkpoint integration | [#242](https://github.com/djshellshoxxx/GhostPay/pull/242) | [`e454de6abfefda70d82784fafc1d8949b277c334`](https://github.com/djshellshoxxx/GhostPay/commit/e454de6abfefda70d82784fafc1d8949b277c334) |
| Historical Pages source audit ledger through rotation 207 | [#214](https://github.com/djshellshoxxx/GhostPay/pull/214) | [`ffd982a7aea2856c186b40ef236a39720a1b81f5`](https://github.com/djshellshoxxx/GhostPay/commit/ffd982a7aea2856c186b40ef236a39720a1b81f5) |

PR #241 is already integrated. The newer main also contains the selected work from
#242; it does not thereby contain or qualify every change in the broader
[#238](https://github.com/djshellshoxxx/GhostPay/pull/238) candidate. PR #214 changes
only the audit ledger relative to `e454de6a`, so those two main commits have the same
runtime and workflow files.

### Work still requiring its own qualification

| Workstream | Source reviewed for this snapshot | Status at inspection |
| --- | --- | --- |
| Broad Pages consolidation | [#238](https://github.com/djshellshoxxx/GhostPay/pull/238), `198aa5baff22272453733a0f3dcfcac0e0994eec` | Open draft; failed application and Mythril runs cannot qualify later selective integrations |
| Spec 18 recovery | [#239](https://github.com/djshellshoxxx/GhostPay/pull/239), `4a1b181c89e02ee564b5568d4b4b8d689f5e42c5`; [#240](https://github.com/djshellshoxxx/GhostPay/pull/240), `38d69832ddc58ec27a19c00dbe3c89347c577495` | Overlapping drafts; reconcile the implementations and repair their application failures before integration |
| Historical adapter safeguards | [#250](https://github.com/djshellshoxxx/GhostPay/pull/250), `22af2074a086d9957a18e310ef8572b28d1facd0` | Source reviewed; full application qualification incomplete at inspection |
| Sleep-aware authority revocation and retained recovery | [#256](https://github.com/djshellshoxxx/GhostPay/pull/256), `df0d70de5b297391af5f1f2b786800a93b02ce52` | Separate follow-up to #242; full combined qualification incomplete at inspection |
| Historical pool, scanner and SOCKS safeguards | [#257](https://github.com/djshellshoxxx/GhostPay/pull/257), `4f14d6f167c788f5ae2d019bc8482027495f3c6c` | Separate focused recovery; full combined qualification incomplete at inspection |
| Contract-analysis evidence and deployment policy | [#255](https://github.com/djshellshoxxx/GhostPay/pull/255), `ea47fa75eabb0be2045081ffeb120fc2bfae67ab` | Open security candidate; documentation recovery does not disposition or suppress its findings |

This table identifies the immediately relevant workstreams, not the entire repository
inventory. The [documentation recovery report](../handoffs/docs-recovery-20261119/README.md)
records exact source ancestry and the older #139/#140/#153 evidence recovered here.

### Verification boundaries

- Main runtime commit `e454de6a` [CI run 44475627087](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475627087)
  was queued at inspection. A previous PR or unchanged runtime tree does not let this
  page claim that a pending workflow succeeded.
- Documentation source [#215 at `362dfa99`](https://github.com/djshellshoxxx/GhostPay/commit/362dfa999a96dc615a1d146b4f37f8325268a595)
  passed [scoped CI 44466963141](https://github.com/djshellshoxxx/GhostPay/actions/runs/44466963141),
  and [#216 at `bb193849`](https://github.com/djshellshoxxx/GhostPay/commit/bb193849a5688bb604e3e32dc83e1647e37fe447)
  passed [scoped CI 44467050336](https://github.com/djshellshoxxx/GhostPay/actions/runs/44467050336).
  Each had four successful applicable jobs and twelve intended skips. Those results
  qualify the original documentation scope, not this later combined candidate or an application release.
- Historical source audits are dated inspection evidence. They do not become new
  runtime tests or independent external audits when recovered into this branch.
- Signed testnet manifests, origin decisions, external-wallet payment and recovery
  acceptance, unresolved security dispositions and explicit deployment authorization
  remain separate release requirements. This documentation work supplies none of them.

### Release scope and deployment

The release target remains the non-custodial, client-side static Pages beta. Private
keys remain client-side; wallet providers and user-selected RPCs remain external
dependencies. Historical service, relayer, CLI, native, non-EVM and experimental
full-profile work is preserved without activating it for the Pages release.

At this source, [the Pages workflow](https://github.com/djshellshoxxx/GhostPay/blob/ffd982a7aea2856c186b40ef236a39720a1b81f5/.github/workflows/pages.yml)
validates pull requests and publishes only through an explicit manual dispatch with
`deploy=true` on main. Merging documentation does not deploy the site. The live GitHub
Wiki was not published by this workstream.
