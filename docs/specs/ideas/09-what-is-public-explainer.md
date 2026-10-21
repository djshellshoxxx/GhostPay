# 09 Interactive "what is public" explainer and sandbox (idea E1)

Status: proposed, not built | Priority: P3 (can run in parallel with anything) | Effort: S-M (about 6 engineer-days) | Owner: WEB, DOC | Branch `claude/remote-extensions-3`, 2026-10-21
Deps: none hard. Reads `docs/user/privacy-limits.md` as source of truth; reuses `packages/core-crypto`, `packages/chain-adapters` (metadata/fee encoders), `apps/web/src/lib/scannerCore.ts`. Sources: `docs/remote/ideas.md` E1 (the original proposal used Sepolia and a faucet, which this spec **replaces** because it needs the network).

## 0. Constraint and redesign

100 percent client-side, **no network at all** while the explainer runs: no RPC, no testnet, no faucet link, no analytics, no fonts/CDN, no wallet. The idea as first written (two tabs playing on Sepolia) is rejected: it needs an RPC provider and a faucet (third parties, IP exposure, and an operator-adjacent dependency for funds).

Redesign: real GhostPay cryptography and real message formats, run against a **deterministic in-memory chain simulator** that lives in the bundle. Anvil is used only at development time to generate and verify fixtures (section 5.3). Running a real EVM in the browser (for example an ethereumjs VM with the router bytecode) is explicitly deferred: it adds a heavy dependency and still would not teach anything the simulator does not (UNVERIFIED size/benefit; revisit only if the router logic itself is to be demonstrated).

## 1. Goals and non-goals

Goals
1. In under 5 minutes a person sees, with their own clicks, exactly what a chain analyst, the payer, an invoice-link holder, the relayer, the RPC provider and the static host can and cannot learn at each step (invoice, pay, scan, sweep).
2. Make the limits memorable: payer can follow the sweep; router use is enumerable; amounts, token and timing are public; reused destination links everything.
3. Zero risk: no real keys, no real funds, no persistence, cannot be confused with the live app.
4. Content cannot drift from `docs/user/privacy-limits.md`: a test ties the observer table to that file.

Non-goals
- Not a security tutorial for key handling, not a testnet faucet or deployment, not a performance benchmark. No gamified "privacy score". No claims of anonymity, ever. It does not simulate adversaries who correlate off-chain data (IP logs joined with chain data), it only labels them.
- Not a replacement for anvil e2e tests (those live in `apps/relayer/src/e2e.anvil.test.ts`).

## 2. UX

Entry points: new top-level view "Learn" (route registered like the other views, `apps/web/src/views/Learn.tsx`), a link from Home, the Sweep page notice ("See what this reveals") and About. Banner on every screen of the view: "Simulation. Keys here are random, exist only in this tab and are worthless. Nothing leaves your browser."

Layout (mobile first): left "Your tab" (role switch Seller / Payer), right "Who sees what" panel with tabs per observer: **Chain analyst**, **The payer**, **Holder of the invoice link**, **Relayer**, **RPC provider**, **Web host**. Each tab has two lists: "Sees" and "Does not see", each item linking to the step that produced it. A timeline scrubber replays the 10 scripted steps; Back/forward are pure functions of simulator state, so scrubbing is deterministic.

Scripted lesson (guided, each step has a "why this is public" sentence):
1. Seller makes a meta-address (real `core-crypto`). 2. Seller creates an invoice (link `...#fragment`, shown with the host-never-sees-fragment explanation). 3. Payer pays through the simulated router: simulator emits the real 57-byte metadata layout and announcement log. 4. Analyst panel: lists every router payment, amount, token, payer; the one-time address is visible but not tied to a seller. 5. Seller scans with the real `scannerCore` over simulated logs (view tag skips ~255/256 of later point operations; the log download is unchanged). 6. Seller sweeps: choose destination. 7. **Mini-challenge A**: sweep to a fresh address vs. a destination reused from a "main wallet": the analyst and payer panels show the link `payer -> one-time -> destination`. 8. **Mini-challenge B**: relayer vs. direct: relayer tab shows owner, destination, amount, fee, hashed IP, timing; direct shows the funding wallet link. 9. Two-invoice view: anyone with two invoices sees the same meta-address (motivates per-client addresses, idea A2). 10. Summary table = privacy-limits observer table, with the "what to do next" links into the real guides.

Free-play sandbox: "Add payment" with amount/token controls, several payers, a second seller, "run analyst clustering" button that applies only the deterministic heuristics in section 4.3 and shows which links it finds and which it cannot.

Accessibility: every panel keyboard reachable, ARIA live region announces new observer facts, no colour-only distinctions, reduced-motion respected. Strings in a single module (`learn/strings.ts`) for future i18n; forbidden words lint: "private payments", "anonymous", "untraceable", "hidden from everyone".

## 3. Safety rules (the sandbox must not be mistakable for production)

