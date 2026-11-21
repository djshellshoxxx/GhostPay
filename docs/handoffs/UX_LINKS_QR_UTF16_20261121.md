# QR capacity malformed UTF-16 bug — source-pinned handoff (2026-11-21)

- Repository: `djshellshoxxx/GhostPay`.
- Exact base `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated branch: `fix/ghostpay-qr-capacity-unicode-surrogate-20261121`.
- Additive ownership claim: `162e18e0ffdd06fc1d713f30175a3abe38a4197b`.
- RED regression commit: `c0ed2dad378ef4dd8c073aa524908b4467373611`.
- Production fix commit: `cb34c7dd9f7372893c023e4d3ec6a0dd21e22b29`.

## Reproduction
`checkQrCapacity` originally checked only type and emptiness then measured `new TextEncoder().encode(payload).length`. TextEncoder substitutes each unpaired UTF-16 surrogate with U+FFFD. For example `\uD800` becomes UTF-8 `EF BF BD`, but the original input cannot be recovered by scanning. Thus the checker could advertise a QR payload as scannable despite silent payload corruption.

## Bounded repair
Reject malformed UTF-16 with a strict lone-surrogate pattern before passing text to TextEncoder. No changes to capacity tables, ECC thresholds, builder, URL/QR payload encoding, valid Unicode input, dependencies, contracts, secrets, payments, fees, or deployment settings. Added six negative regression examples and valid emoji-pair byte-count control to existing `packages/ux-links/src/uri.test.ts`. Production change is confined to `packages/ux-links/src/qr.ts`.

## Evidence and limits
- Node 22.16.0 isolated primitive/source-equivalent proof: six malformed inputs were accepted by the original TextEncoder counting logic; all six are rejected by the new guard, four valid controls remain permitted and valid A+emoji+B remains six UTF-8 bytes. **This is not a repository Vitest result.**
- GitHub source and comparison inspected; 3 commits ahead and 0 behind main, with only two source/test paths plus the additive ownership registry before this handoff.
- Native repository Vitest, TypeScript typecheck, lint, full build, Playwright and exact-head hosted CI have **not** run or not completed at creation. Local Git checkout is blocked by DNS resolution of github.com.
- No independent review is claimed; the implementing worker inspected its own diff.

## Integration
Remain draft until exact published-head hosted CI, independent review, branch/dependency ownership and shared integration lock are checked, and all required gates pass. No merge to main, release, deployment or real funds. Do not combine with other active broad feature/consolidation branches without separate qualification.
