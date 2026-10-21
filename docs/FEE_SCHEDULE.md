# GhostPay Fee Schedule and Revenue Architecture

**Status:** Normative for contracts, relayer and UI. Values marked **[OWNER]** are business decisions the project owner must confirm before any mainnet deployment.

## 1. Principles

1. **Disclosed.** Every fee is shown to the payer/seller in the UI before wallet confirmation and is readable on-chain. No hidden fees, no hidden recipients.
2. **Enforceable only where the code path is ours.** A fee is enforced by a contract only when funds pass through that contract. Direct transfers to a stealth address bypass it. Forks of the open-source client can remove client-side fees. The design never promises otherwise.
3. **Non-custodial, immutable.** Fee recipient and fee rate are `immutable` per deployment. There is no admin, pause, rescue, or fee-change function. A change means deploying a new contract and shipping a new deployment manifest.
4. **The owner's wallet is never hard-coded in source.** The fee recipient is a deployment-time constructor argument, recorded in the signed deployment manifest (`deployments/<chainId>.json`) and displayed by the UI from that manifest. Deploy with a hardware-wallet or multisig address, not a hot key. The recipient address is public on-chain by design.

## 2. Fee types

| ID | Fee | Charged by | Default | Enforcement |
|---|---|---|---|---|
| F-PAY | Checkout fee on payments routed through `GhostPayRouter` | Router contract, taken from the gross amount | **25 bps (0.25 %)**, floor-rounded | On-chain, immutable. Bypassed by paying the stealth address directly. |
| F-SPONSOR | Gas-sponsored sweep ("gasless sweep") | `GhostPaySweepRelayer`, taken from the swept token amount | `max(gasReimbursement × 1.10, 50 bps of amount)` capped at 300 bps **[OWNER]** | On-chain: the exact fee and `feeTo` are inside the stealth key's EIP-712 signature; contract cannot take more than signed. Rate policy lives in the relayer service and the client check. |
| F-SECURE | Flat fee for opt-in advanced security feature: policy-guarded stealth smart account (cold-destination allowlist, delay, limits, recovery) | `PolicyAccountFactory`, charged once at account creation | **Flat, denominated in the chain's stablecoin, default USD 3.00 equivalent** **[OWNER]** | On-chain at creation (immutable amount per deployment). |
| F-FREE | Local encrypted tagging, timing jitter, QR/wallet handoff, scanner, invoice creation | none | free | Client-only features cannot be charged enforceably; they stay free. |

> Assumption flagged for the owner: "the other security feature" was interpreted as the policy-guarded smart account (Playbook Proposal 3), the only security feature with an on-chain code path that can carry a flat fee. If a different feature was meant, F-SECURE moves there.

## 3. Math

- F-PAY: `fee = gross * 25 / 10_000` (floor). `net = gross - fee`. Dust payments (`gross < 400` base units) pay zero fee; the router still works. Fee-on-transfer, rebasing and callback tokens are rejected by balance-delta checks (the stealth address balance must rise by exactly `net`, the recipient balance by exactly `fee`).
- F-SPONSOR: `relayerFee <= amount - 1`. Contract rule: `amount > relayerFee`. The relayer quotes `relayerFee`; the client recomputes the policy locally and refuses a quote above the published cap.
- Native-token payments use the same bps; the fee is sent first to `feeRecipient`, remainder to the stealth address, both via checked `call` with gas stipend limits documented in the contract.
- Gas-buffer (Feature 1): the native buffer is passed through to the stealth address with **no fee**.

## 4. Where the numbers live

- Contracts: `FEE_BPS` constant (25), `feeRecipient` immutable.
- Client: `packages/chain-adapters/src/fees.ts` exports `FEE_SCHEDULE` and pure functions used for previews. A unit test asserts the client preview equals the contract result (differential test against the compiled router).
- Relayer: `apps/relayer` reads the same `FEE_SCHEDULE`; sponsorship quotes are single-use and expire.

## 5. Disclosure copy (required in UI)

> GhostPay charges 0.25 % on payments made through its checkout contract. The fee goes to `<feeRecipient>` (shown from the signed deployment manifest). Paying the stealth address directly costs no GhostPay fee.

## 6. Legal / compliance notes (owner action required)

Collecting a percentage of transactions can have money-transmission, sanctions-screening, tax and consumer-protection consequences that depend on the owner's jurisdiction. The project does not provide legal advice. Obtain counsel before mainnet; add a terms page and a sanctions policy decision (the contracts deliberately carry no blocklist, see ADR-0006).
