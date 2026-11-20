> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# Hosting test-support closure — round 9

## Result

**Complete: four fresh full-content reads, 601 lines, no pending ranges. No new confirmed production finding.** One unranked test-quality observation is recorded separately below. The seven baseline production findings and round 8 documentation observation remain unchanged.

Every new source read is pinned to Tor commit `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`. This closes the four test-support references previously listed as unexpanded in round 8. The files are relevant because the reviewed latest hosting tests import them; test execution is not a prerequisite for including their source in this closure.

## Exact new coverage

| Path | Git blob | Lines read | Status | Method |
|---|---|---:|---|---|
| `tools/portable-hosting-kit/src/demo/demo-site.mjs` | `cfa70aa4b2f47f84ae4b511a1e9346364afa86b9` | 1–161 | Reviewed | Full content |
| `tools/portable-hosting-kit/test/serve/helpers.mjs` | `0ea649190c0402c79caa55681553a680fcc626cb` | 1–242 | Reviewed | Full content |
| `tools/portable-hosting-kit/test/profiles/compare.mjs` | `a9b869f584d95392bb2981c69cd1710aae590377` | 1–123 | Reviewed | Full content |
| `tools/portable-hosting-kit/test/adapters/fixtures.mjs` | `18ca28d400e80731554982da12df1c539795373b` | 1–75 | Reviewed | Full content |

All four path resolutions, Git object IDs and line counts match the round 8 exclusion metadata and the assignment. Each object ID was also recomputed from the returned blob bytes. All four source outputs were complete. Initial truncation of the combined round 8 metadata output was repaired by complete bounded rereads.

These are **four test-support additions** even though the demo helper lives under `src/`. Combined hosting coverage is 60 reviewed file versions, 56 unique paths and 12,007 lines. The 140-line differential caller reread below was already covered in round 8 and adds no new coverage. The root audit’s pre-existing source and test totals are not recategorized by this supplemental record.

## First-party reference closure

| Reviewed helper | First-party reference | Closure |
|---|---|---|
| `src/demo/demo-site.mjs` | `src/errors.mjs` | Same blob fully read in round 8 |
| `test/serve/helpers.mjs` | `apps/web/public/_headers`, read as fixture policy | Same blob fully read in round 8 |
| `test/profiles/compare.mjs` | `test/serve/helpers.mjs` | Fully read in this round |
| `test/adapters/fixtures.mjs` | `src/errors.mjs`; `src/types.mjs` as a JSDoc type reference | Both blobs fully read in round 8 |

The remaining module references are Node built-ins. No additional unread first-party fixture dependency was found. The I2P object in the adapter fixtures is controlled test data; it does not import the optional I2P generator.

The exact reused identities are:

- `tools/portable-hosting-kit/src/errors.mjs`: `80d71210dd00b6f03a03a41943656fc41091741c`, lines 1–55, same pinned commit, full-content coverage inherited from round 8.
- `tools/portable-hosting-kit/src/types.mjs`: `cc9c73bd51da2342eb14a71d592fcf416c577dfe`, lines 1–121, same pinned commit, full-content coverage inherited from round 8.
- `apps/web/public/_headers`: `604be638edef9d055c8c2b4f52d5988e2bbd5ee4`, lines 1–36, same pinned commit, full-content coverage inherited from round 8.

## Source review conclusions

### Demo fixture

The fixture defines fixed file names/content and deterministic asset hashes. Its browser script writes text nodes, uses a same-origin JSON fetch and states that the demo does not establish payment-network routing. writeDemoSite rejects non-empty destinations and uses exclusive file creation. No production vulnerability was established from this test-support read.

