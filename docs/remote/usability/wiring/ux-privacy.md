# Wiring plan: ux-privacy in apps/web

## Privacy coach
- Files: `apps/web/src/features/privacy/PrivacyCoach.tsx`, `FactorRow.tsx`, `AdviceList.tsx`, `usePrivacyFacts.ts`.
- State: facts assembled locally from the wallet's own history (reuse count, timing, gas source, relayer flag); anonymity-set size from the pool data the app already holds. Nothing leaves the device. Recompute with `useMemo(() => computePrivacyScore(facts))`.
- UI: score gauge (text value plus band label, not color alone), expandable per-factor rows (`explanation`), ranked advice list, a non-collapsible "Limits" box rendering `report.limits`. Never display "anonymous"/"private" next to the score.
- i18n keys: `privacy.band.{exposed,weak,fair,careful}`, `privacy.factor.<id>.<tier>`, `privacy.advice.<id>`, `privacy.limits.<n>`, `privacy.unknownInput`. Fallback text from the package.
- e2e: reuse an address -> score drops and advice "addressReuse" appears; unknown gas funding shows the "unknown" badge; score never above 90.

## Policy account editor
- Files: `PolicyEditor.tsx`, `PolicySummary.tsx`, `IssueList.tsx`.
- State: a `FriendlyPolicy` draft in component state; `validateFriendlyPolicy` on each change; "Create" disabled while any `error`.
- Summary: render `describePolicy(...).lines`; lines with `enforcement === 'notEnforced'` get a distinct "not enforced on-chain" badge. Render all strings as text only.
- On confirm: `toSchemePolicyInput` then policy-scheme `validatePolicy`/`buildLimitsTree` (ADR-0014: feature behind its experimental flag).
- i18n keys: `policy.line.*`, `policy.issue.<CODE>`.
- e2e: 59-minute lock rejected; allowlist without destination rejected; guardians show the not-enforced warning.
