# Sonar gate follow-up — 2026-11-09

Read-only observation at 10:15 UTC, before the successor implementation. This
supplements [the annotation triage](SONAR_TRIAGE_2026-11-09.md); it does not
resolve or suppress any finding.

| Exact source | Fresh GitHub check-run result |
| --- | --- |
| PR #84 `48b6bc20108079bb7fbf89997249734bf9f41646` | 33 checks: 31 success, SonarCloud failure, CodeRabbit draft-review skip |
| PR #89 `cfc7b0f3325a550df830584e86db4c38bcc9d6b2` | 26 checks, all success; no Sonar check returned |

The [parent Sonar check](https://github.com/djshellshoxxx/GhostPay/runs/128302927200)
still reports **D Security Rating on New Code**, required A, and twelve
annotations. The child results do not clear that gate. Existing annotations
lack the rule IDs, Sonar severity/type, new-code classification and complete
inventory needed to identify its cause.

## Exact access blocker

One ordinary HTTPS request to each endpoint below returned HTTP 403 with a
CloudFront HTML `Request blocked` response:

- `https://sonarcloud.io/api/issues/search?componentKeys=djshellshoxxx_GhostPay&pullRequest=84&resolved=false&types=VULNERABILITY&ps=100`
- `https://sonarcloud.io/api/qualitygates/project_status?projectKey=djshellshoxxx_GhostPay&pullRequest=84`

No Sonar credential variable or Sonar connector was available in this executor.
GitHub read access succeeded. These observations do not identify whether the
403 is a service rule or an environment restriction. No repeated retries,
credential changes, issue-state changes or quality-gate changes were made.

Closure requires authorized Sonar access to the PR84 issue/hotspot inventory
and project gate, including rule ID, severity, vulnerability/hotspot type,
new-code status and source location, followed by reproduction of the causal
finding. No source edit can honestly be attributed to this inaccessible
inventory. The prior Bitcoin signed-int, Tor/I2P and keyboard-focus cautions
remain applicable. Independent product work continues.
