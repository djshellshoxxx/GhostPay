# Round-3 fix-commit audit: new and changed code

Scope: `git diff d81e468 HEAD -- packages apps ':!*.md'` (commits 50881e4, 29de09c, 365f017; the working tree has no
code changes). This is a read-only adversarial review. The PoCs live outside the repo in `/tmp/claude-0/audit-r3/`:
`c/test/AuditR3.t.sol` (forge), `ts/btc.poc.test.ts` and `ts/evm.poc.test.ts` (vitest).

Baseline: the whole forge suite passes (dev profile, 376 tests). Vitest passes for chain-adapters (270),
btc-silent-payments (308), policy-scheme (54) and relayer (200).

| ID | Sev | Status | Title |
|----|-----|--------|-------|
| NC-01 | Medium | CONFIRMED | EVM amount verification bypasses the two-provider model |
| NC-02 | Medium | CONFIRMED | One ERC-20 Transfer "verifies" any number of announcements to the same stealth address |
| NC-03 | Low-Med | CONFIRMED | BTC scanner reports one output key at several heights with fabricated outpoints |
| NC-04 | Low | CONFIRMED | Relayer per-client cap: trivial bypass with 2 IPs or an IPv6 /64, plus a TOCTOU overshoot |
| NC-05 | Low | CONFIRMED | Global `MAX_PRESIM = 8` lets one client starve admission for everyone (503 `busy`) |
| NC-06 | Low | CONFIRMED | M-03 waiver: a caller blacklisted by the fee token deploys fee-free |
| NC-07 | Low | CONFIRMED | Policy router dropped the on-chain zero-owner guard (funds can go to an undeployable slot) |
| NC-08 | Low | CONFIRMED | Fail-closed manifest readback is opt-in and not wired into the web app |
| NC-09 | Info | PLAUSIBLE | BTC `DEFAULT_MAX_BLOCKS` makes long adapter scans throw; the adapter has no verifier hook |
| NC-10 | Info | CONFIRMED | `lookupMeta` trusts a single RPC; the registry ABI is correct |
| NC-11 | Info | PLAUSIBLE | Pay.tsx generation guard does not stop the in-flight approval for the old invoice |
| R-01..R-05 | n/a | REFUTED | See the bottom of this file |

## NC-01 Amount verification uses only the primary RPC (Medium, CONFIRMED)
- File: `packages/chain-adapters/src/adapter.ts:264` passes `client` only. `verify.ts` calls `client.getLogs`.
- Evidence: the scan cross-checks `eth_getLogs` and block hashes across both providers when `secondaryClient` is set
  (`logs.ts` `getLogsAgreed`). The `Transfer` logs that move a direct payment from `claimed` to `verified` come from
  the primary provider alone. A malicious or compromised primary can therefore return a forged `Transfer` log (right
  token, topic, blockHash and txHash) for a real announcement and promote an attacker-chosen amount to `verified`.
  The announcement itself is still agreed by both providers.
- Fix: when `secondaryClient` is set, fetch the Transfer logs through `requestWithFallbackCheck` with a log
  projection, or require both providers to return the same verdict.

## NC-02 Double counting of Transfer logs (Medium, CONFIRMED, PoC `ts/evm.poc.test.ts`)
- File: `packages/chain-adapters/src/verify.ts:76-99`. The `seen` set is local to one call.
- Evidence: a payer can reuse the ephemeral key and call `announce` N times in one transaction, plus make one
  allowlisted transfer of X to the stealth address. Each announcement is verified on its own and returns
  `verified, amount = X`. The PoC verifies 3 announcements with one Transfer log, so the seller sees 3X "verified"
  (or 3 paid invoices). `DetectedPayment.id` differs per log, so consumer de-duplication by id does not catch it.
- Fix: attribute each Transfer log (`blockHash:logIndex`) to at most one announcement across the scan, for example
  with a shared `consumed` set in `scan()`. Alternatively, collapse announcements by (txHash, stealth) and mark
  extra ones `claimed`.

## NC-03 BTC: same key, different heights, fake outpoints (Low-Medium, CONFIRMED, PoC `ts/btc.poc.test.ts`)
- File: `packages/btc-silent-payments/src/scan/scanner.ts:103-108`. De-duplication is keyed on the oracle-supplied
  `txid:vout`.
