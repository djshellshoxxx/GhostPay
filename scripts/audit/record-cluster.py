#!/usr/bin/env python3
"""Record one fix-cluster result into the audit data set (docs/audits/data/24/status.json).

Purpose: each fix round (implementation plus adversarial review) returns a JSON result; this keeps the per-item
outcomes and the review issues next to the findings, so gen-audit24-report.py and the next agent can read them.
Written by Claude Code (AI agent) for GhostPay, 2026-10-29; same licence as the repository.

Usage: python3 scripts/audit/record-cluster.py RESULT.json [--data DIR]
RESULT.json and --data must be within this checkout's docs/audits/data directory; symlinks are refused.
Published JSON permissions retain existing read restrictions, but never execute or group/world write bits.
Audit directories must belong to the invoking user and disallow group/world writes.
RESULT.json is either the result object itself or a wrapper {"result": {...}}, shaped like the output of
scripts/agents/fix-audit-cluster.js: {cluster, branch, approved, rounds, impl: {commits, items, commands,
open_questions}, review: {summary, issues}}. Commit entries must be bare SHAs (strip any message first).
"""
import argparse
import contextlib
import json
import os
from pathlib import Path
import re
import secrets
import stat

ROOT = Path(__file__).absolute().parents[2]
DATA_ROOT = ROOT / 'docs' / 'audits' / 'data'
ap = argparse.ArgumentParser(description='Record a fix-cluster result into status.json')
ap.add_argument('result')
ap.add_argument('--data', default=str(DATA_ROOT / '24'))
args = ap.parse_args()


def components(value):
    path = Path(os.path.abspath(value))
    try:
        return path.relative_to(DATA_ROOT).parts
    except ValueError:
        raise ValueError('paths must be within docs/audits/data') from None


@contextlib.contextmanager
def directory(parts):
    # Walk using descriptors: a replaced/symlinked parent cannot redirect later I/O.
    fd = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in ('docs', 'audits', 'data', *parts):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
            info = os.fstat(fd)
            if info.st_uid != os.geteuid() or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
                raise ValueError('audit directories must be owned by this user and not group/world-writable')
        yield fd
    finally:
        os.close(fd)


def read_json(fd, name):
    opened = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    with os.fdopen(opened, encoding='utf8') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise ValueError('audit JSON inputs must be regular files')
        return json.load(stream), info


def validate(obj):
    # Check every field used below (including console output) before publication.
    if not isinstance(obj, dict):
        raise ValueError('result must be an object')
    for key in ('cluster', 'branch'):
        if not isinstance(obj[key], str) or not obj[key]:
            raise ValueError(key + ' must be a nonempty string')
    if not isinstance(obj['approved'], bool) or type(obj['rounds']) is not int or obj['rounds'] < 0:
        raise ValueError('approved must be boolean and rounds a nonnegative integer')
    impl = obj['impl']
    if not isinstance(impl['commits'], list) or any(not isinstance(c, str) or not re.fullmatch(r'[0-9a-f]{7,40}', c) for c in impl['commits']):
        raise ValueError('commits must be bare SHAs')
    if not isinstance(impl['items'], list):
        raise ValueError('items must be an array')
    for item in impl['items']:
        for key in ('id', 'outcome', 'change'):
            if not isinstance(item[key], str):
                raise ValueError('item ' + key + ' must be a string')
        if item['id'] == '_clusters':
            raise ValueError('_clusters is reserved')
    review = obj.get('review') or {}
    if not isinstance(review, dict) or not isinstance(review.get('issues', []), list):
        raise ValueError('review issues must be an array')
    for issue in review.get('issues', []):
        if not isinstance(issue['severity'], str) or not isinstance(issue['where'], str):
            raise ValueError('review issue severity and where must be strings')


try:
    result_parts = components(args.result)
    if not result_parts:
        raise ValueError('result must name a JSON file')
    with directory(result_parts[:-1]) as result_dir:
        raw, _ = read_json(result_dir, result_parts[-1])
    obj = raw.get('result', raw) if isinstance(raw, dict) else raw
    validate(obj)
    with directory(components(args.data)) as data_dir:
        try:
            st, previous = read_json(data_dir, 'status.json')
            mode = stat.S_IMODE(previous.st_mode) & 0o644
        except FileNotFoundError:
            st = {}
            # Python has no portable read-only umask API. This single-threaded CLI
            # narrows it briefly, restores it immediately, and creates no file between.
            mask = os.umask(0o777)
            os.umask(mask)
            mode = 0o644 & ~mask
        if not isinstance(st, dict) or not isinstance(st.get('_clusters', {}), dict):
            raise ValueError('status and _clusters must be objects')
        cid = obj['cluster']
        for it in obj['impl']['items']:
            st[it['id']] = {'cluster': cid, 'outcome': it['outcome'], 'change': it['change'],
                            'tests': it.get('tests', ''), 'fail_before': it.get('fail_before', '')}
        review = obj.get('review') or {}
        st.setdefault('_clusters', {})[cid] = {
            'branch': obj['branch'], 'approved': obj['approved'], 'rounds': obj['rounds'],
            'commits': obj['impl']['commits'], 'commands': obj['impl'].get('commands', ''),
            'review_summary': review.get('summary', ''), 'review_issues': review.get('issues', []),
            'open_questions': obj['impl'].get('open_questions', '')}
        serialized = json.dumps(st, indent=1)
        staged = '.status-' + secrets.token_hex(16)
        # Exclusive creation, ownership check, and chmod through the open descriptor.
        opened = os.open(staged, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=data_dir)
        try:
            with os.fdopen(opened, 'w', encoding='utf8') as stream:
                info = os.fstat(stream.fileno())
                if info.st_uid != os.geteuid() or not stat.S_ISREG(info.st_mode):
                    raise ValueError('unsafe staging file')
                stream.write(serialized)
                stream.flush()
                os.fchmod(stream.fileno(), mode)
            os.replace(staged, 'status.json', src_dir_fd=data_dir, dst_dir_fd=data_dir)
        finally:
            try:
                os.unlink(staged, dir_fd=data_dir)
            except FileNotFoundError:
                pass
except (OSError, ValueError, KeyError, TypeError) as exc:
    ap.error(str(exc))

print(f"cluster {cid}: approved={obj['approved']} rounds={obj['rounds']} commits={len(obj['impl']['commits'])}")
for it in obj['impl']['items']:
    print(f"  {it['id']}: {it['outcome']}")
print('  review issues:', [(i['severity'], i['where'][:60]) for i in review.get('issues', [])])
