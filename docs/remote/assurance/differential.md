# Differential testing report

Branch `claude/remote-extensions-1`, 2026-10-21. No repo source, test or config was modified. All harness code lives in `/tmp/claude-0/assure-differential/` (copies of `packages/btc-silent-payments`, `packages/policy-scheme`, `packages/core-crypto`, `packages/contracts` under `w/`; `node_modules` symlinked to the repo root; Foundry out/cache in that directory; scratch `foundry.toml` points `solc` at `/tmp/claude-0/tools/solc/solc` 0.8.28 because the committed path `/home/user/tools/solc` does not exist in this sandbox, and has `fs_permissions` for `./diff`).

## Result

**No divergence found in any of the four areas.** Severity-ranked findings: none. Two harness weaknesses were found and fixed by mutation testing (see "Harness sensitivity").

| Area | Reference | Volume | Divergences |
|---|---|---|---|
| BIP-352 send / scan / label / spend-key | pure Python (own secp256k1, tagged hashes, bech32m), written from the BIP text | 3060 random txs (60 + 30x100), 6913 outputs found by the receiver (4636 labelled) | 0 |
| BIP-352 spend tx (`buildSpendTransaction`) | Python BIP-341 sighash + BIP-340 verify, own tx parser and vsize | 750 random cases (5 seeds x 150): 619 signed txs, 131 expected-failure decisions | 0 |
| Stealth derive/scan (core-crypto scheme 1, policy-scheme scheme 2) | independent noble + viem path (sender-side `r*Pview` vs viewer-side `v*R`, `privateKeyToAddress`, viem `getContractAddress` CREATE2 with the EIP-1167 bytecode, hand-built meta-address) | 600 random key sets / ephemerals | 0 |
| GhostPayRouter, GhostPayPolicyRouter, GhostPaySweepRelayer, PolicyAccount, PolicyAccountFactory fee / nonce / limit / timelock logic | Python state-machine model (`model.py`) driven by random op sequences against the real contracts in forge | seeds 100-129 x 4 scenarios, about 125,000 ops (router 30,090; sweep 30,210; policy 35,514; factory 30,060), plus seeds 1-21 earlier | 0 |

## 1. BIP-352 (btc-silent-payments)

Reference: `ref.py` (own affine secp256k1, `th()` tagged hash, `sender_outputs`, `receiver_scan`, BIP-340 verify, BIP-341 sighash, bech32m). Sanity of the reference itself: it reproduces all 22 sending vectors of `test-vectors/send_and_receive_test_vectors.json` that use only eligible inputs (compared as sorted output sets; the other 6 sending vectors involve ineligible inputs and were not fed to it).

Generator `gen_btc.py` (seeded Python `random`) per case: random scan/spend secrets, 0 to 3 labels from {1,2,3,5,7,100,255,65536,2^32-1}, 1 to 5 inputs of random type (P2WPKH, P2PKH, P2SH-P2WPKH, P2TR with optional annex, P2WSH as ineligible), shared or distinct txids, vouts including 255/256/65536 (byte-order vs integer ordering of `outpoint_L`), 1 to 5 recipients mixing plain, labelled, change (m=0) and foreign addresses, repeated addresses (k counter). Expected values computed by Python: bech32m addresses, sender output x-only keys, receiver finds (k, label, tweak) and normalized spend private key.

TS side `w/btc/src/diff.test.ts` checks: address decode/encode round trip, `createSilentPaymentOutputs`, `scanTransaction` (via real `TxInput` scripts/witnesses, so `extractInputPublicKey` and `computeTransactionTweak` are exercised) with `createLabelTable`, and `spendPrivateKey` equality (value and x-only key). Cases where every input is ineligible: both sides must fail (`toThrow` on TS; 125 such cases).

Input mix over the 3000 batch cases: p2tr 2974, p2sh 1557, p2wpkh 1533, p2wsh 1467, p2pkh 1408.

