from pathlib import Path
from collections import Counter
import datetime
import difflib
import hashlib
import json
import posixpath
import re
import subprocess

repo = Path('/workspace/scratch/a13b43b0f3c9/GhostPay-checkpoint-next')
scratch = Path('/workspace/scratch/a13b43b0f3c9')
base = 'a47648872e648fe7848a17080a5ffa1473e98e8b'
head = '4cdb6a065a6318404bc963a20f90d3b43a068bfe'
packet = 'docs/automation/data/cycle-20261120T0115Z'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo)

def blob(ref, path):
    return git('show', f'{ref}:{path}')

def obj(ref, path):
    return git('rev-parse', f'{ref}:{path}').decode().strip()

paths = git('diff', '--name-only', base, head).decode().splitlines()
modified = git('diff', '--name-only', '--diff-filter=M', base, head).decode().splitlines()
all_paths = set(git('ls-tree', '-r', '--name-only', head).decode().splitlines())
report = {
    'reviewer': '/root/final_independent_review',
    'recorded_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'base': base,
    'head': head,
    'tree': git('rev-parse', f'{head}^{{tree}}').decode().strip(),
    'changed_paths_count': len(paths),
    'only_documentation_changed': all(p.startswith('docs/') for p in paths),
    'historical_preservation': [],
}
for p in modified:
    old = blob(base, p).decode().splitlines(keepends=True)
    new = blob(head, p).decode().splitlines(keepends=True)
    changes = [op for op in difflib.SequenceMatcher(a=old, b=new, autojunk=False).get_opcodes() if op[0] != 'equal']
    report['historical_preservation'].append({
        'path': p,
        'additions_only': all(op[0] == 'insert' for op in changes),
        'historical_body_after_title_byte_identical': ''.join(old[2:]).encode() in ''.join(new).encode(),
        'original_title_preserved': new[:2] == old[:2],
    })

report['copied_handoffs'] = []
for source, p in [
    ('cabf8ae39c81c5c36cdf601e7b7003893e3fc2fb', 'docs/handoffs/CLIPBOARD_REPOSITORY_QUALIFICATION_20261120.md'),
    ('042431b1f53a60e469b1ebd83430de5b083d056e', 'docs/handoffs/RECEIPT_HASH_VALIDATION_20261120.md'),
]:
    report['copied_handoffs'].append({'source': source, 'path': p, 'source_blob': obj(source, p), 'checkpoint_blob': obj(head, p), 'byte_identical': blob(source, p) == blob(head, p)})

report['own_report_provenance'] = []
copies = [
    ('privacy-spec-review-20261120T0115Z/REVIEW.md', 'privacy-spec-review/REVIEW.md'),
    ('clipboard-review-20261120T0115Z/REVIEW.md', 'clipboard-independent-review/REVIEW.md'),
    ('clipboard-review-20261120T0115Z/FIXED_REVIEW.md', 'clipboard-independent-review/FIXED_REVIEW.md'),
    ('clipboard-review-20261120T0115Z/fixed-independent-receipt.json', 'clipboard-independent-review/fixed-independent-receipt.json'),
    ('clipboard-review-20261120T0115Z/committed-vitest.log', 'clipboard-independent-review/committed-vitest.log'),
    ('clipboard-review-20261120T0115Z/fixed-independent-vitest.log', 'clipboard-independent-review/fixed-independent-vitest.log'),
    ('clipboard-review-20261120T0115Z/pending-copy-probe.log', 'clipboard-independent-review/pending-copy-probe.log'),
]
for original, copied in copies:
    actual = blob(head, f'{packet}/{copied}')
    report['own_report_provenance'].append({'original': original, 'copy': copied, 'byte_identical': (scratch / original).read_bytes() == actual, 'sha256': hashlib.sha256(actual).hexdigest()})

manifest = json.loads(blob(head, f'{packet}/SHA256SUMS.json'))
manifest_rows = []
for row in manifest['files']:
    actual = blob(head, f"{packet}/{row['path']}")
    manifest_rows.append({'path': row['path'], 'bytes_match': len(actual) == row['bytes'], 'sha256_matches': hashlib.sha256(actual).hexdigest() == row['sha256']})
