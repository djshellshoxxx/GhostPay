# Remaining Sonar review — PR 47

**Not cleared. Required Security A / Reliability A remain unchanged.** At public
commit `88e5525eb90f84d42e4895114680e33395c0ce45`,
[check 125491709207](https://github.com/djshellshoxxx/GhostPay/pull/47/checks?check_run_id=125491709207)
fails Security D and lists three annotations. This document prepares review;
it does not change any issue status, rating, credentials or acceptance gate.

| Issue | Public source | Evidence to inspect |
| --- | --- | --- |
| `AaGdFRReO3RpFBaCNYrh` | `tools/portable-hosting-kit/src/wizard.mjs:94` | One of two HTTP overlay-origin prompt examples. Confirm the exact highlighted literal. |
| `AaGdFRReO3RpFBaCNYrg` | Same line, second annotation | Review separately: onion/I2P guidance has transport-specific requirements. |
| `AaGdFRUbO3RpFBaCNYrk` | `scripts/audit/gen-audit24-report.py:90` | `SCRATCH` is a string-redaction pattern, not a filesystem write or temporary-directory allocation. |

The wizard supplies examples to `parseHostConfig`; it does not request those
origins. `tools/portable-hosting-kit/src/config/host-config.mjs` requires HTTPS for
clearnet and validates the supported generated onion/I2P HTTP profiles, rejecting
credentials, paths, malformed overlay names and unsupported overlay HTTPS.
Blindly replacing these examples with HTTPS would contradict the generated
profiles. The config/wizard tests and Tor/I2P documentation record these limits;
they do not certify an overlay deployment or wallet/RPC privacy.

The audit generator applies `SCRATCH` to text to redact machine-local paths.
Inspect its call sites and filesystem operations separately before classifying
the annotation. Removing redaction or disguising the literal is not a justified
repair. The reviewed file-permission hardening remains in place; absence of its
prior annotations does not itself establish external issue status.

An authorized Sonar reviewer must confirm the final analyzed revision, exact rule
and highlighted token, then record each justified disposition through the actual
service workflow, or identify a concrete functional correction. Retain the issue
URL, reviewer, rationale, revision and resulting status. Obtain fresh analysis of
the final candidate and verify the required ratings directly. Source review,
passing tests and this proposal do not substitute for that result. No blanket
acceptance, rule suppression, source hiding or gate change is requested.
