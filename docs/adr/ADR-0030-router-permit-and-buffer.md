# ADR-0030: Router entry point `payERC20WithPermitAndBuffer`

Status: proposed (pre-audit; not deployed, not enabled in the app)

## Context
Spec 13 section 2. A payer who pays an ERC-2612 token through `payERC20WithPermit` needs no approval transaction, but a
payer who also forwards a native gas buffer (`payERC20WithBuffer`, so the seller can sweep the one-time address without
funding it from a linked wallet) had to approve the router in a separate transaction first: the two entry points were
mutually exclusive. The extra approval is a second on-chain action from the same payer to the same router, which both
costs gas and adds a public link between the payer and the payment. Spec 13 rejected the two-step alternative for that
reason and asked for a single call, gated on a CONTRACTS_SPEC change, fuzz and invariant coverage, re-audit and a new
deployment manifest.

## Decision
1. `GhostPayRouter` gains `payERC20WithPermitAndBuffer(token, stealth, gross, minNet, deadline, maxBufferWei,
   ephemeralPubKey, metadata, PermitSig permit)`, `payable` and `nonReentrant`. It is the composition of the two existing
   paths and introduces no new rule: buffer bounds (`BufferRequired`, `BufferTooLarge`) are checked first so that a refused
   call never consumes the permit nonce; then the zero-token and deadline checks; then the permit inside `try/catch` with
   the same front-run reasoning as `payERC20WithPermit` (a consumed nonce only makes the permit fail and the transfer
   reverts unless the allowance suffices); then the exact balance-delta ERC-20 transfer, the buffer forward with all
   remaining gas and the announcement. No fee is taken on the buffer and the router holds nothing afterwards.
2. The signature travels as a `PermitSig {v, r, s}` struct (one calldata word), not as three flat parameters: with the
   two dynamic `bytes` arguments the flat form has thirteen stack slots and the compiler rejects it as stack too deep
   without via-IR, which the project does not enable. The policy router and the sweep relayer already use a struct for the
   same reason, so the client builders have a precedent.
3. No new errors, events or storage. `NoDirectETH` and `BufferRequired` documentation names the new path.
4. Clients: `@ghostpay/chain-adapters` builds, decodes and re-encodes the method when a permit signature and a buffer are
   both supplied (previously an input error); `@ghostpay/tx-review` and the web transaction guard treat it exactly like
   `payERC20WithBuffer` (not reviewable, haiku L-04). The web app keeps using approval plus `payERC20WithBuffer` until it
   is wired to the new method against a deployment that has it.

## Consequences
- Deploying this requires a new router deployment and manifest version; existing deployments do not have the method and
  a client must not offer it unless the manifest's router bytecode hash names a build that does.
- The combined path reveals the same facts as the two separate paths (payer, token, amount, buffer, one-time address)
  in one transaction instead of two; it removes the approval transaction, not the public linkage of the buffer itself.
- Re-audit is required before any deployment: the unit, fuzz and invariant suites and the Echidna harness cover the
  new path, but the AI-assisted review is not an audit.
- The spec 13 anvil end-to-end sweep "using only buffered gas" runs through the new method against the compiled router
  (`packages/chain-adapters/src/buffer.anvil.test.ts`, CI with `REQUIRE_ANVIL=1`). Open: the web wiring.
