# Policy accounts (experimental)

> **Experimental and not available in the app or relayer (ADR-0014).** Contracts (`PolicyAccount`, `PolicyAccountFactory`) and a client library (`@ghostpay/policy-scheme`) exist and are tested locally; nothing is deployed and nothing has been independently audited. Do not use with real money.

## The idea

A normal one-time address is a plain key: whoever holds the key can send the funds anywhere immediately. A **policy account** is a small contract owned by that key, with rules fixed at creation:

- funds can only ever go to one **destination**;
- every withdrawal waits a **delay** (1 second up to 30 days) before it can be executed;
- optional **per-token caps** over a rolling window.

A thief who steals the key cannot redirect the funds before twice the delay has passed, and cannot drain them faster than the caps allow. This is a delay, not protection forever: the thief holds the same key, can cancel your actions and can propose a new destination again and again. Your funds stay safe only while you (or a watcher you trust) cancel each of the thief's destination proposals in time, so watch the account and move future payments elsewhere.

![Policy account timelock: withdraw waits one delay, destination change waits twice the delay, owner can cancel in between](../assets/diagrams/policy-account-timelock.svg)

## How it behaves

| Action | What happens | Wait |
|---|---|---|
| `requestWithdraw` | Owner signs an EIP-712 message; anyone may submit it | Starts the delay |
| `executeWithdraw` | Anyone may call; funds go only to the destination, within caps; a request made before a destination change cannot execute (cancel and request again) | After the delay |
| `cancel` | Owner signature cancels the pending request | Before execution |
| `proposeDestination` | Owner proposes a new destination | Starts a 2 x delay timer |
| `executeDestinationChange` / `cancelDestination` | Apply or cancel the change | After 2 x delay / before |

The contract has no admin, no upgrade path, no generic `execute` and no `delegatecall`. Limits cannot be changed after creation. Caps are conservative: after spending a full cap the next spend can be delayed by up to two windows.

## What it does not do

- **It is not privacy.** The destination is fixed in advance, so the link from the account to that destination is permanent and public (audit D6).
- **It only helps if someone watches.** You must notice a malicious request and cancel it inside the delay. If you do not monitor the account, the delay only slows things down.
- **The key still matters.** Anyone with the owner key can also sign cancels or proposals; the design relies on you acting first.
- Creating one costs a flat stablecoin fee (design value USD 3.00 equivalent, owner to confirm). See [Fees](../user/fees.md).
- Scheme id `0x47500002` uses its own meta-address format (`st:eth:gp2:...`); the app does not create or scan these.

Planned vs built: contract and library built; app, relayer and registry support planned, not built.

Related: [Sweeping safely](sweeping-safely.md), [Privacy checklist](privacy-checklist.md), package notes in `packages/policy-scheme/README.md`.
