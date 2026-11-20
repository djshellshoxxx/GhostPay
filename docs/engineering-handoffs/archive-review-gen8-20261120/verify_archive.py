#!/usr/bin/env python3
"""Read-only verification of the pinned historical archive recovery.

This script treats historical prose as bytes. It runs no historical commands,
application tests/builds, network calls, or compressed-corpus rescan.
"""
from collections import Counter, defaultdict
from functools import lru_cache
from hashlib import sha256
import json
import gzip
from pathlib import Path
import posixpath
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

RECOVERY = 'a4503e5c3a5b1e02bfd160f36f841dd6f5e66f58'
ROOT = 'docs/engineering-handoffs/archive-recovery-gen6-20261120'
LATER_CANDIDATE = 'be12cd043dbfc2f562368fd0ccc1a2a8c3f7a22f'
CANDIDATES = [
    '53f4253bd9afc33bea43a7bdfe95ae287e035bf7',
    'a1e5090bac39bf3841f7d0403c79163d787a9793',
]
errors = []
inherited_link_findings = []
counts = Counter()

def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.PIPE)

@lru_cache(maxsize=None)
def blob(commit, path):
    return git('show', f'{commit}:{path}')

def check(condition, label):
    if not condition:
        errors.append(label)

def digest(data):
    return sha256(data).hexdigest()

def object_id(commit, path):
    return git('rev-parse', f'{commit}:{path}').decode().strip()

p = json.loads(blob(RECOVERY, ROOT + '/provenance.json'))
v = json.loads(blob(RECOVERY, ROOT + '/verification.json'))
legacy = json.loads(blob(RECOVERY, ROOT + '/source-records/provenance.json'))
publication = json.loads(blob(RECOVERY, ROOT + '/source-records/publication.json'))
changes = git('diff-tree', '--no-commit-id', '--name-status', '-r', RECOVERY).decode().splitlines()
check(len(changes) == 10, 'exactly ten files in recovery commit')
check(all(line.startswith('A\t' + ROOT + '/') for line in changes), 'all recovery files are additions in archival directory')
check(not git('diff', '--name-only', RECOVERY + '^', RECOVERY, '--', '.', ':!docs/'), 'no non-documentation recovery changes')
base_check = subprocess.run(['git', 'merge-base', '--is-ancestor', p['source_base'], CANDIDATES[0]], capture_output=True)
check(base_check.returncode == 0, 'historical source base is ancestor of frozen candidate')
check(p['source_head'] == '4ff80733a3b36019e2f12fc21a8448e7666b6049', 'source259 pin')
check(p['source_base'] == legacy['main_base'], 'source base matches original record')

# Original manifests and complete archive files are checked against Git objects.
for rec in p['source_records']:
    source = blob(rec['source_commit'], rec['source_path'])
    recovered = blob(RECOVERY, ROOT + '/' + rec['recovered_path'])
    check(source == recovered, 'source record fidelity: ' + rec['recovered_path'])
    check(len(source) == rec['bytes'] and digest(source) == rec['sha256'], 'source record hash: ' + rec['recovered_path'])
    check(object_id(rec['source_commit'], rec['source_path']) == rec['source_blob'], 'source record blob: ' + rec['recovered_path'])
    counts['original_record_copies'] += 1
archives = {}
removed = None
for arc in p['archives']:
    original = blob(arc['source_archive_commit'], arc['source_archive_path'])
    recovered = blob(RECOVERY, ROOT + '/' + arc['recovered_path'])
    archives[arc['pr']] = (original, recovered)
    check(object_id(arc['source_archive_commit'], arc['source_archive_path']) == arc['source_archive_blob'], 'archive original blob ' + str(arc['pr']))
    check(digest(original) == arc['source_archive_sha256'] and len(original) == arc['source_archive_bytes'], 'archive original hash ' + str(arc['pr']))
    check(digest(recovered) == arc['recovered_sha256'] and len(recovered) == arc['recovered_bytes'], 'archive recovered hash ' + str(arc['pr']))
    if arc['pr'] in (139, 153):
        check(original == recovered, 'archive byte identity ' + str(arc['pr']))
    else:
        marker = b'\n---\n\n## Source file: `docs/design/qr-colors.md`\n'
        check(original.count(marker) == 1, 'one QR source-file block in original archive')
        start = original.index(marker)
        end = original.index(b'\n---\n\n## Source file:', start + len(marker))
        removed = {'start_byte': start, 'end_byte_exclusive': end, 'bytes': end - start, 'sha256': digest(original[start:end])}
        check(original[:start] + original[end:] == recovered, 'PR140 removes exactly QR block and preceding separator')
    heading = recovered.split(b'\n', 7)[:7]
    check(b'not current status, current instructions, fresh test results or release approval' in b'\n'.join(heading), 'historical framing ' + str(arc['pr']))
    counts['original_archive_files'] += 1
    counts['recovered_archive_files'] += 1

