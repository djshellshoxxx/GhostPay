# Post-integration compatibility checks — 2026-11-19

All checks here ran against unchanged source
`ed6ab88896d5d4310c9aae7e2434cc187637c00d`, using Node 22.23.4.
The original command arrays, exit codes and logs are retained in
[postintegration-evidence](postintegration-evidence/manifest.json).

| Check | Result | Scope |
| --- | --- | --- |
| Solana adapter build | PASS, 8.375 seconds | Integrated adapter source |
| TRON adapter build | PASS, 5.898 seconds | Integrated adapter source |
| Full CLI typecheck, 768 MiB heap | KILLED, exit 137, 25.327 seconds | No TypeScript diagnostic before termination |
| Full CLI typecheck, one 640 MiB retry | KILLED, exit 137, 17.085 seconds | No TypeScript diagnostic before termination |
| CLI build, 512 MiB heap | PASS, 57.798 seconds | Existing package build command |
| CLI chain regressions | PASS, 45/45, 30.218 seconds | Existing chain-commands file, no skips |
| Package-map validation | PASS | Existing repository check |
| Action pin validation | PASS | 114 existing action references |

The complete CLI typecheck is unqualified locally at this source. The earlier
worker typecheck and the three hosted CLI-platform checks at `28edbcf5` are
separate evidence, not a substitute for this resulting candidate's typecheck.
No gate, coverage threshold or timeout was changed. Further identical local
typecheck attempts were stopped after the bounded retry; the published candidate
must receive its own hosted qualification.
