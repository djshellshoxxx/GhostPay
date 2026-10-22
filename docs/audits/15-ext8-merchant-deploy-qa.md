# Audit 15: merchant examples, integrations, release verification, and self-host recipe

Date: 2026-10-22

## Scope

Reviewed the preserved `examples/`, `integrations/woocommerce/`, `integrations/prestashop/`, `deploy/`, and `.github/actions/release-verify/` additions. The review focused on webhook authentication and replay handling, amount verification, secret-bearing output files, release-manifest parsing, and archive extraction safety. No live payment, WordPress, PrestaShop, Docker, or container operation was performed.

## Changes

- Hardened the release-verification action. Manifest parsing now requires Python 3, rejects duplicate JSON keys and malformed or delimiter-bearing fields, validates exact artifact types and sizes, rejects duplicate/unsafe filenames and symlinked artifacts, and requires checksum entries to correspond exactly to the manifest artifacts plus the manifest itself.
- Added `.github/actions/release-verify/selftest.sh` for valid input and rejection cases: duplicate JSON keys, tab/newline injection, repeated checksum lines, unmanifested checksum entries, and a symlinked file.
- Hardened `deploy/selfhost.sh` before extraction. It rejects traversal, absolute paths, links and special files, duplicate archive paths, multiple top-level directories, setuid/setgid/sticky modes, more than 20,000 entries, more than 2 GiB unpacked, and archives without a root `index.html`. It also requires the web output directory to resolve beneath `deploy/`.
- Added `deploy/selftest.sh` for a valid archive, symlink and traversal archives, and an output directory escaping `deploy/`. Deployment remains gated by explicit confirmation; this audit did not run Docker.
- Made subscription-cron state writes exclusive and atomic. Its outbox contains bearer payment links, so it is now forced to mode `0600`; symlink outboxes are rejected. Documentation describes that protection.
- Removed PrestaShop float formatting from webhook amount comparison and invoice amount signing. After PrestaShop persists the order, the module reads the database `DECIMAL total_paid` as text and uses the existing strict decimal-string conversion. Unsafe/unrepresentable totals and invoice-startup failures cancel the temporary order.
- Added a pure PrestaShop event-to-order action policy: only a sufficient `invoice.paid` or `invoice.over` can mark paid; an underpayment cannot complete an order, partial events remain awaiting, and expiration only cancels an awaiting order. Added CLI fixtures for exact money conversion and these state rules.
- Updated WooCommerce and PrestaShop status documentation with the tests and remaining platform limitations.

## Review findings

The WooCommerce webhook path bounds the raw body, verifies HMAC before parsing, uses a timestamp window and atomic nonce claim, and strictly parses events. Order completion requires matching currency and an integer-string amount at least equal to the order total. The cross-language HMAC test vector is included in the PHP CLI suite.

PrestaShop’s mirrored signature and parser classes use the same bounded raw-body/HMAC/nonce flow. Exact amount handling and explicit partial/expired transitions fail closed. A unique database claim now serializes event IDs and provider transaction IDs; it uses a bounded 15-minute processing lease, returns retryable responses while another delivery owns the claim, releases failed work for retry, and seals successful work. WooCommerce uses unique non-autoloaded option rows with compare-and-swap lease recovery for the same identities. Both suppress duplicate deliveries even when a sender signs the same event again with a fresh nonce. The PHP fixtures verify stable identities across fresh event IDs for one provider transaction and distinguish a partial-to-paid transition. Platform-level callback behavior still needs a real PrestaShop/WordPress test environment; PHP PDO drivers for MySQL/SQLite were unavailable, so this audit does not claim live concurrent database execution.

The static POS example labels its staff-entered “received” control as demo-only; a real terminal must use authenticated server events. The webhook receiver’s in-memory replay and idempotency stores are explicitly documented as process-local, and its selftest exercises valid, replayed, stale, tampered, duplicate, oversized, and wrong-path requests.

## Verification

- `npm run build -w @ghostpay/merchant-hooks -w @ghostpay/invoice-schema -w @ghostpay/merchant-billing` — passed.
- `npm test -w @ghostpay/merchant-hooks -- --maxWorkers=1 --no-file-parallelism` — 28 tests passed.
- `npm test -w @ghostpay/merchant-billing -- --maxWorkers=1 --no-file-parallelism` — 132 tests passed.
- `npm run typecheck -w @ghostpay/merchant-hooks -w @ghostpay/merchant-billing` — passed.
- `node examples/webhook-receiver/selftest.mjs` — passed.
- `node examples/merchant-checkout/checkout.mjs --demo --amount 12.50 --currency USD` — passed with throwaway demo keys.
- `node examples/pos-terminal/parity.test.mjs` — passed.
- Subscription-cron demo: initialized, issued once, ran again with no duplicate invoice, marked the issued period paid, and rejected an invalid period index. Existing and symlink outbox checks confirmed mode `0600` and refusal to follow the symlink.
- `.github/actions/release-verify/selftest.sh` and `bash deploy/selftest.sh` — passed.
- `bash -n` on both selftests, the release verifier, and `deploy/selfhost.sh`; `node --check` on the example JavaScript files; `git diff --check` on the reviewed work — passed.
- `php integrations/woocommerce/tests/run.php` and `php integrations/prestashop/tests/run.php` — passed using PHP 8.3 CLI.
- `find integrations/woocommerce integrations/prestashop -type f -name '*.php' -print0 | xargs -0 -n1 php -l` — all PHP files passed syntax validation.

Docker Compose and `shellcheck` were unavailable. Compose validation, image builds, container startup, and live WordPress/PrestaShop callbacks remain untested.
