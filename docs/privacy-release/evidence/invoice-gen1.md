# Invoice minimization milestone 1

## Source and ownership

Feature: `v11-02-invoice-minimization`, mandatory v1.1 requirement [#287](https://github.com/djshellshoxxx/GhostPay/issues/287). Worker: `/root/invoice_gen1`. Branch: `privacy/v11-invoice-minimization-20261120`. Base: `bbcf71b79d4efd00892948faa833cb7d8f471406`, whose product predecessor is published `137628961463fc5abd8b7927b2efe6b18a0a206a`.

Specification was committed before implementation. Ownership was committed as `e6d152c7`; builder regressions as `dcc49f71`; UI regressions as `d6f7e1e2`; implemented/tested source is **`7c39a080e8510587898e2a02435c7e967951e803`**, tree **`d8dd595b10eadc2ada05a8ecb48823e4f43d4327`**. Subsequent evidence commits do not change runtime or test inputs. Initial unpublished c83 source and its old test results are not used to qualify this branch.

## Implemented slice

The pure `prepareInvoiceMetadata` module accepts only descriptive draft fields. Standard mode preserves the current metadata. Minimal mode omits `memo` and replaces each description with fixed `Item`, preserving quantities and unit values. The existing invoice format requires a nonempty description; empty strings would invalidate the invoice. The helper reuses `validatePrivatePart` and its financial-field constraints, bounds the collection by `MAX_LINE_ITEMS`, returns fresh objects and rejects unsupported modes without reflecting their values.

`buildInvoiceLink` applies this transformation before creating/signing the invoice. Its optional `metadataMode` defaults to standard, preserving existing callers. Tests compare all required fields with a stable test-only nonce: amount policy, tax, quote, expiry, token, signing identity, meta-address, fee policy and v2 gas-buffer policy remain unchanged. Plain, encrypted and passphrase-protected round trips have valid signatures. The existing cryptography, wire format and dependencies are unchanged.

Create Invoice has a labeled keyboard-operable checkbox and explicit limitation text. The original description and memo remain in this session's draft, disabled while omitted. Toggling the policy immediately removes the old link, Copy control and QR preview and invalidates pending build/registration presentation callbacks. A late prior-mode result cannot restore the old link. Existing links already shared remain valid; the UI states this. Reverting the choice permits a newly signed standard invoice using the preserved draft. Session replacement resets the mode with the existing form lifetime.

Five `invoice.metadata.*` catalog keys are classified as privacy-critical in the existing create-invoice group. Existing draft es/ja/ar catalogs carry explicit English fallback copy; no native translation review is claimed. No external code was copied.

## Executed verification

All Vitest commands ran from `apps/web` with the original Vite/Vitest configuration, one worker and a 1024 MiB Node heap. The coordinator provided a locked installation and source-aligned library outputs; this worker did not install or change dependencies. Full commands, source/config/lockfile blobs and lossless log hashes are in [evidence.json](invoice-gen1/evidence.json).

| Check | Observed result | Evidence |
| --- | --- | --- |
| Builder regression baseline on unchanged implementation | **8 failed**, 4 filtered, exit 1 | [red.log.gz](invoice-gen1/red.log.gz) |
| UI regression baseline on unchanged implementation | **4 failed**, exit 1; missing option | [ui-red.log.gz](invoice-gen1/ui-red.log.gz) |
| Helper, real builder/signature/encryption, new UI, original builder and critical-key policy | **51 passed in 5 files**, zero skips, exit 0 | [green.log.gz](invoice-gen1/green.log.gz) |
| All existing/new CreateInvoice view suites | **74 passed in 8 files**, zero skips, exit 0; 174.57 seconds | [view-regressions.log.gz](invoice-gen1/view-regressions.log.gz) |
| Committed secret scan | Passed, exit 0 | `bash scripts/scan-secrets.sh`: `OK: no committed env files or key material found.` |
| Whitespace check | Passed | `git diff --check` |

The two passing selections overlap in the four new UI tests; their counts are not a distinct-test total. Targeted `--coverage=false` runs do not qualify unchanged global coverage thresholds. No full web typecheck, lint, Playwright, browser, hosted CI or release acceptance is claimed.

## Fresh successor handoff

Root should assign a new independent reviewer to this frozen source and the specification. Check the implementation and evidence independently, then execute the original full typecheck and scoped lint in the coordinator's resource window. Browser qualification should cover keyboard operation, absent prior-mode copy/QR output, delayed completion after a toggle or seller-session change, and real parsed minimal links in both supported/full profiles. Retain original assertions and security gates.

Remaining feature scope includes deliberate metadata selection for merchant-profile issuance and any other supported invoice/share/export entry points beyond Create Invoice. Existing template callers still default to standard mode; required-field and exact-template-expiry preservation is tested at the builder layer. Do not strip signed merchant templates or invalidate existing signatures. Coordinate the root-owned retention hook before touching `CreateInvoice.tsx` again.

No remote branch, main, shared integration lock, deployment, release, contract, fee or security gate changed. This is a completed first implemented slice awaiting fresh review and wider v1.1 acceptance, not a claim that issue #287 or GhostPay release qualification is complete.
