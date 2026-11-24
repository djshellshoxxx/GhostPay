# F02 offline merchant proof qualification

Draft child of [#550](https://github.com/djshellshoxxx/GhostPay/pull/550), on `qualification/f02-merchant-catalog-auth-provider`. Parent `974fe2ce363e6d7644e3d4f080a98d6f37b68e35` supplies the catalog decoder and cart reviewer. The branch started from that exact parent, with main observed at `e0cb4681e453af77bb10be45ba61b4d19579f41b`.

## Consumer contract

F08 must authenticate a merchant signature over the complete canonical catalog commitment. The verified result carries its full merchant fingerprint and catalog digest. The independent merchant pin comes from local trust state. The F02 fixture passes the verified digest to the existing cart reviewer, which checks the body, cart, time, prices and delivery terms. The fixture compares both the verified signer and the merchant named in the reviewed catalog against the independent pin before returning a review. A failed verification produces no review.

The two added TypeScript files are under `apps/web/src/test/`. Ephemeral Ed25519 signatures, the public-key fingerprint derivation, and proof objects are private to the fixture. Production requires a reviewed F08 catalog-attestation format, canonical fingerprint rules and adapter. The [F08 specification](https://github.com/djshellshoxxx/GhostPay/tree/50ea73dcf3d4e9593da780ffb34bdfce60a90a15) describes identity and profile verification. The existing merchant profile signature covers its closed profile schema. A profile alone cannot attest catalog terms. UI, payment, fulfillment and release activation remain gated.

## Evidence

Source `9d4dc76a0141879018560e923e9f6dd827d3e615`, tree `64d26916ff1764be9ee8aaa0d47d72d19daae860`. A separate worker reviewed the source and reran the two suites at this SHA. The following command runs from `apps/web`.

```sh
../../node_modules/.bin/vitest run src/features/future/ghoststore/catalog.test.ts src/test/ghoststoreMerchantProof.test.ts --maxWorkers=1 --coverage --coverage.include=src/features/future/ghoststore/catalog.ts
```

All 41 tests passed, including 35 parent cases and six new contract cases. The focused report covered all 72 statements, 98 branches, 12 functions and 59 lines in the catalog module. Fast-check ran 128 generated quantity/expiry cases with seed `20261123`; no counterexample was observed. The negative controls cover changed delivery with a matching changed cart, another valid issuer signing the same digest, a valid signature on a catalog naming another merchant, an invalid signature, and inclusive expiration. The positive control compares the entire result to the ordinary cart review and checks an exact subtotal above JavaScript's safe integer limit.

Changed-file TypeScript and type-aware ESLint passed using the repository compiler/rules with a file-scoped project. ESLint passed on retry with a 320 MiB Node heap after the first process exited 137. The repository secret scan, pinned Actions guard, Solidity transaction-origin guard, and `git diff --check` passed. The environment's fresh offline installation exited 137. Qualification reused a local installation with a byte-identical lockfile, rebuilt address-safety, and used existing library artifacts from source-equivalent workspaces for test configuration. Whole-web builds and browser workflows were outside this isolated qualification.

The F02 owner can compose the real adapter when F08 supplies its attestation, then rerun these controls with that provider and current trust/expiry state. Independent source review and hosted checks on each composed tree remain integration gates. The parent [Pages workflow](https://github.com/djshellshoxxx/GhostPay/actions/runs/45312478199) and [CI workflow](https://github.com/djshellshoxxx/GhostPay/actions/runs/45312478257) were queued at inspection. Its [Beta acceptance job](https://github.com/djshellshoxxx/GhostPay/actions/runs/45312478107/job/138171344091) succeeded.