legacy_sections = {}
legacy_files = {}
for src in legacy['sources']:
    for file in src['files']:
        legacy_files[(src['commit'], file['path'])] = file
        for section in file['sections']:
            key = (src['pr'], src['commit'], file['path'], section['start_line'], section['end_line'])
            check(key not in legacy_sections, 'unique original section identity')
            legacy_sections[key] = section
check(len(legacy_sections) == 158, 'original manifest section count')
for file in p['original_source_files']:
    data = blob(file['commit'], file['path'])
    check(digest(data) == file['sha256'] and len(data) == file['bytes'], 'source file hash ' + file['path'])
    check(object_id(file['commit'], file['path']) == file['blob'], 'source file blob ' + file['path'])
    original = legacy_files[(file['commit'], file['path'])]
    check(original['source_blob'] == file['blob'] and original['source_sha256'] == file['sha256'], 'original/new source-file record agreement ' + file['path'])
    counts['original_source_files'] += 1

ranges = defaultdict(list)
seen = set()
retained = Counter()
omitted = []
rewrite_targets = []
for sec in p['sections']:
    key = (sec['pr'], sec['source_commit'], sec['source_file'], sec['start_line'], sec['end_line'])
    check(key not in seen, 'unique new section identity ' + sec['id'])
    seen.add(key)
    original = legacy_sections.get(key)
    check(original is not None, 'section exists in original selection ' + sec['id'])
    if original:
        check(original['source_sha256'] == sec['source_sha256'] and original['heading'] == sec['heading'], 'original/new section record agreement ' + sec['id'])
    data = blob(sec['source_commit'], sec['source_file'])
    source = b''.join(data.splitlines(keepends=True)[sec['start_line'] - 1:sec['end_line']])
    check(digest(source) == sec['source_sha256'] and len(source) == sec['source_bytes'], 'source section hash ' + sec['id'])
    check(object_id(sec['source_commit'], sec['source_file']) == sec['source_blob'], 'section source blob ' + sec['id'])
    counts['original_sections'] += 1
    text = source.decode()
    # Derive each pinned destination independently, then replay only recorded
    # inline-link changes to establish that no prose was silently edited.
    for rewrite in sec['relative_links_rebased']:
        origin = urlsplit(rewrite['source'])
        source_path = posixpath.normpath(posixpath.join(posixpath.dirname(sec['source_file']), origin.path)) if origin.path else sec['source_file']
        expected = f"https://github.com/djshellshoxxx/GhostPay/blob/{sec['source_commit']}/{source_path}"
        if origin.query:
            expected += '?' + origin.query
        if origin.fragment:
            expected += '#' + origin.fragment
        check(rewrite['archived'] == expected, 'derived historical link ' + sec['id'] + ':' + rewrite['source'])
        check(('](' + rewrite['source'] + ')') in text, 'source inline link exists ' + sec['id'])
        text = text.replace('](' + rewrite['source'] + ')', '](' + rewrite['archived'] + ')', 1)
        target_exists = subprocess.run(['git', 'cat-file', '-e', f"{sec['source_commit']}:{source_path}"], capture_output=True).returncode == 0
        if not target_exists:
            inherited_link_findings.append({'section': sec['id'], 'source_commit': sec['source_commit'], 'source_file': sec['source_file'], 'source': rewrite['source'], 'archived': rewrite['archived'], 'absent_path': source_path})
        counts['historical_link_targets_resolved' if target_exists else 'historical_link_targets_absent'] += 1
        rewrite_targets.append({'section': sec['id'], 'source_path': source_path, 'target_exists': target_exists})
        counts['recorded_relative_link_rewrites'] += 1
    archived = text.encode()
    check(digest(archived) == sec['archived_body_sha256'] and len(archived) == sec['archived_body_bytes'], 'archived body derives from source ' + sec['id'])
    check(archives[sec['pr']][0].count(archived) == 1, 'body occurs exactly once in PR259 archive ' + sec['id'])
    if sec['decision'] == 'recover historical section':
        recovered = blob(RECOVERY, ROOT + '/' + sec['recovered_archive'])
        start, end = sec['recovered_body_start_byte'], sec['recovered_body_end_byte_exclusive']
        check(0 <= start < end <= len(recovered), 'valid recovered range ' + sec['id'])
        check(recovered[start:end] == archived, 'recovered body fidelity ' + sec['id'])
        check(recovered.count(archived) == 1, 'body occurs exactly once in recovered archive ' + sec['id'])
        ranges[sec['recovered_archive']].append((start, end, sec['id']))
        check(not sec['matches'], 'recovered decision has no complete-text match ' + sec['id'])
        retained[sec['pr']] += 1
        counts['recovered_section_bodies'] += 1
    else:
        omitted.append(sec)
        for candidate in CANDIDATES:
            check(source in blob(candidate, sec['source_file']), 'omitted complete QR section retained at ' + candidate)
            counts['omission_retention_checks'] += 1
