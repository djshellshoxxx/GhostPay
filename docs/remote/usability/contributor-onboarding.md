# Contributor onboarding

Audience: a developer who wants to land a first change in GhostPay. Read the root `README.md` status table first: the project is pre-audit, nothing is deployed, nothing is hosted. Never test with real funds or real keys.

## 1. Set up (about 10 minutes)

Requirements: Node >= 22, git. Foundry 1.8.5 only if you touch `packages/contracts`. Docker only for `deploy/`; PHP only for `integrations/`.

```bash
git clone <repo> && cd ghostpay
npm ci --ignore-scripts          # exact lockfile, no install scripts
npm run build:libs               # workspaces import each other through dist/: build before typecheck/test
npm test -w @ghostpay/invoice-schema   # smoke check on one package
```
Newer packages (`i18n`, `sdk`, `merchant-*`, `sandbox`, `plugin-api`) are not in `build:libs`; build the ones you depend on with `npm run build -w @ghostpay/<name>`.

## 2. Where things live

| Path | Purpose |
|---|---|
| `packages/*` | libraries (pure logic, no network unless the package says so) |
| `apps/web`, `apps/relayer` | the static app and the gas-sponsorship service |
| `deploy/` | self-host recipe (compose, nginx, Tor profile, `selfhost.sh`) |
| `examples/`, `integrations/` | merchant starting points, WooCommerce/Shopify/PrestaShop |
| `docs/remote/usability/specs/` | one spec per feature: requirements plus acceptance tests |
| `docs/remote/usability/audit-<pkg>.md` | self-review per package: threat model, findings, honest limits |
| `scripts/`, `.github/` | release build/verify and CI |

## 3. The loop for a package change

1. Find or write the spec in `docs/remote/usability/specs/<id>.md`. Change the spec first when behaviour changes.
2. Write tests first or alongside, with real numbers and adversarial cases (bad input, huge input, replay, injection). Fake data only.
3. Run from the repo root, for your package:
   ```bash
   npm test -w @ghostpay/<name>          # vitest + coverage thresholds 95/90/95/95 (never lower them)
   npm run typecheck -w @ghostpay/<name>
   npm run lint -w @ghostpay/<name>
   npm run build -w @ghostpay/<name>
   ```
4. Update the package audit note if the threat model or limits moved. Report only what you ran; list what you could not verify.
5. One focused commit per package or concern. Conventional prefix (`feat(i18n):`, `fix(relayer):`, `docs:`). Do not commit generated output (`dist`, `coverage`).

## 4. Rules that CI and reviewers enforce

- No secrets in git (`bash scripts/scan-secrets.sh`). Examples and tests use fake keys; real ones come from files with mode 600, never argv.
- Money is `bigint` or decimal strings, never floats.
- No new runtime dependency without a `THIRD_PARTY.md` entry; versions are exact-pinned. No new crypto library: use `@noble/*` as already pinned.
- No analytics, telemetry, remote fonts, third-party scripts. No `eval`, `new Function`, `innerHTML`, `Math.random` (lint-enforced).
- Trust-boundary functions get a TSDoc `@security` note; library code takes injected clock and randomness so tests are deterministic.
- Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Relative imports use the `.js` suffix.
- GitHub Actions must be pinned to a full commit SHA with a `# vX.Y.Z` comment: `bash scripts/check-actions-pinned.sh`. Add no third-party action when a few lines of shell will do (see `.github/actions/release-verify`).

## 5. Other kinds of change

- **Docs only**: keep claims honest. If you did not run it, say "not run".
- **Contracts**: `forge fmt --check && forge test` in `packages/contracts`; gas snapshot, fuzz and invariant suites must stay green. Contracts are immutable once deployed: ask before touching them.
- **Deploy recipe**: `docker compose -f deploy/docker-compose.yml config -q` and `deploy/selfhost.sh --dry-run`; never add a default secret or a published non-loopback port.
- **PHP integrations**: `php -l` on each file and `php integrations/woocommerce/tests/run.php`.
- **Release verification**: `.github/actions/release-verify/verify.sh` checks `SHA256SUMS` and the manifest; it is consistency only, authenticity comes from the signed tag and the attestation (`docs/operators/release-and-verify.md`).

## 6. Security reports

Do not open public issues for vulnerabilities. See `SECURITY.md` (private vulnerability reporting; contact details are still marked as owner-to-confirm there).

## 7. Good first tasks

- Add a missing negative test to a package and tighten its audit note.
- Translate or review a catalog in `packages/i18n/src/catalogs` (es/de samples are unreviewed); run `checkCatalogs` and keep it `ok`.
- Port `examples/merchant-checkout` to `@ghostpay/sdk` once its API is stable.
- Run the browser check for `examples/pos-terminal` (never done) and report results.
- Add `HelperForm` settings rendering to the PrestaShop skeleton.
