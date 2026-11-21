# Lossless qualification artifacts

`EVIDENCE.json` indexes each retained original file by relative source name, byte count, SHA-256 and wrapper path. Each wrapper uses `encoding: gzip+base64`. Decode the payload, decompress gzip and verify both its length and SHA-256 before reading it:

```python
import base64, gzip, hashlib, json
from pathlib import Path

wrapper = json.loads(Path("outputs/r3-backup-hosted-original.log.artifact.json").read_text())
original = gzip.decompress(base64.b64decode(wrapper["gzip_base64"]))
assert len(original) == wrapper["original_bytes"]
assert hashlib.sha256(original).hexdigest() == wrapper["original_sha256"]
```

The payload is the complete retained original, not an excerpt. Every wrapper was decoded and compared byte-for-byte with its scratch original during preparation. The index includes the hosted failure, both original local passing behavioral controls, both subset-coverage gate failures, first killed lint attempt, successful unchanged serial rerun and final source gates. The evidence explicitly distinguishes behavioral-test outcomes from command exit status. Generated coverage HTML is not retained; each original LCOV result, command log and behavioral JSON is retained.
