#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
import shutil
import sys

source, destination = map(lambda value: Path(value).resolve(), sys.argv[1:3])
profile, commit = sys.argv[3:5]
assert profile in ('full', 'lean')
assert source.is_dir() and not destination.exists()
info = json.loads((source / 'build-info.json').read_text())
assert info['app'] == 'ghostpay-web' and info['commit'] == commit
assert (source / 'index.html').is_file()
if profile == 'lean':
    report = json.loads((source / 'ghostpay-lean-build.json').read_text())
    assert report['profile'] == 'lean' and report['chunks'] and report['workers']
shutil.copytree(source, destination, symlinks=True)
hashes = {}
for path in sorted(destination.rglob('*')):
    assert not path.is_symlink(), 'captured artifact must not have symlinks'
    if path.is_file():
        assert not path.name.endswith('.map')
        hashes[str(path.relative_to(destination))] = hashlib.sha256(path.read_bytes()).hexdigest()
record = {'profile': profile, 'commit': commit, 'artifact': str(destination), 'files': len(hashes), 'sha256': hashes}
destination.with_suffix('.inventory.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({'profile': profile, 'commit': commit, 'artifact': str(destination), 'files': len(hashes)}, indent=2))
