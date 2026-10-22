# Security model and contributor rules

Sources: `SECURITY.md`, `docs/threat-model/THREAT_MODEL.md`, `docs/DEVELOPER_SPECIFICATION.md` (security invariants),
`docs/CONTRACTS_SPEC.md`, `docs/adr/ADR-LOG.md`, `eslint.config.js`, `apps/web/scripts/scan-bundle.mjs`, the CI workflows,
and the code. This is a summary for people changing code; the threat model and the four audits are the long form.
Status reminder: pre-audit, nothing deployed, self-run and AI-assisted reviews only (`docs/audits/`).

## 1. What must never happen

These are the project's hard invariants. A change that breaks one needs an ADR first.

1. **Spending keys, viewing keys, plaintext invoice data, invoice decryption keys and seeds never leave the browser process.**
   Not to an RPC, relayer, analytics, log, crash reporter or host. (`DEVELOPER_SPECIFICATION` invariant 1.)
2. **RPC requests carry only public data.** Scanning queries contain block ranges and the announcer address, never a key.
3. **The payer sees, and the wallet confirms, the exact chain, token, destination, amount, fee and contract call.** The
   preview is checked against the calldata that will be signed (`assertPreviewMatchesCalldata`).
4. **Every parser fails closed.** Invoice fragment, deployment manifest, RPC responses, logs and relayer request bodies are
   versioned, size-limited, strictly validated, and parsed as data (never HTML).
5. **Scheme maths is pinned** (ADR-0001) and proven by vectors plus differential tests; a changed hash needs a new scheme id.
6. **Contracts have no owner, proxy, pause, rescue, fee setter, `delegatecall` or arbitrary call**, and never keep funds.
   Configuration is `immutable`. The fee recipient never appears in source: only in a deployment manifest (ADR-0007).
7. **No claim stronger than the guarantee.** Never write "anonymous", "unlinkable", "verified seller" for a bare valid
   signature, "gasless is private", or "received" for an unverified amount (`docs/user/privacy-limits.md`).
8. **No mainnet funds before independent review** (ADR-0011, ADR-0015); no hosting before the ADR-0015 gates.

## 2. Assets and who can hurt them

