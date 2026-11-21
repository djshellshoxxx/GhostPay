# Acceptance-report redaction review

- Reviewed source: `3758a6cce3705c374b988018b1cb54b0e44726ed`.
- Comparison: published `c0dd03e2585089a5c1d57e9cb1f04a0fa4939023`.
- Implementer: `/root`. Independent reviewer: `/root/tor_startup_race_review`.
- Verdict: approved for integration; no concrete blocking source finding.

| File | Exact reviewed Git blob |
| --- | --- |
| `scripts/tor/identity-container.mjs` | `37c3959117f792d767c2853063bbe60a4bd46ba8` |
| `scripts/tor/identity-diagnostics.test.mjs` | `b1347c4879b1340724e76b1e0b02a827fe6b3a29` |

The reviewer verified that native assertion values can no longer enter the
report: exception text is discarded, and the catch records only authored stage
labels, bounded failure codes and a fixed error string. Existing classified
Docker failures preserve their specific records. The image digest is validated
before assignment; invalid output leaves the exported field empty.

Identity assertions, expected Docker exits, network isolation and cleanup loops
are unchanged. A failed acceptance check remains a failure. The three new
regressions use synthetic Docker output to test unexpected verification stdout,
identical generated hostnames and invalid image-inspection output. They inspect
the JSON report and both process streams, retain nonzero exit, and compare
created versus removed volumes. The prior ten diagnostic cases remain.

The reviewer independently executed `node --test
scripts/tor/identity-diagnostics.test.mjs`: **13 passed, 0 failed, 0 skipped**.
Both JavaScript files passed `node --check`; the source patch passed whitespace
validation. The reviewer inspected the recorded RED result: all three new cases
failed their forbidden-value assertion before the correction. Root's raw
RED/GREEN logs are in the evidence directory.

This was read-only source review and synthetic reporting verification. The
reviewer changed no source and used no real identities, Docker or network.
Actual pinned Tor/container acceptance remains a separate hosted gate.
