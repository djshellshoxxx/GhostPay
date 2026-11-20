# Fresh transaction-field security review — generation 4

## Decision and frozen scope

No blocking issue was found in the primitive-string repair at `c344334d757db9ca51e107000b918fd23cc7397d`. Independently executed original wallet and payment-execution suites passed **137/137 cases**, zero failures or skips. This supports the scoped repair; it is not a whole-product security certification, complete browser qualification or release approval.

Reviewer: `/root/final_security_gen4`. Branch: `review/ghostpay-transaction-shapes-gen4-20261120`. The preceding runtime is `fa5d4b143c7459c99a201433e661f6650b957e3e`, containing the separately reviewed receipt-status repair. The regression-only baseline is `795a3892ded8a8d20aea67b2b88d69620a4afdf5`. Root completed the defensive validation repair after the generation 3 worker stopped; this reviewer made no production changes.

`source-pins.json` records the exact three source/test blobs, SHA-256 values and unchanged controls. The review worktree differs from the frozen source only in review documentation at execution. The original privacy implementation and separate quick-hide feature are outside this repair's scope.

## Standards

The change follows the repository's minimal-change and boundary-validation rules. It captures two fields, checks primitive string types, and normalizes those captured strings. It reuses the existing `UserFacingError` key and the existing catch boundary. It introduces no dependency, configuration, storage, network call, translation key or abstraction. Existing tests are preserved and the new regressions exercise observable validation and post-broadcast behavior. No documented-standard violation or useful refactoring issue was found.

## Spec and security review

The required behavior is to reject non-string RPC transaction hash and call-data fields before coercion while preserving valid transaction comparison and recovery behavior. Previously, `String(...)` could turn a malformed representation into an apparently valid field. The repair removes that implicit conversion.

- Hash and `input ?? data` are captured once and required to be primitive strings before lowercasing. Arrays, boxed strings and other non-string values cannot use conversion hooks to pass this boundary.
- Null or absent `input` still selects `data`. A present primitive `input` still avoids reading unused fallback data. Uppercase strings and valid empty call data retain their previous comparison behavior.
- Type failures use the fixed unexpected-transaction-shape error. Neither the value nor a conversion-hook diagnostic is interpolated into user-facing text, a URL or a log by this change.
- The transaction parser's existing sender, destination, value and chain checks remain. The separately reviewed receipt hash correlation and zero/one receipt-status guard also remain intact.
- In `submitTx`, the wallet hash is retained before RPC verification. A malformed transaction response becomes `PostBroadcastError` with a verification-incomplete outcome. The new consumer regressions retain the submitted journal entry, prevent a receipt query after this validation failure, and refuse another wallet send.

This is a low-severity representation-validation repair. It does not authenticate a consistently dishonest RPC, establish finality, or demonstrate protection against theft. The boundary is not a general JavaScript object sanitizer: reading a property can still invoke an accessor on an in-process object, and the change does not add own-property or prototype validation. JSON response values do not carry accessors. The scoped guarantee is that non-string field values are not coerced, and property-access exceptions still encounter the existing fixed-error boundary. No broader accessor/prototype claim is made.

## Independent execution

The review used the original repository Vitest configuration and unchanged assertions/timeouts. The resource controls were one worker, no file parallelism and a 768 MiB Node heap. An external 150-second process cap was present but did not fire.

```sh
npm exec --workspace @ghostpay/web -- vitest run \
  src/lib/wallet.test.ts src/lib/payExec.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

Result at frozen product/test source `c344334d`: **137 passed in two files, zero failed/skipped, exit 0**, 5.936 seconds including command startup. Repository Vitest was 5.1.0. `verification.json` records the exact command, source, worktree, timestamps and raw/compressed output hashes; `focused-tests.log.gz` preserves the original output losslessly.

The coordinator separately executed the regression-only baseline at `795a3892` and reported **12 failures / 125 passing controls**, then **137/137** at the repaired source. Those are author results; this reviewer independently executed the repaired source only and does not present the author's baseline as its own reproduction.

The locked external dependencies were reused through symlinks, with a separate local `@ghostpay` link tree. Workspace links resolve into this review worktree, not a different source checkout. Declaration outputs for 65 packages were copied only after every tracked package input matched the coordinator source. `dependency-provenance.json` records this reuse; no clean installation or fresh whole-workspace library build is claimed. The source diff check passed.

## Preserved qualification limits and fresh handoff

### Final integrated source comparison

The coordinator subsequently froze product and tests at `53f4253bd9afc33bea43a7bdfe95ae287e035bf7`. The independent comparison in `final-integration.json` passed:

- **15/15 selected production/test blobs** exactly match their reviewed inputs: #295 QR classification, #294 assembler deadline, the retained #298 receipt fixtures, #292 artifact/security fixtures, and `c344334d` for the final wallet/parser regressions.
- All **five source commits** remain ancestors of the integrated freeze. No expected changed path is absent, and no additional non-documentation path changed against #278 `417f7c71`.
- **16 protected scopes** remain unchanged, including workflows, package manifests/lockfile, compiler options, deployment manifests, Settings, existing browser/signer repairs, the payment consumer/journal/error boundaries, and every package directory containing contracts.

This is source/blob/control verification. It adds no new execution or hosted result, and it does not transfer earlier partial UI runs into a full-suite pass. Subsequent coordinator changes must remain documentation/evidence only to retain this particular source comparison; any product change requires fresh review of its actual delta.

The preceding generation's incomplete Pay UI runs remain incomplete. They reported partial passes before SIGKILL and must not be added together or relabeled as a full UI pass. This generation ran only the two completed wallet/payment-execution files; it did not retry the 66-case Pay UI file.

Full project typechecking, original complete coverage, static artifact/browser acceptance and current hosted security checks remain with the coordinator and integration QA. This source review does not waive any of those gates. The final integrated candidate must retain these exact reviewed source blobs and all existing workflow, dependency, contract, deployment and authority controls; its final-source comparison belongs in a separate integration receipt.

A fresh successor should inspect that final integrated source and any subsequent changes, complete the remaining qualification in an environment that can finish it, and preserve actual failures until superseded by a source-pinned pass. The quick-hide feature still requires reconciliation with the active privacy owner's latest implementation. No remote write, shared-branch mutation, deployment, release, fee or contract change was performed by this reviewer.
