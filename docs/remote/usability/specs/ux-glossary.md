# Spec: ux-glossary: In-app glossary, contextual help, plain-language labels
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none

## Problem
Terms such as stealth address, view tag, scheme id, permit, relayer, slippage, basis points appear unexplained (CreateInvoice.tsx:173-174 "Maximum slippage (basis points)"; Scan.tsx "One-time address").

## Exists today (verified in repo) vs missing
- apps/web/src/components/Disclosure.tsx LIMITS and fee lists (static explanatory text).
- apps/web/src/views/About.tsx privacy notes.
- docs/user/*.md plain-language guides not reachable from the UI.
- Missing: everything described under Design.

## Design
Typed glossary: term id -> {label, plain (<=25 words), detail (<=120 words), related[]}. A <Term id> inline component renders a button opening an accessible disclosure (details/summary pattern, no tooltip-only). A Help view lists all terms with search. "Plain labels" map internal names to user words (stealth address -> one-time address, basis points -> percent with the bps value shown in parentheses). Field hints reference term ids.

## Privacy and security impact
Static bundled text, no remote fetch. Text reviewed for claims: never say "anonymous"; each privacy term links to privacy-limits wording.

## Build ownership
- NEW package: `packages/ux-glossary` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ux-glossary`.
- Public API (exports from `src/index.ts`):
- `getTerm(id): Term | undefined`
- `searchTerms(q: string): Term[] (case-folded substring, locale-independent)`
- `bpsToPercent(bps: number): string  // 50 -> "0.5 %"`
- `TERM_IDS: readonly string[]`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/components/Common.tsx (Term component, keyboard operable)
- apps/web/src/state.tsx + App.tsx (add ViewId 'help')
- apps/web/src/views/Help.tsx (new)
- apps/web/src/views/CreateInvoice.tsx, Scan.tsx, Sweep.tsx, Settings.tsx (wrap jargon in <Term>)
- Add `@ghostpay/ux-glossary` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **UXGLO-1** MUST Every term id referenced in the UI exists (test scans a registry file).
2. **UXGLO-2** MUST Each plain definition <=25 words and contains no unexplained term id.
3. **UXGLO-3** MUST Term disclosure is operable by keyboard and announced to screen readers.
4. **UXGLO-4** MUST No definition claims anonymity or unlinkability.
5. **UXGLO-5** SHOULD Link to docs/user pages by relative path text (no network).
6. **UXGLO-6** SHOULD Help view deep-linkable by in-app state only (no query string).

## Acceptance tests
1. **T-1** bpsToPercent(25)=="0.25 %", bpsToPercent(1)=="0.01 %", bpsToPercent(10000)=="100 %".
2. **T-2** searchTerms("one-time") returns the stealth-address entry.
3. **T-3** Lint test: no definition matches /anonymous|untraceable|unlinkable(?! is not)/i.
4. **T-4** Render test: Tab+Enter opens a Term, aria-expanded toggles.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
