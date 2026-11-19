# Self-host image defaults and public Compose validation — 2026-11-19

Requirements: F-HOST-01 and SEC-26; selective recovery of PR #209's existing
`08c26b12` defaults and regression checks. Base:
`bda57c32039fa4908cacc8fdeecfe29f44d47ad7`.

## Source change

The existing nginx image and Tor base defaults now carry the registry digests
already selected by the historical work. The same values appear in the public
environment example, Compose defaults and Tor Dockerfile. Independent public
Docker Hub tag metadata checks on 2026-11-19 confirmed both identities. No relayer
base, container family or package version was upgraded.

The existing selftest now checks the digest format and agreement of those
defaults. All original archive, authenticity, interrupted-install and consent
checks remain. CI also validates the public Compose model with and without the
onion profile in its existing `secrets-and-egress` job. This uses an explicit
`.env.example`, a new empty Docker configuration and
`config --no-env-resolution --quiet`; it does not resolve service env files or
invoke image/container lifecycle operations.

The operator documentation now states the digest provenance and actual limits:
the Tor apt package selection remains mutable, digest identity is not a
vulnerability or runtime qualification, and the public HTTPS terminator owns
HSTS. No new Dependabot schedule, workflow trigger, permission, release policy,
package metadata, finding suppression or deployment behavior was added.

## Actual checks

| Check | Result |
| --- | --- |
| Recovered pin assertions on the original defaults | Exit 1: exactly three failures, for the unpinned nginx default, Tor Compose base and Tor Dockerfile base. |
| The same selftest after default correction | Exit 0: `selfhost selftest: ok`, including all existing archive and release-gate checks. Node 22.23.4, 512 MiB heap, shared qualification mutex. |
| Public Compose model, default services | Exit 0, no output. |
| Public Compose model, onion profile | Exit 0, no output. |
| Compose CLI provenance | Official v5.8.0 Linux asset SHA256 matches both GitHub release metadata and its published checksum file. |
| Workflow and shell structure | YAML and shell syntax pass; removing the one added step yields the unchanged prior CI model. |
| Header parity and pinned actions | Existing proxy-header check passes; all 114 action references remain pinned. |

Source hashes, commands, baseline/corrected logs, registry identities and the CLI
checksum are recorded in `evidence/selfhost-pins-20261119/`. The validation CLI
was run without a Docker daemon. Its temporary Docker configuration was empty;
operator credentials and private configuration were not inspected.

## Remaining acceptance

The coordinator independently reviewed the source diff and reported **PASS**.
Exact combined hosted CI remains coordinator-owned.
This task supplies source and read-only configuration acceptance, not live-host
qualification. No container was pulled, built or started. Image vulnerability
assessment, build reproducibility, live mount permissions, API operation, TLS,
public headers and Tor reachability still need their respective acceptance.
The unchanged release and self-host authenticity gates continue to apply.