Evidence: [tools/portable-hosting-kit/src/demo/demo-site.mjs:15–51](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/demo/demo-site.mjs#L15-L51); [tools/portable-hosting-kit/src/demo/demo-site.mjs:77–143](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/demo/demo-site.mjs#L77-L143); [tools/portable-hosting-kit/src/demo/demo-site.mjs:151–161](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/demo/demo-site.mjs#L151-L161).

### Serving fixture and raw client

The fixture starts from the real application header policy, then appends explicit test-only header combination/detachment rules. The raw client preserves request bytes, collects interim responses, merges repeated response fields and exposes raw post-header bytes. Its socket timeout and loopback nginx helpers are harness behavior, not evidence of an executed deployment.

Evidence: [tools/portable-hosting-kit/test/serve/helpers.mjs:12–14](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/serve/helpers.mjs#L12-L14); [tools/portable-hosting-kit/test/serve/helpers.mjs:47–111](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/serve/helpers.mjs#L47-L111); [tools/portable-hosting-kit/test/serve/helpers.mjs:127–176](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/serve/helpers.mjs#L127-L176); [tools/portable-hosting-kit/test/serve/helpers.mjs:204–242](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/serve/helpers.mjs#L204-L242).

### Differential assertions

The request matrix covers routing, files, encodings, methods, conditional requests and malformed inputs. The comparator requires selected security headers on both servers, compares status/interim/header values and successful bodies, and makes an explicit nginx-version allowance for CONNECT refusals. H9-TQ-01 records the limited HEAD body assertion separately.

Evidence: [tools/portable-hosting-kit/test/profiles/compare.mjs:14–80](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/compare.mjs#L14-L80); [tools/portable-hosting-kit/test/profiles/compare.mjs:89–123](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/compare.mjs#L89-L123).

### Adapter assertions

Adapter fixtures supply controlled onion/I2P configurations, require generated file data to be Uint8Array, and verify KitError class/code with optional message matching. The I2P fixture is local test data and adds no import or dependency on the excluded I2P generator.

Evidence: [tools/portable-hosting-kit/test/adapters/fixtures.mjs:3–42](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/adapters/fixtures.mjs#L3-L42); [tools/portable-hosting-kit/test/adapters/fixtures.mjs:48–75](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/adapters/fixtures.mjs#L48-L75).

## Test-quality observation — separate from production findings

### H9-TQ-01 — HEAD body assertions cover only successful responses

**Classification:** unranked test-quality observation. **Confidence:** high from source. **Runtime failure observed:** none.

requestCases includes HEAD requests for missing, hidden, malformed and conditional cases. compareServers checks the length of both HEAD bodies only inside its n.status === 200 block. For a non-200 HEAD response, the helper checks status, interim responses and selected headers but makes no assertion that either body is empty.

This is an assertion-coverage gap in the differential helper. It does not establish that either production server emits a body on a non-200 HEAD response. Dedicated tests elsewhere may provide additional coverage, and none were executed in this review.

**Suggested improvement:** Apply the HEAD body-length assertion to all completed HEAD responses independently of status, retaining status and header comparisons. Keep this as a test-quality improvement, separate from production vulnerabilities.

The existing differential caller also includes explicit normative spot checks and requires observed status coverage; this observation is scoped to the helper assertion and does not claim the whole test suite has no independent oracle.

Evidence: [tools/portable-hosting-kit/test/profiles/compare.mjs:45–64](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/compare.mjs#L45-L64); [tools/portable-hosting-kit/test/profiles/compare.mjs:109–120](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/compare.mjs#L109-L120); [tools/portable-hosting-kit/test/profiles/differential.test.mjs:70–125](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/differential.test.mjs#L70-L125).

## Latest-test import evidence

- [scripts/tor/hosting-config.test.mjs:10–10](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/scripts/tor/hosting-config.test.mjs#L10-L10)
- [tools/portable-hosting-kit/test/adapters/tor.test.mjs:8–8](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/adapters/tor.test.mjs#L8-L8)
- [tools/portable-hosting-kit/test/profiles/differential.test.mjs:14–15](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/differential.test.mjs#L14-L15)
- [tools/portable-hosting-kit/test/profiles/static-export.test.mjs:10–10](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/static-export.test.mjs#L10-L10)
- [tools/portable-hosting-kit/test/profiles/nginx.test.mjs:12–12](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/nginx.test.mjs#L12-L12)
- [tools/portable-hosting-kit/test/serve/headers.test.mjs:11–11](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/serve/headers.test.mjs#L11-L11)
- [tools/portable-hosting-kit/test/serve/headers.test.mjs:289–290](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/serve/headers.test.mjs#L289-L290)

## Retained exclusions and limitations

- `tools/portable-hosting-kit/src/adapters/i2p.mjs`, blob `03bd1640f26322927519c7ebb7033e16f1549c37`, 226 lines: optional generator is not selected by the reviewed Tor preparation path; no expansion or I2P end-to-end claim.
- `tools/portable-hosting-kit/src/wizard.mjs`, blob `a6630c1762e213d650d9ab8b611d410a8912911d`, 123 lines: interactive configuration command is not invoked by the reviewed Tor preparation/build path; no expansion.
- No target code, test, build, install, server, browser acceptance, probe, proof of concept, Docker/Tor command or network operation was executed. No Git state, application source, configuration or tests were changed.
- This record establishes static source coverage. It does not establish passing tests, a successful deployment, Tor availability, browser acceptance or payment-network behavior.
- The seven baseline production findings remain unchanged; H8-DOC-01 remains in the round 8 record. H9-TQ-01 does not enter the production vulnerability register.

## Handoff

All four newly included test-support versions are reviewed in full, 601 lines, with verified SHA/path/blob/line-count identities and empty pending ranges. Their first-party dependency closure is complete through this pass or same-blob round 8 reads. No new confirmed production finding; one unranked test-quality observation (H9-TQ-01) is separate from the seven baseline production findings. The optional I2P generator and interactive wizard remain legitimately excluded. No execution or runtime-validation claim is made.
