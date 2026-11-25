# Fiat view expectations — 2026-11-24

## Reviewed contract decision

The integration coordinator selected the existing C1 parser diagnostic after
reviewing PR #616 at `7c4987650faf32322d7ded48ad669130aba7e63b`. This successor
changes only two message expectations in the existing #511 regression file.
Every production file is byte-identical to the combined base.

- Branch: `integration/fiat-view-expectations-20261124`.
- Worktree: `/workspace/scratch/f80482f352bc/fiat-view-expectations`.
- Base: `a107d993c1aed73827d853924ea36036f083400f`.
- Pre-edit ownership claim: `d860b8e3ee4680cf7baffbc4c3e03994f047edaf`.
- Qualified expectation correction: `ca0cc1054aadeaeb645292f954becfeeeb626400`.
- Qualified tree: `a8af53f1441e130f56b26d8ab7f3f2d1ef20b9ba`.
- The final handoff commit changes documentation only.

The earlier production-message alternative remains untouched on
`integration/fiat-message-20261124` at
`57fb4b2b012fd7777d8f7f6310760c3b1232f516`. Neither that branch nor correction
`6412aabb92aabb5cf800321345d2af99aff23768` is imported by this successor.

## Two-layer behavior

1. C1's `parseRate` takes one quote-field snapshot. It catches a failed field read
   and returns `{ ok: false, error: { code: 'bad-rate-format', message: 'quote fields could not be read' } }`.
2. `computeFiatView` receives that structured result and forwards its error in an
   `invalid` view. This normal result path does not enter the outer catch.
3. The outer catch remains unchanged, including its generic
   `quote could not be read` diagnostic for an exception that reaches that layer.

The more specific established inner-parser message is retained for both direct
parser callers and views forwarding its error. The six existing field-accessor
and proxy cases exercise this inner-parser path after composition with C1.
Their expected messages therefore become `quote fields could not be read`.

The two existing `toEqual` assertions still compare the entire returned object,
including exact state, error code and diagnostic text. All six cases and the
valid, ordinary-invalid, offline, stale and future controls are unchanged. No
assertion was loosened, removed or skipped; no production behavior or test input
was changed. A mechanical comparison confirmed that replacing exactly those two
literals reproduces the entire changed test file.

## Qualification

Executed sequentially on Node `v24.22.3` against correction
`ca0cc1054aadeaeb645292f954becfeeeb626400`:

| Command from worktree root | Result |
| --- | --- |
| `npm run test --workspace @ghostpay/ux-fiat -- --maxWorkers=1` | 7 files, 88/88 passed, zero skips; original coverage thresholds passed; exit 0 |
| `npm run typecheck --workspace @ghostpay/ux-fiat` | Passed; exit 0 |
| `npm run lint --workspace @ghostpay/ux-fiat` | Passed; exit 0 |
| `git diff --check a107d993c1aed73827d853924ea36036f083400f..HEAD` | Passed |

Coverage is 99.67% statements (310/311), 99.36% branches (315/317), 100% functions
(27/27), and 99.58% lines (239/240). Thresholds remain 95/90/95/95 respectively.
All 68 workspace links resolve inside this isolated worktree; external installed
dependencies were reused. No dependency or lockfile changed. Lockfile SHA-256:
`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.

Raw evidence is in `/workspace/scratch/f80482f352bc/`:

| File | SHA-256 |
| --- | --- |
| `fiat-view-expectations-test.log` | `a638cd15305488c3a0414b3c6278ffc3ca4b0cf37e77b0232a02278529003bc1` |
| `fiat-view-expectations-typecheck.log` | `6e1b4db8e52c7eb6d892cb23070d083186fc9c6226f79fca2762049dafb29b7c` |
| `fiat-view-expectations-lint.log` | `572471cf4099892d6422e6879e0f5fdc8908eeacac7dfbce78cd409297c0e5ff` |

No baseline reproduction, new case, payload, stress test, remote write, root
checkout edit or donor mutation was performed. Root owns final independent
review and the combined qualification and promotion gates.
