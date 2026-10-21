# Essential missing features (top 5)

Branch `claude/remote-extensions-3`, 2026-10-21. Method: docs read (README, blueprint, gap analysis, research, threat model, audit 01, privacy limits, web DEVIATIONS), then absence checked by grep and reading in `apps/web/src` and `packages/*/src`. Nothing was built or run. Effort: S under a day, M days, L a week or more or needs outside action. Items overlapping the gap analysis are kept only where they decide safety or viability.

## Ordering

1. E1 Authenticated release and manifest, plus audit gate (blocks everything else on mainnet).
2. E2 Recoverable seller identity (a lost browser tab must not mean lost funds).
3. E3 Offline / hardware-isolated spending.
4. E4 Seller invoice ledger and payment reconciliation.
5. E5 Licence, terms, privacy notice and sanctions position (owner action, can run in parallel with all of the above).

## E1. Authenticated release, manifest and audit gate

- **Why essential:** the manifest decides the router and fee-recipient addresses every payer sends money through. An unverified manifest on a tampered host redirects payments. README states no mainnet use until audited.
- **Evidence absent:** `apps/web/src/lib/manifest.ts` fetches the manifest with no signature check; `signature` in the schema is never verified. `packages/chain-adapters/src/readback.ts` (`verifyManifest`) exists but is not imported anywhere in `apps/web/src` or `apps/relayer/src`. `deployments/` holds only `schema.json` and `README.md`. All mainnets are `enabled: false` in `packages/chain-adapters/src/config/chains.ts`. No independent audit (`docs/audits/` is self-run).
- **User impact:** without it nobody can safely pay or be paid with real funds.
- **Privacy/security:** compile the manifest into the hashed bundle; read-back (`FEE_RECIPIENT()`, `ANNOUNCER()`, `FEE_BPS()`, codehashes) through two independent RPCs, fail closed; signed tag, SBOM, reproducible build. Limit: a compromised host can still serve a malicious bundle; the in-app hash widget is self-attested (audit S3-04). Verification must happen outside the page.
- **Client-side/static:** yes for read-back and compiled-in manifest. Not client-side: release-signing key, deployment, external audit (owner and third party).
- **Design sketch:** wire `verifyManifest` into the manifest loader and Pay/Sweep entry; block payment UI on any failed check; show verified chain, router, recipient on the final screen; publish release fingerprint and a "verify from another machine" script (`docs/operators/release-and-verify.md`).
- **Acceptance:** tampered manifest, wrong codehash, wrong fee recipient or a single lying RPC each disable payment (tests with mock RPC plus an anvil run against the compiled router); reproducible build hash matches in CI; one independent audit with no open high/critical findings; testnet deployment exercised end to end with a real wallet.
- **Effort:** M for code, L overall (audit and deployment are outside the repo).

## E2. Recoverable seller identity

