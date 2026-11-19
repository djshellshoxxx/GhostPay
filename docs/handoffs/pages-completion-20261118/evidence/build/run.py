#!/usr/bin/env python3
"""Run one pinned-toolchain qualification command, preserving output and exit status."""
from pathlib import Path
import argparse
import datetime
import json
import os
import shlex
import subprocess
import sys
import time

BASE = Path(__file__).resolve().parent
NODE_BIN = Path('/workspace/scratch/a884a1d6c4d8/fs35-node22-npm-cache/_npx/e5e7bdc4f892e393/node_modules/node/bin')
TOOLS = Path('/workspace/scratch/4fa14be12559/toolchain-probe')

parser = argparse.ArgumentParser()
parser.add_argument('name')
parser.add_argument('--cwd', default=str(BASE / 'source'))
parser.add_argument('--heap', default='1536', choices=['384', '768', '1536'])
parser.add_argument('--pages-node-cap', action='store_true')
parser.add_argument('--env', action='append', default=[])
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ['--'] else args.command
if not command:
    parser.error('a command is required')
if not args.name.replace('-', '').replace('_', '').isalnum():
    parser.error('name must be alphanumeric with dashes or underscores')
env = os.environ.copy()
removed = []
for key in list(env):
    if key.startswith(('GHOSTPAY_', 'GP_', 'VITE_')) or key in ('VERSION', 'SOURCE_DATE_EPOCH', 'OUT_DIR', 'KEEP'):
        removed.append(key)
        env.pop(key)
paths = [str(NODE_BIN), str(TOOLS / 'npm-bin'), str(TOOLS / 'bin')]
if args.pages_node_cap:
    paths.insert(0, str(BASE / 'resource-bin'))
env['PATH'] = ':'.join(paths + [env['PATH']])
env['NODE_OPTIONS'] = '--max-old-space-size=' + args.heap
env['CI'] = '1'
env['TZ'] = 'UTC'
env['LC_ALL'] = 'C'
overrides = {}
for entry in args.env:
    key, sep, value = entry.partition('=')
    if not sep:
        parser.error('--env must be KEY=VALUE')
    env[key] = value
    overrides[key] = value
record = {
    'name': args.name, 'cwd': args.cwd, 'command': command,
    'started': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'node_bin': str(NODE_BIN), 'npm_bin': str(TOOLS / 'npm-bin'),
    'heap_mib': int(args.heap), 'pages_node_cap': args.pages_node_cap,
    'overrides': overrides, 'removed_ambient_build_variable_names': sorted(removed),
}
result_path = BASE / (args.name + '.json')
log_path = BASE / 'logs' / (args.name + '.log')
if result_path.exists() or log_path.exists():
    parser.error('evidence name already exists; select a new name')
started = time.monotonic()
with log_path.open('w') as log:
    log.write('$ ' + shlex.join(command) + '\n')
    log.write('cwd: ' + args.cwd + '\n')
    log.write('resource settings: ' + json.dumps({'NODE_OPTIONS': env['NODE_OPTIONS'], 'pages_node_cap': args.pages_node_cap}) + '\n')
    log.flush()
    proc = subprocess.run(command, cwd=args.cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
    record['exit_code'] = proc.returncode
    record['seconds'] = round(time.monotonic() - started, 3)
    record['finished'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    log.write('\nEXIT_CODE=' + str(proc.returncode) + '\n')
    log.write('SECONDS=' + str(record['seconds']) + '\n')
record['log'] = str(log_path)
result_path.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2), flush=True)
print('--- Last output lines ---', flush=True)
print(''.join(log_path.read_text(errors='replace').splitlines(keepends=True)[-35:]), end='', flush=True)
sys.exit(proc.returncode if proc.returncode >= 0 else 128 - proc.returncode)
