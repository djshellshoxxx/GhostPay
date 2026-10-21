# GitHub Pages prototype hosting

Prototype only. Serves the static SPA `apps/web` at https://djshellshoxxx.github.io/GhostPay/ from the orphan branch `gh-pages` (only build output + `.nojekyll`).

## Findings
- Router: none; invoice state lives in the URL fragment (`#gpi=...`), so no history-routing/404.html fallback is needed.
- Asset base: `vite.config.ts` has `base: './'`; the build is made with `--base=/GhostPay/` (absolute prefix, no source change).
- Manifests are fetched relative (`deployments/<chainId>.json`). None is shipped, so payments are disabled (404s on these in the console are expected).
- CSP: `index.html` already carries a `<meta http-equiv="Content-Security-Policy">`, which is kept in the output.

## Build and publish
```
npm ci && npm run build:libs
cd apps/web
npx tsc -p tsconfig.json --noEmit
npx vite build --base=/GhostPay/ --outDir "$OUT" --emptyOutDir
rm -f "$OUT/_headers"; touch "$OUT/.nojekyll"
node -e "import('./scripts/scan-bundle.mjs').then(m=>console.log(m.scanBundle(process.argv[1],'src','vite.config.ts')))" "$OUT"   # [] expected
cd ../..
git worktree add --orphan -b gh-pages "$WT"      # first time; later: add worktree on existing gh-pages
cp -a "$OUT"/. "$WT"/ && cd "$WT" && git add -A && git commit && git push origin gh-pages
```
For a rebuild, replace the worktree contents (`git rm -rf .` first) so stale assets disappear.

## Enabling
Repo owner: Settings > Pages > Build and deployment > Deploy from a branch > `gh-pages` / `/ (root)`.

## CSP limitations
Pages cannot send HTTP headers, so `public/_headers` is dropped. Lost: `frame-ancestors` and `X-Frame-Options` (clickjacking/framing protection; meta CSP ignores frame-ancestors), `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `X-Content-Type-Options`, `Cross-Origin-Resource-Policy`, cache headers, and the HTTP `Referrer-Policy` (the `<meta name="referrer">` still applies). The meta CSP keeps script/style/connect/worker/object/base-uri/form-action restrictions.

## Known gaps
- Payments disabled: no deployment manifest.
- Embed SDK/popup mode not supported on Pages (see apps/web/DEVIATIONS.md).
- Not a hardened production host.

## Theme (cypher / neon)
A CSS-only overlay in `docs/remote/pages-theme/` (see its README for font source, license, contrast). After the normal build and `scan-bundle` step run `bash docs/remote/pages-theme/apply-theme.sh "$OUT"`, then publish as above. Source in `apps/web` is not modified; CSP meta unchanged (same-origin CSS and font only).
