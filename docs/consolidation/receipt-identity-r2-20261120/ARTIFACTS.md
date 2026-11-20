# Lossless qualification artifacts

[EVIDENCE.json](EVIDENCE.json) lists the original filename, byte count, SHA-256, relative artifact path and encoding for every retained artifact. The four independent-review files are preserved as original readable bytes. Other originals are stored as JSON wrappers with `encoding: gzip+base64` and a `gzip_base64` payload.

For each wrapper, decode base64 and decompress gzip. Verify the result's byte count and SHA-256 against both the wrapper and evidence index before reading it. The payload is the complete original file, not a summarized replacement. For example, with Python's standard library:

```python
import base64, gzip, hashlib, json
from pathlib import Path

wrapper = json.loads(Path("outputs/receipt-identity-r2-red.json.artifact.json").read_text())
original = gzip.decompress(base64.b64decode(wrapper["gzip_base64"]))
assert len(original) == wrapper["original_bytes"]
assert hashlib.sha256(original).hexdigest() == wrapper["original_sha256"]
```

Each payload was decoded and compared byte-for-byte with its original during preparation. The index includes the initial failed lint gate, the two-line test correction and independent addendum, the separate corrected-source rerun, and the final successful original web gates. Runs on different source identities remain separate, and overlapping test counts are not summed.
