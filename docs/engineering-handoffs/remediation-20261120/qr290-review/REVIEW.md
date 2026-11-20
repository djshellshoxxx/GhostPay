# Independent PR #290 qualification

Reviewer: `/root/qr290_independent_review`. Initial reviewed head: `aaa8a7e2091e91f17b5c6f3ca6a9e7f8bc8f27da`. Latest reviewed head: `ec546311f994fe1db544fe85ff2aa6db428d67d4`. Canonical PR #278 remained `d74af79ebabdc8cead843361c3497b46d8c421f9` at the final live lookup. This reviewer authored no production correction and performed no remote mutation or shared integration.

## Scoped conclusion

The primitive-string guards are a genuine, minimal correction to the canonical candidate. Its existing own-property checks convert non-string keys before checking them and can convert them again for lookup or interpolation. Arrays, boxed strings and stateful conversion objects can therefore be accepted, and conversion hooks can execute. The guards reject these values before property access while preserving every declared payload mapping, flag precedence, frame class, handling rule and error message.

This is a low-severity runtime API correctness defect. Source inspection found no demonstrated externally reachable object-coercion exploit or fund-loss path. QR rendering call sites use constant kinds or kinds derived from the application classifiers. The review does not claim that every typed internal renderer, including `localizedQrKind`, validates arbitrary JavaScript object arguments.

The four-file original PR changes only the two QR source/test files, the ownership registry and QR documentation. The newer `ec546311` adds stronger error-class, hostile-getter and valid-mapping tests; its production module remains byte-identical to the initially reviewed correction. These changes do not overlap the five non-documentation changes in remediation PR #292.

## Independently executed verification

Node 22.23.4 and locked Vitest 5.1.0 were used. Dependencies were linked read-only from the coordinator's installation; no new independent clean installation is claimed.

| Verification | Actual outcome |
| --- | --- |
| Initial submitted tests with original canonical runtime | 29 passed, 10 failed, 0 skipped |
| Initial fixed taxonomy/component/classification selection | 116 passed across eight files, 0 failed, 0 skipped |
| Latest submitted tests with original canonical runtime | 40 passed, 13 failed, 0 skipped |
| Latest fixed taxonomy tests | 53 passed, 0 failed, 0 skipped |
| Independently authored actual-module hostile-input probes | Original: 16 failures. Fixed: 16 passed, zero failures |
| Valid-name, inherited-name, all payload/flag combinations and frame controls | 148 controls passed on both actual module versions |
| Type-aware ESLint for the two changed files | Passed on both reviewed heads |

The eight-file selection includes `QrFrame` behavior, i18n, security, large-warning and payment-request component tests; QR classification tests; and all six existing property tests with their original deterministic seed and run budgets. The current head changes only the taxonomy test file, so the older selection's seven other source/test files and runtime are identical. The new 53-case taxonomy run qualifies that expanded test file; it is not presented as a newly executed 130-case combined run.

The independent probe imports exact `git show` copies of the real TypeScript module using Node's type stripping. It neither reconstructs the implementation nor supplies a replacement API. Its cases include callable objects, conversion-getter proxies, revoked proxies, throwing getters, stateful conversion, array getters, boxed strings and `valueOf` fallback. The corrected boundaries execute no coercion hook. Reproduction source, compressed logs, exact blob identities and SHA-256 hashes are preserved in this directory.

Both original-runtime substitutions were confined to the review worktree and the fixed production file was restored byte-for-byte. An initial failed relative-path substitution is excluded from the baseline results and documented in the receipt. No assertion, threshold, fuzz budget, dependency, workflow or release policy was weakened.

## Integration disposition and remaining requirements

The scoped correction is suitable for integration after the repository's existing qualification and ownership gates. The two current production/test blob IDs are `a85e1011cdface74c87683146ff7428654b7830d` and `af5ef89f6fba0cea13b18884df387875f064ad34`.

Refresh the live PR head before integration; source or assertion changes require reconciliation. Complete exact-head hosted CI, applicable full web typecheck/lint/build/coverage and the canonical browser/security matrix. These focused tests disable coverage collection explicitly. Component tests use jsdom; they are not browser, local-chain or external-testnet acceptance. The canonical integration lease, independent external security review, hosting/signing decisions and deployment approvals remain separate requirements.

**BLOCKED — WITH PRECISE REMAINING REQUIREMENTS**
