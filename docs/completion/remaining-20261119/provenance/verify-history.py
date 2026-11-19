#!/usr/bin/env python3
"""Verify the remaining-work original-history archive without changing refs."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[4])
    parser.add_argument('--check-imported', action='store_true', help='also require every recorded original head in this repository')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    manifest = json.loads((directory / 'manifest.json').read_text())
    bundle = directory / manifest['bundle']['filename']
    actual = hashlib.sha256(bundle.read_bytes()).hexdigest()
    if actual != manifest['bundle']['sha256'] or bundle.stat().st_size != manifest['bundle']['bytes']:
        raise SystemExit('History bundle digest or byte count differs from its recorded value')
    subprocess.run(['git', '-C', str(args.repo), 'bundle', 'verify', str(bundle)], check=True)
    listed = subprocess.check_output(['git', 'bundle', 'list-heads', str(bundle)], text=True)
    observed = dict(line.split(' ', 1)[::-1] for line in listed.splitlines())
    expected = {row['ref']: row['commit'] for row in manifest['heads']}
    if observed != expected:
        raise SystemExit('History bundle advertised refs differ from the frozen source inventory')
    if args.check_imported:
        for row in manifest['heads']:
            tree = subprocess.check_output(['git', '-C', str(args.repo), 'rev-parse', row['commit'] + '^{tree}'], text=True).strip()
            if tree != row['tree']:
                raise SystemExit('Imported source tree differs: ' + row['ref'])
    print('PASS: bundle digest, prerequisites and all ' + str(len(expected)) + ' original source heads verified' + (' with imported tree identities' if args.check_imported else ''))


if __name__ == '__main__':
    main()
