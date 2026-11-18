# CodeQL synthetic-fixture finding — bounded independent disposition

## Exact evidence

- Source PR: [#222](https://github.com/djshellshoxxx/GhostPay/pull/222), head `2bc2098298d90928eb1acafad969f28316bb05fc`.
- Findings check: `134777382565`; its reported failed state remains unchanged by this workstream.
- [Original annotation endpoint](https://api.github.com/repos/djshellshoxxx/GhostPay/check-runs/134777382565/annotations?per_page=100).
- [Copied annotation](../evidence/security/codeql-222-annotations-live.json): `apps/web/src/views/Settings.test.tsx`, line 47, columns 47–95; title `Clear text storage of sensitive information`, annotation level `failure`.
- [Exact source blob copy](../evidence/security/Settings.test.source.txt): Git blob `f73eee0286e0b0e490674ab5578240dcf796579c`. Independently checked: the full file has this same blob at both the original PR source and published candidate `9bad95e5cc0ee73f5adb8d2c587161074b21e080`.
- Prior independent review: [security-tooling review, CodeQL section](INDEPENDENT_SECURITY_TOOLING_REVIEW.md).

## Reasoning and disposition

The reported value is a literal synthetic URL on `rpc.example`, defined in the test file. The annotated statement
serializes that constant into jsdom localStorage so the next render can verify the warning for an already-saved
provider-looking key. `beforeEach` clears storage; the default `makeServices` fixture refuses RPC/network operations,
and this case supplies no network override. The flow does not take a real user/environment/provider secret as input.
These source facts support a false-positive disposition for **this one synthetic-fixture annotation**.

The independently reviewed official query title maps to
[js/clear-text-storage-of-sensitive-data](https://codeql.github.com/codeql-query-help/javascript/js-clear-text-storage-of-sensitive-data/)
(security severity 7.5). The annotation response itself omits `ruleId`; the mapping is from the official title,
not a claim to have retrieved fresh SARIF. No new test or analyzer was executed by this documentation review.

## What remains unresolved

The check is still failed. No scanner exclusion, suppression, alert dismissal, test renaming or check-clearance
operation was performed. The GitHub connector rejected the annotations/code-scanning endpoint families with
`INVALID_ARGUMENT`; the ordinary public annotation request succeeded, but the separate private alert request timed
out and supplied no fresh private inventory/SARIF. These are distinct access/result facts, not a verified absence
of findings. Final candidate CodeQL and SonarCloud results remain unqualified.

Production Settings can still persist provider-bearing RPC URLs in plaintext unless the user explicitly chooses
session-only storage. That policy and its residual exposure are separate from this fixture disposition. Neither
the source review nor a future clean fixture result should be described as clearing that production boundary.
