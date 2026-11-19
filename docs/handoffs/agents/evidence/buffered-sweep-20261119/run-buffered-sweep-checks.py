"""Run the scoped buffered-sweep checks, retaining command outcomes and exact source identity."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

workspace = Path('/workspace/scratch/6eafdb04d91b/GhostPay-buffered-sweep')
output = Path('/workspace/scratch/6eafdb04d91b/security-evidence')
cwd = workspace / 'packages/chain-adapters'
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=768',
       'ANVIL_BIN': '/workspace/scratch/75c78c17e2fc/contract-tools/anvil', 'REQUIRE_ANVIL': '1'}
checks = [
    ('typecheck', ['node', '../../node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--noEmit']),
    ('lint', ['node', '../../node_modules/eslint/bin/eslint.js', '--config', '../../eslint.config.js', 'src/router.anvil.test.ts']),
    ('anvil-final', ['node', '../../node_modules/vitest/vitest.mjs', 'run', 'src/router.anvil.test.ts', '--coverage=false', '--maxWorkers=1']),
]
record = {'scope': 'F-CTR06 test-only native acceptance and scoped static checks',
          'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=workspace, text=True).strip(),
          'sourcePath': 'packages/chain-adapters/src/router.anvil.test.ts',
          'sourceSha256': hashlib.sha256((cwd / 'src/router.anvil.test.ts').read_bytes()).hexdigest(),
          'cwd': str(cwd), 'nodeOldSpaceMiB': 768, 'requireAnvil': True,
          'lock': '/workspace/scratch/6eafdb04d91b/qualification.lock', 'checks': []}
receipt = output / 'buffered-sweep-checks.json'
for name, command in checks:
    log = output / ('buffered-sweep-' + name + '.log')
    item = {'name': name, 'argv': command, 'log': str(log),
            'startedAt': datetime.now(timezone.utc).isoformat()}
    print('Starting ' + name, flush=True)
    with log.open('wb') as stream:
        result = subprocess.run(['flock', '--close', record['lock'], *command], cwd=cwd, env=env,
                                stdout=stream, stderr=subprocess.STDOUT, check=False)
    data = log.read_bytes()
    item.update({'finishedAt': datetime.now(timezone.utc).isoformat(), 'exitCode': result.returncode,
                 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
    record['checks'].append(item)
    receipt.write_text(json.dumps(record, indent=2) + '\n')
    print(f'{name}: exit {result.returncode}', flush=True)
    if result.returncode != 0:
        sys.exit(result.returncode)