Assets in order of harm: seller spending keys; payer funds in flight; viewing key and local tags; integrity of the addresses a
payer is told to pay (router, fee recipient, one-time address); invoice contents (a bearer link); fee revenue; relayer hot-key
balance (`THREAT_MODEL` section 1). Boundaries and what crosses them: [architecture.md](architecture.md#3-trust-boundaries).

| Threat | Mechanism in the code | Residual / not covered |
|---|---|---|
| Malicious frontend bundle (host or CDN compromise) | CSP and header policy in `_headers`, `scan-bundle.mjs`, reproducible signed releases | A compromised host can replace code and manifest; the in-app release-hash widget cannot detect it (audit S3-04). Verify on a separate machine. |
| Poisoned deployment manifest | strict validator (`validateManifest`), chain-id match, role-collision checks; `verifyManifest` read-back of fee recipient, announcer, fee bps and code hashes | `signature` is never verified; read-back is only as honest as the RPC. The web app runs it with the user's single RPC before enabling payments (`unverified` state blocks them; no second provider) and the relayer runs it once at startup (`MANIFEST_READBACK_FAILED` refuses to start); `createEvmAdapter` itself is still built without `readback` in the app because the gate sits upstream. |
| Payer-side tx tampering | `assertPreviewMatchesCalldata`; post-send comparison against the user's own RPC (`SubmissionMismatchError`) | the fee recipient is not in calldata; a consistently lying provider with no second RPC is undetectable |
| Hostile announcements (spam, spoofed amounts) | `validateAnnouncementLog` skips attacker content, counts it; `checkAnnouncement` never throws on chain data; `verifyAnnouncementAmount` separates `verified` from `claimed` | announcement flooding costs the flooder only gas; scanning still downloads all logs |
| Provider lies or omits logs | cursor hash check and reorg rollback; optional second provider (`secondary`) | one provider = single point of trust unless `secondary` is set; the web app uses one |
| Invoice-link leakage | fragment never sent to servers; `history.replaceState` clears the bar; AES key is *in* the fragment so the link is a bearer secret | browser history DB, extensions, screenshots, clipboard, any script on the page |
| Relayer abuse (drain, DoS) | allowlists, quote HMAC, deadline window, signature check, per-IP and per-owner buckets, admission pre-simulation, fee floor, gas/budget caps, circuit breaker, one tx in flight per chain | in-memory state resets on restart; a distributed attacker is bounded by budget/queue/breaker, not rate limits; no sanctions screening unless a `PolicyGate` is supplied |
| Relayer misbehaviour towards users | order signed by the stealth key; contract enforces destination, amount, fee, `feeTo` | it can censor, delay or observe (owner, destination, amount, timing) |
| Fee recipient blacklisted or unable to receive ETH | none in-contract by design (ADR-0013) | every router payment of that asset >= 400 base units reverts until a new router and manifest ship |
| Oracle failure | `readPrice` checks, heartbeat cap, sequencer guard (`quote.ts`); fiat invoices disabled while `FEEDS` is empty | no verified feeds exist yet |
| Key theft of a policy account | timelock, caps, destination only; owner can cancel in the window | no recovery; the thief holds the same key; experimental (ADR-0014) |

## 3. Secrets and the scanner worker

- `SecretScalar` (core-crypto, and an independent copy in btc-silent-payments) extends `Uint8Array` and throws on
  `JSON.stringify`, `String()`, template strings, `toLocaleString`, `Symbol.toPrimitive` and `util.inspect`. Use
  `unsafeRevealSecret` only at an explicit export boundary and `zeroize` the copy. JavaScript cannot guarantee erasure
  (JIT, GC, structured clone).
- `apps/web/src/lib/session.ts` keeps the three seller secrets (spending, viewing, invoice-signing) inside a module closure; React
  state only receives the public summary; nothing is written to web storage (an e2e test inspects `localStorage`,
  `sessionStorage`, IndexedDB and cookies). Encrypted backups use `keystore.ts` (scrypt + AES-256-GCM, see
  [byte-layouts.md](byte-layouts.md#seller-key-backup-web-app)).
- **Deliberate exception to "never `postMessage` a secret":** `runScan` posts the viewing key to the scan worker once, as
  raw bytes in a `start` message; `ScanSession` wraps it in a `SecretScalar`, `zeroize`s the incoming buffer, and `dispose()`
  zeroizes the wrapper; `runScan` zeroizes its own copy in a `finally`. The worker holds the **viewing** key only (never the
  spending secret), has no network API (a test fails if `scannerCore.ts` or the worker entry mention `fetch`, `WebSocket`,
  `XMLHttpRequest`, `EventSource`, `sendBeacon` or `importScripts`), and receives only public `WireLog` batches. A Worker is
  a responsiveness tool, not an isolation boundary: same-origin script can replace it.
- Errors are fixed strings with stable codes in every package. Do not add `${input}` or key bytes to a message.
- Logging: the relayer logs only `requestId, route, status, chainId, txHash, errorClass`; raw IPs are hashed with a
  rotating in-memory salt. The web app never logs the fragment or parsed private fields.

## 4. Contributor rules (enforced or expected)

**Enforced by tooling**

| Rule | Enforcement |
|---|---|
| No `Math.random`, `eval`, `new Function`, `Function()`, `innerHTML`/`outerHTML` assignment, `dangerouslySetInnerHTML`, no `any` | ESLint (`eslint.config.js`), run in CI and at release |
| No dynamic code, source maps, inline script/style, unexpected URLs or network APIs in the worker in the web bundle | `apps/web/scripts/scan-bundle.mjs` (`postbuild`); URL allowlist with a stated reason per entry |
| No committed env files or key material | `scripts/scan-secrets.sh` (CI `secrets-and-egress`, release) |
| Every GitHub Action pinned to a 40-hex SHA with a `# vX.Y.Z` comment | `scripts/check-actions-pinned.sh`; Dependabot groups updates weekly |
| Formatting, zero compiler warnings, NatSpec for the four listed contracts | `forge fmt --check`, `forge build`, `scripts/check-natspec.sh` |
| Static analysis | Slither 0.11.6 with `--fail-medium` and no detector exclusions; by-design sites carry inline `slither-disable` comments with a rationale (`docs/audits/00-slither-triage.md`) |
| Coverage thresholds, gas snapshot | vitest thresholds per workspace; `forge snapshot --check` |
| Production dependency advisories | `npm audit --omit=dev --audit-level=high` (CI, nightly) |

**Expected in review (not machine-enforced)**

- **Dependencies**: exact pins in `package.json` (no ranges); no new runtime dependency without a `THIRD_PARTY.md` entry
  (licence, version, purpose, review note; regenerate with `node docs/tools/third-party-table.mjs --write`); noble imports use
  explicit `.js` subpaths; no analytics, telemetry, remote fonts or third-party scripts in the browser app. Known contradiction:
  the installed closure contains noble 1.x copies through viem (ADR-0004 amendment, `THIRD_PARTY.md` section 1).
- **Cryptography**: no home-rolled primitives; any change needs updated vectors and a differential test; reject zero scalars,
  infinity, off-curve and non-canonical encodings; never reuse one key for two roles (spend/view/invoice-signing are separate).
- **Contracts**: SafeERC20 plus exact balance-delta checks for every token movement; `nonReentrant` on entry points;
  consume nonces before external calls; assembly `call` without return-data copy for native sends to untrusted payees; no
  unbounded loops; custom errors with stable names. **Any public-ABI change** (functions, events, errors, EIP-712 types)
  updates `docs/CONTRACTS_SPEC.md` first, regenerates the TypeScript ABIs (`gen-abi`), vectors and docs, and records a
  DEVIATIONS item; the policy router `PolicyRef` -> `salt` change (R10) is the template.
- **Parsers**: strict, size-capped, duplicate-key-free, fail-closed; typed errors; fuzz them.
- **Fixes**: one regression test per fix, referenced in `DEVIATIONS.md`; never delete a failing exploit test to go green.
- **Claims**: update `docs/user/privacy-limits.md` and the README status table when a limitation changes; do not describe
  unaudited behaviour as safe.
- **Secrets in CI**: no deployment, RPC, pinning or signing secrets in `ci.yml`; release jobs get only OIDC attestation
  rights and a manually approved `release` environment.

## 5. Review checklist for a pull request

1. Does any new code path send a secret, a decrypted invoice field or a key-derived value to a network, log, storage or URL?
2. Is every external input (RPC result, log, manifest, fragment, HTTP body, wallet response) validated before use, with a
   typed failure and a test for a hostile value?
3. Does a UI string imply a guarantee the code does not provide (verified, private, received, final)?
4. Could the previewed payment differ from the signed call? Is `assertPreviewMatchesCalldata` still on the path?
5. Does a contract change touch value flow? If so: invariant, fuzz, mock-token matrix, gas snapshot, NatSpec, ABI regeneration,
   spec and DEVIATIONS updates.
6. New dependency? `THIRD_PARTY.md`, exact pin, lockfile diff reviewed, install scripts absent.
7. New configuration? Names only in `.env.example`; no default numbers for operator economics.
8. Did coverage thresholds, `forge snapshot --check`, bundle scan and Slither stay green without exclusions?

## 6. Known open weaknesses (do not assume they are fixed)

Authoritative lists: audits `docs/audits/01..04`, `docs/remote/gap-analysis.md`, `README.md` "Security limitations". Highlights
at commit `7aee906`: manifest signature unverified and no signing key published; read-back is wired into the web app and the
relayer startup but uses a single RPC and runs once per page view / process start; the release-hash widget is self-attested; browsers may retain the invoice link in history;
announcements are unauthenticated payer claims and `verified` amounts are bounded by the primary/secondary-RPC trust model and a per-scan (not persisted) transfer ledger (round-3 review NC-01/NC-02 were fixed in `ab09bad`; `docs/remote/audit-parts/new-code.md` lists NC-01..NC-11, some still open); the relayer prices with operator constants, not an oracle; fiat invoices
cannot be paid; policy accounts have no recovery and no UI; hosting, signing keys, licence and legal review are owner
decisions that have not happened. Findings are tracked with IDs (`S3-xx`, `D1-D10`, `M-01..03`, `L-01..06`, `N-01..08`);
cite the ID in commit messages and tests.

Reporting: GitHub private vulnerability reporting (never a public issue); the contact and timelines in `SECURITY.md` are
placeholders awaiting owner confirmation.
