# Independent browser privacy cross-review

Reviewer: `metadata_privacy`. Implementation owner: `browser_privacy`.
This is an AI-assisted source and regression review, not a professional external audit.

Working baseline: PR #238 `198aa5baff22272453733a0f3dcfcac0e0994eec` on
`chatgpt/ghostpay-tm-hardening-20261118`. Final source hashes are recorded below.

## Scope inspected

- `settings.ts`: credential-path heuristics, URL normalization and session-only markers.
- `settingsExchange.ts`: primary/secondary export selection and source preservation.
- `Settings.tsx`: rejected-form atomicity, session-only escape hatch, stored-profile status and cross-tab updates.
- `networkSelection.ts`: strict browser-persistence validation, missing preference versus malformed/pending policy.
- `defaultServices.ts`: creation-time selection and existing per-dispatch gate for cached clients/retries.

## Confirmed finding and resolution

**Medium, TM14: incomplete persisted policy initially failed open.** The first implementation checked only
supplied object entries against the package parser's normalized output. `{}` or a partially damaged acknowledged
policy therefore acquired missing fields from defaults, including a missing `rpcMode` becoming the public single-RPC
mode. This contradicted the new strict browser-storage boundary. The reviewer sent the finding to the owner and
coordinator; the coordinator had independently identified it as well.

The owner added six failing regressions (empty object, acknowledgement-only object, and each missing canonical field)
and required the raw object to have exactly the canonical field count as well as matching allowed values. The pure
package parser retains its existing permissive behavior for other consumers; the browser persistence boundary is
strict. Reinspection confirms no provider replacement is inferred from a present incomplete policy.

## Independent executed verification

From `apps/web`:

```
node ../../node_modules/vitest/vitest.mjs run src/lib/settingsPrivacy.test.ts src/lib/defaultServices.privacySelection.test.ts src/lib/settingsExchange.test.ts --maxWorkers=1
```

Result: **3 files passed, 46 tests passed, exit 0**, Vitest 5.1.0 / Node v24.22.3.
Log: `metadata-browser-cross-review.log`.

This includes session-only URL normalization/exclusion, decoded credential-label heuristics, primary/secondary
export exclusion without changing source settings, exact storage-policy completeness, unreadable/corrupt/pending
policy refusal, and cached-client/retry blocking. Existing settings-exchange compatibility cases also passed.

No remaining material blocker was found in these reviewed changes. This does not qualify every browser egress
surface, cross-tab user journey or real Tor/own-node deployment. The Settings UI was source-reviewed here; its
interactive tests and whole-web/browser qualification remain the implementation owner's/coordinator's commands.
Credential detection remains heuristic and the user-facing session-only checkbox is available even for a missed
credential. Network settings remain device/page preferences, not seller private keys.

## Reviewed runtime SHA-256

| Path | SHA-256 |
|---|---|
| `apps/web/src/lib/settings.ts` | `95c926b144203659227190e8837506c27c1e39947c5a48fa383c70e260eb4e1c` |
| `apps/web/src/lib/settingsExchange.ts` | `7084d81e91486a347970f594c76e701b8f2adada8101b8306d4dede7e4dd226a` |
| `apps/web/src/views/Settings.tsx` | `6c12f5cee917687a9146dc4af998ad1c6d0ae5044f4d636ef09e268bbabec4c2` |
| `apps/web/src/lib/networkSelection.ts` | `b4f411e560789c31a66833558c100da3d207ade435d8c7c767cd07fb8d5c1ec1` |
| `apps/web/src/lib/defaultServices.ts` | `a4a16a34da4b1b711cd8feb4d39328c8cc177656bdc899238e3a2fc298c92b71` |
