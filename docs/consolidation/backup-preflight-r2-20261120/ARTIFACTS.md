# Original qualification artifacts

The [evidence index](EVIDENCE.json) records each original filename, byte length,
SHA-256 and repository path. Files in `outputs/` contain deterministic gzip+base64
wrappers. Decompressing the payload reproduces the original bytes; all wrappers
were round-trip checked against the source artifacts before this docs commit.
The independent review and planning reports are copied byte-for-byte as readable
Markdown/JSON next to this file.

For one wrapper, this standard-library Python example recovers and verifies the
original file in the current directory:

```python
import base64
import gzip
import hashlib
import json
from pathlib import Path

wrapper = json.loads(Path("outputs/backup-preflight-r2-green.json.json").read_text())
raw = gzip.decompress(base64.b64decode(wrapper["gzip_base64"]))
assert len(raw) == wrapper["original_bytes"]
assert hashlib.sha256(raw).hexdigest() == wrapper["original_sha256"]
Path(wrapper["original_filename"]).write_bytes(raw)
```

The 22-test GREEN and 246-test compatibility runs overlap. Their totals must not
be added. The full/lean Playwright logs list two cases each; they execute no browser
body. Build identity is the local runtime `fde65b79`, preserved in the original
build metadata and artifact hashes.
