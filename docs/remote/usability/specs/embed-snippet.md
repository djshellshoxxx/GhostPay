# Spec: embed-snippet: Embed snippet generator
Impact 3/5 | Effort S | Score 3 | Wave 0 | Depends on: none
Built in: `packages/ux-flow` (`src/embed.ts`). Generic only: no POS/plugin/cart concepts (swarm 8 owns merchant POS/plugins).

## Problem
Merchants hand-write the `data-invoice` attribute and script tag.

## Design
`makeSnippet(link, appOrigin, opts)` returns copy-paste HTML: one `<button class="ghostpay-btn ghostpay-btn--<variant>" data-ghostpay data-invoice="...">`, one `<script defer src="<appOrigin>/ghostpay-embed-v1.js">`, optional `<link rel=stylesheet>` to a same-origin `/ghostpay-embed-v1.css` (class names only, no inline style) and an optional `<noscript><a rel="noopener noreferrer">` fallback. `validateEmbedLink` replicates `validLink` from `apps/web/public/ghostpay-embed-v1.js` (https or http://localhost, same origin, no userinfo, `#gpi=v1.` fragment with non-empty body, <= 22000 chars) and returns `'ok'` or a Reason: type, length, app-origin, parse, scheme, origin, credentials, fragment.

## Requirements
1. **EMBED-1** MUST validateEmbedLink agrees with the embed script on shared vectors (22 vectors in `embed.test.ts`).
2. **EMBED-2** MUST Text and attribute output escapes & < > " ' and backtick; the link is re-serialised from the parsed URL.
3. **EMBED-3** MUST Different-origin link -> `BAD_LINK` (reason origin); non-canonical or non-https appOrigin -> `BAD_ORIGIN`.
4. **EMBED-4** MUST No inline style, inline script, event-handler attribute, iframe, or third-party host in output.
5. **EMBED-5** MUST Options allowlisted (label, variant in default|dark|outline, includeStylesheet, includeFallback); unknown keys -> BAD_OPTION; label 1..80 chars, no control characters.
6. **EMBED-6** SHOULD UI warns the link is a bearer secret and public HTML publishes it; generate per order.

## Acceptance tests (`src/embed.test.ts`)
T-1 hostile label escaped, exactly one script tag; T-2 other origin refused; T-3 vector table; T-4 structural check (one button, one script, no `style=`/`on*=`/`<iframe`) since no DOM in node (DOMParser round trip belongs to an apps/web e2e).
Open item: cross-test against `apps/web/src/embed.test.ts` vectors once wired (script file itself cannot import the package).
