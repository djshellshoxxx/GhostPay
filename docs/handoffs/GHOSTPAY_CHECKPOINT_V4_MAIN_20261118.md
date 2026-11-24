# Pages checkpoint v4 — narrow main extraction, 2026-11-18

## Outcome and source pins

The reviewed checkpoint privacy repair is extracted onto main without taking #222's broader changes.
Only checkpoint persistence and key lending change in product code. The main scanner body is preserved.
The old v1/v2/v3 positions deliberately require a rescan; new v4 progress resumes with the matching seller
keys and chain. No publication, protected-main merge, deployment or public-chain transaction was performed
by this worker.

| Item | Exact source |
|---|---|
| Main candidate branch | `chatgpt/ghostpay-pages-checkpoint-v4-20261118` |
| Main base | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Initial main ownership claim | `87b41e1b48568ab21cecb90f98c8a0bfd6a17608` |
| Main RED regression | `1d8e61776b2e28a4a4d2e082399eefe58148ea7c` |
| Main product and final test source | `7c37de5154ac18e06725ecde6d194185b2e820f2` |
| Main `scanClient.ts` blob | `043fb19af6e3ccf88224122185192829eed29c92` |
| Shared `scanCursorSlot.ts` blob | `d33c6f6e4099fb386016289cc8aa560b1380ffa8` |
| Original PR #211 input | `a92658b1ef6b95ff0145b2e1933d0047d51289d5` |
| Original PR #222 input | `2bc2098298d90928eb1acafad969f28316bb05fc` |
| Preserved #222-lane product/test source | `1dd0fa6152f67010dd38db35d46d102130b583f3` |
| Preserved #222-lane handoff head | `f90499d2925a965b73533da2650c60ca9ea119ed` |

This handoff, claim completion and two threat-model row corrections are documentation-only changes after
the main product/test source above. The #222 lane remains on the isolated local branch
`chatgpt/ghostpay-checkpoint-v4-20261118`; no duplicate remote PR is intended.

## Why v4 and why a main extraction

Main stores checkpoints under public v2 names derived from the chain and public seller-key ID, and it can
read them without loaded keys. PR #211 improves privacy with a private-viewing-key HKDF derivation, an
identity-bound synchronous key lender, session-token cache invalidation, temporary-key wiping and legacy
purging. PR #222 instead uses a private-viewing-key HMAC derivation and migrates old public v2 records.
Both PRs call their incompatible slot derivations v3. #222 also permits a requested key ID unrelated to
the loaded seller, which can misattribute a stored position after the session changes.

The first repair lane reconciled these differences on #222, preserving its unrelated scanner changes.
The coordinator then requested this main extraction so the Pages privacy fix does not depend on accepting
the rest of #222. There is no package, manifest, transport, BTC or contract dependency preventing that
narrow extraction: main already has the required HKDF, secret-box and session APIs.

The chosen format is:

```text
slot = "ghostpay.scan.checkpoint.v4." + lowercase_hex(
  HKDF-SHA256(
    ikm = 32-byte private viewing key,
    salt = empty,
    info = UTF8("GhostPay/scan-checkpoint/v4/slot|" + chainId + "|" + keyId),
    output_length = 32
  )
)
keyId = SHA256(lowercase(spendingPublicKey) + "|" + lowercase(viewingPublicKey))
```

The independent Node `crypto.hkdfSync` vector is pinned in `scanCursorSlot.test.ts`. The helper and the
entire persistence section are identical to the independently reviewed #222-lane repair. Neither old v3
algorithm is tried as a fallback or interpreted as v4.

## Behavior and security boundaries

The default lender checks that the requested public key ID belongs to the loaded seller before revealing
a temporary viewing-key copy. It wipes that copy in `finally`, including when derivation throws. The
store caches derived slot names only while the session's public snapshot is the same object. Every access
rechecks that token. A silent session clear removes the snapshot; reinstalling identical keys creates a
new snapshot and therefore derives again. Lenders without a reliable loaded-session token do not cache.

