# Buffered ERC-20 sweep acceptance — 2026-11-19

## Result and scope

The existing compiled router now has a native integration regression proving
that a fresh derived stealth signer can sweep its ERC-20 receipt using **only the
native gas buffer sent by the payer**. This closes the missing local acceptance
case F-CTR06 in `packages/chain-adapters/src/router.anvil.test.ts`; it does not
change the router or enable a new payment feature.

Requirement sources are [CONTRACTS_SPEC sections 1 and 3](../../CONTRACTS_SPEC.md)
and [gas-buffer specification section 4](../../specs/13-gas-buffer-v2.md). The
existing native router tests exercised ERC-20 and native fee boundaries, while
payment-evidence tests exercised receipt validation. Neither previously called
the buffered path and then signed a direct sweep using only its forwarded ETH.
The baseline was a missing acceptance test, not a reproduced runtime defect.

Branch: `chatgpt/ghostpay-buffered-sweep-20261119`. Base:
`cbed997a1fd8398975feac8fa23f9162a65f7e73`. The only package edit is the test file.
The fixture now retains its actual deployed announcer address in the manifest
so the added receipt assertions bind the real announcement. Existing tests and
their assertions are preserved.

## What the regression proves

The fixture funds only its deployer and payer. The newly derived stealth address
starts with zero ETH, zero tokens and nonce zero. Its private key is derived and
checked by the existing scheme-1 crypto helper, then used for local transaction
signing. The key is not sent to Anvil and the signer is not impersonated.

The exact signed raw ERC-20 transfer is first rejected for insufficient funds.
Balance and nonce remain zero. The payer then sends the actual
`payERC20WithBuffer` transaction built by the existing adapter, with preview and
calldata equality checked. The test verifies all of the following:

- The token debit equals the gross amount; the fee recipient receives the exact
  floor-rounded 25-basis-point token fee; the stealth address receives the exact
  token net and the entire ETH buffer.
- The native fee recipient balance is unchanged, so the buffer has no router
  fee. The payer's ETH debit equals the buffer plus actual receipt gas cost.
- Exactly one event from the deployed announcer binds scheme, stealth address,
  caller, ephemeral key and metadata. The metadata net equals the executed net.
- Resubmitting the **same signed raw transfer**, unchanged from the failed
  attempt, succeeds. The derived signer spends nonce zero exactly once.
- Its final ETH balance equals buffer minus `gasUsed * effectiveGasPrice`, with
  positive gas cost within the stated budget. Its token balance becomes zero;
  the destination gains exactly the net; fee-recipient tokens remain unchanged;
  the router retains neither ETH nor tokens.

The synthetic payment is 10,000,003 token base units: fee 25,000 and net
9,975,003. The buffer uses the existing `calculateBuffer` formula with 100,000
gas, a 2-gwei maximum gas price and the existing 20% margin, producing
240,000,000,000,000 wei. These are local fixture inputs, not new gas policy.
Owned temporary secret byte arrays are wiped in `finally`; JavaScript string
copies used by the local signer are not claimed to be erasable.

## Verification and independent review

All final checks bind test-source SHA-256
`b2cd4c75e69e6eae942389b408abae94c327ce812cb010a374612589d27229ec`.

| Check | Result | Evidence |
|---|---|---|
| Complete focused router Anvil file | 4 passed, 0 failed or skipped; 3.54 seconds | [Final native log](evidence/buffered-sweep-20261119/buffered-sweep-anvil-final.log) |
| Package TypeScript check | Exit 0 | [Typecheck log](evidence/buffered-sweep-20261119/buffered-sweep-typecheck.log) |
| Typed ESLint for the changed test file | Exit 0 | [Lint log](evidence/buffered-sweep-20261119/buffered-sweep-lint.log) |

The native invocation used `REQUIRE_ANVIL=1`, one worker and the existing 60-second
test timeout. Every command used a 768-MiB Node old-space cap and a separate
`flock --close` acquisition of the shared qualification mutex. The
[command receipt](evidence/buffered-sweep-20261119/buffered-sweep-checks.json)
retains actual arguments, source hash, timestamps, exit codes and log hashes.
The earlier four-test pass is also retained; final-source evidence is authoritative.

Anvil is 1.8.5, commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`. The reused
artifacts were compiled with solc 0.8.28, Cancun and optimizer 200 in the existing
deployment-policy worktree. Artifact/bytecode hashes and every metadata source
hash were checked against this worktree and recorded in the
[artifact receipt](evidence/buffered-sweep-20261119/buffered-sweep-artifacts.json).
No new contract compilation or full Foundry campaign is claimed.

Independent coordinator source review: **PASS**. The reviewer inspected the
whole fixture/process and final diff, confirmed only deployer/payer funding,
the zero-state negative control, identical locally signed transaction reuse,
real buffered payment, exact balances/event/gas/nonce assertions and absence of
signer impersonation. The review accepted the explicit disposable-Anvil scope.

This is local EVM acceptance using a standard mock token, not live-chain,
real-token, wallet/UI, OP Stack fee or full repository qualification. The builder
uses the existing 84532 configuration fixture, while signed transactions execute
on isolated Anvil chain 31337; router payment calldata has no chain-ID field.
No production allowlist, UI, feature flag, protocol, authority, fee, test timeout
or coverage threshold changed. The focused native command disables coverage;
no full-package coverage result is claimed.

[Machine-readable handoff](BUFFERED_SWEEP_20261119.json) records source identity,
review and all preserved evidence hashes. The separately requested independent
review of the coordinator's focus/lean-buffer tests is recorded in
[WEB_SCOPE_REVIEW_20261119.md](WEB_SCOPE_REVIEW_20261119.md).
