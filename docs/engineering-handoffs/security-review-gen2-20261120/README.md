# Fresh independent privacy quick-hide review — generation 2

## Decision and source boundary

No blocking issue was identified in the new quick-hide source at `052ac56c36cf62419941223318d1b6a366954625`. This is a bounded internal source and focused-test review, not approval of the whole privacy implementation or a release. The feature adds two runtime paths (a new 28-line component and a two-line shell integration) and two regression files over the frozen masking/history dependency `8be15289`. The author's final `675c946f` adds only documentation and evidence; the reviewed runtime/test blobs are unchanged.

Reviewer: `/root/security_review_gen2`, a newly spawned independent worker. The review branch is `review/ghostpay-quick-hide-gen2-20261120`. Source hashes are in `source-pins.json`. The source branches were not edited.

## Standards

The diff follows `AGENTS.md` and `docs/ai/WORKFLOW.md`: a dedicated branch, explicit owner and base, narrow source changes, behavior regressions, source-pinned evidence, and an explicit deferred integration boundary. The new component separates the shortcut's listener lifecycle from the existing privacy model without adding another state machine. It reuses the existing translated hide label and the existing one-way hide function. No documented-standard violation or useful refactoring finding was established. Scope is limited to the changed source and its relevant inherited helpers.

## Spec and security behavior

The parent-approved scope is a one-way keyboard/button action while privacy mode is already enabled. The implementation matches that scope:

- Only Alt+Shift+H reaches the action. Already-prevented events, composition, repeated keydown, unrelated keys, and extra Control/Meta modifiers are left alone. The listener is removed on component unmount or privacy-mode disable.
- The shortcut and accessible button call the same existing `hide` operation. That operation increments the shared reveal revision, invalidating both the page reveal and independently granted history reveals. It does not toggle privacy, grant a reveal, unlock history, navigate, send a transaction, change storage, or clear keys/recovery material.
- The existing privacy boundary moves focus out of a newly hidden sensitive subtree, clears sensitive selection, and removes that subtree from visual/accessibility interaction using `hidden`, `inert` and `aria-hidden`. This feature does not change those inherited mechanics. Drafts and sole-copy material stay mounted.
- The visible button supplies `aria-keyshortcuts="Alt+Shift+H"` and an ordinary activation path. Its label contains no sensitive data. Native browser/platform shortcut delivery and assistive-technology behavior still require browser qualification.

There is no new RPC, network, cryptographic, fee, clipboard, contract, or persistent-history path. This is visual privacy, not DOM/memory erasure or cryptographic locking. The review does not certify every requirement in issue #286 or the active wallet/privacy branches.

## Independently executed verification

Original configured Vitest selection on the exact reviewed source: **40 passed, zero failed or skipped, four files, 49.59 seconds**. The selection contains the new shell/shortcut tests plus original privacy-mode and shell privacy tests. It checks deliberate and independent history reveals, locked history, no toggle on repeated activation, disabled mode, unrelated typing/modifiers, listener removal, focus movement, and retained draft/session/preferences.

Execution used Node 24.22.3, repository Vitest 5.1.0, one worker, no file parallelism and a 768 MiB heap. The test configuration, timeouts, assertions and repository gates were unchanged. Coverage was disabled only for this focused selection; no complete coverage pass is claimed. Exact command, results and lossless raw log hashes are in `verification.json`.

The lockfile is byte-identical to the existing installation. Dependencies were privately copied for this worktree and workspace links resolve into this worktree. Existing output from 65 packages was copied only after matching their complete Git package trees against the original checkout; `declaration-cache.json` records those inputs. No fresh library build is claimed, and copied output is disclosed rather than represented as a new build.

An initial reviewer setup command failed before Node started because its log directory was created relative to the wrong working directory. It executed zero cases; after correcting the path, the single actual focused run above passed. The author's separate baseline failure, first startup failure, lint pass and TypeScript exit-137 attempts are preserved in its handoff and are not relabeled as independent results.

## Remaining qualification and fresh successor

The author's full web TypeScript attempts were killed with exit 137 and no source diagnostic. Full project typing, original whole-suite coverage, native browser/keyboard/accessibility execution and hosted checks remain open. This review does not waive any gate or turn a resource failure into a pass.

The feature remains stacked on the frozen local masking dependency. Before integration, a fresh successor must reconcile its minimal import/mount with the actively advancing privacy owner, compare the final relevant blobs, and run the same behavioral selection on that resulting source. Then qualify the actual keyboard/button behavior in supported browsers and resolve the full typecheck/hosted gates. Preserve the existing recovery/authority and disclosure requirements. No main merge, deployment, release, remote mutation or production configuration change was performed by this reviewer.
