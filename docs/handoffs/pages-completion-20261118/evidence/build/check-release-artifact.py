#!/usr/bin/env python3
"""Check development release outputs without publishing, extracting, or executing them."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import sys
import tarfile

artifact = Path(sys.argv[1]).resolve()
commit, lock_sha, epoch = sys.argv[2:5]
entries = list(artifact.iterdir())
assert all(path.is_file() and not path.is_symlink() for path in entries), 'artifact directory contains only regular files'
manifest = json.loads((artifact / 'release-manifest.json').read_text())
assert manifest['project'] == 'ghostpay-web'
assert manifest['channel'] == 'development'
assert manifest['tag'] is None
assert manifest['commit'] == commit
assert manifest['sourceTree'] == {'clean': True, 'tagCommit': None}
assert manifest['sourceDateEpoch'] == int(epoch)
assert manifest['tools']['node'] == 'v22.23.5'
assert manifest['tools']['npm'] == '11.21.2'
assert manifest['lockfile']['sha256'] == lock_sha
assert manifest['publication']['status'] == 'not-published'
assert manifest['chains']['deploymentManifests'] == []
expected = {item['name']: item for item in manifest['artifacts']}
assert len(manifest['artifacts']) == len(expected) == 2
assert set(item['kind'] for item in expected.values()) == {'web-bundle-tarball', 'sbom'}
checksums = {}
for line in (artifact / 'SHA256SUMS').read_text().splitlines():
    match = re.fullmatch(r'([0-9a-f]{64})  ([^/\\]+)', line)
    assert match, 'checksum entry must be a single filename'
    digest, name = match.groups()
    assert name not in checksums
    data = (artifact / name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == digest, name
    checksums[name] = digest
    if name in expected:
        assert expected[name]['sha256'] == digest
        assert expected[name]['bytes'] == len(data)
assert set(checksums) == set(expected) | {'release-manifest.json'}
assert set(p.name for p in entries) == set(checksums) | {'SHA256SUMS'}

tar_name = next(name for name, item in expected.items() if item['kind'] == 'web-bundle-tarball')
with tarfile.open(artifact / tar_name, 'r:gz') as tar:
    members = tar.getmembers()
    seen_names = set()
    for member in members:
        parts = PurePosixPath(member.name).parts
        assert parts[0] == 'ghostpay-web' and '..' not in parts and not member.name.startswith('/')
        canonical_name = str(PurePosixPath(member.name))
        assert member.name.rstrip('/') == canonical_name
        assert canonical_name not in seen_names, 'no duplicate tar member names'
        seen_names.add(canonical_name)
        assert member.isfile() or member.isdir(), 'no links or special files in bundle'
        assert member.uid == member.gid == 0
        assert member.mtime == int(epoch)
        assert not member.name.endswith('.map')
    bundled_info = json.load(tar.extractfile('ghostpay-web/build-info.json'))
    assert bundled_info['app'] == 'ghostpay-web'
    assert bundled_info['commit'] == commit
    file_count = sum(member.isfile() for member in members)
sbom_name = next(name for name, item in expected.items() if item['kind'] == 'sbom')
sbom = json.loads((artifact / sbom_name).read_text())
assert sbom['bomFormat'] == 'CycloneDX'
assert sbom['metadata']['component']['name'] == 'ghostpay'
print(json.dumps({
    'result': 'PASS', 'scope': 'development artifacts; no publication', 'artifact': str(artifact),
    'commit': commit, 'channel': manifest['channel'], 'sourceTree': manifest['sourceTree'],
    'node': manifest['tools']['node'], 'npm': manifest['tools']['npm'],
    'sourceDateEpoch': int(epoch), 'bundleFiles': file_count,
    'sbomComponents': len(sbom.get('components', [])), 'sha256': checksums,
}, indent=2))
