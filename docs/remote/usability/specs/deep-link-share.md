# Spec deep-link-share: deep links and Web Share Target

Package: `packages/ux-intake` (`deeplink.ts`).

## Requirements
- R1 Scheme allowlist, subset of `https`, `ghostpay`, `web+ghostpay`; any other scheme (javascript, data, file, intent, blob, http, relative) is `scheme-not-allowed`. Configuring an unsupported scheme throws `TypeError`.
- R2 https deep links: exact host match, no credentials, no port, pathname in route allowlist (default `/pay,/invoice,/share-target`).
- R3 Fragment safety: fragments are never sent to servers by browsers; the package therefore (a) returns invoice links with `safeDisplay` containing only `#gpi=v1.[N chars hidden]`, (b) provides `stripFragment(url)` and `redactForLog(text)` (fragments, `gpi=v1.`/`gpi%3Dv1`, 40+ char base64url blobs), (c) exports `REQUIRED_REFERRER_POLICY = 'no-referrer'`, (d) warns `fragment-in-query` when a shared invoice link arrives inside a share-target query (it then may have reached a server).
- R4 Web Share Target (`title`, `text`, `url`): exactly one distinct recognised payload across `url` and tokens of `text`/`title` (surrounding `<>()"'[],.;` trimmed). Two different payloads give `ambiguous-share`. Duplicate share params, > 16 params, > 32 candidate tokens, oversize query rejected.
- R5 Open redirect: any redirect-like query param (`next, redirect, redirect_uri, return, returnTo, continue, dest, callback, goto, target, back, forward, u` ...) must be a same-origin allowlisted path accepted by `safeRedirectTarget` (no `//`, backslash, `:`, `@`, `%`, `?`, `#`, dot segments) or the whole link is `open-redirect`.
- R6 `web+ghostpay:` is normalised to `ghostpay:`.

## Acceptance tests
Invoice/URI/address deep links; navigate with safe `returnTo`; 5 hostile redirect params; trailing-dot host, userinfo, port, wrong route, plain `#section`; allowedSchemes handling; share-target: address in text, link in `url` with warning, URI in angle brackets, duplicate payload ok, two payloads rejected, nothing recognised, duplicates, param caps, unknown params ignored; `redactForLog` leaves no `SECRETKEY` marker.
