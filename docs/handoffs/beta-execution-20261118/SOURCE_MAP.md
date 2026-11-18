# Repair source map

Each repair was authored and tested in an isolated local worktree. Publication through GitHub Git data created a different commit identity with the **same full Git tree**; every tree was compared before the branch and PR were created. This transfers source content, not CI results. Fresh hosted checks must run on the published/integrated head. A local commit below is provenance and is not assumed to be a remote GitHub object.

| PR | Published head | Local final head | Verified common tree | Parent base |
|---|---|---|---|---|
| [#225](https://github.com/djshellshoxxx/GhostPay/pull/225) | `94ca7d5ba9dc65c7324805e5bf9b7d1d2dccee57` | `fe8ccee2a1b76886a1fd094723c141ae45deb0dc` | `f4ca3feb3884ab49f9cf9ea9b3841ebed8d5a2c7` | `4894d0d8d94333dffa8ae3937a4d8314f27c686f` |
| [#226](https://github.com/djshellshoxxx/GhostPay/pull/226) | `3a3b136a326e0d8c1f369d94d4517ad0711babc8` | `ff0e9044fbe7d11bd73e0de56dd9c781e6bc02f2` | `f45ae4b5e9f07648a5593b496f2b5661f8097634` | `1054daabc5cabe958466ec144582d76137b54910` |
| [#227](https://github.com/djshellshoxxx/GhostPay/pull/227) | `613667be4eeb132c7d21ccd06c627f9a7144d85b` | `59fcde26df4e5061fb42c5fee2ab38834c62bd8f` | `35560821a127947b8e5915d4596d11995375c671` | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| [#228](https://github.com/djshellshoxxx/GhostPay/pull/228) | `685fe1a39a3fa9f1d6a4d10a77b4d1a2745edeed` | `5c8baa19794a7ba65ca901f1f843120f6f65cad4` | `65ddbf08951341ee2c8e183e23b7401495ce0f68` | `2bc2098298d90928eb1acafad969f28316bb05fc` |
| [#229](https://github.com/djshellshoxxx/GhostPay/pull/229) | `18110015e99efbeb4f23d47cd88bd6f917010108` | `673f190d39ba2ce983abdef9ca8b996481e22d52` | `b8475e156a7a929b1f90fc6118f257fc5e76fe4e` | `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` |
| [#230](https://github.com/djshellshoxxx/GhostPay/pull/230) | `0b2609c2c83143741ad343bfb08234a2d1182aa5` | `291fc8f9c1926bcfb0b5a14e48d063dd46294498` | `979f41c3a27e1eaa2f906fbca7a36c9b7d0b72d3` | `2bc2098298d90928eb1acafad969f28316bb05fc` |
| [#231](https://github.com/djshellshoxxx/GhostPay/pull/231) | `d9ff386807de724eb1a1c4d400c882df0fc20bb7` | `03042f112050966de4616587ad0859f39cba91a6` | `e003f7d0e2c953d9779c357dabf982069d951ad0` | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| [#233](https://github.com/djshellshoxxx/GhostPay/pull/233) | `67cf835d0bf5f3b239e8ee6f18dca401fd5a5050` | `cf13b9be093ae8deae17d5e17d8ef756b4c4eb28` | `d2344cba3807580c3314fe38b91a1a58de1a1d4a` | `2bc2098298d90928eb1acafad969f28316bb05fc` |

## Verification scope distinctions

- Main functional suites ran locally at `76256a6a81169b07a16e9c4bdbdbb3b0de327a18`, which differs from canonical main `dfc75ef2087fa6463ae59e0818abec01796c578d` only by the execution-evidence ownership claim. Runtime, tests, package manifests and lockfile are identical. Later report files do not change those sources.
- #227's 44-test run, whole-web typecheck and two clean Pages builds apply to its integration source. The builds record exact local final 59fcde26; remote 613667be has the identical tree. The 16 site files and their SHA256SUMS are byte-identical across both clean builds. This is same-environment reproducibility, not cross-platform release reproducibility.
- #229's 78 web tests, 64 codec/property tests and 16 independent recovery tests apply to the logic repair before final disclosure-only additions. Whole-web typecheck passed at local 67f0d2fe3b00ea8f64cd8b1df8c0b563f791f6a3; the subsequent test-only microtask adjustment received scoped lint and an 11-test component rerun. Component 11 and locale/security 16 were rerun after their respective followups. The verified Pages artifact was built from `1b0dd02e78d1d3f8dd117977c589eaa62671b3da`, not final 673f190d/remote 18110015. Final changes preserve runtime/format and add disclosure text/docs.
- #230's 171 affected tests and whole-web typecheck apply to local 291fc8f9. Independent privacy reviewer ran 12 focused tests at that exact source.
- #231's 120 author/72 independent tests and whole-web typecheck apply to runtime/catalog/DOM-test source `d03d529f5b785dcd129b302d122b191d3d066214`. Final 03042f11 additionally changes handoff/claim and two reviewed+linted E2E setup clicks. Runtime/catalog/DOM-test blobs are unchanged. Browser suites were not executed.
- #228's full-web TypeScript attempt ended 137. The 13 focused tests and scoped lint passed; no whole-web typecheck pass is claimed.
- A later local documentation-only commit 2196fe17 in the own-node worktree records independent ledger review. It was not substituted for the published #228 tree; that review is preserved in the execution report instead.

- #233's 49 author tests, 3 independent helper tests and whole-web typecheck apply to fixture source `6dc3ae7c419c8f706c11fc3d96de66e055ad165d`. Final cf13b9be adds documentation only. Playwright listing collected 14 tests and executed zero browser tests. The prior hosted 11 pass/2 fail/3 unrun belongs to synthetic merge `644a43ee6366298f418a0aca5a40ecf974871748`, whose parents are main 5467c158 and #222 head 2bc20982; it is not a passing result for this repair.