Spend: `w/btc/src/diffspend.test.ts` builds txs with `buildSpendTransaction` from random spendable outputs (1 to 4 inputs, sweep to SP or P2TR, or fixed-amount payments of 1 to 3 destinations, optional SP or P2TR change, fee rates {0.5,1,1.5,2.25,3.3,10,100}, RBF on/off). `verify_spend.py` independently checks: input order/outpoints, empty scriptSig, sequence (0xfffffffd / 0xfffffffe), version 2 / locktime 0, one 64-byte witness element per input, **BIP-341 SIGHASH_DEFAULT sighash + BIP-340 signature valid for every input**, SP destination and change output keys (recomputed with the Python sender over the normalized input keys), P2TR destination scripts, amounts, `fee = sum(in) - sum(out)`, `vsize` equal to the vsize computed from the raw tx and from a closed-form formula, and the fee/change/dust/INSUFFICIENT_FUNDS/FEE_TOO_HIGH decision re-derived independently (131 failure expectations matched: 129 INSUFFICIENT_FUNDS, 2 FEE_TOO_HIGH; DUST_OUTPUT was not produced by the generator).

Repro (from `/tmp/claude-0/assure-differential`):
```
python3 gen_btc.py 1 60 $PWD/c1.json
(cd w/btc && CASES=$PWD/../../c1.json npx vitest run src/diff.test.ts --coverage.enabled=false)
python3 gen_spend.py 2 150 $PWD/s2.json
(cd w/btc && SPEND_IN=$PWD/../../s2.json SPEND_OUT=$PWD/../../s2.out.json npx vitest run src/diffspend.test.ts --coverage.enabled=false)
python3 verify_spend.py s2.json s2.out.json
```
Mutation check of the harness: removing the taproot negation (`if (k.isTaproot && !hasEvenY(...)) d = n - d`) in a scratch copy of `sender.ts` makes `seed=1 ci=0` fail immediately.

## 2. Stealth maths (core-crypto, policy-scheme)

`w/ps/src/diff.test.ts` (600 iterations, OS RNG): for each fresh key set and a scripted ephemeral `r`:
- `S = r*Pview` equals `S' = v*R` (R from `deriveStealthPayment`); `viewTag == keccak(S)[0]`; ephemeral pubkey equals `getPublicKey(r)`.
- `stealthAddress == viem.privateKeyToAddress((spend + keccak(S) mod n) mod n)`; `deriveStealthSecret` returns exactly that scalar; `checkAnnouncement` matches, and rejects a flipped view tag and a foreign key set.
- Scheme 2: `computePolicyHash` equals viem ABI-encoded keccak; meta-address string equals a hand-built `st:eth:gp2:0x<spend><view><policyHash>`; `ownerAddress` equals the scheme-1 address for the same `r`; `accountSalt` equals the ABI-encoded keccak; `predictAccountAddress` / `accountAddress` equal viem `getContractAddress({opcode:'CREATE2', from: factory, salt, bytecode: 0x3d602d80600a3d3981f3363d3d373d3d3d363d73 || impl || 0x5af43d82803e903d91602b57fd5bf3})`; `checkScheme2Announcement` finds the right policy among decoys and rejects scheme id 1 and a wrong policy list; `deriveScheme2OwnerKey` key maps (viem) to `ownerAddress` and equals the scheme-1 scalar.
Result: 600/600 pass (about 50 s). Note: the repo's own `core-crypto/src/differential.test.ts` already compares against `@scopelift/stealth-address-sdk`; this run is a separate, structurally different path.

Repro: `cd w/ps && npx vitest run src/diff.test.ts --coverage.enabled=false`.

## 3. Contracts vs Python model

Method: `model.py` is a Python state machine written from the NatSpec and behaviour (not from the Solidity text): ERC-20 with allowances, per-owner nonce sets (as sets, not bitmaps), rolling-window limit buckets, timelocks, fee `gross*25//10000`, error selectors computed with Keccak in Python. `gen_*` produce seeded random op sequences with boundary-biased choices (deadline = now / now-1, exact `executeAfter`, window bucket edges, nonces across 256-bit word edges 250..262 and 2^255, `2^256-1` amounts to hit the checked-overflow `Panic`, max allowances, allowance/balance shortfalls). Op files are JSON; `w/ct/test/DiffModel.t.sol` and `DiffPolicy.t.sol` replay them against the real contracts with `vm.warp`, `vm.sign`, low-level calls and log counting, write one line per op (revert selector, or 0, plus a state snapshot), and `cmp.py` diffs against the model. `posthoc.py` additionally recomputes in Python from the deployed addresses: the policy-router predicted CREATE2 address, every Sweep EIP-712 digest (260 per run), every Withdraw / ProposeDestination struct hash, and the Merkle root of the 4-leaf limits tree.

