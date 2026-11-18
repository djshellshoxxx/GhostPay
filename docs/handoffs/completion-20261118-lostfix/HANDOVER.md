# Rows handed to other active claims (2026-11-18)

Source-pinned at `main` = `5467c158`. Each row below is missing there. The files belong to another active claim or
need an owner decision, so this run did not edit them. Rows 1 to 7 have a test that fails on `5467c158` because the
protection is missing; a second agent, told to refute each verdict, could not. Rows 8 to 12 were shown by an executed
failing test or direct evidence against the candidate `364b1f18` on 2026-11-11 and were rechecked by reading the code
at `5467c158`. This is AI-assisted review, not an independent professional audit.

How the rows were found: `evidence/scripts/lost-fix-scan.py` compares the lines every `fix` commit added with today's
file. Merge `84c2c185` (2026-10-22, 13 parents) took whole files from the side that did not have these fixes; no
commit reverts them on purpose (`git log -S` on the marker strings finds only the fix commit).

To use a failing test: copy `evidence/repro/<name>.txt` to the path in the table without `.txt`, run the command, and
delete the copy afterwards. Verdict details with file:line are in `evidence/dropped-fix-triage-main-2026-11-18.json`.

## Scheme 2 client library (`packages/policy-scheme/src/**`, PR #211 lane G1)

All five came with commit `b85e0b59` (audit round 3b). Exposure today is low: scheme 2 is behind
`VITE_GHOSTPAY_EXPERIMENTAL_POLICY`, is not in the lean build, and no contract is deployed. The contract re-checks rows
1, 3 and 4 on chain, so the result of the gap is an order that reverts, not a loss.

| # | Row | Missing at `5467c158` | Failing test (copy to) | Command | Reference |
|---|---|---|---|---|---|
| 1 | T-b85e0b59-3 | `decodePolicyPaymentCalldata` (`router.ts:162-189`) only decodes and checks the predicted account. No canonical re-encoding, no compressed-point check of `R`, no metadata checks (kind, token, net = gross minus fee, minNet). Corrupt metadata, another token's metadata, a wrong net amount, an uncompressed `R` and trailing bytes all decode. The web caller `paymentEvidence.ts:112,126-129` re-checks by itself; other library callers get nothing. | `packages/policy-scheme/src/repro.T-b85e0b59.3.test.ts` | `cd packages/policy-scheme && npx vitest run src/repro.T-b85e0b59.3.test.ts --coverage=false` (5 fail) | `git show b85e0b59 -- packages/policy-scheme/src/router.ts`, ported to today's `PolicyRef` ABI |
| 2 | T-b85e0b59-4 | `signPolicyTypedData` (`eip712.ts:337-342`) signs any self-consistent typed data: a foreign `Transfer` struct under domain `Evil` is signed with the owner key. The only caller passes builder output today. | `packages/policy-scheme/src/repro.T-b85e0b59.4.test.ts` | same pattern (1 fails) | `assertPolicyShape` in `b85e0b59` |
| 3 | T-b85e0b59-5 | `buildWithdrawTypedData` (`eip712.ts:229-231`) checks the proof against the root but never recomputes the leaf from token, limit and window: an inflated limit, another token's leaf and the root used as a leaf all build. | `packages/policy-scheme/src/repro.T-b85e0b59.5.test.ts` | same pattern (3 fail) | leaf equality check in `b85e0b59` |
| 4 | T-b85e0b59-6 | `getLimitProof` (`limits.ts:136-157`) trusts the stored leaf of a restored tree: a tree with an edited limit returns a proof. Web records are rebuilt on parse, so only direct library callers are affected. | `packages/policy-scheme/src/repro.T-b85e0b59.6.test.ts` | same pattern (1 fails) | recompute in `b85e0b59` |
| 5 | T-b85e0b59-7 | `checkScheme2Announcement` (`derive.ts:177-179`) copies the viewing secret before it validates `policyHashes` and the deployment address; a validation error leaves the copy unwiped. JavaScript wiping is best effort anyway. | `packages/policy-scheme/src/repro.T-b85e0b59.7.test.ts` | same pattern (1 fails; the test spies on `Uint8Array.prototype.set` and is fragile, read the code as well) | move the copy below the validation, as in `b85e0b59` |

Documentation dropped with them (T-b85e0b59-8): the "Trust notes" section of `packages/policy-scheme/README.md`
(the scheme 2 meta-address is unauthenticated; decode and sign caveats) and the note in `packages/core-crypto/README.md`
that announcement metadata is not authenticated.

## Scheme 2 router ABI (owner decision AUD24-01; contracts are PR #212 and #217)

