# Plan 08 Multi-relayer selection and self-submit

Spec: [08](../../../specs/ideas/08-multi-relayer-self-submit.md). Branch `claude/remote-extensions-3`. Estimates are single-engineer days (guesses). Owner roles: WEB, CA, REL, DOC.

| Step | Work | Files | Days | Exit check |
|---|---|---|---|---|
| 1 | List format, canonicalization, EIP-191 verify, pin store, known-answer vectors | `apps/web/src/lib/relayerList.ts`, `relayerList.vectors.json`, tests | 1.5 | Vectors pass; mutation fuzz clean |
| 2 | Eligibility, pick (CSPRNG), `/v1/info` probe, `getInfo` client | `lib/relayerSelect.ts`, `lib/relayerClient.ts` | 1.5 | Conformance test against in-process `apps/relayer` |
| 3 | Settings v2 + v1 migration; shipped starter list (empty or project-run entries only if owner approves) | `lib/settings.ts`, `public/relayers/relayers.v1.json` | 1.5 | Migration test; bundle scan green |
| 4 | Settings "Relayers" card and import dialog with pin/diff | `views/Settings.tsx` | 1 | RTL tests, wording lint |
| 5 | Sweep: strategy, told-so-far counter, supersede rule, self-submit builder + order view/import | `views/Sweep.tsx`, `lib/sweep.ts`, new `lib/selfSubmit.ts` | 2 | Anvil scenarios 1-5 |
| 6 | Docs: sweep guide, privacy-limits relayer row, relayer-runbook "get listed", THREAT_MODEL entry; Playwright egress update | `docs/user/*`, `docs/operators/relayer-runbook.md`, `apps/web/e2e` | 1 | Acceptance list ticked in PR |

Order: 1 -> 2 -> 3 -> (4, 5 parallel) -> 6. Gate: spec 01 merged (manifest read-back) because `probeInfo` compares against a verified manifest address.
Owner-gated: whether the project ships any relayer in the built-in list (ADR-0006 operator duties); release key for signing the shipped list (ADR-0015). Without them, ship an empty built-in list marked unsigned.
Risks: list governance (nobody maintains the community list) -> keep self-submit first-class; users misread "multiple relayers" as anonymity -> copy review.
Rollback: Settings v2 reader keeps v1 data; feature flag `selfSubmit` in settings can hide the new UI.
