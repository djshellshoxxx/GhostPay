# Global masking: generation 2 review and handoff

## Released implementation

Branch `privacy/v1-masking-20261120`; reviewed predecessor `1110d51fb512803353b3361e8f76ec5eefa177e9`. Tested source **`ea6759e50655e9a4a469bb59bd0cb05ca2515bf6`**, tree `1edc0e83c0edc74516af6a4e327590725d39f306`. Generation 2 changed only two production spans: `AppShell.tsx` execution-storage refresh fallback and `Pay.tsx` execution-settings identity/context dependencies. No external code, new dependency, storage format, cryptography, fee, contract or network destination was introduced. The existing `sameExecutionSettings` module was reused.

## Findings repaired

1. **Unintended reveal on storage refresh.** The UI-only storage handler preserved the current privacy fallback, but the execution-settings handler reloaded defaults. Origin-wide clearing, missing preferences, malformed preferences and refused preference reads could turn an already masked screen visible without an explicit privacy change. Four real AppShell regressions failed before the repair. The execution refresh now overlays valid visual preferences with the current tab's choice as fallback. Existing execution-grant revocation remains, drafts and seller authority are preserved, and a deliberate later toggle can still turn privacy off.
2. **Prepared payment lost after a privacy-only change.** `refreshContext` depended on the entire app object, while operation guards compared entire settings objects. Changing only masking rebuilt the context beneath an existing prepared payment, removing the final preview without restoring Prepare; an in-flight preparation could remain stranded. Two real Pay regressions failed, while the actual execution-settings-change refusal already passed. The repair retains one captured execution-settings identity across only the two presentation preferences excluded by the existing comparator. Every other own field, future field, endpoint/signer reference, session, invoice and network authority remains guarded. Refresh dependencies now track the actual execution inputs. The tests assert the same prepared object/transaction values, no added RPC or wallet calls from hiding/revealing, and explicit submission only after the user's Send action.

## Independent review

- `privacyMode.tsx` bounds deliberate grants with wall and monotonic clocks, invalidates on bad/rollback clocks and revokes on visibility, page, session and lock changes. Expired grants cannot revive. Route/invoice/sweep/session scope remains opaque.
- `PrivacyBoundary` uses native hidden, inert and aria-hidden. It clears selected text and moves focused controls to the neutral privacy control. Mounted DOM, drafts and recovery workflows remain intact; this is presentation concealment, **not DOM or JavaScript memory erasure**.
- Quick hide remains one-way, refuses unrelated/prevented/composition events and removes its listener on disable/unmount. Independent history consent stays independent.
- The shell masks sensitive routes, main prelude and live announcements. Settings wraps its endpoint, signer and exchange details separately while keeping neutral controls available. Home/About contain neutral product information. Render-error fallback is fixed text.
- The existing original browser journey checks actual rendering/accessibility, keyboard focus and a retained input/key through expiry and navigation. It was inspected, **not executed** here. Chromium-only fixtures do not establish Safari or real-device behavior.

## Actual execution

All Vitest runs used the original configuration from `apps/web`, `--coverage=false --maxWorkers=1`, and `NODE_OPTIONS=--max-old-space-size=1024`.

| Source/check | Result |
| --- | --- |
| Initial independent three-file run at76c32fce |39 passed; zero skips; exit0 |
| Storage regression at253cef90 |4 failed;8 intentionally filtered; exit1 |
| Storage repair at9b443f7b |49 passed in4files; zero skips; exit0 |
| Pay regression at6e2c839c |2 failed,1 passed; zero skips; exit1 |
| Final combined focused source above |**66 passed in8files**, zero skips,17.85s, exit0 |
| Secret scan and complete feature-range whitespace |Passed |
| Two-file typed ESLint attempt at9b443f7b |Killed with exit137; no diagnostics; **not qualified** |

Final command:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/views/Pay.masking.test.tsx src/views/Pay.network.test.tsx src/views/Pay.preflightCompletion.test.tsx src/lib/executionSettings.test.ts src/lib/privacyMode.test.tsx src/components/PrivacyQuickHide.test.tsx src/AppShell.privacy.test.tsx src/lib/settings.uiPrivacy.test.ts --coverage=false --maxWorkers=1
```

Earlier successful selections overlap the final66; do not sum them as distinct coverage. Complete unmodified logs are compressed next to the receipt, which records hashes. The empty lint child log and the shell's exit137 are recorded separately. Root's original whole-web typecheck also remained resource-blocked; that is coordinator evidence, not a pass on this branch.

## Fresh generation assignment

Integrate this source with released v1 wallet and history repairs, then v1.1 disclosure separately. The new `Pay.masking.test.tsx` is intentionally standalone v1: its `connected()` helper and explicit Send need the disclosure team's explicit per-request approvals in v1.1, without bypassing the production gate. Preserve the two AppShell edits as separate spans: storage fallback here, disclosure gate scope in its own team.

Review and execute the combined original Pay quote/expiry/journal checks, full typed lint/typecheck and coverage, and original `e2e/privacy-mask-history.spec.ts` under an adequate runtime. Preserve existing browser build/security gates; do not substitute a weaker build and call it original qualification. Confirm masking does not revive stale wallet/network authority or restore obsolete outcomes after the full lifecycle merge.

A next bounded inspection is the sibling stale-settings-revision branch inside `AppShell.updateSettings`: assess its fallback when a clipboard-only preference is changed after an execution write whose storage event has not arrived. No defect/result is asserted for that unexecuted scenario in this milestone. Keep independent manual privacy consent and execution revocation distinct.

All release/full-browser/hosted gates remain open. No remote mutation, deployment, release or shared integration-lock change occurred.
