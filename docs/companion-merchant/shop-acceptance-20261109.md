# Shop companion acceptance — 2026-11-09

Base: `5628bc00b05a6dd0d9cd89f04f0385d9119281ac` (PR #90), sibling Track B.
Initial implementation checkpoint: `aed18659`; the integration handoff identifies the final combined source SHA.
Only the shop integration directories and new `scripts/companion-merchant/shop-*` / `docs/companion-merchant/shop-*` files are owned here. Shared HMAC fixtures are supplied by B3 in `packages/merchant-hooks/test-vectors/webhooks.json`; the PHP consumers do not change the protocol.

## Implemented and reviewed

| ID | Evidence and impact | Change and qualification |
|---|---|---|
| B7-SETTINGS | Configuration page returned messages but no form; required public endpoint settings could not be edited through the module page. | Real HelperForm contract, two public fields, explicit employee configure permission, POST/token checks, bounded typed URL/host validation, honest failed-save message. New shim tests fail on base and pass fixed. |
| B7-REDIRECT | Independent reviewer reproduced `valid_link()` accepting userinfo or explicit port because multi-argument `isset` requires every field simultaneously. Same hostname restriction still held; moderate redirect-policy violation, not arbitrary-host execution. | Individual presence checks; four original failing credential/port cases and valid/foreign/query controls. Independently retested. |
| B6-HPOS-EXPIRY | Real WooCommerce 11.2.2 HPOS returned invoice metadata IDs 62 then 61. `end()` selected the older invoice; its expiry cancelled an order with a newer unpaid invoice. Moderate checkout correctness defect. | Select maximum persisted metadata ID. Shim fails before and passes fixed; real HPOS old expiry preserves pending order, while late payment still works. |
| B6/B7-PACKAGE | No reproducible local installable module ZIP recipe. | Deterministic explicit-input ZIP builder, exclusive output creation, symlink/missing-input refusal, fixed timestamps/modes. Three packaging tests pass. No public release or platform certification. |

## Executed evidence

- PHP **8.4.27**, official Debian `8.4.27-1~deb13u1` packages extracted under a user-owned tool directory; `pdo_sqlite`/`sqlite3` loaded. No system package mutation.
- `php integrations/prestashop/tests/run.php`: **239 assertions passed**, including actual PHP methods/SQL on SQLite shim and separate request processes. No skipped SQLite suite.
- `php integrations/woocommerce/tests/run.php`: **177 assertions passed**, including metadata-order regression and shared HMAC exact-byte/Unicode/replay/timestamp vectors.
- `php -l`: **28 PHP files** passed across both integrations and shop PHP harnesses.
- `python scripts/companion-merchant/shop-packages.test.py`: **3 tests passed**; deterministic contents, overwrite refusal, missing input and symlink refusal.
- `git diff --check`: passed.
- `python scripts/companion-merchant/shop-woocommerce-platform.py ...`: **28/28 checks passed** on a fresh disposable installation. Real WordPress/WooCommerce and MariaDB callbacks are distinct from the shim assertions above; counts are not interchangeable.

### Named WooCommerce platform fixture

| Component | Version/source | SHA-256 when distributed as archive |
|---|---|---|
| WordPress | [7.1.4 official archive](https://wordpress.org/wordpress-7.1.4.tar.gz) | `881e53a4681ff2cd911651b11cccdede5ae477ddf0765af5d6a1a8b219a1d835` |
| WooCommerce | [11.2.2 official plugin archive](https://downloads.wordpress.org/plugin/woocommerce.11.2.2.zip) | `a4746183efd951de5837396aad119f7cf508f06cb699ccb590a01cada4c44932` |
| MariaDB | Official Debian `11.8.8-0+deb13u1`, [package directory](https://deb.debian.org/debian/pool/main/m/mariadb/) | Package version recorded; no claim of upstream signature verification by this harness |
| PHP | Official Debian `8.4.27-1~deb13u1`, [package directory](https://deb.debian.org/debian/pool/main/p/php8.4/) | Package version recorded |

The runner downloads only pinned official WordPress/WooCommerce archives, verifies their digests and creates a temporary shop/datadir. It uses loopback TCP in one process group, no Unix socket, suppresses mail and WordPress outbound HTTP, disables cron, uses fresh disposable secrets, and tears down processes/datadir in `finally`. No customer data or production merchant service is used. A syntactically valid fake bearer link is used by the invoice-service fixture; it is not a verified or payable real invoice.

Fourteen checks per data store cover: settings HTML and absence of secret inputs; exact HMAC invoice-service request and accepted redirect result; checkout-to-webhook transition; requested store active; old expiry acknowledgement and preservation of newer invoice; paid webhook and persisted status; fresh-nonce duplicate acknowledgement and unchanged order effects; rejected signature replay; currency mismatch; partial payment; late payment on cancelled order.

The initial HPOS run **failed**, and the failing persisted-state/metadata evidence led to B6-HPOS-EXPIRY. A separate initial legacy run passed 12 checks; these earlier diagnostic counts are not added to the final 28.

### Run locally

Use Python >=3.12, PHP with mysqli/mysqlnd, PDO, SQLite, ctype, mbstring, XML/DOM/SimpleXML, curl and fileinfo, and a MariaDB installation prefix with `bin/mariadb`, `bin/mariadb-install-db`, and `sbin/mariadbd`. If installed in a custom prefix, set its library loader path in the invoking environment as appropriate. Ports 13317 and 18886 must be free. Keep server/client in the same execution environment; this workspace's separate tool calls do not share loopback listeners.

```bash
php integrations/woocommerce/tests/run.php
php integrations/prestashop/tests/run.php
python scripts/companion-merchant/shop-packages.test.py
python scripts/companion-merchant/shop-woocommerce-platform.py \
  --php /absolute/path/to/php \
  --mariadb-prefix /absolute/path/to/mariadb-prefix \
  --output /tmp/ghostpay-shop-evidence
python scripts/companion-merchant/shop-packages.py --output /tmp/ghostpay-shop-zips
```

The platform output contains `result.json`, bounded process logs and verified download cache. It does not retain configured keys or the database. ZIPs are local evaluation artifacts; inspect the acceptance limits before using them in another disposable platform.

## Acceptance still open

- Real PrestaShop installation, module callbacks and permission/session behavior; actual admin order-note visibility and absence from storefront history; deleted-customer fallback, multishop behavior and validator.
- Browser-driven WooCommerce classic checkout/admin CSRF/redirect and PrestaShop configuration; no browser compatibility claim is made by rendered HTML inspection.
- Concurrent MySQL delivery claims across processes; crash during effects/completion, failed real saves, lease takeover and external callbacks. Existing leases and completion markers do not guarantee exactly-once emails or third-party side effects. Unresolved outcomes must not be treated as proven failures by an operator.
- Real invoice-service behavior, all supported platform versions, native refunds, Blocks, native-language review, production acceptance and publication.

Primary platform contracts consulted: [PrestaShop HelperForm](https://devdocs.prestashop-project.org/8/development/components/helpers/helperform/), [module configuration](https://devdocs.prestashop-project.org/8/modules/creation/adding-configuration-page/), [PrestaShop 8.1.7 Module permissions source](https://github.com/PrestaShop/PrestaShop/blob/8.1.7/classes/module/Module.php), [WooCommerce HPOS recipe](https://developer.woocommerce.com/docs/features/orders/high-performance-order-storage/recipe-book/), and pinned installed WooCommerce DataSynchronizer/metadata sources. These inform implementation; they do not replace execution evidence.