- Simulated chain id `0x5a5a5a5a` (decimal 1515870810, a value not used by any chain in `packages/chain-adapters/src/config`); a unit test asserts it is not in the adapter tables and that `createPayContext`, `directSweep` and wallet code reject it.
- The Learn module imports **no** wallet, RPC, `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon` or `idbStore`/`keystore` code. Enforced by an ESLint `no-restricted-imports` override for `src/learn/**` and by the existing `scan-bundle` worker/network scans extended with a Learn-chunk check (the Learn code is lazy-loaded as a separate chunk, so its imports are auditable).
- Keys: `crypto.getRandomValues` -> `core-crypto` -> held in a closure; zeroized on route exit; never written to storage; never displayed as "your key"; addresses displayed carry a "SIM" prefix chip.
- No clipboard writes of sandbox invoices that look like real links: the sandbox invoice link has host `ghostpay.invalid` (reserved TLD per RFC 6761 -> RFC 2606) and scheme markers so the real Pay view refuses it.
- Persistence: none (not even localStorage). Reload resets.

## 4. Formats, APIs, types

### 4.1 Simulator (`apps/web/src/learn/sim/`)
```ts
export interface SimChain {
  readonly chainId: 1515870810;
  height: number; time: number;                       // advanced by `mine()`; time = fixed epoch + 12 s per block
  accounts: Map<Address, { nonce: number; native: bigint }>;
  erc20: Map<Address /*token*/, Map<Address, bigint>>;
  logs: SimLog[];                                      // append-only
  txs: SimTx[];                                        // {hash, from, to, input?, blockNumber, kind: 'pay'|'sweep-relayed'|'sweep-direct'|'fund'}
}
export interface SimLog { readonly blockNumber: number; readonly txHash: Hex; readonly address: Address; readonly topics: readonly Hex[]; readonly data: Hex }
export function createSim(seed: Uint8Array): SimChain;          // seed only fixes block timing and tx hashes for scripted lessons
export function simPay(c: SimChain, p: { payer: Address; token: Address; gross: bigint; stealth: StealthResult; feeRecipient: Address; feeBps: number }): SimTx;
export function simSweepRelayed(c: SimChain, o: SweepOrder, relayer: Address): SimTx;
export function simSweepDirect(c: SimChain, o: { owner: Address; destination: Address; amount: bigint }): SimTx;
export function mine(c: SimChain, n?: number): void;
```
- `simPay` reuses chain-adapters' metadata builder (57-byte ERC-20 layout: view tag, `transfer` selector `0xa9059cbb`, token, net amount; 33-byte compressed ephemeral key) and fee split from FEE_SCHEDULE, so the demonstrated announcement is byte-identical to what the router emits. A conformance test compares `simPay` logs with logs recorded from a real anvil run (fixture below).
- ERC-20 and fee maths use the same pure functions the app uses; the simulator never reimplements fee rounding.
- Hashes are `keccak256` of canonical tx descriptors (not real RLP); labelled "simulated hash".

### 4.2 Observer lenses (`learn/lens.ts`) - pure functions of `SimChain` plus client/session facts
```ts
export type Fact = { id: string; text: string; sourceStep: number; kind: 'public-chain'|'link-holder'|'relayer'|'rpc'|'host'|'payer' };
export interface Lens { readonly observer: ObserverId; sees(c: SimChain, s: Session): Fact[]; doesNotSee(c: SimChain, s: Session): Fact[] }
export const LENSES: Record<ObserverId, Lens>;
// ObserverId = 'analyst' | 'payer' | 'linkHolder' | 'relayer' | 'rpc' | 'host'
```
`Session` records what the lesson did (relayer used? destination reused? number of invoices from one meta-address? RPC configured?). `host` lens only ever shows IP, UA, files, timing and "not the fragment"; `rpc` lens shows the addresses queried during the simulated scan/balance step.

### 4.3 Clustering heuristics (`learn/analyst.ts`)
Deterministic, each documented in the UI: H1 same payer -> router payments grouped; H2 payer follows one-time address to destination (`sweep.from` equals a paid `stealth`); H3 destination reuse across sweeps; H4 equal-amount match (gross - fee) to a known invoice amount; H5 same meta-address across two shown invoices; H6 sweep-within-N-blocks timing. Output is a list of `{heuristic, nodes, confidence: 'certain'|'likely'|'weak'}` where `certain` means an on-chain fact (H1, H2). The UI states these are examples, not a complete adversary model.

### 4.4 Source-of-truth tie to docs
`learn/observers.ts` holds the observer table as data `{ observer, learns: string[], doesNotLearn: string[] }`. Vitest reads `docs/user/privacy-limits.md` from the repo at test time, parses the "Who learns what" table, and fails when observer names differ or when a doc row is missing in the data (the strings need not be identical; rows and observer names must). A second test fails if a "Specific limits" numbered item count changes without the data's `limitsCovered` list being updated.