- Evidence: TS-01 (several outputs with one key in one block) is now flagged with `duplicateKey`. But the oracle also
  supplies the tweaks, so it can replay a real (tweak, key) pair at a later height with a fabricated txid, vout and
  amount. The PoC gets two results: 400 / real txid and 401 / `3333..` / 50 BTC. Both have `duplicateKey: false` and
  `verified: false`. A BIP-352 output key cannot legitimately recur, because its inputs are spent. The adapter
  (`adapter.ts:111`) never passes a `verifier`, so every adapter result is unverified and outpoint spoofing is only
  closed for callers that supply one.
- Fix: de-duplicate by x-only key across the call (and persist that across calls), flagging repeats as
  `duplicateKey`. Expose `verifier` through `BitcoinAdapterDeps` and treat `verified: false` amounts as claimed in
  the UI.
- BIP-352 core: no regression. `scanTweakAgainstSet`, the label table and the k-loop are unchanged. Splitting
  candidates into lists preserves matching.

## NC-04 Relayer per-client lane cap (Low, CONFIRMED by code)
- File: `apps/relayer/src/service.ts:297-301`, `server.ts:167-176`.
- Evidence:
  - (a) The cap is 75% of `maxPending` per key, so two IPs fill the whole lane.
  - (b) The key is the raw remote address with no IPv6 /64 aggregation, so one host has 2^64 keys. The same gap
    applies to `ipLimiter`.
  - (c) The cap check (line 297) runs before `await this.preflight` and the increment (line 301) runs after it, so
    concurrent requests from one key all pass the check. The overshoot is bounded only by `MAX_PRESIM` (8).
- XFF: the new config rule (`config.ts`, `trustProxyHops > 0` requires a loopback `listen.host`) correctly closes
  direct XFF spoofing. With `hops > n` entries the code falls back to the proxy's socket address, which is one
  shared bucket (minor griefing).
- Fix: reserve (increment) before preflight and release on failure. Mask IPv6 to /64 (and IPv4 optionally to /24
  for the cap). Use a smaller share (for example `ceil(maxPending / 4)`) or fair queuing.

## NC-05 Global pre-simulation semaphore (Low, CONFIRMED by code)
- File: `apps/relayer/src/service.ts:85,316`.
- Evidence: `presim` is service-wide, not per client or per chain. Eight in-flight `eth_call`s from one client make
  every other request fail 503 `busy`. A slow RPC (or a chain under load) makes this cheap. Each request costs the
  relayer about 2 `eth_call`s plus a price lookup inside the lane, so there is no large amplification. In the
  breaker's open/half-open state any non-revert preflight error re-trips it at once, so an attacker who can trigger
  RPC errors keeps the breaker open.
- Fix: a per-chain semaphore with a per-client sub-limit. Queue briefly instead of failing immediately.

## NC-06 M-03 waiver triggered by a sender-side token refusal (Low, CONFIRMED, PoC `AuditR3Factory`)
- File: `packages/contracts/src/PolicyAccountFactory.sol:150-163`.
- Evidence: the waiver is meant for refusals caused by the recipient or the token. But balance >= fee and
  allowance >= fee also hold when the caller itself is blacklisted (USDC blacklists `from`). The PoC shows a
  blacklisted caller deploying with `FeeWaived` and paying nothing. Gas starvation cannot trigger the waiver (see
  R-03), and the factory, recipient and token are immutable or trusted, so this is limited revenue loss to
  sanctioned or frozen addresses. Revenue cannot be drained in general, and the waiver gives no griefing lever
  over other users.
- Fix (optional): probe the recipient instead, for example check that `FEE_TOKEN.transfer` of 0 to `FEE_RECIPIENT`
  fails, or accept and document the behaviour. Off-chain revenue accounting should index `FeeWaived`.

