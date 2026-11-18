# Consolidation outcomes — local versus remote

Source snapshot: `e8c77e7e8699dd16b86b7a1ff90b834594d07105`; starting remote main: `dfc75ef2087fa6463ae59e0818abec01796c578d`.

**Remote main merges: 0. PR closures: 0. Deployments: 0. Release publications: 0. Branch deletions: 0.** These are workstream actions, not counts of historical repository activity. Candidate-branch publication is in progress through a separate publisher; its mapping and final PR are not yet asserted here.

Eleven reviewed PR source heads are present by ancestry in the local snapshot. Eight other PR sources contributed bounded extractions. #223 documentation is staged separately at `1e513ea9b5c7edb2afcc97df1381a6dcd6335bcc`. The initial inventory contained 53 historically merged PRs; those are not merges performed by this workstream.

| Source PR | Exact reviewed head | Local handling / commit(s) | Main merged? | Outcome and limits |
|---|---|---|---|---|
| [#227](https://github.com/djshellshoxxx/GhostPay/pull/227) | `613667be4eeb132c7d21ccd06c627f9a7144d85b` | `b45f0eeada982bc93b3ee6872e9ecd09ae9a7bed` | No | Wall/monotonic expiry and clock rollback; unsaved sole-copy safeguard retained. |
| [#235](https://github.com/djshellshoxxx/GhostPay/pull/235) | `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | `036cf9fa1a99f486681646289edba54ea25dca59` | No | Private session-bound v4 HKDF slots supersede both v3 formats; cursor content remains plaintext. |
| [#231](https://github.com/djshellshoxxx/GhostPay/pull/231) | `d9ff386807de724eb1a1c4d400c882df0fc20bb7` | `f9954310c08be220d6abf87692e3832d23d92ca0` | No | Explicit per-refresh balance consent and stale-result invalidation. |
| [#234](https://github.com/djshellshoxxx/GhostPay/pull/234) | `5e9e7be70399a9818579cf87bd494e013e25d4f9` | `f437987be0190bdf1d4de1d69f6ce4b84905e3e8` | No | Opt-in pinned-signer parser; Pay UI is not globally forced to require pins. |
| [#237](https://github.com/djshellshoxxx/GhostPay/pull/237) | `7109290b7e4f029c36d9743bde9fd664d1da5474` | `305ccb0d570c27a47435083059492edc819a0101` | No | Restricted hidden log retention only; not a browser failure fix. |
| [#222](https://github.com/djshellshoxxx/GhostPay/pull/222) | `2bc2098298d90928eb1acafad969f28316bb05fc` | `e194a5c5bafe08e3b6b59f2cec33dfff7ef41f61` | No | Source integrated with v4 checkpoint and balance-consent resolutions; later cancellation/copy fixes applied. Experimental routes remain outside lean. |
| [#228](https://github.com/djshellshoxxx/GhostPay/pull/228) | `685fe1a39a3fa9f1d6a4d10a77b4d1a2745edeed` | `f73ce555d5c0d862880713fe51fa0f87f3b0fe93` | No | Own-node policy enforced at cached-client dispatch and retries. |
| [#230](https://github.com/djshellshoxxx/GhostPay/pull/230) | `0b2609c2c83143741ad343bfb08234a2d1182aa5` | `c17f5778815a85e297fe442f628c4f73a4041dcf` | No | Session-memory destination ledger, stale-write guard and best-effort legacy cleanup. |
| [#233](https://github.com/djshellshoxxx/GhostPay/pull/233) | `67cf835d0bf5f3b239e8ee6f18dca401fd5a5050` | `b10ce324750a4e1dbd068d3bc53484e9a0a28115` | No | Browser fixtures preserve encrypted/minimized defaults; upstream hosted acceptance is separate from final combined source. |
| [#213](https://github.com/djshellshoxxx/GhostPay/pull/213) | `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` | `fefb7a57ec45c152c9269a553b3f18347e836206` | No | Spec 18 recovery integrated with independent recovery lane fixes and disclosure. |
| [#229](https://github.com/djshellshoxxx/GhostPay/pull/229) | `18110015e99efbeb4f23d47cd88bd6f917010108` | `fefb7a57ec45c152c9269a553b3f18347e836206` | No | Selected-export import consent and archive metadata disclosure. |
| [#209](https://github.com/djshellshoxxx/GhostPay/pull/209) | `b5e2ea3e5030b56c79063eb1f91c8a634ee5d740` | `766ce6d8e41feaefb09047ce846d7adad360cf6c`, `5510ecdc406154d262373bf44ea4503050baae45`, `4a5249b13af5a8119466619822c6977a5e1e0d22`, `1ff82f9a0920f391970c245e128eb46f08acfa22`, `fd110c68147cad4d3e120c9d90ff042b1fbdc51d`, `e88f4bed3ab3538a3269fc0f86f4a78d09a947b8`, `16d3e39b5bc6d3b57ed159c3fb14df4c9d9b173a`, `bffd60955ce06ccc90eef9c6e2d7559dc352395a`, `3e02b8e7fd044333a470080e3fe836a8f411784d`, `8af196a2ba8b962f4b84050b8904a14178f04b84`, `3d2688a7cfa6949bca849ef5e712dea2b34a61ca`, `60f7cc06f08633050cf52eab6134637393ab212e`, `63317df07e9071314ebbc86d6c08c512e3bb70a9`, `fb68a868b3b525046ae1b1bae83c2385374fa039` | No | Fourteen selected source/test/doc commits; release-test relaxation, unrelated automation/runtime pins and speculative changes excluded. |
| [#210](https://github.com/djshellshoxxx/GhostPay/pull/210) | `4d19655a2e5d93ad9378803cd4163245168aca24` | `5f2162ee3dc6554387d0e1366fcb6b49c145d4ea` | No | Matching dependency group extracted with #236; source head not merged by ancestry. |
| [#236](https://github.com/djshellshoxxx/GhostPay/pull/236) | `defdaa308a2d05ab407af7e42f8dc457cf52d103` | `811276498b589c0576fdc76e58a52296b155c413` | No | Root viem override/coverage repair extracted with matching #210 dependency and lockfile state. |
| [#212](https://github.com/djshellshoxxx/GhostPay/pull/212) | `4894d0d8d94333dffa8ae3937a4d8314f27c686f` | `bf6c8d1d65139b3785f4146244ec72c06a6baf65`, `29784adb573ab3084480464d640efd7f4ab42dfb` | No | Standalone Mythril utility/historical review plus deployment-validator command only; no contract or gate-policy change. |
| [#225](https://github.com/djshellshoxxx/GhostPay/pull/225) | `94ca7d5ba9dc65c7324805e5bf9b7d1d2dccee57` | `bf6c8d1d65139b3785f4146244ec72c06a6baf65` | No | Fail-closed standalone Mythril utility retained unwired. |
| [#224](https://github.com/djshellshoxxx/GhostPay/pull/224) | `1054daabc5cabe958466ec144582d76137b54910` | `f219cc89986eeef36c77e58175d4c417ff0f138d`, `b1d31915081048326e23eac5c0c3bbb5327b6f5f`, `0b67fa9fbd125b18412ef53a5d377ab5ccd460e2` | No | Static helper, HTTPS-only pinned downloads, no-install integration execution and bidi escapes only. |
| [#226](https://github.com/djshellshoxxx/GhostPay/pull/226) | `3a3b136a326e0d8c1f369d94d4517ad0711babc8` | `f219cc89986eeef36c77e58175d4c417ff0f138d` | No | Final path/symlink/malformed-request audit-helper repair. |
| [#220](https://github.com/djshellshoxxx/GhostPay/pull/220) | `16c48521f99903ccd2e584df5d00a9dec5ef754c` | `fce8d96d0e18f79a437f20a801a6dd4aa9a8cfc6`, `c4a6e0a10230b6c791ac716dd4cc7341e41f7e5d` | No | RPC fetch flags, key-boundary proof and automation/compiler-integrity slices; bypassable D1 guard and contract changes excluded. |

## Superseded, deferred and blocked work

The initial open-PR decisions were 18 EXTRACT, 7 REWORK, 5 BLOCKED and 10 DEFER. Initial branch decisions were 177 SUPERSEDED, 36 EXTRACT, 17 DEFER, 7 REWORK and 5 BLOCKED. These are discovery dispositions, not PR closure counts. Historical inclusion does not prove later behavior was retained.

#211 checkpoint work is superseded by #235 v4 within the local candidate; its policy/optional-chain/CLI/focus work remains preserved for separate qualification. #218 shared signer enforcement is covered by #234, while server/CLI/limiter work remains separate. #219 consent/worker/header spent-recognition work remains outside lean Pages. #223 useful documentation has been refreshed rather than importing its stale current-state paragraph.

The complete inventory remains in `RECONCILIATION_MATRIX.json` / `.md`. Current residual decisions and exact #211/#218/#223 comparisons are in `REMAINING_PR_DELTA_REVIEW_20261118.md`. No branch is deleted and no useful work is dismissed solely because it is old or non-ancestral.

Release-test relaxation from #209, speculative/experimental contract changes, the bypassable D1 ambiguity guard, and wiring the standalone Mythril utility into a gate were intentionally excluded. Existing release/analyzer policies remain in force.
