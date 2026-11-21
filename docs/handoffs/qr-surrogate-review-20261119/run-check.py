#!/usr/bin/env python3
"""Preserve complete scoped command output and its actual child exit status."""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[3]
name, cwd_relative, heap, *command = sys.argv[1:]
if not command or '/' in name or '..' in name:
    raise SystemExit('name, relative working directory, heap and command required')
out = Path(__file__).resolve().parent / 'evidence'
out.mkdir(exist_ok=True)
log = out / (name + '.log.gz')
receipt_path = out / (name + '.json')
if log.exists() or receipt_path.exists():
    raise SystemExit('refusing to overwrite prior evidence')
cwd = (root / cwd_relative).resolve()
source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
tree = subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], cwd=root, text=True).strip()
env = os.environ.copy()
env['NODE_OPTIONS'] = '--max-old-space-size=' + heap
env['NO_COLOR'] = '1'
start = datetime.datetime.now(datetime.timezone.utc).isoformat()
monotonic = time.monotonic()
process = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
assert process.stdout is not None
raw_hash = hashlib.sha256()
size = 0
with log.open('wb') as handle:
    with gzip.GzipFile(filename='', mode='wb', fileobj=handle, mtime=0) as compressed:
        while True:
            block = process.stdout.read(65536)
            if not block:
                break
            raw_hash.update(block)
            size += len(block)
            compressed.write(block)
exit_code = process.wait()
receipt = {
    'source': source, 'tree': tree, 'command': command, 'cwd': str(cwd),
    'environment': {'NODE_OPTIONS': env['NODE_OPTIONS'], 'NO_COLOR': '1'},
    'started': start, 'ended': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'durationSeconds': round(time.monotonic() - monotonic, 3), 'exitCode': exit_code,
    'log': {'path': str(log.relative_to(root)), 'uncompressedSha256': raw_hash.hexdigest(),
            'uncompressedBytes': size, 'storedSha256': hashlib.sha256(log.read_bytes()).hexdigest()},
}
receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
print(gzip.decompress(log.read_bytes()).decode(errors='replace')[-16000:])
raise SystemExit(exit_code if exit_code >= 0 else 128 - exit_code)