## NC-07 Zero-owner guard removed from the policy router (Low, CONFIRMED, PoC `AuditR3Router`)
- File: `packages/contracts/src/GhostPayPolicyRouter.sol:247`.
- Evidence: the old `_checkPolicyAccount` reverted on `owner == 0`. The salt-only version cannot, so the router now
  accepts payments to `predict(salt(0, h))`, which the factory can never deploy. The PoC shows the funds landing
  there and `factory.deploy(0, ...)` reverting, so the funds are frozen forever. Only payer error or a buggy client
  can cause this; the TS builder still rejects owner 0. Binding, owner and anti-front-run guarantees are otherwise
  unchanged: the old router also never verified `policyHash` or owner provenance. CREATE2 salts are keccak outputs,
  and `deploy` derives the salt from (owner, policy), so a squatter cannot initialise a slot differently. Hiding
  `policyHash` (N-01) works: before deployment, the salt reveals nothing beyond the address.
- Fix: document it as accepted, or keep an opt-in helper for payers. No cheap on-chain fix exists without the
  pre-image.

## NC-08 Readback not enforced by the app (Low, CONFIRMED)
- File: `apps/web/src/lib/pay.ts:133` calls `createEvmAdapter` without `readback`, so the "legacy trust manifest"
  path is the only one in use.
- Also: `verifyManifest` compares on-chain values against the manifest's own `bytecodeHashes`, and the manifest
  signature is not checked. It therefore only proves the chain matches the manifest, not that the manifest is
  authentic. The policy router address and its `FACTORY` are not read back at all (the manifest has no policy
  router).
- Logic otherwise fails closed: errors become `actual: 'error'`, `ok` requires every check, it refuses an empty
  client list or a wrong chain, and it refuses EIP-7702 designators and empty code.
- Fix: call `verifyManifest` (with two providers) before building payments, add the policy router plus a
  `FACTORY()` check, and pin the expected codehashes from the build.

## NC-09 BTC scan caps (Info, PLAUSIBLE)
- `scanner.ts:33`: an adapter `scan()` with a range larger than 200,000 blocks (for example from taproot activation,
  709,632, to the 2026 tip) now throws `INVALID_INPUT` instead of scanning. Callers must chunk the range. The
  BlindBit hardening is sound: https only (loopback http behind a flag), a streaming byte cap, a timeout, and a tip
  bound. When there is no stream, the `json()` fallback is uncapped, but only test fakes take that path.

## NC-10 Registry (Info)
- The ABI matches ERC-6538: `registerKeys(uint256,bytes)`, `registerKeysOnBehalf(address,uint256,bytes,bytes)`,
  `incrementNonce()`, `stealthMetaAddressOf(address,uint256)` returning `bytes`, `nonceOf(address)`, and the events
  `StealthMetaAddressSet(address indexed,uint256 indexed,bytes)` and `NonceIncremented(address indexed,uint256)`.
  Selectors do not depend on parameter names. The 66-byte spend||view layout matches ERC-5564 scheme 1. The
  canonical address is correct.
- `lookupMeta` (`registry.ts:114`) is single-RPC: a lying RPC can substitute a meta-address and redirect payments.
  Use two providers or signed invoice data (the code comment says so, but the API does not enforce it).
  `assertRegistryAvailable` fails closed, and `REGISTRY_CODEHASHES` is empty.

## NC-11 Pay.tsx stale-invoice guard (Info, PLAUSIBLE)
- `Pay.tsx:301`: `ensureAllowance` (an approval transaction) for the old invoice still runs if the fragment changes
  mid-prepare. Only `setBuilt` is guarded. A send already in the wallet prompt also completes for the old invoice
  (the user is told). The capped relayer response read and the error-shape parsing are fine.

## Refuted
- R-01: CREATE2 salt collision or griefing in the policy router. The router computes the same address as
  `Clones.predictDeterministicAddress(IMPLEMENTATION, salt, FACTORY)`, and the implementation is cached from an
  immutable factory field. No other deployer can occupy the slot, and a front-run `deploy` installs exactly the
  committed (owner, policy).
- R-02: forcing the fee waiver for an arbitrary caller. That needs a token or recipient refusal outside the caller's
  control, or the caller's own blacklist (NC-06).
- R-03: gas-starvation waiver. After an out-of-gas `transferFrom`, the remaining 1/64 of gas cannot pay for the
  cold `balanceOf` and `allowance` calls (their access lists are reverted), `CREATE2` and initialisation. The repo's
  sweep test agrees.
- R-04: ERC-6538 ABI mismatch (see NC-10).
- R-05: `trustProxyHops` XFF spoofing on a public listener. The new config check blocks it.
