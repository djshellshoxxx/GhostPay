"""Verify the frozen evidence archives without unpacking them."""
from pathlib import Path
import hashlib
import json
import tarfile

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'ARCHIVE_MANIFEST.json').read_text())
count = 0
for archive in manifest['archives']:
    path = root / archive['path']
    assert path.stat().st_size == archive['bytes'], path
    assert hashlib.sha256(path.read_bytes()).hexdigest() == archive['sha256'], path
    expected = {x['path']: x for x in manifest['files'] if x['archive'] == archive['path']}
    with tarfile.open(path, 'r:gz') as tar:
        members = tar.getmembers()
        assert {m.name for m in members} == set(expected), path
        for member in members:
            assert member.isfile() and not member.name.startswith('/') and '..' not in Path(member.name).parts, member.name
            data = tar.extractfile(member).read()
            record = expected[member.name]
            assert len(data) == record['bytes'], member.name
            assert hashlib.sha256(data).hexdigest() == record['sha256'], member.name
            count += 1
print(json.dumps({'verified_archives': len(manifest['archives']), 'verified_files': count, 'failed': 0}))