Scenarios and what is compared (status = revert selector, 0 on success):
- router: GhostPayRouter and GhostPayPolicyRouter `payERC20`, `payNative`, `payERC20WithBuffer`; check order, 25 bps fee, `minNet`, deadline, stealth exclusions (zero, fee recipient, router itself), ephemeral key shape, 57-byte metadata variants, buffer rules, `NotPolicyAccount`/`ZeroAddress` policy ref, allowance/balance reverts after the fee leg, overflow Panic; balances of 7 accounts (token and ETH) and announcement count.
- sweep: `sweep` check order (Expired, InvalidAmount `amount <= fee`, ZeroAddress, SelfAddress, bad signer, high-s malleated signature `ECDSAInvalidSignatureS`, NonceAlreadyUsed with the 256-bit word bitmap), dest == owner and feeTo == dest balance-delta reverts, 3 owners, balances and `nonceUsed`.
- policy: `requestWithdraw` (leaf mismatch, corrupted proof, zero leaf, bad signer, zero-window finite limit, over-limit), `executeWithdraw` (timelock inclusive boundary, two-bucket sliding window, native and ERC-20 shortfalls), `cancel`, `proposeDestination` (2x delay, pending guard), `executeDestinationChange`, `cancelDestination`; full account snapshot incl. `windowState` and request status.
- factory: `deploy` (ZeroAddress, InvalidDelay > 30 days or 0, DelayTooShort < 1h, AlreadyDeployed per (owner,dest,delay,root), flat 3e6 fee leg with allowance/balance reverts), returned address == `predictAddress`, initialized fields.

Status variety over seeds 100-129 (model-expected, which equals actual): router 14 distinct statuses, sweep 11, policy 17 incl. `WinLimit` 249, `Timelock` 999, `BadProof` 277; factory 7. Thin spots: policy `InsBal` 42, `NativeFail` 1; `WindowMismatch` is unreachable with fixed leaves.

Repro: `./loop.sh 100 129 1000` (runs generate, `forge test --match-contract "DiffModel|DiffPolicy"`, `cmp.py`, `posthoc.py` per seed; prints nothing but `seed N` when clean; `final_loop.log`). Needs `PATH=/root/.local/bin:$PATH`, `FOUNDRY_OUT`, `FOUNDRY_CACHE_PATH` (set inside `loop.sh`) and `pip install pycryptodome`.

### Harness sensitivity (mutations applied to the scratch copy of `src/`, reverted afterwards; `diff -r` against the repo confirmed identical)
Detected: `FEE_BPS` 25 to 26 (router); sweep `amount <= fee` to `<`; `_consume` previous-bucket carry replaced by `previous = current`; nonce word shift `>> 8` to `>> 7`; factory `delay < MIN_DELAY` to `<=`; `executeDestinationChange` timelock `<` to `<=`; window `amount > limit - used` to `>=`; propose `2*delay` to `delay`.
First round **missed** `executeWithdraw` timelock `<` to `<=` and window bucket `(timestamp+1)/window`, because the generator never executed exactly at `executeAfter` or on a bucket edge. Fixed by boundary warps followed by executes; both are now detected (the `executeWithdraw` boundary mutant shows 833 divergent ops on seed 3). One further mutant (`bucket <= s.bucket + 1`) is an equivalent mutant (time cannot go backwards) and is correctly undetected.

## Could not run / not covered
- `sweepWithPermit` and `payERC20WithPermit` (permit tokens), fee-on-transfer, blacklist, reentrant and no-return tokens: not modelled; covered only by the repo's own tests.
- PolicyAccount with `limitsRoot == 0` (unlimited account) and multi-account interleavings: not generated.
- `executeWithdraw` insufficient-funds and native-failure paths are rarely hit (1 `NativeFail` in 35k ops).
- BIP-352: ineligible input kinds beyond P2WSH (uncompressed keys, NUMS script-path, future segwit versions, malleated P2PKH), K_max = 2323, testnet HRP and version > 0 addresses were not randomised; they remain covered by the BIP vectors already in the repo. The BIP's own `reference.py` was not executed (needs the vendored `secp256k1lab`; I wrote an independent implementation instead and validated it on the BIP vectors).
- No contract-vs-TS (`policy-scheme` calldata/ABI builders) differential; `policy-scheme/src/anvil.test.ts` exists but was not run here.
- Forge fuzz with the model inside Solidity and anvil+cast replay were not used; forge scripted replay was used instead.
- The committed `packages/contracts/foundry.toml` points to `/home/user/tools/solc`, which is absent here (informational, environment only).