actual_inventory = {p.removeprefix(packet + '/') for p in all_paths if p.startswith(packet + '/') and posixpath.basename(p) != 'SHA256SUMS.json'}
declared_inventory = {row['path'] for row in manifest_rows}
report['evidence_inventory'] = {
    'count': len(manifest_rows),
    'all_bytes_and_hashes_match': all(r['bytes_match'] and r['sha256_matches'] for r in manifest_rows),
    'missing_from_manifest': sorted(actual_inventory - declared_inventory),
    'declared_but_absent': sorted(declared_inventory - actual_inventory),
    'rows': manifest_rows,
}

pattern = re.compile(r'(?<!!)\[[^\]]+\]\(([^)\n]+)\)')
link_rows = []
for p in paths:
    if not p.endswith('.md'):
        continue
    new_links = Counter(pattern.findall(blob(head, p).decode()))
    if p in modified:
        new_links.subtract(Counter(pattern.findall(blob(base, p).decode())))
    for target, count in new_links.items():
        if count <= 0 or re.match(r'^[A-Za-z][A-Za-z0-9+.-]*:', target):
            continue
        raw_path, _, anchor = target.partition('#')
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(p), raw_path)) if raw_path else p
        link_rows.append({'source': p, 'target': target, 'resolved': resolved, 'count': count, 'exists_in_frozen_tree': resolved in all_paths, 'anchor': anchor})
report['new_local_markdown_links'] = {'occurrences': sum(x['count'] for x in link_rows), 'distinct_source_target_pairs': len(link_rows), 'all_targets_present': all(x['exists_in_frozen_tree'] for x in link_rows), 'rows': link_rows}

report['json_validation'] = []
for p in paths:
    if p.endswith('.json'):
        json.loads(blob(head, p))
        report['json_validation'].append(p)

mapping = json.loads(blob(head, f'{packet}/publication-map.json'))
report['publication_local_tree_checks'] = []
for name in ('clipboard', 'receipt'):
    for row in mapping[name]['commits']:
        tree = git('rev-parse', row['local'] + '^{tree}').decode().strip()
        report['publication_local_tree_checks'].append({'candidate': name, 'local': row['local'], 'remote': row['remote'], 'declared_tree': row['tree'], 'actual_local_tree': tree, 'match': tree == row['tree']})

report['raw_log_files'] = [p for p in paths if p.endswith('.log')]
report['markdown_json_diffcheck_exit_code'] = subprocess.run(['git', 'diff', '--check', base, head, '--', '*.md', '*.json'], cwd=repo, check=False).returncode
report['frozen_worktree_head_matches'] = git('rev-parse', 'HEAD').decode().strip() == head
report['worktree_clean'] = git('status', '--porcelain=v1').decode().strip() == ''

output = scratch / 'checkpoint-review-next-20261120T0115Z/structural-qa.json'
output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({
    'head': head,
    'tree': report['tree'],
    'changed_paths': len(paths),
    'historical_documents': len(report['historical_preservation']),
    'all_additive': all(x['additions_only'] and x['historical_body_after_title_byte_identical'] and x['original_title_preserved'] for x in report['historical_preservation']),
    'handoffs_byte_identical': all(x['byte_identical'] for x in report['copied_handoffs']),
    'own_reports_byte_identical': all(x['byte_identical'] for x in report['own_report_provenance']),
    'inventory_count': report['evidence_inventory']['count'],
    'inventory_valid': report['evidence_inventory']['all_bytes_and_hashes_match'] and not report['evidence_inventory']['missing_from_manifest'] and not report['evidence_inventory']['declared_but_absent'],
    'local_links': report['new_local_markdown_links']['occurrences'],
    'all_links_resolve': report['new_local_markdown_links']['all_targets_present'],
    'json_files_valid': len(report['json_validation']),
    'raw_logs': len(report['raw_log_files']),
    'local_publication_trees_match': all(x['match'] for x in report['publication_local_tree_checks']),
    'markdown_json_diffcheck_exit_code': report['markdown_json_diffcheck_exit_code'],
    'clean': report['worktree_clean'],
    'receipt': str(output),
}, indent=2))
