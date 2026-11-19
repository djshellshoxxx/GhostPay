# Bitcoin spent status and scan privacy

The Bitcoin test interface can recognize confirmed spends from the complete block
transactions it already downloads. Full-block scanning leaves optional per-output
spent-status queries off by default. This interface is part of the full web
profile; the lean GitHub Pages profile continues to exclude Bitcoin.

## Reading the result

| Status | Evidence used | What it does not establish |
| --- | --- | --- |
| `local` | Every displayed output has continuous, locally checked block-input coverage from its discovery through the sampled chain tip. A known confirmed spend removes that output from sweep candidates. | Mempool status, later blocks, complete Bitcoin consensus validation, or knowledge of a heavier chain the selected providers have hidden. |
| `provider` | The selected Esplora server reports the status of candidates not already known locally to be spent. The request identifies each queried transaction ID and output index. | Independent proof that the server's answer is correct or complete, or that a later broadcast will succeed. |
| `unknown` | The scanned range is incomplete, saved history lacks continuous input coverage, or chain evidence has changed. | Unspentness. Candidates remain visible, but selection and sweep review are disabled until refreshed. |

An output is never described as locally unspent just because a partial scan did
not observe its spend. The result's status describes the displayed candidates,
not a permanent wallet balance. Local status is an observation through the stated
height, and a new block or mempool transaction can change spendability afterward.

## Choosing whether to query a provider

In full-block mode, **Also ask the server whether each found output is unspent**
is off initially. Turning it on authorizes queries for exact candidate outpoints;
the provider can associate those outputs with the requester. It can also report
unconfirmed spends it knows about. Turning the option off cancels the active scan,
aborts outstanding requests, and discards results from the old operation. Requests
already sent cannot be withdrawn. The next scan creates a new worker and a new
request bridge carrying the selected permission.

Light oracle mode does not download all block inputs. Its explanation states,
before scanning, that starting this mode authorizes provider spent-status queries.
The checkbox remains required for that mode. Both the worker client and scan
engine refuse light scanning without explicit authorization. Switching back to
full-block mode restores the optional setting; an old light-mode selection cannot
silently keep provider queries enabled.

These controls cover optional spent-status lookups during scanning. Full-block
providers still observe the requested blocks, including historical payment blocks
reread during recovery, connection timing and network metadata. Selected historical
block requests can narrow wallet activity even without revealing an exact outpoint.
Broadcasting a transaction necessarily sends that transaction to its
selected broadcast provider. No Tor service, new endpoint, or telemetry is added.

## Saving, resuming and refreshing old history

**Save scan progress encrypted in this browser** uses the existing Bitcoin vault.
The saved state contains discovery and spend metadata, public block hashes, and
the last continuously checked spend height for each output. It does not contain a
seed, private scan/spend key, or spend tweak. Saving remains opt-in, authenticated,
network/wallet/source-policy scoped, and protected against stale-tab writes.

Only a fully processed block advances the cursor and its spend-coverage evidence.
Cancellation or interruption leaves the last successfully committed checkpoint.
On restoration, matching output blocks are read again and the spend tweaks are
derived locally; saved metadata alone does not authorize spending. A later scan
watches previously discovered outpoints and persists any newly observed spend.

Older version-1 state without spend coverage still loads. It is treated as unknown,
because rereading a payment's creation block does not reveal a spend hidden in a
previously scanned interval. To refresh it:

1. For an incomplete scan, continue scanning to the checked chain tip. New blocks
   are processed in pages of at most 500, with at most 500 historical payment
   blocks revalidated in the same request.
2. For a historical coverage gap, use **Forget saved scan progress** and rescan from
   the original first block. The fresh scan must include the payment's creation
   and every later block through the sampled tip.
3. Alternatively, explicitly enable the provider check for the current scan. This
   reveals the queried outpoints. Provider answers are not persisted as permanent
   local evidence; later local-only scans still require continuous coverage.

Malformed or contradictory state is rejected. Conflicting or duplicate output
identities, invalid coverage heights and inconsistent stored block hashes cannot
be accepted as proof. A source mode without complete inputs leaves a coverage gap;
switching to full-block mode does not bridge it automatically.

## Chain reorganizations

Discovery, spend and continuous-coverage records are tied to block hashes. Before
resuming, Bitcoin state is compared with the checked header chain. A shallow
reorganization rolls progress back to the retained common ancestor. Orphaned
discoveries become pending; orphaned spends are cleared, and coverage is reduced
to the retained chain. A fork beyond the remembered 100-block window restarts at
the birth height. Canonical discoveries are revalidated during recovery.

If a displayed result loses supporting chain evidence, its spent count is cleared
and its status becomes unknown. Surviving canonical discoveries can still be
displayed, but cannot be swept until the scan refreshes their status. This includes
the later coverage anchor of outputs restored from old discovery blocks.

## Resource and verification limits

Scans retain existing limits on block/response size, worker requests, 10,000
ephemeral matches, and 512 KiB of serialized/encrypted checkpoint plaintext. Large
histories can reach the byte limit before the match limit; the scan stops with an
error rather than truncating evidence or silently declaring missing history safe.

Coinbase exclusion is determined from the transaction's serialized input, not an
uncommitted provider flag. Full-block data is checked against transaction Merkle
roots, witness commitments and the selected checked header chain. Cross-checked
sources preserve their existing agreement requirements. None of this replaces a
full Bitcoin node's consensus validation, guarantees payment completeness, or
detects every mempool spend. A broadcast can fail if an input has already been
spent. Live-node and physical-device acceptance remain separate from deterministic
fixture tests.

See [Spec 12](../specs/12-bip352-light-client-scanning.md) and the
[feature qualification report](../handoffs/btc-spentness-20261118/QUALIFICATION.md)
for implementation evidence and remaining gates.
