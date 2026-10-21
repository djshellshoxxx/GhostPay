# Red team: `apps/web` (browser client)

Attacker models exercised: hostile invoice-link author (fragment fields), malicious
relayer, malicious RPC, hostile embedding page, malicious injected wallet.

Scope: `apps/web` built to `dist/`, loaded in headless Chromium
(`/opt/pw-browsers/chromium-1194`, no `playwright install`). Scratch and scripts under
`/tmp/claude-0/assure-redteam-web/`. No repo files modified.

## Summary

No exploitable web vulnerability found in the classes tested. XSS, CSP bypass, storage
leakage, prototype pollution, fake-manifest injection and fragment tampering were all
driven with live payloads against a real build and **failed to produce impact**. React
text-node escaping, the meta CSP (`script-src 'self'`), the signed-invoice envelope, the
manifest validator and the post-submit transaction verifier each held. Three residual
items are INFO (platform limits already noted in `apps/web/DEVIATIONS.md`, not defects).

## Method / what was run

Signed invoice links were built with the app's own `@ghostpay/invoice-schema`
(`createInvoice`+`signInvoice`+`encodeFragment`), so payloads reach the Pay view exactly
as a real `#gpi=v1.` link would. Line-item `description` and `memo` were set to
`<img src=x onerror="window.__pwned=1">`.

- `/tmp/claude-0/assure-redteam-web/make-frag.mjs` — builds the malicious signed fragment.
- `/tmp/claude-0/assure-redteam-web/redteam.mjs` — static server (no `_headers`, i.e.
  GitHub-Pages model) + headless Chromium: loads the link, checks XSS, CSP, storage.
- `/tmp/claude-0/assure-redteam-web/logic.mjs` — fragment tampering + embed `validLink`.
- `/tmp/claude-0/assure-redteam-web/manifest.mjs` — `loadDeployment` tamper matrix.

Repro (all three):
```
cd /home/user/ghostpay
node /tmp/claude-0/assure-redteam-web/make-frag.mjs > /tmp/claude-0/assure-redteam-web/frag.txt
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node /tmp/claude-0/assure-redteam-web/redteam.mjs
node /tmp/claude-0/assure-redteam-web/logic.mjs
node /tmp/claude-0/assure-redteam-web/manifest.mjs
```

## Results (PASS, with evidence)

### XSS via invoice memo / line items — not exploitable
Malicious link rendered in Pay view. Observed: `window.__pwned = null`,
`document.querySelectorAll('img[src="x"]').length = 0`, memo present only as literal text
in `innerText`. The raw `<` is escaped by React (JSX text nodes in `Pay.tsx`:
`<td className="wrap">{li.description}</td>`, `Memo: {inv.memo}`). No `innerHTML` /
`dangerouslySetInnerHTML` / `eval` / `document.write` exists in `src/` (grep clean;
`scanBundle.test.ts` enforces this on the built bundle). Note: `innerHTML` of the body
does contain the characters `onerror="..."` as inert text because the enclosing `&lt;img`
is escaped — no element, no handler, no execution.
Schema hardening behind this: `packages/invoice-schema/src/schema.ts#text()` rejects C0/C1
controls, lone surrogates and non-NFC, and caps length (`MAX_MEMO_LENGTH=500`,
`MAX_DESCRIPTION_LENGTH=200`, `MAX_LINE_ITEMS=50`); `json.ts` caps depth at 8.

### CSP — enforced; inline script blocked
`index.html` ships the meta CSP (`default-src 'self'; script-src 'self'; ...
object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self'`). Injecting an
inline `<script>` from the page was refused: console "Refused to execute inline script …
script-src 'self'", `securitypolicyviolation` fired (`script-src-elem :: inline`),
`window.__inline = null`. `img-src 'self' data:` blocks external image beacons (relevant
to the wallet-icon `<img src={w.icon}>` in `Pay.tsx`).

### Fragment tampering — rejected
`isSignatureVerified(parse(original)) = true`; flipping one base64url char →
`parseFragment` throws (`JsonParseError`); any field change that stays valid JSON breaks
the secp256k1 signature over canonical bytes (`sign.ts`). The link is integrity-protected.