for filename, intervals in ranges.items():
    intervals.sort()
    check(all(a[1] <= b[0] for a, b in zip(intervals, intervals[1:])), 'nonoverlapping recovered ranges ' + filename)
check(seen == set(legacy_sections), 'all original section identities accounted for')
check(dict(retained) == {139: 42, 140: 74, 153: 41}, 'expected retained section distribution')
check(len(omitted) == 1 and omitted[0]['id'] == 'pr140:docs/design/qr-colors.md:5-17', 'only QR section omitted')

# Recheck published objects and ten historical comparison-file hashes while
# retaining the explicit limit that absent original local objects cannot be
# compared to their published counterparts.
publication_checks = []
for local, record in publication.items():
    remote = record['remote_sha']
    tree = git('rev-parse', remote + '^{tree}').decode().strip()
    parents = git('show', '-s', '--format=%P', remote).decode().strip().split()
    mapped = [publication[x]['remote_sha'] if x in publication else x for x in record['parents']]
    local_available = subprocess.run(['git', 'cat-file', '-e', local + '^{commit}'], capture_output=True).returncode == 0
    check(tree == record['tree'] and parents == mapped, 'published tree and mapped parents ' + remote)
    publication_checks.append({'original_local': local, 'original_available': local_available, 'published': remote, 'tree_matches': tree == record['tree'], 'parents_match': parents == mapped})
    counts['published_commit_metadata'] += 1
comparison = publication[legacy['comparison_commit']]['remote_sha']
for key, original in legacy_files.items():
    check(digest(blob(comparison, key[1])) == original['comparison_sha256'], 'historical comparison-file hash ' + key[1])
    counts['historical_comparison_file_hashes'] += 1

# Resolve local destinations from the committed recovery tree, not an arbitrary
# working-tree file that could hide an unresolved link.
links = []
for line in changes:
    filename = line.split('\t', 1)[1]
    if not filename.endswith('.md'):
        continue
    for target in re.findall(r'\[[^\]]*\]\(([^\s)]+)\)', blob(RECOVERY, filename).decode()):
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc:
            continue
        path = posixpath.normpath(posixpath.join(posixpath.dirname(filename), unquote(parsed.path))) if parsed.path else filename
        exists = subprocess.run(['git', 'cat-file', '-e', RECOVERY + ':' + path], capture_output=True).returncode == 0
        check(exists, 'local Markdown link target ' + filename + ' -> ' + target)
        links.append({'file': filename.removeprefix(ROOT + '/'), 'target': target, 'exists': exists})
        counts['local_markdown_links'] += 1
check(counts['local_markdown_links'] == 22, 'local link inventory count')
check(v['source_validation']['errors'] == [], 'predecessor manifest has no source-validation errors')
# Inspect only documentation added or changed after the predecessor's final
# comparison. This does not repeat its complete-repository compressed scan.
delta_paths = git('diff', '--name-only', CANDIDATES[-1], LATER_CANDIDATE, '--', 'docs', 'README.md').decode().splitlines()
delta_payloads = []
def add_delta_payload(path, data, kind):
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError:
        return
    delta_payloads.append((path, kind, text))
    if path.endswith('.json'):
        def strings(value):
            if isinstance(value, str):
                if len(value) >= 80:
                    delta_payloads.append((path, 'decoded JSON string', value))
            elif isinstance(value, list):
                for item in value:
                    strings(item)
            elif isinstance(value, dict):
                for item in value.values():
                    strings(item)
        strings(json.loads(text))
