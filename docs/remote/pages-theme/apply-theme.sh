#!/usr/bin/env bash
# Usage: apply-theme.sh <built-output-dir>
# Copies theme.css + fonts into the OUTPUT dir and links theme.css after the
# existing stylesheets in the OUTPUT index.html. Source tree is never touched.
set -euo pipefail
OUT="${1:?usage: apply-theme.sh <built-output-dir>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$OUT/index.html" ] || { echo "no $OUT/index.html" >&2; exit 1; }
cp "$HERE/theme.css" "$OUT/theme.css"
mkdir -p "$OUT/fonts"
cp "$HERE/fonts/Michroma-Regular.ttf" "$HERE/fonts/OFL.txt" "$OUT/fonts/"
if ! grep -q 'href="./theme.css"' "$OUT/index.html"; then
  node -e '
    const fs=require("fs");const f=process.argv[1];let h=fs.readFileSync(f,"utf8");
    const tag="<link rel=\"stylesheet\" href=\"./theme.css\">";
    if(!h.includes("</head>")) process.exit(2);
    h=h.replace("</head>","    "+tag+"\n  </head>");fs.writeFileSync(f,h);' "$OUT/index.html"
fi
grep -q 'href="./theme.css"' "$OUT/index.html" && echo "theme applied to $OUT"
