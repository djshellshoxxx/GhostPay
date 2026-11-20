# Privacy-safe outputs: generation 1 handoff

Source `81e295a3cdf3e75d5a64f36cefe395aa233cce0c`, tree `fd3ddbbc8278660c5cea33142e23c9f2f49a3a70`. Published base 13762896 already contains neutral recovery filenames and bounded generic errors. This generation fixed two additional incidental filenames: policy hash prefix becomes `ghostpay-policy.json`; tag-archive date becomes `ghostpay-tags.gpa`. Canonical policy JSON and the encrypted archive creation timestamp/payload remain unchanged. No external implementation was copied.

Behavioral regressions were committed before production changes (69bda52a): 3 failed, 27 filtered. All three then passed; the original green shell completion receipt was not retained, so that result is reported from its full log only. A subsequent complete original-file run at the source above passed **34/34 in 3 files, zero skips, exit 0**,31.66 seconds:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/lib/errors.test.ts src/lib/tagArchive.test.ts src/features/policy/PolicyView.more.test.tsx --coverage=false --maxWorkers=1
```

These include exact canonical policy data, 1- and 1,000-tag archive round-trips and existing neutral error behavior. Compressed unmodified logs plus hashes are adjacent. Selected red/green cases are subsets of the 34; do not add them as separate coverage.

## Fresh successor task

Independently review remaining export/notification/title/live-region call sites against v1-05-outputs. Preserve exact recovery and intended encrypted-invoice bytes. Any further defect needs a narrow regression and bounded repair. Reuse existing modules; no new Notification API, wire format, dependency, cryptography, deletion or remote publication. Inspect filenames separately from payloads. Record exact source and focused versus full/browser qualification; original typing, lint and complete release gates remain open. Finish at a tested milestone with an internal next-generation handoff.
