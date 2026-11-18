# Exact local commit ledger

Starting main: `dfc75ef2087fa6463ae59e0818abec01796c578d`. Integration snapshot: `e8c77e7e8699dd16b86b7a1ff90b834594d07105`. Tree: `81341de7972041b5f7ce53da76027846356fab90`.

The delta contains 78 commits, 36 on the integration first-parent chain, 15 merges overall and 13 first-parent merges. This includes existing source-branch work; it is not a count of newly authored commits. JSON retains parents, trees, author/committer metadata, complete messages and first-parent changed paths.

## Integration first-parent order

| Commit | Parents | Subject |
|---|---|---|
| `b828b44e9f745e723e64ddbcd34fff36b20acabd` | `dfc75ef2087fa6463ae59e0818abec01796c578d` | docs: claim Pages beta consolidation continuation |
| `b45f0eeada982bc93b3ee6872e9ecd09ae9a7bed` | `b828b44e9f745e723e64ddbcd34fff36b20acabd`, `613667be4eeb132c7d21ccd06c627f9a7144d85b` | merge: integrate reviewed Pages idle-clock repair (#227) |
| `036cf9fa1a99f486681646289edba54ea25dca59` | `b45f0eeada982bc93b3ee6872e9ecd09ae9a7bed`, `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | merge: integrate reviewed Pages repair (#235) |
| `f9954310c08be220d6abf87692e3832d23d92ca0` | `036cf9fa1a99f486681646289edba54ea25dca59`, `d9ff386807de724eb1a1c4d400c882df0fc20bb7` | merge: integrate reviewed Pages repair (#231) |
| `f437987be0190bdf1d4de1d69f6ce4b84905e3e8` | `f9954310c08be220d6abf87692e3832d23d92ca0`, `5e9e7be70399a9818579cf87bd494e013e25d4f9` | merge: integrate reviewed Pages repair (#234) |
| `305ccb0d570c27a47435083059492edc819a0101` | `f437987be0190bdf1d4de1d69f6ce4b84905e3e8`, `7109290b7e4f029c36d9743bde9fd664d1da5474` | merge: integrate reviewed Pages repair (#237) |
| `6cae32f392a49a246f2b15cb0f7df3937a0ce13c` | `305ccb0d570c27a47435083059492edc819a0101` | docs: claim privacy consolidation and collision resolution |
| `e194a5c5bafe08e3b6b59f2cec33dfff7ef41f61` | `6cae32f392a49a246f2b15cb0f7df3937a0ce13c`, `2bc2098298d90928eb1acafad969f28316bb05fc` | merge: consolidate privacy defaults while preserving v4 checkpoints and balance consent |
| `f73ce555d5c0d862880713fe51fa0f87f3b0fe93` | `e194a5c5bafe08e3b6b59f2cec33dfff7ef41f61`, `685fe1a39a3fa9f1d6a4d10a77b4d1a2745edeed` | merge: consolidate reviewed privacy follow-up (#228) |
| `c17f5778815a85e297fe442f628c4f73a4041dcf` | `f73ce555d5c0d862880713fe51fa0f87f3b0fe93`, `0b2609c2c83143741ad343bfb08234a2d1182aa5` | merge: consolidate reviewed privacy follow-up (#230) |
| `b10ce324750a4e1dbd068d3bc53484e9a0a28115` | `c17f5778815a85e297fe442f628c4f73a4041dcf`, `67cf835d0bf5f3b239e8ee6f18dca401fd5a5050` | merge: consolidate browser fixtures for privacy defaults (#233) |
| `821d1035b3e8b20921904f5c3bf6411f22ea3346` | `b10ce324750a4e1dbd068d3bc53484e9a0a28115` | fix(privacy): stop scheduling bulk evidence requests after scan cancellation |
| `27e80199ab7299e6cc72d64366366335c57196b3` | `821d1035b3e8b20921904f5c3bf6411f22ea3346` | fix(web): align scan disclosure with explicit sweep balance consent |
| `766ce6d8e41feaefb09047ce846d7adad360cf6c` | `27e80199ab7299e6cc72d64366366335c57196b3` | Reject published test keys as release keys in production builds |
| `5510ecdc406154d262373bf44ea4503050baae45` | `766ce6d8e41feaefb09047ce846d7adad360cf6c` | Scan every HTML page and share one lean exclusion list |
| `4a5249b13af5a8119466619822c6977a5e1e0d22` | `5510ecdc406154d262373bf44ea4503050baae45` | Remove the legacy runtime-fetch unsigned-dev manifest loader |
| `1ff82f9a0920f391970c245e128eb46f08acfa22` | `4a5249b13af5a8119466619822c6977a5e1e0d22` | Pass sanitized root error handlers to createRoot |
| `fd110c68147cad4d3e120c9d90ff042b1fbdc51d` | `1ff82f9a0920f391970c245e128eb46f08acfa22` | Refuse key, sweep and settings views when framed |
| `e88f4bed3ab3538a3269fc0f86f4a78d09a947b8` | `fd110c68147cad4d3e120c9d90ff042b1fbdc51d` | Guard unsaved keys against leaving the page |
| `16d3e39b5bc6d3b57ed159c3fb14df4c9d9b173a` | `e88f4bed3ab3538a3269fc0f86f4a78d09a947b8` | Check the deployed origin against the declared origin |
| `bffd60955ce06ccc90eef9c6e2d7559dc352395a` | `16d3e39b5bc6d3b57ed159c3fb14df4c9d9b173a` | Allow the build's own declared origin literal in the bundle scan |
| `3e02b8e7fd044333a470080e3fe836a8f411784d` | `bffd60955ce06ccc90eef9c6e2d7559dc352395a` | Walk every lean view and a fixture invoice in the Pages smoke test |
| `8af196a2ba8b962f4b84050b8904a14178f04b84` | `3e02b8e7fd044333a470080e3fe836a8f411784d` | Attest the Pages artifact checksums before deploying |
| `3d2688a7cfa6949bca849ef5e712dea2b34a61ca` | `8af196a2ba8b962f4b84050b8904a14178f04b84` | Tighten the audited fetch call sites after the manifest loader removal |
| `60f7cc06f08633050cf52eab6134637393ab212e` | `3d2688a7cfa6949bca849ef5e712dea2b34a61ca` | Recover isolated-context seller-vault recovery checks R1-R3 |
| `63317df07e9071314ebbc86d6c08c512e3bb70a9` | `60f7cc06f08633050cf52eab6134637393ab212e` | Call invalidateFrom with its current signature in the IndexedDB check |
| `fb68a868b3b525046ae1b1bae83c2385374fa039` | `63317df07e9071314ebbc86d6c08c512e3bb70a9` | Document bearer precedence over caution flags in QR design guide |
| `0bbd8965b2535a48ecd4eab700cd4f28e54b38fa` | `fb68a868b3b525046ae1b1bae83c2385374fa039` | fix(web): keep root error reporting free of mutable error content |
| `fefb7a57ec45c152c9269a553b3f18347e836206` | `0bbd8965b2535a48ecd4eab700cd4f28e54b38fa`, `1aba6d2c5798f5e2b0103cbd80914c59848d92d9` | merge: consolidate reviewed independent key recovery (#213, #229) |
| `0ca168f26a368d60782a12ce2dcb7c42d3b2f2c8` | `fefb7a57ec45c152c9269a553b3f18347e836206`, `ef464ee582086192c5c8a498ec9730cdf62c3f66` | merge: qualify paired dependency and viem alignment (#210, #236) |
| `985b57935eb295ac88353a5596d8231c5f45713c` | `0ca168f26a368d60782a12ce2dcb7c42d3b2f2c8`, `2563e43e676bc6613bd525302c56195fa4332044` | merge: consolidate reviewed security tooling without relaxing release gates |
| `e85db1ef942bda9cb54317a6c036a22484b46ff9` | `985b57935eb295ac88353a5596d8231c5f45713c` | docs(security): clarify delegated viewing-key boundary |
| `2f4b7801d08970c18eb36d4847c90efae45c414b` | `e85db1ef942bda9cb54317a6c036a22484b46ff9` | docs(pages): align hosting and privacy guidance with integrated behavior |
| `9156f803849997058f398ee05648675e99fec1a1` | `2f4b7801d08970c18eb36d4847c90efae45c414b`, `ec5c63c79d6ff82353c0e9197a19023a59f9ae4d` | merge: qualify Pages smoke render-error failure gate |
| `ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929` | `9156f803849997058f398ee05648675e99fec1a1` | docs(pages): describe runtime framing guard and artifact provenance accurately |
| `e8c77e7e8699dd16b86b7a1ff90b834594d07105` | `ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929` | fix(vault): wipe temporary keystore passphrase bytes on every exit |

## Initial documentation work staged separately

| Commit | Tree | Subject |
|---|---|---|
| `a8a8d7ec1cdeaf11df53aa6aa0ea48ee9ecb9583` | `7ca9995add76d6cbbaaa32e9e6caabddd7698f24` | docs(pages): reconcile current implementation and privacy evidence |
| `8acfacf2b93af606fc02e5638bf7007231893a59` | `a4b25d8468efa6de28e7060e67308731327b0431` | docs(privacy): describe current network controls and Tor limits |
| `1e513ea9b5c7edb2afcc97df1381a6dcd6335bcc` | `9d0a4cd182b4ea2c007c2c2a840a53a2259cc331` | docs(handoff): record independent documentation review |
| `2d83582af7b4611a3cde062a8041bc3dbe423555` | `8ff0f714d1cdfd4adaf4941650597ef611c5a320` | docs(handoff): stage source-pinned Pages completion packet |

The complete post-runtime documentation history through `1656558a78f52a2251a3e84b1ce980741a6d46fc`, including
the documentation merge and completed npm/native evidence, is recorded in
[LOCAL_COMMIT_LEDGER.json](LOCAL_COMMIT_LEDGER.json). The self-referential final report commit and its remote
mapping are recorded in [PR #238](https://github.com/djshellshoxxx/GhostPay/pull/238) after publication.

Remote candidate publication and remote main integration are separate actions. See [REMOTE_SHA_MAPPING.json](REMOTE_SHA_MAPPING.json);
the initial published mapping is independently verified. Main integration remains unperformed.