### 4.5 Fixtures (generated, committed)
`apps/web/src/learn/fixtures/anvil-run.v1.json`: produced by `scripts/gen-learn-fixtures.mjs` (dev only, requires anvil; never run in CI by default, but CI verifies the committed file's hash against `fixtures.sha256` and an optional job regenerates and diffs). Content: router/sweep-relayer deployment addresses on the dev chain, real announcement logs for ERC-20 and native payments, a relayed sweep receipt, expected metadata bytes. Only used by tests and by the "compare with a real run" disclosure; the sandbox itself does not depend on it at runtime (so a bad fixture cannot break the page).

### 4.6 Routing and bundle
Lazy chunk `learn.[hash].js` (dynamic `import()`), no new dependencies. Static hosting: same-origin assets, existing routing mechanism unchanged, works on GitHub Pages / IPFS (relative base). Added size budget: <= 120 KiB gzip for the chunk (UNVERIFIED target; measure).

## 5. Threat model and honest limits
| Risk | Mitigation | Residual |
|---|---|---|
| User believes sandbox results are guarantees | Banner, limits copy, "examples not a complete adversary model", no scores | Some will still overtrust |
| Educational overclaim (e.g. "sweep via relayer hides link") | Observer data tied to privacy-limits.md; wording lint; native-reviewer pass | Doc itself may be wrong; fix in doc first |
| Simulator drifts from real router behaviour | Shared encoders; anvil-fixture conformance; fee maths from shared functions | Router edge cases (fee-on-transfer etc.) are not simulated; stated |
| Sandbox invoice copied into live app | `ghostpay.invalid` host + scheme marker; Pay view rejects | Manual retyping of addresses is unaffected and harmless (worthless chain) |
| Compromised page logic in Learn leaks keys | Sandbox keys are random and worthless; module has no network imports | Same total-compromise class as D7 for the real app |
| Exfiltration via Learn chunk | No network APIs, lint and bundle scan, CSP `connect-src` stays but Playwright blocks all non-same-origin requests during Learn and fails on any | A malicious release remains out of scope (ADR-0015) |
| Resource exhaustion in free-play | Cap 200 payments, 20 accounts, scanning in a Web Worker with timeout | None significant |
Honest limits: it simulates one router, one relayer, one hash-linking adversary; it cannot show real mempool or off-chain correlation; "simulated hashes" are not verifiable; teaching value is unmeasured (no analytics by design).

## 6. Failure modes
`crypto.getRandomValues` missing: view shows "needs a modern browser" and does nothing. Worker blocked: fall back to main-thread scan for <= 200 logs. Chunk fails to load: error boundary with link to the markdown guides (`docs/user/*` shipped as static files if that is later added; otherwise plain text). Reduced-motion/no-JS: static `learn-noscript` section with the observer table (shipped as plain HTML in the bundle).

## 7. Test plan
- Unit: simulator invariants (supply conserved; fee + net = gross using shared fee function; nonce monotonic; log order); `simPay` metadata bytes == fixture; lenses golden outputs for the scripted lesson (snapshot of Fact ids, reviewed); heuristics truth table (H1..H6 on hand-built chains incl. negative cases: fresh destination, relayer on, different meta-addresses).
- Docs tie tests (section 4.4); wording lint over `learn/strings.ts` and rendered DOM.
- Property: scanning simulated logs with the real `scannerCore` finds exactly the seller's payments, zero false positives across 1000 random payments.
- Safety: chain id absent from adapter tables; Pay/sweep functions reject it; no-network lint rule test; bundle scan check on Learn chunk.
- Playwright: complete the guided lesson with Chromium and Firefox; `page.route('**', ...)` aborts and records any request not same-origin -> test fails if any; axe pass; reload clears state; keyboard-only run; mobile viewport.
- Fixture integrity: hash check in CI; optional job regenerates with anvil.

## 8. Acceptance criteria
- [ ] Entire lesson and free-play work with the network disabled (Playwright offline mode) and make zero requests after page load.
- [ ] No wallet, RPC, storage or keystore import in `src/learn/**` (lint + test).
- [ ] Observer table in the UI is generated from data that the docs-tie test validates against `docs/user/privacy-limits.md`.
- [ ] Each of the six observers shows non-empty sees and does-not-see lists at every step; challenge A and B outcomes demonstrate the payer-follows-sweep and relayer-sees-all facts.
- [ ] Simulator metadata equals recorded real anvil metadata bytes for ERC-20 and native.
- [ ] Wording lint clean; privacy review sign-off recorded in `docs/reviews/`.
- [ ] Works on a header-less static host (GitHub Pages, IPFS) as well as Cloudflare Pages (spec 10).

## 9. Effort
Simulator + shared encoders wiring 1.5 d; lenses + heuristics + data 1.5 d; UI + a11y 2 d; tests, fixture script, docs tie 1 d. About 6 d.

## 10. Audit checklist
1. No network-capable API reachable from `src/learn/**` (grep and bundle scan of the Learn chunk).
2. Sandbox chain id and invoice host cannot be accepted by production flows.
3. Keys created only by CSPRNG, never stored, zeroized on unmount.
4. Every "does not see" claim has a matching row in privacy-limits.md; no claim of anonymity.
5. Simulator reuses, not reimplements, fee and metadata logic.
6. Fixtures contain no real keys or addresses of live deployments.
7. No `dangerouslySetInnerHTML`; all strings rendered as text.
8. Lazy chunk does not widen the CSP; no inline scripts or styles.
9. Native-language review plan for privacy strings (idea B8 dependency).
