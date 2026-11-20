# QR kind primitive-input follow-up — cycle 20261120T0035Z

## Ownership and source pins

- Author: native ChatGPT worker `/root/spec_verification_review`, assigned by coordinator `/root`. The author originally identified the residual defect during spec review, then became the implementation owner; the author does **not** independently approve this follow-up.
- Branch: `automation/20261120T0035Z/worker/qr-kind-primitives`.
- Exact parent: [PR #285](https://github.com/djshellshoxxx/GhostPay/pull/285), `89942105c48df03b9351f777278b6a992e35a95e`. Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Claim committed before edits: `9fdbcfc37c6c844d00589afcf91d2cd34e0991a2`.
- Tests committed before production correction: `6aed2a04712b01d12b856efde29ccb8170e6b07b`, strengthened error-class assertions in `94836beb6d60389c862426ed25bc87be06ac446c`.
- Final source/test and design correction: `2df03bde3883439e7514a02c871db66ccffd83fd`. All successful implementation checks below apply to this exact source commit. This subsequent handoff changes documentation only; the coordinator must record its final published head and fresh hosted checks separately.
- Owned files: `apps/web/src/lib/qrKinds.ts`, `apps/web/src/lib/qrKinds.test.ts`, `docs/design/qr-colors.md`, this handoff, and the additive `docs/ai/ACTIVE_WORK.md` claim. No existing remote branch was edited by this worker.

## Confirmed finding and repair

**GP-QR-KIND-PRIMITIVE-20261120-01: low severity, high confidence, defensive API correctness.** At parent `89942105`, `qrKinds.ts:180` and `:235–236` passed an unchecked runtime value to `hasOwnProperty` and then used it again for interpolation or lookup. Property-key conversion occurs on both operations.

- `kindForPayload(['spend-key'])` and a boxed `'spend-key'` were accepted as `secret`.
- An object whose `Symbol.toPrimitive` returned `'spend-key'` first and `'invoice-link'` next passed validation but returned `shareable`; the unverified path returned `caution`.
- The corresponding frame object could validate `'secret'` and emit `qr-kind-shareable`.
- A throwing coercion getter could propagate its own `Error` and input-derived message instead of the fixed `TypeError`.

The initial exact-module probe matched GitHub source blob `68de6518783cc57bd7f3a66d0588d530e27d21b6`; the repository Vitest reproduction below supersedes that probe for regression evidence. Production call sites currently pass literals or values selected from typed literal mappings, including `qrClassify.ts:408–451`. **No browser-reachable payment exploit is established.** The practical defect is an incomplete runtime contract and possible policy/class mismatch for invalid JavaScript callers.

The correction adds `typeof value !== 'string'` before each existing own-property check. It rejects non-string values without reading or invoking coercion hooks. Fixed error classes/messages, all 16 recognized payload mappings, secret/bearer warning precedence, frame classes and print policy remain unchanged. The design guide now correctly says both `secret` and `bearer` are never downgraded. No cryptography, protocol, custody, payment enablement, dependency or security-gate change.

## Executed verification

Environment: Linux native execution, Node **24.22.3**, npm **11.19.1**, repository-locked Vitest **5.0.5**, TypeScript **5.9.3**, ESLint **10.15.0**. The coordinator copied a complete successful `npm ci --ignore-scripts` dependency tree into this isolated worktree; the lockfile is unchanged, SHA-256 `e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`. Workspace package links resolve within this checkout.

| Check | Exact source | Observed result |
| --- | --- | --- |
| `NODE_OPTIONS=--max-old-space-size=1536 npm run build:libs` | Tests-only `94836beb` | Exit 0; repository library builds completed before regression execution. |
| From `apps/web`: `../../node_modules/.bin/vitest run src/lib/qrKinds.test.ts --maxWorkers=1` | Tests-only `94836beb` | **9 failed / 14 passed**, exit 1: six cases accepted non-string/stateful inputs; three hostile-hook cases propagated ordinary `Error` instead of `TypeError`. |
| Same taxonomy command | Fixed `2df03bde` | **23/23 passed**, zero skips, exit 0. |
| Related QR suites, command below | Fixed `2df03bde` | **8 files / 97 tests passed**, zero skips, exit 0. jsdom emitted its navigation-not-implemented diagnostic; no test failed. |
| `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck --workspace @ghostpay/web` | Fixed `2df03bde` | Exit 0; full web TypeScript check. |
| From `apps/web`: `NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/eslint --config ../../eslint.config.js src/lib/qrKinds.ts src/lib/qrKinds.test.ts` | Fixed `2df03bde` | Exit 0; no output. |
| `git diff --check` | Fixed `2df03bde` | Exit 0. |

Related UI/classifier command, using the unmodified repository configuration:

```sh
../../node_modules/.bin/vitest run \
  src/lib/qrKinds.test.ts src/lib/qrContrast.test.ts src/lib/qrClassify.test.ts \
  src/components/QrFrame.test.tsx src/components/QrFrame.security.test.tsx \
  src/components/QrFrame.i18n.test.tsx src/components/QrFrame.largeWarning.test.tsx \
  src/components/PaymentRequestQr.test.tsx --maxWorkers=1
```

The new regressions cover undefined, null, both booleans, numbers including NaN/Infinity, bigint, symbol, arrays, array-like objects, plain objects, boxed strings, stateful conversion and throwing conversion getters. They assert the `TypeError` class **and** the exact fixed message, and assert that coercion hooks were never touched. Valid controls cover all 16 mappings, each warning flag and their combination, and every declared frame class.

### Preserved setup/failure evidence

- The coordinator reported two concurrent dependency installations killed with exit 137; these were environment/resource failures, not source-test results. This worker's initial runner attempt preceded completion and exited 127 because `node_modules/.bin/vitest` did not yet exist.
- After the dependency copy, the first config-load attempt exited 1 because `@ghostpay/chain-adapters` had not been built. No tests ran in that attempt. The successful repository `build:libs` command resolved the prerequisite; no test or configuration bypass was added.
- The meaningful RED at `94836beb` reported `expected function to throw an error, but it didn't` for six cases and `expected error to be instance of TypeError` with `Error: private input must not escape` for three cases. Original taxonomy and valid-mapping controls passed.
- RED log SHA-256: `f1fc6e471638ab5abd151c912c2442cbfca221b4ef57d63dd0abc57810d6f208`; GREEN: `2507dee78fa9f6de50d175b4fa86cad87b8f21ec4527b3600dd6dc57ca9d8d0e`; related-suite log: `6485287a158ef6a46a9bfaa22007d04a0fc712f98c2699bd34c9b36f8ac8d63c`. Logs are in the coordinator's cycle scratch directory; the source pins, commands, results and failure messages above are the durable reproduction record.

## Independent review

Separate native worker **`/root/standards_security_review`** inspected `89942105...2df03bde` and independently ran the real repository taxonomy command at `2df03bde`: **23/23 passed, zero skips, exit 0**, plus `git diff --check`. The reviewer reported no blocking source/test/spec findings, verified that coercion is rejected before lookup, and confirmed valid mappings and warning precedence. This is a genuine separate native-worker review, not this author's self-review, an external professional audit or a substitute for GitHub-required approvals and CI.

## Payments-disabled static build

The unchanged `scripts/pages/build-pages.sh` was inspected and executed at exact `2df03bde` with `GHOSTPAY_PAGES_DEV=1` and `GP_COMMIT=2df03bde3883439e7514a02c871db66ccffd83fd`; manifest, release-key and origin inputs were explicitly unset. A new scratch output directory was used. **Build exited 0**, including its TypeScript check, Vite lean build, bundle scan and static-site verifier.

- Built site: **16 files**, lean profile, `paymentsEnabledChainIds: []`, `release: false`, `origin: null`.
- Evidence status: **DEVELOPMENT BUILD (not release evidence): DEMO: payments disabled on every chain (no deployment manifest)**.
- A separate `verify-pages-site.mjs` invocation with `--expect-commit 2df03bde3883439e7514a02c871db66ccffd83fd` passed; all **16/16 SHA256SUMS** checks passed.
- Manifest digest: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a` (empty manifest set).
- SHA256SUMS-file digest: `5f2f294f2c8e2a5dd238961a8ef13ee827da33a0ae329bac7e2caf822378fbb8`.
- Artifact identity belongs to `2df03bde`, not the later documentation-only handoff commit. No artifact was uploaded, served publicly or deployed. DOM tests are not Playwright, real-camera, external-wallet or real-funds acceptance.

## Consolidation, gates and next action

Available-ref inspection covered 299 origin refs and six distinct `qrKinds.ts` source blobs; none already had this primitive guard. [PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278) at `d74af79ebabdc8cead843361c3497b46d8c421f9` already contains exactly the original #285 source/test blobs (`68de6518` / `e918e368`). Therefore **do not import the original #285 correction again into that integration**. This follow-up is unique; port only the delta after `89942105` if the integration coordinator qualifies it against a fresh target.

The worker did not acquire, mutate or release the durable integration lock and did not merge any branch. Main policy, lock ownership, exact-head hosted CI, GitHub-required reviews and deployment-trigger checks remain coordinator responsibilities. The coordinator owns publication of this isolated branch/draft and the existing central automation ledgers. Hosted checks for the final published follow-up head have **not** been observed by this worker; original #285 workflow success cannot qualify new commits.

Preserve this branch and its test-first commits. Recheck the final remote head, refresh #285/#278/main and lock ownership, obtain all required exact-head checks, and reconcile only the unique follow-up under the valid coordinator lock. Existing Mythril and broader release findings remain open; this QR repair changes none of those gates. No deployment, release, real-funds operation, force-push, paid API, external agent, Codex execution or schedule change was performed.
