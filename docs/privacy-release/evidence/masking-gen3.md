# Global masking generation 3: stale settings-update refusal

## Source and bounded repair

Branch `privacy/v1-masking-20261120`; reviewed base `59188a23e7f98e3119011f160627f088ab88ed8d`. Tested runtime **`32930d6615310e78009b525841fec58cba07f805`**, tree `4ae7a9626071a1961bd053a02902d958468d93f7`. Generation 4 independent review identified the sibling fallback named by the M2 handoff, and this generation reproduced its behavior. Only the stale-revision fallback in `apps/web/src/AppShell.tsx` changed in production: five inserted lines replace one direct settings reload.

A newer execution-settings write can be visible before its cross-tab storage event reaches this shell. The existing guard correctly refuses the obsolete edit and loads the newer settings. However, its previous `setSettings(loadSettings())` defaulted the visual settings when the separate UI preference record was missing, malformed or unreadable. An already masked screen consequently became visible even though the attempted clipboard/settings edit was refused.

The repair uses a functional state update and overlays `loadPrivacyPreferences(current)` on the newly loaded execution settings. It reuses the existing helper and the already reviewed storage-event pattern. Current masking and clipboard preference survive unavailable preference storage; valid saved choices still load normally. Existing revision refresh, RPC cache clearing, session-only endpoint clearing, network invalidation, fixed error announcement and `return false` remain in place. No dependency, storage format, cryptography, network destination, wallet/disclosure API, fee or contract changed.

## Regression and acceptance evidence

Six actual AppShell cases cover the real clipboard selector and a captured stale settings-form update, each with missing, corrupt and blocked privacy storage. The latter invokes the actual context handler; the handler and network authority are not mocked. Tests preserve the newer execution-settings bytes exactly, refuse the obsolete candidate, observe one authority revision advance, retain seller session and mounted sensitive content/draft, avoid RPC creation, and permit a new deliberate privacy choice without revoking its fresh grant.

| Execution | Exact result |
|---|---|
| Initial fixture at5493bf01 |6 setup failures,12 filtered,exit1; frozen network authority rejected a spy before the behavior ran |
| Corrected tests-only baseline at5f845ce8 |**6 behavioral failures**,12 deliberately filtered,exit1; mask became false |
| Final runtime above |**40 passed across4complete files**,zero skips,8.30s,exit0 |
| Secret scan |Passed |
| Working-tree and complete generation-range whitespace checks |Passed |

The initial fixture was corrected by observing the real authority's revision counter; production source remained unchanged until the behavioral RED was captured. Both failure logs remain recorded. The six new cases are part of the final40 and are not additional coverage. Prior-generation selections overlap this run and must not be summed as a unique total. Complete unmodified compressed logs, exact commands and raw-log hashes are in [masking-gen3/evidence.json](masking-gen3/evidence.json).

Original focused acceptance from `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/AppShell.privacy.test.tsx src/views/Settings.clipboardPrivacy.test.tsx src/lib/settings.uiPrivacy.test.ts src/lib/executionSettings.test.ts --coverage=false --maxWorkers=1
```

## Fresh successor assignment

Merge this released masking branch into the isolated standalone v1 candidate, then merge that source into v1.1. Preserve the separately owned disclosure provider/scope and its explicit approvals in existing AppShell fixtures. Review both settings refresh entry points together: a rejected stale execution edit must preserve current visual fallback while accepting the newer execution revision; it must never silently overwrite that newer selection or revive an old network grant.

Run original combined typecheck, typed lint, complete coverage and browser/privacy journeys in the coordinator's resource window, with exact-source evidence. This generation ran no heavy typing, lint, build, browser or hosted gate. It does not claim release qualification, DOM/JavaScript memory erasure, network privacy or deployment. The original recovery and submission-evidence protections remain outside this narrow settings repair.

No remote write, deployment, main merge, shared integration-lock mutation or gate waiver occurred. Source ownership is released after this tested milestone.