After a silent clear or replacement by a different seller, an awaiting scan cannot save under the prior
identity even if its caller omitted cancellation: the store refuses the absent or mismatched identity.
For a clear-and-restore of identical keys, an already pending scan is cancelled by the existing
`Scan.tsx` session subscription and `AbortSignal` checks after awaits. **That protection is an existing
scan lifecycle guarantee, not a new transaction guard in the store.** This change does not alter idle-lock
policy or the sole-unverified-key-copy retention exception. An application lock signal by itself is not
treated as a session wipe by the lender.

On creation, an enumerable storage adapter snapshots names and best-effort deletes only the exact v1,
v2 and v3 checkpoint prefixes. It never reads their values. Snapshotting before deletion preserves correct
Web Storage enumeration as indexes shift. No current v4 entry, unrelated setting or other store is deleted.
The known public v2 slot can also be removed on save/clear without needing private keys.

The existing Scan screen therefore offers no legacy position to resume and uses the user's chosen start
block when a scan is started. This deliberately discards an optimization and requires a rescan. It does
not erase seller keys, invoices, receipts, tag vaults or encrypted scan-history contents. After a new v4
checkpoint is saved, the same seller keys and chain can resume it in a fresh store.

Cleanup is best effort. A storage adapter without enumeration cannot remove unknown old names; a denied
read/write/removal can leave old records on disk; an older application tab can recreate them after the
initial purge. The v4 store still never reads or uses those records, and a later store initialization
retries enumerable cleanup. Close older application tabs before evaluating the consolidated candidate.

**Cursor values remain plaintext, unauthenticated public block number/hash data.** Private derivation of
the name prevents computing that name from the public meta-address alone; it does not encrypt progress,
hide RPC activity, authenticate local storage against same-origin tampering, or hide every clue to chain
activity in public block data. Encrypted scan-history naming still has its existing public-key linkage;
the two threat-model row corrections preserve that distinction. No encrypted history or transactional
cross-tab CAS implementation is added. The shared-storage test proves separate seller-context isolation
and local lock/restore behavior, not that one tab locks another.

## Scope and preservation proof

Product files:

- `apps/web/src/lib/scanClient.ts`: one new helper import and only the checkpoint persistence section.
- `apps/web/src/lib/scanCursorSlot.ts`: the reviewed HKDF/lender/cache helper.

Tests:

- `scanCheckpointPrivacy.test.ts` and `scanCursorSlot.test.ts` are identical to the reviewed #222-lane tests.
- `scanClient.test.ts` retains main's existing scanner assertions. Its storage fixtures now lend a synthetic
  viewing key; malformed-current-format fixtures use v4 slots; three pending-corroboration lifecycle cases
  are added.
- `scannerCore.spam.nocov.test.ts` changes only the synthetic key-lender test seam. Original million-log,
  resume, budget, non-duplication and payment assertions remain.

An exact source comparison confirmed that everything in `scanClient.ts` before its persistence section
is byte-identical to main after removing the one new helper import. `defaultServices.ts`, `session.ts`
and `Scan.tsx` have unchanged blobs. No #222 `bulkEvidence`/router-evidence feature was copied. Main's
provider agreement, replay-tail, finality, reorg and worker behavior remain in place.

Documentation is limited to the ownership record, this handoff, the checkpoint row in
`PRIVACY_THREAT_MODEL.md` and the browser-profile row in `THREAT_MODEL.md`.

## Main-lane verification

Existing main dependencies and matching built package outputs were copied locally from the root checkout;
all workspace links resolve to this new worktree. No dependency or lockfile changed. Commands ran from
`apps/web`, with one Vitest worker. Focused tests disable coverage and do not claim project-wide coverage.

