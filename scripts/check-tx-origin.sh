#!/usr/bin/env bash
# Fails (exit 1, listing file:line) if `tx.origin` appears in Solidity sources under packages/*/src/** or
# packages/*/contracts/** (spec 04: contracts must not authenticate or branch on tx.origin).
# Fail-closed by design: only pure line comments (a line whose first non-blank characters are `//`) and the body of a
# block comment that starts a line (`/*` ... `*/`) are skipped. A trailing `// tx.origin` comment on a code line, a
# `/* x */ code` line, a `*`-prefixed continuation line or a string containing `//` are all checked, so a mention there
# fails and must be reworded. Test and script directories are excluded; `lib` directories are not (packages/*/src/lib
# holds deployed library code; vendored forge-std lives outside the scanned roots).
# Usage: scripts/check-tx-origin.sh [repo-root]   (default: repository root)
set -euo pipefail

root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
status=0
count=0

files=()
while IFS= read -r file; do
  count=$((count + 1))
  files+=("$file")
  lineno=0
  in_block=0
  prev=''
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    code="$line"
    if [ "$in_block" -eq 1 ]; then
      # Inside a block comment: skip up to and including the closing `*/`, check whatever follows it.
      if [[ "$code" == *'*/'* ]]; then
        code="${code#*\*/}"
        in_block=0
      else
        continue
      fi
    elif [[ "$code" =~ ^[[:space:]]*// ]]; then
      continue
    elif [[ "$code" =~ ^[[:space:]]*/\* ]]; then
      if [[ "$code" == *'*/'* ]]; then
        code="${code#*\*/}"
      else
        in_block=1
        continue
      fi
    fi
    if [[ "$code" =~ tx[[:space:]]*\.[[:space:]]*origin ]]; then
      echo "ERROR ${file#"$root"/}:$lineno: tx.origin must not be used: $line"; status=1
    elif [[ -n "$prev" && "$prev $code" =~ tx[[:space:]]*\.[[:space:]]*origin ]]; then
      # `tx` and `.origin` split across lines (comment/blank lines between are skipped): same fail-closed rule.
      echo "ERROR ${file#"$root"/}:$lineno: tx.origin split across lines must not be used: $line"; status=1
    fi
    # Remember only a trailing `tx` / `tx.` fragment of the last non-blank code line.
    if [[ "$code" =~ [^[:space:]] ]]; then
      if [[ "$code" =~ (^|[^[:alnum:]_])tx[[:space:]]*\.?[[:space:]]*$ ]]; then prev="$code"; else prev=''; fi
    fi
  done < "$file"
done < <(find "$root"/packages/*/src "$root"/packages/*/contracts -type f -name '*.sol' \
  -not -path '*/test/*' -not -path '*/tests/*' -not -path '*/script/*' -not -path '*/scripts/*' \
  -not -path '*/node_modules/*' 2>/dev/null | LC_ALL=C sort)

# Second, additive pass over each whole file: drop all comments (keeping newlines) and match `tx` `.` `origin` across any
# whitespace/line breaks. The per-line checks above stay as they are (stricter: a mention inside a comment on a code
# line still fails); this pass only adds failures, for splits that hide behind comments or several lines.
if [ "${#files[@]}" -gt 0 ]; then
  node - "$root" "${files[@]}" <<'NODE' || status=1
const { readFileSync } = require('node:fs');
const [root, ...files] = process.argv.slice(2);
let bad = 0;
for (const f of files) {
  const t = readFileSync(f, 'utf8');
  let o = '';
  for (let i = 0; i < t.length; ) {
    if (t[i] === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') { o += ' '; i++; } }
    else if (t[i] === '/' && t[i + 1] === '*') {
      o += '  '; i += 2;
      while (i < t.length && !(t[i] === '*' && t[i + 1] === '/')) { o += t[i] === '\n' ? '\n' : ' '; i++; }
      if (i < t.length) { o += '  '; i += 2; }
    } else { o += t[i]; i++; }
  }
  const re = /(?<![A-Za-z0-9_$])tx\s*\.\s*origin(?![A-Za-z0-9_$])/g;
  let m;
  while ((m = re.exec(o)) !== null) {
    const line = o.slice(0, m.index).split('\n').length;
    console.log(`ERROR ${f.startsWith(root + '/') ? f.slice(root.length + 1) : f}:${line}: tx.origin (split across lines or comments) must not be used`);
    bad = 1;
  }
}
process.exit(bad);
NODE
fi

if [ "$status" -eq 0 ]; then
  echo "OK: no tx.origin in $count Solidity source file(s)."
fi
exit "$status"