| # | Row | State at `5467c158` | Failing test (copy to) | Command |
|---|---|---|---|---|
| 6 | T-50881e47-1, -2 | Commit `50881e47` (2026-10-21, audit N-01) made `GhostPayPolicyRouter` take a per-payment `bytes32 salt`, so the seller-constant `policyHash` never appeared in payment calldata, and updated `packages/policy-scheme` to match. Checkpoint `ecc29c1e` re-imported the older router and merge `84c2c185` took that tree. Today the router takes `PolicyRef{owner, policyHash}` again (`GhostPayPolicyRouter.sol:96,112,139,164`). This is the open item AUD24-01 / SEC-06. The point for the owner decision: the salt-only design already exists in history with its tests, and nothing records a decision against it. | `packages/contracts/test/repro.T-50881e47.1.t.sol`, `packages/policy-scheme/src/repro.T-50881e47.2.test.ts` | `cd packages/contracts && forge test --match-path test/repro.T-50881e47.1.t.sol` (2 fail); `cd packages/policy-scheme && npx vitest run src/repro.T-50881e47.2.test.ts --coverage=false` (1 fails) |
| 7 | T-50881e47-4 | Documentation drift from the same drop. `docs/developer/byte-layouts.md:100`, `docs/developer/contracts-reference.md:246` and `docs/developer/api/policy-scheme.md:156,162` still describe the salt ABI that the contracts no longer have. `packages/contracts/DEVIATIONS.md` stops at R9: the R11 to R13 decision text (requests never expire, front-run deploy, native alias double cap) is gone. `docs/CONTRACTS_SPEC.md:65` still says `policyHash` "does not reveal the destination" without the deploy-time caveat. | direct evidence | `grep -n "salt" docs/developer/byte-layouts.md` |

The fee waiver of the same commit (M-03) is present today in a stricter form (`PolicyAccountFactory.sol:114-163`); the
N1 residual is not a regression of it.

## Web hosting, transport and key management (PR #209 and PR #213)

| # | Row | Missing at `5467c158` | Owner |
|---|---|---|---|
| 8 | LF-6f25385ce-3 (Medium) | Pay and Sweep verify the deployment manifest on chain through one RPC client. `createReconciledClient` (`packages/chain-adapters/src/rpc.ts`) has no caller in `apps/web`; `getRpc` in `AppShell.tsx` returns only the primary client, and only Scan uses the secondary RPC. `docs/DEPLOYMENT_MANIFEST.md` still says an optional second RPC must agree when supplied. Either wire the second client into `verifyManifestForFlow`, or correct the document and the settings hint. | #209 lane B1 (`AppShell.tsx`, `lib/manifest.ts`) |
| 9 | R12-1 (Medium) | Same finding as SEC-10: the local-proxy scan mode accepts `http://127.0.0.1` endpoints that every shipped Content-Security-Policy blocks. | #209 lane B2 |
| 10 | LF-6f25385ce-4 (Low) | Build-time narrowing of `connect-src` to the configured origins (`GHOSTPAY_CONNECT_ORIGINS`) was dropped. | #209 lane B1 |
| 11 | LF-6f25385ce-5 (Low) | Content-addressed copy and SHA-384 SRI record for the embed SDK were dropped (same as SEC-43). | #209 lane B1 |
| 12 | LF-4ffb7a99b-4 (Low) | `derive()` in `packages/ux-vault/src/keystore-portable.ts:75` passes the UTF-8 passphrase bytes to scrypt inline and never wipes them; only the derived key is wiped. The earlier fix kept the bytes in a variable and filled it in `finally`. Residual value is small because the passphrase string itself cannot be wiped. | #213 (spec 18 reuses `derive`) |

## Not handed to anyone (open, low value, recorded so they are not rediscovered)

- LF-4ffb7a99b-1: `packages/chain-adapters/src/index.ts:8` exports the raw `signDigest`; the earlier fix exported a
  `signTransactionHash` wrapper instead. Defence in depth only; changing the export list touches every importer.
- LF-4ffb7a99b-2: `checkRelayerUrl` in `apps/web/src/lib/settings.ts` trims trailing slashes with `/\/+$/` and has no
  length cap; quadratic on a long run of slashes typed by the user (a stall of their own tab).
- LF-4ffb7a99b-5: in the full-profile Tags panel one damaged tag record makes the whole list an error
  (`TagVault.list` is all or nothing; the earlier `listReport` skipped and counted damaged records).
- LF-365f017ac-3: invoices carry `quote.maxSlippageBps`; it is shown to the payer and validated at creation, but
  never compared with a fresh price. The historical commit added only an unused helper. Whether to enforce it is a
  product decision.
