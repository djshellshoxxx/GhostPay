#!/usr/bin/env bash
# Re-runs every PoC. From the repo root:  bash docs/audits/poc/run-all.sh
# Needs: built libs (npm run build:libs), a built web bundle (DIST), a built relayer (RELAYER_DIST), preinstalled Chromium.
# Used in the review: clean-room copies produced with `git archive HEAD` (see report "Reproducibility"); paths below are examples.
set -u
cd "$(dirname "$0")"
DIST="${DIST:-../../../apps/web/dist}"
RELAYER_DIST="${RELAYER_DIST:-../../../apps/relayer/dist}"
export RELAYER_DIST
echo "### 01 secret redaction";            node poc-01-secret-redaction-bypass.mjs
echo "### 02 stealth edge cases + forged announcement"; node poc-02-stealth-edge-and-forged-announcement.mjs
echo "### 03 invoice parser fuzz";         node poc-03-invoice-parser-fuzz.mjs
echo "### 04 browser CSP/XSS/referrer";    node poc-04-browser-csp-xss-referrer.mjs "$DIST"
echo "### 05 relayer HTTP layer";          node poc-05-relayer-http.mjs
echo "### 06 malicious RPC";               node poc-06-malicious-rpc.mjs
echo "### 07/08 vitest PoCs";              (cd ../../.. && node_modules/.bin/vitest run --root docs/audits/poc --reporter=verbose poc-07-direct-sweep.test.ts poc-08-keystore-and-jitter.test.ts)
echo "### 09 preview vs calldata";         node poc-09-preview-vs-calldata-mutations.mjs
echo "### 10 history DB";                  node poc-10-history-db-leak.mjs "$DIST"
echo "### 11 relayer breaker stuck";       node poc-11-relayer-breaker-stuck-half-open.mjs
