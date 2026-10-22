# Vendored third-party Solidity (read-only, unmodified)

| Dir | Package | Version | License | Source | Files (sha256) |
|---|---|---|---|---|---|
| `poseidon-solidity/` | `poseidon-solidity` (Chance Hudson, repo `vimwitch/poseidon-solidity`) | 0.0.5 | MIT (SPDX header in every file and npm `license` field; the GitHub repo has **no LICENSE file**, HTTP 404 on `LICENSE` for `main` and `master`, checked 2026-10-21) | `npm pack poseidon-solidity@0.0.5`, tarball sha256 `e21e1b6f1cd0d95b321e9a1a69031b544b4966635eefdbeaacb0bd6ea9fb3517` | `PoseidonT2.sol` `0fca2b29e92dfc4c99b485a809856a41589c81cbf1c6e2470a7a3bd133fc1ad0`, `PoseidonT3.sol` `08a7493be37838166954af6c77d583d797cc17d37673196498fc70cbf557831c`, `PoseidonT4.sol` `289e22a19a20bcec7519e29d172b8c1624b65ac6140d1982fe029254e1600a8f` |
| `lean-imt/` | `@zk-kit/lean-imt.sol` (PSE / Ethereum Foundation) | 2.0.1 | MIT (`LICENSE` included) | `npm pack @zk-kit/lean-imt.sol@2.0.1`, tarball sha256 `582bcd76c855739bf18eeebb37777fb83c10706d359c192a04d45d45abf654d5` | `InternalLeanIMT.sol` `ccf7cd12afa1f10d1d7dc0872e87c36b7bda8acb99e8c2a033d50e28db18f824`, `Constants.sol` `7df874f2616822f56f17825241539bb928b9196226672eff2bf7cc71a52eb2c3` |

Use in this package:

- `PoseidonT3` / `PoseidonT4` are deployed **as standalone contracts** (their `hash` is a `public pure` library function
  whose assembly reads its input at memory `0x80` and ends with `return(0, 0x20)`, so it only works as an external call).
  The pool calls them through `IPoseidonT3` / `IPoseidonT4` with `STATICCALL`; it never links them, because a
  linked library call compiles to `DELEGATECALL` (checked with solc 0.8.28 `--opcodes`), which the package bar forbids.
- `InternalLeanIMT` is used **only by tests** as the differential reference for `src/lib/PoolLeanIMT.sol`
  (a port of its `_insert` / `_has` / `_root` that hashes through the immutable hasher address).
- OpenZeppelin 5.6.1 and forge-std are not copied; they are remapped read-only to `../contracts/lib`.

Upgrade procedure: replace the files from a new `npm pack`, update the hashes above, re-run `forge test`
(`PoseidonVectors.t.sol` and `LeanIMTDiff.t.sol` must stay green).
