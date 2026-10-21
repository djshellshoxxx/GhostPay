# Audit: @ghostpay/cli
## Threat model
Operators run the CLI on laptops/CI with signing keys and webhook secrets, feeding it untrusted files (CSVs, invoice links, JSON). Risks: secrets leaking via argv/shell history/logs/error text; CSV or link injection; verifying "valid" while implying a trusted seller; silent overwrite of files; accidental network use or telemetry; float money; two inputs racing for stdin.
## Findings and fixes
- F1 Inline secrets: `--key`, `--secret`, `--private-key`, `--signing-key`, `--password`, `--passphrase`, `--mnemonic`, `--seed-phrase`, `--api-key` are refused with guidance; the value is never echoed (tested with `--key X` and `--key=X`). Secrets come only from file / stdin / env var NAME.
- F2 `--key-env` given a pasted secret instead of a NAME is rejected without echo (NAME regex check). Tested.
- F3 Key/secret bytes are zeroed in `finally` after use; error text for bad hex/length is fixed text (tested that no stream ever contains the key across 10 success/failure paths).
- F4 `invoice verify` distinguishes `valid-signature` from `trusted-seller` (needs `--pin`), prints a note when unpinned, flags test chains, never prints line items/memo, and exits 1 on invalid signature or expiry (injected clock; boundaries at `expiresAt-1` and `expiresAt` tested).
- F5 `invoice link` re-validates the output with `assertPaymentLink`, refuses http (localhost only with an explicit flag), warns on stderr that the link is a bearer secret (suppressed under `--json`). Verify accepts links via file/stdin only, so bearer links are not required on argv.
- F6 `batch confirm` re-parses the CSV and compares the preview hash, so file or option changes between preview and confirm fail (tampered amount, swapped destination, other chain id all tested). Issue output shows row/field/code only; formula-leading cell content not echoed (tested).
- F7 Output files: exclusive create by default, `--force` to overwrite, mode 0600 in the node adapter.
- F8 Inputs capped at 1 MiB (CLI check) and by byte size in the node adapter; JSON via the strict parser (no floats, duplicate keys). Unknown ledger/export rows get shape checks so library TypeErrors do not surface as INTERNAL.
- F9 Unexpected exceptions map to a generic `INTERNAL` message (error text from unknown exceptions is never printed).
- F10 Found while testing: signing/webhook secrets and bodies cannot both come from stdin; second read is refused (`STDIN_TWICE`).
## Verification run
`npm test -w @ghostpay/cli` (53 tests; coverage 98.4% stmts / 96.1% branches / 100% funcs / 99.4% lines vs thresholds 95/90/95/95), typecheck, lint, build all pass. `dist/bin.js` smoke-tested for `--version`, `webhook sign` via stdin, refused `--key`, `sub schedule`.
## Honest limits
- Secret files are not permission-checked (no warning for world-readable key files). Env vars are visible to same-user processes and `/proc/<pid>/environ`.
- `webhook verify` is stateless: replay protection is not checked across runs (output says so).
- A valid signature plus `--pin` is only as trustworthy as where the pin came from.
- Zeroing is best effort: the hex text read from file/env/stdin lives in immutable JS strings that cannot be wiped.
- `batch confirm` creates no payment object; it only outputs the plan id. Nothing here submits transactions.
- `bin.ts` (6 lines of process wiring) is excluded from coverage; the adapter `node-io.ts` is tested against a temp dir. Windows behaviour and real TTY stdin are not tested.
- `sandbox chain demo` is a deterministic mock (no EVM semantics).
- Expiry uses the local system clock; a wrong clock is only caught by `doctor`'s coarse sanity check.
- `package-lock.json` is not updated here (coordinator runs npm install); no new third-party dependencies were added.
