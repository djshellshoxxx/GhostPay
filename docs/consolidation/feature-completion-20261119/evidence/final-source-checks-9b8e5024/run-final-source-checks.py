#!/usr/bin/env python3
"""Serial, source-pinned final checks. Outputs preserve original commands and exits."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

BASE = Path('/workspace/scratch/13855ecc035c')
REPO = BASE / 'GhostPay'
WEB = REPO / 'apps/web'
NODE = BASE / 'runtime-npm-cache/_npx/361c55be1121897e/node_modules/node/bin/node'
HEAD = '9b8e502498388405d5f03da170e7c51574bc06a6'
PUBLISHED = '155d009160a6e5b2c24a91705c72fc8cca6ce815'
OUT = BASE / 'final-source-checks-9b8e5024'
OUT.mkdir(exist_ok=True)
assert subprocess.check_output([str(NODE), '--version'], text=True).strip() == 'v22.23.4'
env = dict(os.environ)
env['PATH'] = str(NODE.parent) + os.pathsep + env['PATH']
env['NODE_OPTIONS'] = '--max-old-space-size=768 --max-semi-space-size=32'
env['GP_COMMIT'] = HEAD


def frozen():
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip() == HEAD
    local_tree = subprocess.check_output(['git', 'rev-parse', HEAD+'^{tree}'], cwd=REPO, text=True).strip()
    published_tree = subprocess.check_output(['git', 'rev-parse', PUBLISHED+'^{tree}'], cwd=REPO, text=True).strip()
    assert local_tree == published_tree, 'Published/local tree mismatch'
    changes = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=REPO, text=True).splitlines()
    assert all(p.startswith('docs/') for p in changes), changes
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=REPO, text=True).splitlines()
    assert all(p.startswith('docs/') for p in untracked), untracked


def run(label, args, cwd=WEB, overrides=None):
    frozen()
    log = OUT / (label + '.txt')
    receipt = OUT / (label + '.json')
    assert not log.exists() and not receipt.exists(), 'Refusing to overwrite prior execution: ' + label
    command = [str(NODE), *args]
    actual_env = {**env, **(overrides or {})}
    started = time.time()
    with log.open('xb') as f:
        f.write((json.dumps({'source_local': HEAD, 'published_equivalent': PUBLISHED,
                            'node': '22.23.4', 'cwd': str(cwd), 'argv': command,
                            'NODE_OPTIONS': actual_env['NODE_OPTIONS'],
                            'GP_COMMIT': HEAD,
                            'GHOSTPAY_LOCAL_BUILD_PROFILE': actual_env.get('GHOSTPAY_LOCAL_BUILD_PROFILE')}) + '\n').encode())
        f.flush()
        result = subprocess.run(command, cwd=cwd, env=actual_env, stdout=f, stderr=subprocess.STDOUT)
    input_error = None
    try:
        frozen()
    except Exception as exc:
        input_error = repr(exc)
    value = {'label': label, 'source_local': HEAD, 'published_equivalent': PUBLISHED,
             'exit_code': result.returncode, 'wall_seconds': round(time.time()-started, 3),
             'cwd': str(cwd), 'argv': command, 'node': '22.23.4',
             'node_options': actual_env['NODE_OPTIONS'], 'log': log.name,
             'post_source_validation_error': input_error,
             'qualification': ('BLOCKED_SOURCE_BINDING' if input_error is not None else
                               'PASSED' if result.returncode == 0 else 'FAILED'),
             'bytes': log.stat().st_size, 'sha256': hashlib.sha256(log.read_bytes()).hexdigest()}
    with receipt.open('x') as f: json.dump(value, f, indent=2); f.write('\n')
    print(json.dumps(value), flush=True)
    return 2 if input_error is not None else result.returncode


def manifest(profile):
    frozen()
    paths = sorted(p for p in (WEB/'dist').rglob('*') if p.is_file())
    value = {'source_local': HEAD, 'published_equivalent': PUBLISHED, 'profile': profile,
             'source_tree': subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=REPO,text=True).strip(),
             'node': '22.23.4', 'local_artifact_only': True,
             'scope': 'Vite production bundling, CSP application and artifact scan',
             'typecheck_prerequisite_qualified': typecheck_ok(),
             'files': [{'file': str(p.relative_to(WEB/'dist')), 'bytes': p.stat().st_size,
                        'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]}
    target = OUT / (profile + '-artifact-manifest.json')
    frozen()
    with target.open('x') as f: json.dump(value, f, indent=2); f.write('\n')
    if profile == 'lean':
        with (OUT/'lean-module-report.json').open('xb') as f:
            f.write((WEB/'dist/ghostpay-lean-build.json').read_bytes())
    print(json.dumps({'manifest': target.name, 'files': len(paths), 'profile': profile}), flush=True)


def typecheck_ok():
    path = OUT/'web-typecheck.json'
    if not path.is_file(): return False
    value = json.loads(path.read_text())
    return (value.get('source_local') == HEAD and value.get('published_equivalent') == PUBLISHED
            and value.get('exit_code') == 0 and value.get('qualification') == 'PASSED')


p = argparse.ArgumentParser()
p.add_argument('--phase', choices=['type-nocov', 'builds'], required=True)
a = p.parse_args()
failures = []
if a.phase == 'type-nocov':
    for label, args, extra in [
        ('web-typecheck', ['../../node_modules/typescript/bin/tsc','-p','tsconfig.json','--noEmit'],
         {'NODE_OPTIONS':'--max-old-space-size=1536'}),
        ('web-nocov', ['../../node_modules/vitest/vitest.mjs','run','--config','vitest.nocov.config.ts',
                       '--maxWorkers=1','--no-file-parallelism','--reporter=verbose'], {})]:
        if run(label, args, overrides=extra) != 0: failures.append(label)
else:
    print(json.dumps({'phase':'builds','scope':'Vite bundling/postbuild',
                      'matching_typecheck_qualified':typecheck_ok()}),flush=True)
    if not typecheck_ok(): failures.append('original-build-typecheck-prerequisite')
    for profile in ['full','lean']:
        extra = {'GHOSTPAY_LOCAL_BUILD_PROFILE':profile}
        if run(profile+'-build', ['../../node_modules/vite/bin/vite.js','build'], overrides=extra) != 0:
            failures.append(profile+'-build')
            continue
        ok = True
        for label, args in [(profile+'-csp',['scripts/apply-csp.mjs']),
                            (profile+'-scan',['scripts/scan-bundle.mjs'])]:
            if run(label, args, overrides=extra) != 0: failures.append(label); ok = False
        if ok: manifest(profile)
        if profile == 'full':
            if run('hosting-kit', ['--test','--test-concurrency=4','test/**/*.test.mjs'],
                   cwd=REPO/'tools/portable-hosting-kit') != 0:
                failures.append('hosting-kit')
        elif ok:
            js = "import{readFileSync}from'node:fs';import{checkLeanReport}from'../../scripts/pages/verify-pages-site.mjs';const r=JSON.parse(readFileSync('dist/ghostpay-lean-build.json','utf8'));const problems=checkLeanReport(r);console.log(JSON.stringify({chunks:r.chunks.length,workers:r.workers.length,problems}));if(problems.length)process.exitCode=1;"
            if run('lean-boundary',['--input-type=module','-e',js]) != 0: failures.append('lean-boundary')
print(json.dumps({'phase':a.phase,'failures':failures}),flush=True)
raise SystemExit(1 if failures else 0)