for path in delta_paths:
    data = blob(LATER_CANDIDATE, path)
    add_delta_payload(path, data, 'raw')
    if data.startswith(b'\x1f\x8b'):
        expanded = gzip.decompress(data)
        check(len(expanded) <= 64 * 1024 * 1024, 'bounded later gzip payload ' + path)
        add_delta_payload(path, expanded, 'gzip')
def normalize(text):
    return ' '.join(text.split())
def link_normalize(text):
    return normalize(re.sub(r'(\[[^\]]*\])\([^)]*\)', r'\1', text))
normalized_delta = [(path, kind, text, normalize(text), link_normalize(text)) for path, kind, text in delta_payloads]
delta_matches = []
for sec in p['sections']:
    if sec['decision'] != 'recover historical section':
        continue
    source = b''.join(blob(sec['source_commit'], sec['source_file']).splitlines(keepends=True)[sec['start_line'] - 1:sec['end_line']]).decode().strip()
    recovered = blob(RECOVERY, ROOT + '/' + sec['recovered_archive'])
    archived = recovered[sec['recovered_body_start_byte']:sec['recovered_body_end_byte_exclusive']].decode().strip()
    for path, kind, raw, whitespace, links_removed in normalized_delta:
        if any(value in raw for value in (source, archived)) or any(normalize(value) in whitespace for value in (source, archived)) or any(link_normalize(value) in links_removed for value in (source, archived)):
            delta_matches.append({'section': sec['id'], 'path': path, 'payload': kind})
check(not delta_matches, 'no complete recovered section introduced by later documentation delta')
for sec in omitted:
    source = b''.join(blob(sec['source_commit'], sec['source_file']).splitlines(keepends=True)[sec['start_line'] - 1:sec['end_line']])
    check(source in blob(LATER_CANDIDATE, sec['source_file']), 'omitted QR section remains present at later candidate')
    counts['omission_retention_checks'] += 1
later_delta = {'previous_comparison': CANDIDATES[-1], 'later_candidate': LATER_CANDIDATE, 'changed_document_paths': delta_paths, 'payloads_inspected': len(delta_payloads), 'methods': ['source and archive exact text', 'whitespace normalization', 'inline Markdown-link normalization', 'gzip expansion and decoded JSON string values'], 'complete_section_matches': delta_matches}

result = {
    'reviewer': '/root/archive_review_gen8',
    'reviewed_recovery': RECOVERY,
    'reviewed_tree': git('rev-parse', RECOVERY + '^{tree}').decode().strip(),
    'historical_source': p['source_head'],
    'comparison_candidates': CANDIDATES,
    'later_documentation_delta': later_delta,
    'result': ('passed with inherited historical-link findings' if inherited_link_findings else 'passed') if not errors else 'failed',
    'verification_script_sha256': digest(Path(__file__).read_bytes()),
    'inherited_historical_link_findings': inherited_link_findings,
    'counts': dict(sorted(counts.items())),
    'changed_paths': changes,
    'retained_sections': dict(retained),
    'omitted_section': omitted[0]['id'] if len(omitted) == 1 else None,
    'pr140_removed_block': removed,
    'publication_metadata': publication_checks,
    'local_links': links,
    'errors': errors,
    'limits': [
        'No application tests, builds, network requests or historical commands were executed.',
        'This review does not repeat the predecessor full candidate-text/gzip/ZIP corpus scan; its absence/normalization result remains attributed to that scan.',
        'All 158 original source sections and all 157 recovered bodies were independently verified against Git objects.',
        'External URL availability and fragment anchors were not fetched; 39 of43 recorded historical link-target occurrences resolve in Git. Four occurrences resolve to two already-absent historical paths and are preserved as explicit findings.',
        'Unavailable original local commits prevent independent local-versus-published tree equivalence; published metadata and ten comparison-file hashes were checked.',
        'Historical status, test outcomes, ownership and release statements are evidence only and convey no present authority.',
    ],
}
print(json.dumps(result, indent=2))
sys.exit(0 if not errors else 1)
