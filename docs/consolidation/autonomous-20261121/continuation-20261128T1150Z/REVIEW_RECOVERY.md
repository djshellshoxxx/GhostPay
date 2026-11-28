# Evidence recovery — review_761

Recovered at 2026-11-28 11:47:08 UTC by /root/review_761.

## Availability event

A fresh exec read confirmed that /workspace/scratch/e0d032f0e72f/review_761 and /workspace/scratch/e0d032f0e72f/ghostpay were absent. At that read, the workspace contained only publication_20261128 and build_consolidation_checkpoint.py. The cause of the filesystem disappearance was not established.

This directory restores surviving functions store objects. JSON is reserialized from those stored values; it is not a claim to reproduce original HTTP wire bytes or the final lost on-disk files byte for byte. No source tests, browser tests, network qualification, GitHub mutation, lease acquisition, or source edit was performed during recovery.

## Restored files and provenance

- PR753_HEAD_REFRESH.store-before-local-proof.json: the actual stored pr753_review_json object used to create the initial PR753_HEAD_REFRESH.json. The later local step embedded the full preservation proof and evidence-file SHA-256 values into that file; those later additions were not placed back into this store and are not restored here.
- PR753_EXACT_HEAD_SNAPSHOT.store.json: the actual stored, structured generic Actions/check-runs/status/ref snapshot, checked at 2026-11-28 11:27:50 UTC. It records current main0934ea09, #753 head6bb0d3de, six pending/queued workflows, 15 checks (14 queued, one skipped), and the separate successful Snyk status.
- RAW_TOOL_STORE_OBJECTS.json: 18 surviving named values, including the original tool response objects for PR metadata, comments, branch refs, commit6bb0d3de, synthetic merge7ad43a97, generic Actions/check-runs/status responses, plus derived review/snapshot objects. pr753_final_2 also retains the actual read-only command result confirming identical package-lock.json and CI/Pages/Beta/Mobile workflow blobs across the two candidate heads. Some other command responses contain only filenames, not file bytes.

The initial PR753 review object contains earlier qualification references and scoped conclusions. It does not contain downloaded browser ZIPs, raw browser execution logs, or the full prior 63-case collector log. Those references remain prior reported evidence; recovery did not rerun or newly verify them.

## Not recovered

The final PR753_HEAD_REFRESH.md, final locally augmented PR753_HEAD_REFRESH.json, and full PR753_PRESERVATION_PROOF.json bytes were not recovered. The earlier #761 review, handler executable/result/logs, merge-preservation proof, #243 report, automation residual overlay, and #248 coordination files were also not found in the filesystem. No surviving #761 handler or earlier review objects were found among the explicit known/likely store keys inspected; this is not a claim that a global store-key listing was available.

No original-name evidence file is replaced with synthesized content. No original test output or full proof is recreated from a narrative summary. Root should publish the actual recovered objects and retain this availability limitation.

## Previously observed final-file hashes

These hashes were printed by the last successful local verification before the disappearance. The bytes they identify are currently unavailable; they are not the hashes of the recovered files:

| Lost original | Original bytes | Previously observed SHA-256 |
| --- | ---: | --- |
| PR753_HEAD_REFRESH.md | 8498 | 8fc3c4bb8287877cc78136245498ecee6f30b388aeeceeb047b2bbfb6f9cef14 |
| PR753_HEAD_REFRESH.json | 27404 | 78dc5fb994fb692fdac68a4d6ad329cf08cd8d034b859957f50df6021fa28f01 |
| PR753_PRESERVATION_PROOF.json | 8471 | f5183a7869375a6e7458fb24ad13b0258d64cf12d1826b5c773d181147e6a772 |

RECOVERY_MANIFEST.json records the newly recovered file sizes and hashes. These recovered artifacts can be read by exec_command at the absolute directory above.

