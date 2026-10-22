#!/usr/bin/env bash
# Usage: build-site.sh <out-dir> [--skip-app] [--base=/GhostPay/]
# Builds apps/web (vite, absolute base), applies the neon theme, assembles the help/marketing pages and adds
# a static link strip to the OUTPUT index.html (outside #root, no scripts). Sources are never modified.
set -euo pipefail
OUT="${1:?usage: build-site.sh <out-dir> [--skip-app]}"; shift || true
SKIP_APP=0; BASE=/GhostPay/
for a in "$@"; do case "$a" in --skip-app) SKIP_APP=1;; --base=*) BASE="${a#--base=}";; esac; done
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
if [ "$SKIP_APP" = 0 ]; then
  ( cd "$REPO" && npm run build:libs >/dev/null )
  ( cd "$REPO/apps/web" && npx vite build --base="$BASE" --outDir "$OUT" --emptyOutDir )
  rm -f "$OUT/_headers"
fi
[ -f "$OUT/index.html" ] || { echo "no app build in $OUT" >&2; exit 1; }
touch "$OUT/.nojekyll"
bash "$REPO/docs/remote/pages-theme/apply-theme.sh" "$OUT"
node "$HERE/src/build.mjs" "$OUT"
# Static strip in the OUTPUT index.html, before <div id="root"> (React only owns #root, so it survives hydration).
node -e '
  const fs=require("fs");const f=process.argv[1];let h=fs.readFileSync(f,"utf8");
  if(h.includes("gp-strip")) process.exit(0);
  const strip="<nav class=\"gp-strip\" aria-label=\"GhostPay guides\"><a href=\"./help/\">Help</a><a href=\"./how-it-works.html\">How it works</a><a href=\"./privacy-options.html\">Privacy options</a><a href=\"./why.html\">Why</a></nav>\n    ";
  if(!h.includes("<div id=\"root\">")) {console.error("no #root");process.exit(2);}
  h=h.replace("<div id=\"root\">",strip+"<div id=\"root\">");
  h=h.replace("</head>","    <link rel=\"stylesheet\" href=\"./site.css\">\n  </head>");
  fs.writeFileSync(f,h);' "$OUT/index.html"
grep -q gp-strip "$OUT/index.html" && echo "site assembled in $OUT"