| Check at main product/test source `7c37de51`, unless noted | Actual outcome |
|---|---|
| New privacy test against unchanged main, RED commit `1d8e6177` | 5 failed, 2 passed: public namespace, identity/clear behavior, missing purge and old-v2 reuse reproduced. |
| Dedicated privacy/helper tests plus complete `scanClient.test.ts` | 110 passed, 0 failed. |
| Existing million-announcement spam/checkpoint-resume test | 1 passed, 0 failed. |
| Whole-web TypeScript with 1536 MiB heap cap | Exit 0. |
| Scoped ESLint on all six source/test files | Exit 0. |
| `git diff --check` | Exit 0. |
| Independent reviewer: dedicated privacy/helper tests | 20 passed, 0 failed, exit 0. |
| Independent reviewer: pending-corroboration lifecycle cases | 3 passed, 87 deliberately unselected, exit 0. |

Commands:

```sh
../../node_modules/.bin/vitest run src/lib/scanCheckpointPrivacy.test.ts src/lib/scanCursorSlot.test.ts src/lib/scanClient.test.ts --coverage.enabled=false --maxWorkers=1
../../node_modules/.bin/vitest run --config vitest.nocov.config.ts src/lib/scannerCore.spam.nocov.test.ts --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/tsc -p tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/eslint --config ../../eslint.config.js src/lib/scanClient.ts src/lib/scanCursorSlot.ts src/lib/scanCheckpointPrivacy.test.ts src/lib/scanCursorSlot.test.ts src/lib/scanClient.test.ts src/lib/scannerCore.spam.nocov.test.ts
```

The RED command selected only `src/lib/scanCheckpointPrivacy.test.ts`. Independent review selected the
first two files, then `scanClient.test.ts -t 'cannot persist an old scan'`. The independent reviewer verified
the HEAD and all six source/test blobs before and after those commands and reported no blocking finding.
Review covered identity/token invalidation, legacy cleanup, key-copy wiping, storage-denial limitations,
unchanged main scanner behavior and both threat-model row corrections.

Supplementary local logs under the session scratch root: `checkpoint-main-red.log`,
`checkpoint-main-green.log`, `checkpoint-main-spam.log`, `checkpoint-main-typecheck.log`,
`checkpoint-main-lint.log`, and `checkpoint-main-independent.log`.

## Preserved #222-lane evidence

The original repair remains independently reviewable on its own branch/worktree at the source pins above.
Its RED commit `017dc6188f51aab12a6ed108be6b6f436c346971` produced 6 failures and 1 control pass on unchanged
#222. At `1dd0fa6152f67010dd38db35d46d102130b583f3`, the full scanner/privacy/helper selection passed 120/120,
the million-announcement resume test passed 1/1, whole-web TypeScript and scoped lint exited 0, and the
security reviewer independently reran 20/20 tests. Both the coordinator and security reviewer reported
no blocking source finding in that lane. Its wider scanner test count includes #222-only features;
those features and their separate qualification are not part of this main extraction.

## Integration and remaining gates

Publish and review the **main-based** candidate only; retain the #222 branch as a source/evidence record.
For another main descendant, take the main RED regression and product/test commit listed above, then the
final documentation commit, resolving the shared ownership registry carefully. Do not merge the whole
#222 branch or replace main's scanner with #222's implementation just to obtain this fix.

If #211/#222 are reconciled later, retain the v4 namespace, session-bound lender and unreadable legacy
behavior. Do not restore v2 migration or either v3 derivation. Other independently reviewed privacy
repairs remain separate; this change does not imply acceptance of #222, own-node routing, sweep history
changes or any optional non-Pages feature.

The coordinator owns publication and final combined-head checks. No Pages build, local browser execution,
multi-browser recovery acceptance, hosted CI, production-RPC acceptance, deployment or overall beta
qualification is claimed by this handoff. The remaining task is candidate integration and qualification,
with deliberate old-position rescan and the storage/privacy limits above retained.
