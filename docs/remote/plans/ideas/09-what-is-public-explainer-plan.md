# Plan 09 What-is-public explainer and sandbox

Spec: [09](../../../specs/ideas/09-what-is-public-explainer.md). Estimates are single-engineer days (guesses). Roles: WEB, DOC.

| Step | Work | Files | Days | Exit check |
|---|---|---|---|---|
| 1 | Observer data module + docs-tie test; wording lint; strings module | `apps/web/src/learn/observers.ts`, `strings.ts`, tests | 1 | Tie test fails on a deliberately edited doc row |
| 2 | Simulator (chain, simPay, sweeps, mine) using shared metadata/fee code; invariants | `learn/sim/*` | 1.5 | Property tests green; metadata equals fixture |
| 3 | Fixture generator script (anvil) + committed fixture + hash check | `scripts/gen-learn-fixtures.mjs`, `learn/fixtures/*` | 0.5 | Regenerate diff empty |
| 4 | Lenses + analyst heuristics + golden tests | `learn/lens.ts`, `analyst.ts` | 1 | Truth table incl. negatives |
| 5 | Learn view, lazy chunk, guided steps, challenges, free-play, a11y | `views/Learn.tsx`, `learn/*` | 1.5 | Playwright offline run, axe clean |
| 6 | Safety rails: ESLint override, bundle-scan check for the chunk, chain-id rejection tests | `eslint config`, `scripts/scan-bundle.mjs`, tests | 0.5 | Scan fails on an injected `fetch` |
| 7 | Links from Home/Sweep/About; `docs/user/README.md` entry; review record | docs, views | 0.5 | Acceptance list ticked |

Order: 1 -> 2 -> (3, 4) -> 5 -> 6 -> 7. No dependency on other ideas; step 1 can start immediately. Owner decisions: none (no deployment, no funds). Review: privacy wording sign-off by someone other than the author.
Risks: doc drift (mitigated by tie test), simulator drift (fixture conformance), overclaim (wording lint + review). Rollback: remove route and lazy chunk; nothing else depends on it.
