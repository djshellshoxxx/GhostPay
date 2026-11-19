#!/usr/bin/env python3
"""Run explicitly selected, original-config lint partitions; never retry an attempt.

Metadata only:  python run-web-lint-partitions.py --validate-only
24-file trial:  python run-web-lint-partitions.py --partitions 3
Continue once:  python run-web-lint-partitions.py --remaining
Recheck result: python run-web-lint-partitions.py --status

No mode defaults to execution. Failed/incomplete partition directories are retained
and blocked. All diagnostic partitions run serially; input drift stops execution.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import signal
import subprocess
import sys
import time


SCRATCH = Path('/workspace/scratch/13855ecc035c')
REPO = SCRATCH / 'GhostPay'
CWD = REPO / 'apps/web'
EVIDENCE = REPO / 'docs/consolidation/feature-completion-20261119/evidence'
MANIFEST = EVIDENCE / 'web-lint-manifest.json'
MONOLITHIC = EVIDENCE / 'final-serial-web-lint.txt'
NODE = Path('/workspace/scratch/13855ecc035c/runtime-npm-cache/_npx/361c55be1121897e/node_modules/node/bin/node')
NODE_FLAGS = ['--max-old-space-size=768', '--max-semi-space-size=32']
CLI = ['../../node_modules/eslint/bin/eslint.js', '--config', '../../eslint.config.js']
SELECTION_SHA = '293c110b6816d6e1632bd141c25bba3e1611fc084ff065612e781bf55faa0eb4'
SOURCE_SUFFIXES = {'.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'}
CURRENT_OUTPUT = None


class Blocked(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Blocked(message)


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def fingerprint(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())


def environment_fingerprint():
    # Retain the environment unchanged; do not publish credential-bearing values.
    relevant = {k: v for k, v in os.environ.items()
                if k == 'CI' or k.startswith(('NODE_', 'ESLINT_', 'TSESTREE_', 'TYPESCRIPT_ESLINT_', 'TS_NODE_'))}
    return fingerprint(relevant)


def file_record(path):
    data = path.read_bytes()
    return {'path': str(path), 'bytes': len(data), 'sha256': sha(data)}


def write_json(path, value, replace=False):
    text = json.dumps(value, indent=2, sort_keys=True) + '\n'
    if replace:
        temporary = path.with_suffix('.json.tmp')
        temporary.write_text(text)
        os.replace(temporary, path)
    else:
        with path.open('x') as handle:
            handle.write(text)


def record_blocked_status(output, reason):
    """A stale prior pass must not remain the current aggregate after rejection."""
    if output is None or not output.is_dir() or not (output / 'session.json').exists():
        return
    with (output / 'driver.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        previous = output / 'aggregate.json'
        historical = None
        if previous.exists():
            historical = output / f'aggregate-history-{time.time_ns()}.json'
            with historical.open('xb') as handle:
                handle.write(previous.read_bytes())
        write_json(previous, {'qualification': 'BLOCKED_CURRENT_VALIDATION', 'updated_at': now(),
                   'reason': reason, 'historical_aggregate': str(historical) if historical else None,
                   'prior_monolithic_command_exit_code': 137, 'prior_monolithic_log': str(MONOLITHIC),
                   'error_count': None, 'warning_count': None}, replace=True)


def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO).decode().strip()


def relative_source(value):
    p = PurePosixPath(value)
    require(not p.is_absolute() and '..' not in p.parts and str(p) == value,
            f'Noncanonical source path: {value!r}')
    require(p.parts and p.parts[0] in ('src', 'e2e'), f'Outside original scope: {value}')
    return value


def load_manifest():
    raw = MANIFEST.read_bytes()
    manifest = json.loads(raw)
    require(manifest['schema'] == 1 and manifest['selected_count'] == 497,
            'Expected the final schema-1, 497-file manifest')
    require(manifest['repository'] == str(REPO) and manifest['cwd'] == str(CWD), 'Wrong repository/cwd')
    require(manifest['original_script'] == 'eslint --config ../../eslint.config.js src e2e', 'Original script changed')
    paths = [relative_source(item['path']) for item in manifest['files']]
    require(len(paths) == 497 and len(set(paths)) == 497, 'Duplicate/missing manifest files')
    require(sha(('\n'.join(paths) + '\n').encode()) == manifest['selected_manifest_sha256'] == SELECTION_SHA,
            'Selection fingerprint differs from the final manifest')
    parts = manifest['partitions']
    require([p['id'] for p in parts] == list(range(1, 22)), 'Expected partitions 1 through 21')
    require([len(p['files']) for p in parts] == [24] * 20 + [17], 'Partition sizes changed')
    require([f for p in parts for f in p['files']] == paths, 'Partition union/order differs from manifest')
    for part in parts:
        require(part['command_argv'] == CLI + part['files'], f'Unexpected CLI arguments in partition {part["id"]}')
    ignored = [relative_source(p) for p in manifest['ignored_files']]
    require(len(set(ignored)) == 11 and not set(paths).intersection(ignored), 'Invalid original ignored-file inventory')
    for key, config in manifest['resolved_configs'].items():
        require(sha(encoded(config)) == key, 'Resolved-config fingerprint is invalid')
        require(config['languageOptions']['parserOptions']['projectService'] is True, 'Typed project service missing')
    require(all(f['config_sha256'] in manifest['resolved_configs'] for f in manifest['files']), 'Unknown resolved config')
    require(git('rev-parse', manifest['source_head'] + '^{tree}') == manifest['source_tree'], 'Source commit/tree mismatch')
    return manifest, sha(raw)


def typed_path(path):
    return (path.startswith(('apps/web/', 'packages/')) and Path(path).suffix in SOURCE_SUFFIXES)


def verify_inputs(manifest, manifest_sha):
    """Check all manifest bytes and conservatively pin other local type inputs."""
    require(sha(MANIFEST.read_bytes()) == manifest_sha, 'Manifest changed during execution')
    actual = set()
    for folder in ('src', 'e2e'):
        for directory, dirs, files in os.walk(CWD / folder):
            require(not any((Path(directory) / d).is_symlink() for d in dirs), 'Symlinked source directory')
            for name in files:
                path = Path(directory) / name
                require(not path.is_symlink(), f'Symlinked source file: {path}')
                actual.add(path.relative_to(CWD).as_posix())
    expected = {f['path'] for f in manifest['files']} | set(manifest['ignored_files'])
    require(actual == expected and len(actual) == 508, 'Original source scope gained/lost files')
    source_hashes = {}
    for item in manifest['files']:
        data = (CWD / item['path']).read_bytes()
        digest = sha(data)
        require(digest == item['sha256'] and len(data) == item['bytes'], f'Source drift: {item["path"]}')
        source_hashes[item['path']] = digest
    for rel, digest in manifest['inputs_sha256'].items():
        require(sha((REPO / rel).read_bytes()) == digest, f'Config/lock drift: {rel}')
    for rel, digest in manifest['discovery_implementation_sha256'].items():
        require(sha((REPO / 'node_modules' / rel).read_bytes()) == digest, f'Installed ESLint drift: {rel}')
    versions = {}
    for package, wanted in [('eslint', manifest['eslint']), ('typescript-eslint', manifest['typescript_eslint'])]:
        versions[package] = json.loads((REPO / 'node_modules' / package / 'package.json').read_text())['version']
        require(versions[package] == wanted, f'Installed version changed: {package}')

    # Documentation may advance. Tracked web/package source or type configuration may not.
    changed = git('diff', '--name-only', manifest['source_head'], '--', 'apps/web', 'packages').splitlines()
    require(not any(typed_path(p) for p in changed), 'Tracked source/type input differs from pinned commit')
    extra = {}
    selected_repo_paths = {'apps/web/' + f['path'] for f in manifest['files']}
    tracked = git('ls-files', '-z', '--', 'apps/web', 'packages').split('\0')
    for rel in tracked:
        if typed_path(rel) and rel not in selected_repo_paths:
            extra[rel] = sha((REPO / rel).read_bytes())
    # This original tsconfig include sits outside the 497 lint-file selection.
    for path in (CWD / 'scripts').glob('*.d.ts'):
        rel = path.relative_to(REPO).as_posix()
        require(rel in tracked, f'Untracked declaration changes the type graph: {rel}')
        extra[rel] = sha(path.read_bytes())
    # Workspace declarations are ignored build outputs, but still influence the full type graph.
    for package in (REPO / 'packages').iterdir():
        for directory, _, files in os.walk(package / 'dist'):
            for name in files:
                if name.endswith(('.d.ts', '.d.mts', '.d.cts')):
                    path = Path(directory) / name
                    extra[path.relative_to(REPO).as_posix()] = sha(path.read_bytes())
    state = {
        'manifest_sha256': manifest_sha,
        'source_files': source_hashes,
        'config_inputs': manifest['inputs_sha256'],
        'discovery_implementation': manifest['discovery_implementation_sha256'],
        'additional_typed_inputs': extra,
        'installed_versions': versions,
        'inherited_environment_sha256': environment_fingerprint(),
        'eslint_cli_sha256': sha((REPO / 'node_modules/eslint/bin/eslint.js').read_bytes()),
        'monolithic_log': file_record(MONOLITHIC),
    }
    return {'verified_at': now(), 'observed_head': git('rev-parse', 'HEAD'),
            'identity_sha256': fingerprint(state), 'inputs': state}


def invocation(part, directory):
    return [str(NODE), *NODE_FLAGS, *CLI, '--format', 'json', '--output-file',
            str(directory / 'eslint.json'), *part['files']]


def inspect_result(path, expected):
    results = json.loads(path.read_text())
    require(isinstance(results, list), 'ESLint JSON is not an array')
    seen, errors, warnings, fatal = [], 0, 0, 0
    for result in results:
        p = Path(result['filePath'])
        require(p.is_absolute(), 'ESLint result path is not absolute')
        relative = p.resolve().relative_to(CWD.resolve()).as_posix()
        seen.append(relative)
        messages = result['messages']
        require(isinstance(messages, list), f'Invalid messages: {relative}')
        for msg in messages:
            require(type(msg['severity']) is int and msg['severity'] in (1, 2), 'Invalid diagnostic severity')
            require(msg.get('fatal') is not True or msg['severity'] == 2, 'Fatal diagnostic is not an error')
            ignored = msg.get('ruleId') is None and ('file ignored' in msg['message'].lower() or 'no matching configuration' in msg['message'].lower())
            require(not ignored, f'Ignored result cannot count as linted: {relative}')
        counts = (sum(m['severity'] == 2 for m in messages), sum(m['severity'] == 1 for m in messages),
                  sum(m.get('fatal') is True for m in messages))
        for field, count in zip(('errorCount', 'warningCount', 'fatalErrorCount'), counts):
            require(type(result[field]) is int and result[field] == count, f'Inconsistent {field}: {relative}')
        errors += counts[0]
        warnings += counts[1]
        fatal += counts[2]
    require(Counter(seen) == Counter(expected) and len(seen) == len(set(seen)), 'Missing/duplicate/unexpected ESLint result files')
    return {'files': seen, 'file_count': len(seen), 'error_count': errors,
            'warning_count': warnings, 'fatal_error_count': fatal}


def execute(part, directory):
    """wait4 supplies this child’s RSS/CPU, never a cumulative children maximum."""
    argv = invocation(part, directory)
    result = {'argv': argv, 'cwd': str(CWD), 'started_at': now(), 'returncode': None,
              'shell_exit_code': None, 'termination_signal': None, 'resource_usage': None,
              'interrupted_by': None, 'launch_error': None}
    child = None
    old_handlers = {}
    started = time.monotonic()

    def interrupt(signum, _frame):
        result['interrupted_by'] = signum
        if child is not None:
            try:
                os.killpg(child.pid, signum)
            except ProcessLookupError:
                pass

    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            old_handlers[sig] = signal.signal(sig, interrupt)
        with (directory / 'stdout.txt').open('xb') as out, (directory / 'stderr.txt').open('xb') as err:
            child = subprocess.Popen(argv, cwd=CWD, stdout=out, stderr=err, start_new_session=True)
            result['pid'] = child.pid
            _, status, usage = os.wait4(child.pid, 0)
            child.returncode = os.waitstatus_to_exitcode(status)
            result['returncode'] = child.returncode
            result['shell_exit_code'] = child.returncode if child.returncode >= 0 else 128 - child.returncode
            result['termination_signal'] = -child.returncode if child.returncode < 0 else None
            result['resource_usage'] = {
                'user_seconds': usage.ru_utime, 'system_seconds': usage.ru_stime,
                'max_rss_kib': usage.ru_maxrss, 'rss_scope': 'this child; Linux wait4 ru_maxrss',
                'minor_page_faults': usage.ru_minflt, 'major_page_faults': usage.ru_majflt,
                'voluntary_context_switches': usage.ru_nvcsw, 'involuntary_context_switches': usage.ru_nivcsw,
                'block_inputs': usage.ru_inblock, 'block_outputs': usage.ru_oublock,
            }
    except OSError as exc:
        result['launch_error'] = f'{type(exc).__name__}: {exc}'
    finally:
        result['finished_at'] = now()
        result['wall_seconds'] = time.monotonic() - started
        for sig, previous in old_handlers.items():
            signal.signal(sig, previous)
    return result


def collect(manifest, manifest_sha, output, session, current, verification_error=None):
    summary = {'source_head': manifest['source_head'], 'manifest_sha256': manifest_sha,
               'updated_at': now(), 'expected_files': 497, 'expected_partitions': 21,
               'prior_monolithic_command_exit_code': 137,
               'prior_monolithic_log': session['inputs']['monolithic_log'],
               'qualification': 'INCOMPLETE', 'partitions': []}
    successful, processed, totals = [], [], Counter()
    for part in manifest['partitions']:
        directory = output / f'partition-{part["id"]:03d}'
        item = {'id': part['id'], 'status': 'UNEXECUTED', 'receipt': str(directory / 'receipt.json')}
        if directory.exists():
            try:
                receipt = json.loads((directory / 'receipt.json').read_text())
                item.update(returncode=receipt['execution']['returncode'],
                            shell_exit_code=receipt['execution']['shell_exit_code'],
                            resource_usage=receipt['execution']['resource_usage'],
                            stdout=str(directory / 'stdout.txt'), stderr=str(directory / 'stderr.txt'),
                            result_json=str(directory / 'eslint.json'))
                require(receipt['manifest_sha256'] == manifest_sha, 'Stale manifest receipt')
                require(receipt['partition'] == part['id'] and receipt['execution']['cwd'] == str(CWD), 'Partition/cwd receipt mismatch')
                require(receipt['execution']['argv'] == invocation(part, directory), 'Command receipt mismatch')
                require(receipt['requested_files'] == part['files'], 'Requested files changed')
                require(receipt['before']['identity_sha256'] == session['identity_sha256'] == receipt['after']['identity_sha256'], 'Input identity failed/stale')
                require(receipt['input_error'] is None and receipt['json_error'] is None, 'Attempt originally failed input/JSON validation')
                artifact_paths = [a['path'] for a in receipt['artifacts']]
                expected_artifacts = [str(directory / name) for name in ('stdout.txt', 'stderr.txt', 'eslint.json')]
                require(Counter(artifact_paths) == Counter(expected_artifacts), 'Missing/duplicate/unexpected artifact hashes')
                for artifact in receipt['artifacts']:
                    require(file_record(Path(artifact['path'])) == artifact, 'Artifact missing or modified')
                parsed = inspect_result(directory / 'eslint.json', part['files'])
                require(receipt['analysis'] == parsed, 'Result counts/files differ from original receipt')
                item.update(parsed)
                processed.extend(parsed['files'])
                totals.update({k: parsed[k] for k in ('error_count', 'warning_count', 'fatal_error_count')})
                code = receipt['execution']['returncode']
                require(type(code) is int, 'Missing/noninteger process returncode')
                item['returncode'] = code
                if code == 0 and parsed['error_count'] == 0 and parsed['fatal_error_count'] == 0 and not receipt['execution']['interrupted_by']:
                    item['status'] = 'PASSED'
                    successful.extend(parsed['files'])
                elif code == 1 and parsed['error_count'] > 0:
                    item['status'] = 'FAILED_DIAGNOSTICS'
                else:
                    item['status'] = 'BLOCKED_EXECUTION'
            except (OSError, ValueError, KeyError, TypeError, Blocked) as exc:
                item.update(status='BLOCKED_RECEIPT', reason=f'{type(exc).__name__}: {exc}')
        summary['partitions'].append(item)
    expected = Counter(f['path'] for f in manifest['files'])
    complete = Counter(processed) == expected
    passed = Counter(successful) == expected and all(p['status'] == 'PASSED' for p in summary['partitions'])
    summary.update(processed_files=len(processed), successful_files=len(successful),
                   exact_complete_file_union=complete, known_counts=dict(totals),
                   error_count=totals['error_count'] if complete else None,
                   warning_count=totals['warning_count'] if complete else None,
                   current_input_identity_verified=current is not None and current['identity_sha256'] == session['identity_sha256'],
                   current_input_verification_error=verification_error)
    if passed and summary['current_input_identity_verified']:
        summary['qualification'] = 'PASSED_EXHAUSTIVE_ORIGINAL_CONFIG_PARTITIONED_LINT'
    elif any(p['status'].startswith(('BLOCKED', 'FAILED')) for p in summary['partitions']):
        summary['qualification'] = 'BLOCKED_OR_FAILED'
    if not summary['current_input_identity_verified']:
        summary['qualification'] = 'BLOCKED_INPUT_IDENTITY'
    return summary


def parse_ids(text):
    result = []
    try:
        for token in text.split(','):
            values = token.split('-')
            require(1 <= len(values) <= 2, 'Invalid partition range')
            first = int(values[0])
            last = int(values[-1])
            require(1 <= first <= last <= 21, 'Partition IDs must be between 1 and 21')
            result.extend(range(first, last + 1))
    except ValueError as exc:
        raise Blocked('Use comma-separated IDs/ranges, for example 3 or 1-3,5') from exc
    require(len(result) == len(set(result)), 'Duplicate requested partition')
    return result


def main():
    global CURRENT_OUTPUT
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--partitions', metavar='IDS', help='Run only previously unattempted IDs, e.g. 3 or 1-3,5')
    modes.add_argument('--remaining', action='store_true', help='Run unattempted partitions; never retry failed/incomplete ones')
    modes.add_argument('--status', action='store_true', help='Validate existing receipts and aggregate, without lint')
    modes.add_argument('--validate-only', action='store_true', help='Validate manifest and current inputs; no output files or lint')
    parser.add_argument('--output-dir', type=Path, default=SCRATCH / 'web-lint-partitions')
    args = parser.parse_args()
    output = args.output_dir.resolve()
    require(not output.is_relative_to(REPO), 'Output directory must be outside the product repository')
    CURRENT_OUTPUT = None if args.validate_only else output
    manifest, manifest_sha = load_manifest()
    node_version = subprocess.check_output([str(NODE), '--version'], text=True).strip()
    require(node_version == manifest['node'] == 'v22.23.4', 'Wrong Node executable/version')
    before = verify_inputs(manifest, manifest_sha)
    if args.validate_only:
        print(json.dumps({'mode': 'validation-only', 'lint_executed': False, 'manifest_sha256': manifest_sha,
                          'input_identity_sha256': before['identity_sha256'], 'files': 497,
                          'partitions': [{'id': p['id'], 'files': len(p['files'])} for p in manifest['partitions']]}))
        return 0

    output.mkdir(parents=True, exist_ok=True)
    with (output / 'driver.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise Blocked('Another partition driver owns this output directory') from exc
        session_path = output / 'session.json'
        if session_path.exists():
            session = json.loads(session_path.read_text())
            require(session['manifest_sha256'] == manifest_sha and session['identity_sha256'] == before['identity_sha256'], 'Stale session: manifest/source/type inputs changed')
            require(session['node'] == str(NODE) and session['node_flags'] == NODE_FLAGS, 'Resource configuration changed')
        else:
            require(not list(output.glob('partition-*')), 'Partition files exist without a session identity')
            session = {**before, 'manifest_sha256': manifest_sha, 'node': str(NODE), 'node_version': node_version,
                       'node_flags': NODE_FLAGS, 'driver_sha256': sha(Path(__file__).read_bytes()),
                       'inherited_environment_sha256': environment_fingerprint(),
                       'prior_monolithic_exit_code': 137}
            write_json(session_path, session)
        require(session['driver_sha256'] == sha(Path(__file__).read_bytes()), 'Driver changed since the first partition')
        require(session['inherited_environment_sha256'] == environment_fingerprint(), 'Inherited Node/ESLint/parser environment changed')
        valid_names = {f'partition-{p["id"]:03d}' for p in manifest['partitions']}
        require(all(p.name in valid_names for p in output.glob('partition-*')), 'Unknown partition artifacts')
        selected = parse_ids(args.partitions) if args.partitions else []
        if args.remaining:
            selected = [p['id'] for p in manifest['partitions'] if not (output / f'partition-{p["id"]:03d}').exists()]
        require(all(not (output / f'partition-{i:03d}').exists() for i in selected), 'Refusing to overwrite/retry an existing partition attempt')

        for ident in selected:
            part = manifest['partitions'][ident - 1]
            before = verify_inputs(manifest, manifest_sha)
            require(before['identity_sha256'] == session['identity_sha256'], 'Input drift before partition')
            directory = output / f'partition-{ident:03d}'
            directory.mkdir()
            write_json(directory / 'started.json', {'partition': ident, 'time': now(), 'argv': invocation(part, directory)})
            print(json.dumps({'event': 'starting', 'partition': ident, 'files': len(part['files'])}), flush=True)
            execution = execute(part, directory)
            after, input_error = None, None
            try:
                after = verify_inputs(manifest, manifest_sha)
                require(after['identity_sha256'] == session['identity_sha256'], 'Input drift after partition')
            except (OSError, ValueError, KeyError, Blocked) as exc:
                input_error = f'{type(exc).__name__}: {exc}'
            analysis, json_error = None, None
            try:
                analysis = inspect_result(directory / 'eslint.json', part['files'])
            except (OSError, ValueError, KeyError, TypeError, Blocked) as exc:
                json_error = f'{type(exc).__name__}: {exc}'
            artifacts = [file_record(directory / name) for name in ('stdout.txt', 'stderr.txt', 'eslint.json') if (directory / name).exists()]
            write_json(directory / 'receipt.json', {'partition': ident, 'manifest_sha256': manifest_sha,
                       'requested_files': part['files'], 'before': before, 'after': after,
                       'execution': execution, 'analysis': analysis, 'json_error': json_error,
                       'input_error': input_error, 'artifacts': artifacts})
            print(json.dumps({'event': 'finished', 'partition': ident, 'returncode': execution['returncode'],
                              'analysis': analysis and {k: v for k, v in analysis.items() if k != 'files'},
                              'json_error': json_error, 'input_error': input_error}), flush=True)
            if input_error or execution['interrupted_by']:
                break

        current, verification_error = None, None
        try:
            current = verify_inputs(manifest, manifest_sha)
        except (OSError, ValueError, KeyError, Blocked) as exc:
            verification_error = f'{type(exc).__name__}: {exc}'
        summary = collect(manifest, manifest_sha, output, session, current, verification_error)
        write_json(output / 'aggregate.json', summary, replace=True)
        print(json.dumps(summary, indent=2))
        if args.partitions:
            return 0 if summary['current_input_identity_verified'] and all(p['status'] == 'PASSED' for p in summary['partitions'] if p['id'] in selected) else 2
        return 0 if summary['qualification'].startswith('PASSED_') else 2


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (Blocked, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        error = f'{type(exc).__name__}: {exc}'
        status_error = None
        try:
            record_blocked_status(CURRENT_OUTPUT, error)
        except OSError as status_exc:
            status_error = f'{type(status_exc).__name__}: {status_exc}'
        print(json.dumps({'qualification': 'BLOCKED', 'error': error,
                          'blocked_status_write_error': status_error}), file=sys.stderr)
        sys.exit(2)