- **Why essential:** the seller's spending and viewing keys are the only way to reach funds. A lost keystore or forgotten passphrase is permanent loss, and a leaked key has no response procedure.
- **Evidence absent:** `apps/web/src/lib/session.ts` generates random keys (`generateKeySet`, `randomScalar`); no mnemonic or deterministic root anywhere (`grep -i mnemonic|bip39` finds only the unrelated BTC library). The only backup is one passphrase-encrypted JSON file (`keystore.ts`, `SellerKeys.tsx`), with no second factor, no restore check and no recorded birth block (`Scan.tsx` asks the user to type a start block by hand). No key rotation or meta-address migration (no match in `apps/web/src`); the ERC-6538 publish is also missing (gap analysis).
- **User impact:** after restoring from a file the seller must guess how far back to scan or may miss payments; there is no way to retire a leaked key.
- **Privacy/security:** a written recovery phrase is a bearer secret; show once, never store, never log. Derive spend, view and invoice-signing keys from one root with domain separation (document the choice in an ADR; do not reuse a wallet's own seed path). Rotation cannot recall old invoices or announcements: state that plainly.
- **Client-side/static:** yes, all of it.
- **Design sketch:** BIP-39 phrase to HKDF-separated spend/view/signer keys; keystore v2 embeds creation block per chain and a key-id; "verify backup" step that re-derives and compares the meta-address; rotation flow that creates a new key set, pins it, and keeps scanning with the old view key until swept; compromise runbook in `docs/user/`.
- **Acceptance:** phrase round-trips to the identical meta-address (vectors in `test-vectors/`); restore from phrase alone finds a seeded testnet payment using the stored birth block; v1 keystores still import; rotation test shows old key still scans and sweeps; no secret reaches storage, logs or the network (existing bundle scan and e2e egress checks extended).
- **Effort:** M.

## E3. Offline / hardware-isolated spending

- **Why essential:** sweeping needs the derived stealth private key in the browser tab (`apps/web/src/lib/sweep.ts`, `deriveVerifiedSweepKey` reads `requireSession().keys`). The threat model lists a compromised frontend stealing keys as a top risk and names an "optional offline signer/hardware path for sweeps" as a mitigation still to build (`THREAT_MODEL.md` line 232).
- **Evidence absent:** the session requires both spending and viewing keys; no view-only mode (grep for viewOnly/watch-only finds nothing); no WebUSB, Ledger, Trezor or WebAuthn code. The EIP-1193 wallet code (`wallet.ts`) is for payers only and cannot sign for a derived stealth key.
- **User impact:** a single XSS or tampered host while the vault is unlocked can drain every unswept payment.
- **Privacy/security:** a hardware wallet cannot sign directly for `spend + hash(shared secret)`. Realistic options: (a) view-only online scanning with spend key kept on an offline machine, transferring unsigned sweep requests and signed results as QR or file; (b) a spending root derived from a hardware-wallet signature (deterministic signing only, with a documented trust trade-off). Offline route leaks nothing extra; the relayer path is unchanged.
- **Client-side/static:** yes. The offline signer can be the same static bundle opened from a local file with the network blocked.
- **Design sketch:** watch-only session (view key plus spend public key) for Scan; "export sweep request" produces the announcement, owner, token, destination and relayer quote; offline page derives the key, verifies it controls `owner`, signs the sweep or transaction, and exports a signed payload; online page submits it.
- **Acceptance:** Scan and sweep-request creation work with no spending key in memory (unit and Playwright tests assert none is present); the offline signer reproduces the current in-browser signatures byte for byte; wrong owner or tampered request is refused; a worked testnet sweep.
- **Effort:** M for option (a), L if hardware-wallet derivation (b) is added.

## E4. Seller invoice ledger and payment reconciliation

- **Why essential:** a seller cannot tell which invoice was paid, whether the amount matched, or whether it is final. Announcement metadata carries only view tag, token and net amount (`packages/core-crypto/src/metadata.ts`), not an invoice id, so matching must be done locally.
- **Evidence absent:** `CreateInvoice.tsx` and `invoiceCreate.ts` persist nothing; `Scan.tsx`, `scannerCore.ts` and `scanClient.ts` contain no reference to invoices; `tags.ts` stores free-form local tags only. No paid/partial/over/under/expired status. Non-router announcements show payer-claimed amounts unverified (audit S3-02).
- **User impact:** manual bookkeeping across opaque addresses invites mistakes: shipping against a payment that was short, unfinalized or faked.
- **Privacy/security:** keep the ledger encrypted in the existing vault (`tags.ts`, IndexedDB), export only as an encrypted archive; a plaintext export would defeat the privacy goal. Matching by token, amount and time window is heuristic and must say so.
- **Client-side/static:** yes.
- **Design sketch:** on invoice creation store `{invoiceId, chainId, token, amount, expiry}` encrypted; scanner joins matches by token, amount and finality depth; states: awaiting, seen, finalized, short, over, expired, unverified; verify amount against `Transfer` logs or `balanceOf` for non-router announcements; encrypted export and import.
- **Acceptance:** tests for exact, short, over, duplicate, expired, reorged and spoofed-announcement cases; finalized only after `finalityDepth`; ledger unreadable while locked; export/import round trip.
- **Effort:** M.

## E5. Licence, terms, privacy notice and sanctions position

- **Why essential:** without a licence nobody may legally run, fork, host or contribute; a hosted frontend or relayer needs terms and a privacy notice; operating a fee-taking payment tool needs a sanctions/compliance stance (ADR-0006 left it as a hook).
- **Evidence absent:** no `LICENSE` file at the repo root; every `package.json` says `"license": "UNLICENSED"`; README "Licence" section and hosting list item 4 call it an open owner decision; relayer policy gate defaults to allow-all.
- **User impact:** operators and contributors cannot rely on the code; hosts and ENS/IPFS providers may refuse unlicensed or unreviewed services.
- **Privacy/security:** the privacy notice must describe the relayer's visibility (owner, destination, amount, timing) and RPC provider exposure as already documented in `docs/user/privacy-limits.md`.
- **Client-side/static:** documents are static; legal review is not client-side and is not something the repository can complete.
- **Design sketch:** owner picks a licence; add `LICENSE`, update `package.json` and `THIRD_PARTY.md`; terms and privacy pages shipped in the bundle; decision record on sanctions screening and where the relayer applies it.
- **Acceptance:** licence file and package metadata agree; third-party licences compatible; legal sign-off recorded; terms and privacy pages linked from the app footer and covered by the bundle scan.
- **Effort:** S in the repo, L elsewhere (owner and counsel).

## Deliberately not listed

Payer wallet connection is present (EIP-6963 and injected, `apps/web/src/lib/wallet.ts`); WalletConnect is optional. Encrypted seller keystore export exists. Policy-account recovery, ERC-6538 publishing, fiat oracle feeds and Bitcoin web integration are real gaps but are tracked in `gap-analysis.md` and are not required for a minimal safe EVM launch.