### Fake / tampered manifest injection — rejected
`chain-adapters loadDeployment` rejected every mutation (`ChainAdapterError`):
wrong `chainId` arg, `feeBps` raised to 9999, malformed address, extra key,
`__proto__` payload, and an HTML-fallback body. `({}).polluted` stayed `clean` — no
prototype pollution. A hostile static host cannot forge fees or addresses past the
validator; the app ships no manifest, so payments stay disabled by default.

### Storage leakage — none
After loading the malicious link: `localStorage` and `sessionStorage` both empty; no
invoice/memo bytes persisted (`settings.ts` writes only `ghostpay.settings.v1` on explicit
save; `idbStore.ts` stores only ciphertext/HMAC/ids). Fragment auto-cleared from the
address bar (`location.hash` no longer contains `gpi=`; `App.tsx` `clearFragment` +
`Referrer-Policy: no-referrer`).

### Embed SDK abuse — rejects hostile attributes
`public/ghostpay-embed-v1.js#validLink` tested via the shipped file: `accepted` only for
same-origin https `#gpi=v1.` links; `REJECTED` for cross-origin, `javascript:`, missing
prefix, embedded credentials, and non-localhost http. It uses popup `noopener,noreferrer`
only — no iframe, no `postMessage` channel, no completion callback. The app registers no
`message` listener (grep: listeners exist only in Worker test harness / `scanClient`).

### Worker abuse — low surface
`scanner.worker.ts` speaks a typed structured-clone protocol (`ToWorker`/`FromWorker`); no
`importScripts`/`eval`; `worker-src 'self'`. `embed.test.ts` forbids
network/`postMessage`/`eval` tokens in the SDK.

## Residual items (INFO — platform limits, already in `DEVIATIONS.md`)

1. **Clickjacking on GitHub Pages.** The meta CSP cannot express `frame-ancestors`, and
   Pages ignores `public/_headers` (where `frame-ancestors 'none'` + `X-Frame-Options:
   DENY` live). So on a Pages deployment the app is framable. Impact bounded: the embed is
   popup-only with `noopener`, no in-frame signing callback. Suggested: deploy on
   Cloudflare/Netlify (headers apply), or add a JS frame-buster for Pages builds.

2. **Malicious injected wallet mutates the signing request.** A hostile EIP-1193 provider
   can sign a tx different from the preview. This is detected, not prevented:
   `payExec.ts verifySubmission` re-decodes the network-seen tx and raises
   `PreviewMismatchError` ("Do not trust this payment…"); permit sigs are recovered to the
   payer; chain/account are re-checked pre-send (`wallet.ts`); on-chain `minNet` caps loss.
   Inherent to client-side signing; no code fix — the preview/verify UX is the mitigation.

3. **Broad `connect-src 'self' https: wss:`.** Needed because RPC/relayer origins are
   runtime data. A user-configured hostile RPC/relayer is reachable, but URLs are validated
   (https/wss, no credentials; `settings.ts`, `validateRpcUrl`) and responses are strictly
   bounded and schema-checked (`relayerClient.ts`: 16 KiB cap, `redirect:'error'`,
   `credentials:'omit'`, regex-validated fee/feeTo/expiry/quoteToken/txHash; never echoes
   bodies). No leak or injection path found from a hostile relayer response.

## Not run / limitations

- **Link-preview leaks:** not exercised with a live crawler. Static reasoning: fragment is
  never sent to any server (client-only parse), `Referrer-Policy: no-referrer`, crawlers
  see only the static shell; low risk. Not proven end-to-end.
- **Full wallet signing-mutation e2e:** the mutation *defense* (`verifySubmission`) was
  read, not driven end-to-end — it needs a mock EIP-1193 provider + RPC. Existing
  `payExec.test.ts` / `wallet.test.ts` cover it in-repo.
- **`_headers`-enforced CSP path:** tested the Pages model (meta only). The stronger
  Cloudflare/Netlify header set (frame-ancestors, COOP, CORP) was not exercised against a
  header-applying server.
- Tooling: `apps/web/dist` already built; I did not rebuild. Chromium pinned to the
  preinstalled 1194 via `executablePath` (playwright-core expected 1248; no install run).
