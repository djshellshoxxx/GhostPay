# Spec: policy-undo: Undo window for pending policy changes
Impact 2/5 | Effort L | Score 0.5 | Wave 1 | Depends on: sweep-guide
Built in: `packages/ux-flow` (`src/undo.ts`). Scope note: this module is the generic, chain-agnostic pending-change queue with a client-side undo window. The EIP-712 cancel typed-data / log decoding (`policy-ui-kit`, POLIC-1) is NOT built here: it needs contract fixtures from forge and a deployment manifest, and stays a follow-up.

## Problem
A user who changes a spending policy (limits, allowlist, delay) has no grace period to notice a mistake before it takes effect.

## Design
`UndoQueue` holds pending changes. Each has `activatesAt = createdAt + delayMs`. Cancel is allowed only while `now < activatesAt` (half-open: at the boundary it is closed). The clock is injected (`() => ms`) and clamped monotonic, so a clock rolled back cannot reopen or extend a window. After the window, caller calls `due()`, performs the real action, then `activate(id)`; once the on-chain effect lands, `markExecuted(id, ref)`. Activated and executed changes can never be cancelled by this queue.

States: pending -> cancelled | activated -> executed.

## API
`new UndoQueue(clock, {minDelayMs=1000, maxDelayMs=30d, maxPending=256})`; `submit({id, kind, summary, payload, delayMs})`, `cancel(id) -> {ok, change}|{ok:false, reason}`, `due()`, `activate(id)`, `markExecuted(id, ref)`, `remainingMs(id)`, `get`, `list`, `snapshot()`, `UndoQueue.restore(clock, data)`.
Cancel refusals: NOT_FOUND, WINDOW_CLOSED, ALREADY_CANCELLED, ALREADY_ACTIVATED, EXECUTED_ON_CHAIN.

## Requirements
1. **POLIC-A** MUST cancel succeeds iff status pending and now < activatesAt.
2. **POLIC-B** MUST Clock is injected; non-finite/negative clock values throw BAD_CLOCK; regression is clamped.
3. **POLIC-C** MUST Executed (and activated) changes are never undone; refusal names the reason.
4. **POLIC-D** MUST Input validation: id `[A-Za-z0-9_-]{1,64}`, kind `[a-z][a-z0-9._-]{0,63}`, summary 1..280, payload <= 4096, delay within bounds, unique id, pending cap.
5. **POLIC-E** MUST `restore` validates untrusted stored data field by field and status invariants (BAD_SNAPSHOT).
6. **POLIC-F** SHOULD UI states plainly that this is a local grace period, not an on-chain guarantee, and that cancelling an on-chain pending withdrawal needs the same key (POLIC-4 from original spec).
7. **POLIC-G (deferred)** Typed-data parity with CANCEL_WITHDRAW_TYPEHASH, block-timestamp countdown, manifest gating (original POLIC-1..3) remain with `policy-ui-kit`.

## Acceptance tests (`src/undo.test.ts`)
Boundary at activatesAt closed; cancel one ms before works; clock rollback cannot reopen; activate before due refused; executed -> EXECUTED_ON_CHAIN; snapshot round trip over all four states; 18 tampered snapshots rejected; property: `cancel.ok === (now < delay)`.
