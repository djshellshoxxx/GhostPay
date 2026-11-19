# BTC, Solana and TRON caller review after consolidation

## Result and scope

No remaining confirmed runtime authorization regression was found in the reviewed non-EVM callers. The review began at combined BTC master `bd77aa273a5cd3846457edbd6bbeddaf9c52b84c`, included G5 master `0d0f4211f54131448212952da2b413dbb90ae243`, and inspected the only subsequent runtime change through `32573edb3f3a940180b5fb5a5e747c227e28608c`: the Esplora abort type repair. This is a bounded source review, not a full repository audit, build or typecheck.

The reviewer performed no installations, tests, source changes or remote mutations during this follow-up. Root owns the combined qualification runs. The earlier BTC candidate's 367 distinct focused passes qualify its recorded source pins and borrowed-dependency harness, not all later integration changes.

## Callers and request authority

| Caller | Reviewed request boundary | Preserved behavior |
|---|---|---|
| `apps/web/src/features/btc/BtcView.tsx` | `authorizedOperationFetch`, action `btc-scan` or `btc-sweep`, selected network, RPC prefix scope; selected oracle endpoints get indexer scopes using the same operation signal | Header checks, scans, fresh selected-output checks before signing, and broadcast use operation-scoped transport. Network revision, lock and replacement operations invalidate pending work. |
| `apps/web/src/features/solana/SolanaView.tsx` | `network.authorize`, `solana-scan` or `solana-sweep`, exact selected RPC endpoint and network, operation signal | Scan explicitly gets scan authority; review/sign/broadcast use sweep authority. Genesis/network refusal, pending-operation invalidation and secret cleanup remain. |
| `apps/web/src/features/tron/TronView.tsx` | `network.authorize`, `tron-scan` or `tron-sweep`, selected RPC prefix and network, operation signal | Scan explicitly gets scan authority; balance/memo/review/sign/broadcast paths preserve abort checks. Existing mainnet-genesis refusal remains; this review does not claim a newly added exact Nile/Shasta genesis proof. |

The production service constructor creates network authority and denies raw `fetchFn` dispatch. The `network === undefined` fallback in `networkOperation.ts` and injected component services supports tests; it is not the production constructor's network path. `networkOperation.ts` uses same-origin and path-boundary matching, chooses the most specific registered path, and disposes already-created contexts if later authorization fails.

The shared controller copies authorization inputs, binds them to the selected network/session/revision, and rechecks the selection at dispatch and response reads. Its protocol policy separates scan requests from transaction submission. This caller review complements the separate controller/defaultServices/EVM review; it does not replace that review or its regression evidence.

## BTC consent, state and signing

The main-thread worker client captures `request.providerSpentCheck === true` before invoking the worker factory. The same immutable primitive controls source dispatch and result acceptance. The bridge rejects per-outpoint requests without consent before calling its source. Later mutation of the caller object cannot broaden this permission. Light mode requires explicit opt-in; it does not force the checkbox or manufacture permission.

The selected per-output coverage representation, legacy-global-coverage-as-unknown rule, unknown output presentation, range and header validation, empty-result anchors, complete spend-list validation and rollback handling remain the same as the reviewed BTC candidate. Unknown outputs remain visible but are not silently marked unspent. Existing TM13 local positive spend detection and the separately disclosed fresh selected-output `isUnspent` check before signing remain intact. No secret key is added to network requests or worker source-dispatch messages.

Esplora still derives spent prevouts from the serialized transaction's committed inputs before skipping transactions that cannot yield a BIP-352 tweak. Contradictory uncommitted coinbase metadata is rejected. The valid untweakable-input regression separately retains the committed spend evidence case.

## Confirmed type issue and repair

The merged Esplora request method initially compared `signal?.aborted === true` directly before an await and again in catch. A source-review concern about stale TypeScript narrowing was confirmed by root's TypeScript 5.9.3 probe as TS2367. Commit `b90ab48909b5ce3121bea33b56fba71bfbf3c54a` replaces those direct comparisons with calls to an `assertNotAborted` closure.

The reviewed repair calls that closure before dispatch and first in catch. It retains live abort observations, `boundedRequest`, response-size limits, local `EsploraHttpError(status)` propagation and sanitized transport errors. Root's paired minimal GREEN compiler probe returned zero. This establishes the narrow control-flow repair; it is not a full web typecheck.

Source and compiler evidence are committed under `docs/consolidation/master-20261118/ESPLORA_ABORT_TYPE_REPAIR.md`, `esplora-narrowing-probe.ts.txt`, `esplora-narrowing-red.txt`, `esplora-narrowing-green.ts.txt` and `esplora-narrowing-green.txt` at `32573edb`.

## G5 compatibility and package boundary

The `bd77aa27..0d0f4211` G5 change does not modify `apps/web/src`. Web Solana still imports `@ghostpay/solana-stealth`; web TRON still imports `@ghostpay/tron-adapter`. There is no new web import of `chain-solana` or `chain-tron`, no new route activation and no new path around browser network authority.

G5 changes the CLI-side codecs to the existing web formats: `st:sol:` with cluster binding and the base58 `gpst1:` memo, and `st:trx:` with the existing TRON announcement format. The new interoperability tests exercise this alignment and explicitly reject retired CLI formats. The preexisting `packages/solana-stealth/README.md` statement that the packages are not interoperable is therefore stale after this integration; it should be reconciled with the qualified alignment and documented stricter CLI cases. That documentation mismatch does not change dispatch behavior.

The new `chain-solana/src/interop.test.ts` and `chain-tron/src/interop.test.ts` load sibling web sources via computed file URLs. They do not introduce bare package imports requiring sibling `dist` during these tests. `chain-tron`'s bare `@ghostpay/core-crypto` import is already declared in its package dependencies. `scripts/build-workspaces.mjs` visits dependencies, development dependencies and optional dependencies before consumers, so the declared core edge is ordered before `chain-tron`. Both package build configurations exclude test files. These are repository-local differential tests; their source-loading design is not evidence that packed standalone packages contain sibling source.

The vector generator explicitly imports sibling `dist` files. Its header already documents building `core-crypto`, `solana-stealth` and `tron-adapter` first, followed by the generator command. The committed package map matches the existing declared edges; the differential source imports do not require new bare-package edges. No missing generator prerequisite was found and no dependency was added speculatively. A separate, unapplied documentation patch, `history-solana-compatibility-docs.patch`, corrects the stale interoperability paragraph without changing the frozen master worktree.

## Evidence locations and limits

The exact reviewed paths and findings are indexed in `history-non-evm-authorization-review.json`. Review references are Git commit/path pairs so the source remains reproducible after master advances. No full dependency install, package build, browser run, live network transaction, external node validation or full workspace typecheck is claimed here.
