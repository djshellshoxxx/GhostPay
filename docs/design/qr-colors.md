# QR colour system

Every QR code in GhostPay is shown inside a frame that tells the user what kind of data it carries. Source of truth: `apps/web/src/lib/qrKinds.ts` (`QR_KINDS`, `QR_PALETTE_*`, `kindForPayload`). Component: `apps/web/src/components/QrFrame.tsx`. CSS tokens: `apps/web/src/styles/qr.css`.

## Kinds

| Kind | Colour | Border | Icon | Label | Examples | Handling |
|---|---|---|---|---|---|---|
| `secret` | red | thick solid | lock | SECRET | keystore backup, recovery data, anything that spends or decrypts | hidden until "Reveal"; auto-hides after 60 s and when the page is hidden; no copy, no download; warning text; not printed |
| `shareable` | green | solid | share | SHARE | public invoice link (plain or passphrase), seller stealth meta-address, payment request, registry entry | safe to show the payer |
| `bearer` | orange | dashed | key | PRIVATE LINK | invoice link that contains its own decryption key | share only with the intended payer; not printed by default |
| `device` | blue | double | phone and computer | MY DEVICES | settings, RPC list, pinned-signer list | private, not secret |
| `proof` | purple | dotted | check-document | PROOF | receipts, proof of payment, signed manifests, fingerprints | keep or compare |
| `caution` | yellow | groove plus hazard stripe | warning triangle | CAUTION | testnet, dev, unsigned, unverified data | verify before relying on it |

`kindForPayload(type, flags)` picks the kind. `secret` is never downgraded; any other kind becomes `caution` if flagged testnet, unsigned or unverified.

## Rationale

- Colour is never the only cue (WCAG 1.4.1): each frame has a text label, an icon (decorative, `aria-hidden`; the label carries the meaning) and a unique border style. Text-only browsers (lynx) and screen readers get the label, the explanation and any warning as plain text.
- The QR modules are never coloured. The QR keeps its own white background with a 4-module quiet zone inside the coloured frame.
- Secret handling: the QR is not in the DOM until revealed, so it cannot be seen by accident, by assistive tech, or in a quick glance over a shoulder. Copy and download are removed for secret codes to avoid clipboard and file leaks. Print CSS hides secret codes.
- "Show larger" opens a full-screen white, high-contrast dialog (Escape or Close to leave, focus restored) and asks for the Screen Wake Lock where the browser has it. Web pages cannot raise screen brightness, so the page only tells the user to do it.
- Multipart codes: "Part i of n" with Previous/Next. Optional auto-advance every 2.5 s; with `prefers-reduced-motion: reduce` only manual stepping is offered.

## Contrast and modes

- Light and dark tokens are CSS variables (`--qr-red` etc.), overridden for `prefers-color-scheme: dark`, `data-theme`, and `prefers-contrast: more` (thicker borders).
- Forced colours: all kinds use system colours (`CanvasText`/`Canvas`); the label, icon and border style carry the distinction. Not verified in a real Windows High Contrast session.
- Measured WCAG ratios, light (frame vs page `#f7f8fa` / vs white / label text on chip): red 6.89/7.33/7.33, green 6.17/6.56/6.56, orange 4.73/5.02/5.02, blue 5.09/5.41/5.41, purple 11.17/11.86/11.86, yellow 3.59/3.82/5.50 (black text). Dark (vs page `#0f1218` / vs surface `#181c24` / label text): red 6.82/6.21/7.64, green 8.46/7.70/9.48, orange 9.19/8.36/10.29, blue 6.89/6.27/7.72, purple 10.12/9.21/11.34, yellow 11.19/10.19/12.53. Requirement: at least 3:1 for the frame (1.4.11) and 4.5:1 for label text. Enforced by `qrKinds.test.ts`.

## Colour-blind check method and results

Method: `lib/qrContrast.ts` converts each frame colour to linear RGB, applies the Machado et al. (2009) full-severity matrices for protanopia, deuteranopia and tritanopia, converts to CIE Lab and takes the CIE76 distance for every pair of the six colours. The test requires every pair to stay above 5 in light and dark. This is a simulation, not a test with colour-blind people.

Smallest pair distance (higher is easier to tell apart): light: normal 30.5 (orange/yellow), protanopia 14.2 (orange/yellow), deuteranopia 7.0 (orange/yellow), tritanopia 20.9 (green/blue). Dark: normal 28.4, protanopia 16.7 (blue/purple), deuteranopia 11.2 (orange/yellow), tritanopia 17.0 (green/blue). The weakest pairs (orange/yellow, blue/purple) are separated mainly by the label, icon and border style, which is the intended design. An earlier palette had blue/purple at 0.9 under deuteranopia in light mode and was changed (blue lightened, purple darkened).

## Not verified

No real phones, tablets, camera scanners, screen readers, forced-colours sessions or AR glasses were used. Scanning with real phone cameras is untested; the QR image itself is unchanged by the frame.
