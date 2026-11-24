from __future__ import annotations
import collections, csv, datetime, hashlib, io, json, pathlib, subprocess

BASE = pathlib.Path('/workspace/scratch/f80482f352bc')
REPO = BASE / 'GhostPay-followups'
OUT = BASE / 'branch-index-final-698'
LOCAL = 'bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8'
TREE = '8add357748674afb128926a797982badb54bac6b'
MAIN = '706188000c38b3dde5a3a362370a530870aa7587'
PUBLISHED = '87bee07895679deaef345c3dd4aaf2e8f8651f1c'
REMOTE_SOURCE = 'c6efee6e9e0505d4bcb8b81bf5b02e4ab3331c48'
BASELINE_PATH = 'docs/consolidation/all-branches-20261124/BRANCH_INDEX.csv'
HISTORICAL_MD = 'docs/consolidation/all-branches-20261124/held-branch-eligibility.md'
OUT.mkdir(exist_ok=True)

def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO, text=True).rstrip('\n')

def git_bytes(*args):
    return subprocess.check_output(['git', *args], cwd=REPO)

def load(name):
    return json.loads((BASE / name).read_text())

def sha(data):
    return hashlib.sha256(data).hexdigest()

def save_json(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

def tree_entry(commit, path):
    return git('ls-tree', commit, '--', path) or None

assert git('rev-parse', LOCAL + '^{tree}') == TREE
assert git('rev-parse', REMOTE_SOURCE + '^{tree}') == TREE
assert git('rev-parse', 'origin/main') == MAIN
baseline_bytes = git_bytes('show', LOCAL + ':' + BASELINE_PATH)
baseline = list(csv.DictReader(io.StringIO(baseline_bytes.decode())))
baseline_map = {r['branch']: r for r in baseline}
assert len(baseline) == len(baseline_map) == 696
snapshot = load('branch-ref-snapshot-final.json')
refresh = load('branch-refresh-698.json')
audit = load('held-branch-eligibility.json')
audit_map = {r['branch']: r for r in audit['rows']}
notes = load('branch-index-notes.json')
code_comparisons = load('branch-current-code-comparisons.json')
code_map = {r['branch']: r for r in code_comparisons['rows']}
helper = load('residual-index-notes.json')
assert helper['reviewed_source'] == code_comparisons['source'] == LOCAL
refs = snapshot['refs']
assert len(refs) == len({r['branch'] for r in refs}) == 698
assert len(audit['rows']) == len(audit_map) == 67
assert set(baseline_map) <= {r['branch'] for r in refs}
targets = dict(main=MAIN, published_core=PUBLISHED, local_combined=LOCAL, equivalent_remote_source=REMOTE_SOURCE)
ancestors = {key: set(git('rev-list', pin).splitlines()) for key, pin in targets.items()}
new_refs = [r for r in refs if r['branch'] not in baseline_map]
advanced_refs = [dict(r, previous_head=baseline_map[r['branch']]['head']) for r in refs
                 if r['branch'] in baseline_map and r['head'] != baseline_map[r['branch']]['head']]
assert len(new_refs) == 2 and len(advanced_refs) == 2

def raw_delta(before, after):
    raw = git_bytes('diff-tree', '--no-commit-id', '--raw', '-r', '-z', '--no-renames', before, after)
    pieces = raw.split(b'\0')
    entries = []
    for i in range(0, len(pieces) - 1, 2):
        old_mode, new_mode, old_blob, new_blob, change = pieces[i].decode()[1:].split(' ')
        entries.append(dict(path=pieces[i+1].decode(), old_mode=old_mode, new_mode=new_mode,
                            old_blob=old_blob, new_blob=new_blob, change=change))
    return dict(before=before, after=after, uncapped=True, rename_detection=False,
                entry_count=len(entries), raw_sha256=sha(raw),
                documentation_only=all(e['path'].startswith('docs/') for e in entries), entries=entries)

ledger_branch = 'ledger/consolidation-snapshot-20261124-0418'
ledger_head = next(r['head'] for r in refs if r['branch'] == ledger_branch)
assert ledger_head == '21009fb406eb1059f6cce22c0133873aba465f57'
ledger_previous = next(r['head'] for r in refresh['refs'] if r['branch'] == ledger_branch)
ledger_bases = git('merge-base', '--all', MAIN, ledger_head).splitlines()
ledger_evidence = dict(format='ghostpay-ledger-incremental-refresh/1', observed_at=snapshot['observed_at'],
    branch=ledger_branch, head=ledger_head, previous_observation=refresh['recorded_at'],
    since_1137=raw_delta(ledger_previous, ledger_head),
    since_696_baseline=raw_delta(baseline_map[ledger_branch]['head'], ledger_head),
    main=MAIN, all_best_merge_bases=ledger_bases,
    per_merge_base=[raw_delta(b, ledger_head) for b in ledger_bases])
assert ledger_evidence['since_1137']['entry_count'] == 1
assert all(x['documentation_only'] for x in [ledger_evidence['since_1137'],
           ledger_evidence['since_696_baseline'], *ledger_evidence['per_merge_base']])
assert ledger_evidence['since_1137']['entries'][0]['path'] == 'docs/consolidation/autonomous-20261121/semantic-overlay-20261124T1205Z.json'
save_json('LEDGER_REFRESH_1224.json', ledger_evidence)

pr_map = {}
for row in baseline:
    for pr in row['prs'].split(';'):
        if pr:
            pr_map[int(pr)] = row['branch']
refresh_map = {r['branch']: r for r in refresh['changes']}
for row in refresh['changes']:
    if row.get('pr'):
        pr_map[row['pr']] = row['branch']

unit_definitions = [
    dict(id='portable_keystore_cleanup', donor='9bad95e5cc0ee73f5adb8d2c587161074b21e080',
         selected='20d12d860bed893d1c29215ea4f4131bdc75a5d7',
         scope='Portable-keystore owned temporary-buffer cleanup',
         evidence='docs/handoffs/PORTABLE_KEYSTORE_CLEANUP_20261124.md'),
    dict(id='react_pages_diagnostics', donor='ec7dd86db9b20ab906582c35fcb370b043e44ec4',
         selected='71884c053814c20286e6c612a674219770efafa5',
         scope='Fixed-label React diagnostics plus complete existing Pages smoke walk/error harness; only reviewed console hunk, without unrelated --expect-origin source',
         evidence='docs/handoffs/REACT_PAGES_DIAGNOSTICS_20261124.md'),
    dict(id='pir_terminal_separator', donor='d37b0ab37d0e9968bda21c57bd18d78c2897487d',
         selected='dd809454e6f4167b7db77744bce1e4a1301d7c73',
         scope='PIR terminal-separator source and ordinary URL/path case only, without timing/stress case or Settings fixture',
         evidence='docs/handoffs/PIR_IDB_COMPATIBILITY_20261124.md'),
    dict(id='idb_harness_api', donor='6e48ce51ac6b550c998d0331fc7692621dcf174d',
         selected='01983844a343f5dc8226cc4df2e7fa942cd10e45',
         scope='Existing IndexedDB invalidation API/assertion block only, preserving browser selection',
         evidence='docs/handoffs/PIR_IDB_COMPATIBILITY_20261124.md'),
    dict(id='release_fixture_key', donor='21fdd4350d1a4a2fa04198d7e11e922cd7f3da31',
         selected='02f71c11d064f9ab3e28a104b6aeba38453423e7',
         scope='Coherent four-file release fixture-key rejection and validated development-flag propagation',
         evidence='docs/handoffs/RELEASE_FIXTURE_KEY_RECOVERY_20261124.md'),
]
for unit in unit_definitions:
    assert unit['selected'] in ancestors['local_combined']
mixed_units = {}
for row in audit['rows']:
    if row['eligibility'] == 'mixed_scope_unresolved':
        donor_ancestors = set(git('rev-list', row['head']).splitlines())
        mixed_units[row['branch']] = [u for u in unit_definitions if u['donor'] in donor_ancestors]

branch_notes = {
 'chatgpt/ghostpay-historical-consolidation-20261115': dict(
  disposition='superseded_source', selected='Current SellerKeys preserves cancellable-operation ownership, durable-write ownership and finally cleanup.',
  gap='Old restoration removes these controls and current blocked-download, ENS, real browser-restart and same-nonce cancellation checks. Completion-order intent has dedicated current tests.'),
 'claude/lucid-meitner-apalzc': dict(
  disposition='covered_selected_source', selected='Calendar validation plus bounded retries and ambient-credential policy are selected.',
  gap='Seven other production paths are comments or old implementations removing current protections; no missing eligible source is established by wholesale restoration.'),
 'codex/ghostpay-recovered-lean-checkpoint-20261028': dict(
  disposition='superseded_source', selected='Current lean helper explicitly retains this historical selection/public-copy basis.',
  gap='Current emitted chunk/export/Worker evidence, executable-public-asset checks, output proof and HTML entries strengthen the donor. Restoration would remove these guards.'),
 'ghostpay-local-lean-boundary-20261027': dict(
  disposition='superseded_source', selected='Lean selection/public-copy intent is retained through the recovered checkpoint and strengthened helper.',
  gap='Historical code lacks current emitted-graph, executable-public-asset, output-proof and HTML-entry checks; no old-file restoration is eligible.'),
 'evidence/ghostpay-idle-session-r2-20261120': dict(
  disposition='held_runtime_contract', gap='Sleep-aware suspension and backup-only authority remain coupled across session/AppShell/vault/checkpoint/SellerKeys. #365/#544/#582/#596 must compose sole-copy/first-sign semantics with current #572 export and newer SellerKeys/receipt ownership.'),
 'integration/ghostpay-sweep-consent-20261120': dict(
  disposition='held_runtime_contract', gap='Sleep-aware suspension and backup-only authority remain coupled across session/AppShell/vault/checkpoint/SellerKeys. #365/#544/#582/#596 must compose sole-copy/first-sign semantics with current #572 export and newer SellerKeys/receipt ownership.'),
 'fix/ghostpay-browser-acceptance-20261120-r3': dict(
  disposition='partial_coverage_residual_held', selected='The narrow WalletDisclosure focus-restoration intent is equivalent in unselected #589/#606, not another current runtime patch.',
  gap='Selected source lacks the larger disclosure/privacy module. The 551-path historical stack also imports older privacy/export/workflow/contracts code; its parent authority remains unselected.'),
 'fix/remediation-f95457fd-22ecf9': dict(
  disposition='rejected_superseded_source', gap='Donor labels every different payer/chain payment as legacy without a key-version discriminator, blocks independent payments and removes newer derived-payment checks. Current regression explicitly rejects this exact remediation.'),
 'ghostpay-cloud-recovery-2026-10-26': dict(
  disposition='partial_coverage_residual_held', selected='Selected journals, operation ownership, portable APIs and individual export supersede major portions of the monolithic recovery design.',
  gap='Remaining recovery/approval/BTC/policy/reconciliation/deployment variants require semantic separation. Old acceptance variants and monolithic source cannot replace newer lifecycle/custody contracts.'),
 'ghostpay-offline-deps-2026-10-27': dict(
  disposition='held_dependency_incompatible', gap='The manifest/repacked-Viem/repacker/provenance alternative uses an old global local-file override incompatible with the selected SDK-scoped Viem override. Shared recovery source is not another missing Pages feature.'),
 'ghostpay-sbom-repro-2026-10-27': dict(
  disposition='held_tooling', gap='Archive SBOM normalization assumes repository-vendored archives not used by current dependencies. Whole-file restoration removes current root-component-name normalization; adoption needs a reconciled archive policy/tooling unit.'),
 'backup/individual-stealth-keypair-export-20261123-28bba11c': dict(
  disposition='selected_local_followup', selected='Exact-head alias of selected #572, retained once in the canonical individual export composition.',
  gap='Not a second implementation or feature count. Fresh combined native export/recovery acceptance remains required.',
  evidence=['docs/handoffs/INDIVIDUAL_EXPORT_RECOVERY_20261124.md']),
 'recover/ghostpay-canonical-json-descriptors-20261121-r10': dict(
  disposition='covered_selected_source', selected='Canonical JSON production blob is exact; the only test difference is two reviewed delete-to-Reflect.deleteProperty fixture repairs.',
  gap='No missing runtime/regression intent established. Original donor head is not represented as merged.', evidence=['CURRENT_SOURCE_COMPARISONS.json']),
 'qualification/pr504-main-package-rollup-20261124': dict(
  disposition='covered_selected_canonical', selected='Canonical C1 source is selected through original merged history. Of 213 formerly unmatched code paths, 190 are exact; the remaining 23 are reviewed locale/export/print/POS/ledger and stronger parser/linear-operation postimages.',
  gap='The qualification branch itself is not merged. Historical qualification does not establish fresh combined hosted gates.',
  evidence=['CURRENT_SOURCE_COMPARISONS.json', 'docs/consolidation/all-branches-20261124/README.md', 'final-selected-composition-independent-review.json']),
}
for entry in branch_notes.values():
    entry.setdefault('evidence', ['held-branch-eligibility.json'])
for entry in helper['rows']:
    branch = entry['branch']
    assert baseline_map[branch]['head'] == entry['head']
    covered = 'covered_selected_source' in entry['current_disposition']
    branch_notes[branch] = dict(disposition=entry['current_disposition'],
        selected=entry['note'] if covered else '', gap='' if covered else entry['note'],
        evidence=['residual-index-notes.json'] + [(LOCAL if tree_entry(LOCAL, p) else entry['head']) + ':' + p for p in entry['evidence']])

def prs_for(branch):
    result = [int(v) for v in baseline_map.get(branch, {}).get('prs', '').split(';') if v]
    pr = refresh_map.get(branch, {}).get('pr')
    if pr and pr not in result:
        result.append(pr)
    return result

def note_for(branch):
    if branch in branch_notes:
        return branch_notes[branch]
    for pr in prs_for(branch):
        if str(pr) in notes:
            return notes[str(pr)]
    return None

def concrete_successors(branch, visited=None):
    visited = set() if visited is None else visited
    if branch in visited:
        return []
    visited.add(branch)
    row = baseline_map[branch]
    results = []
    for field in ['open_successor_prs', 'coheld_code_prs']:
        for value in row[field].split(';'):
            if not value or int(value) not in pr_map:
                continue
            pr, target = int(value), pr_map[int(value)]
            if target == branch:
                continue
            entry = note_for(target)
            if entry and 'held' in entry['disposition']:
                results.append((pr, target, entry['gap']))
            elif target in baseline_map:
                results.extend(concrete_successors(target, visited))
        if results:
            break
    unique = {}
    for item in results:
        unique.setdefault(item[0], item)
    return list(unique.values())

def default_classification(row, head):
    d = row.get('disposition', 'new_ref')
    ev = ['BASELINE_696.csv']
    if row.get('branch') == 'main':
        return 'snapshot_main', 'Comparison base; main has not been advanced in this artifact.', '', ev
    if head in ancestors['main']:
        return 'integrated_main_ancestry', 'Exact head is an ancestor of snapshot main.', '', ev
    if head in ancestors['published_core']:
        return 'selected_published_core', 'Exact head is an ancestor of published core 87bee; this is history, not a feature count or wholesale file identity.', 'Selected core remains separate from snapshot main; final hosted acceptance is not asserted here.', ev
    if head in ancestors['local_combined']:
        return 'selected_local_followup', 'Exact head is an ancestor of combined source bda2af; reviewed merge resolutions may retain stronger current files.', 'Fresh combined hosted/native acceptance remains required before promotion.', ev
    if d == 'evidence_only':
        return 'evidence_only', '', 'Donor merge-base delta is documentation/evidence only; retain as historical evidence.', ev
    if d in {'exact_changed_code_equivalent_main', 'no_net_delta'}:
        return ('equivalent_main_delta' if d == 'exact_changed_code_equivalent_main' else 'no_net_delta'), row['note'], '', ev
    if d == 'production_intent_superseded_main':
        return 'superseded_source', row['note'], '', ev
    if d in {'behavior_covered_local_candidate', 'semantically_covered_selected_source'}:
        return 'covered_selected_source', row['note'].replace('Now composed locally, not in main.', 'Represented in selected source; not in snapshot main.'), 'Fresh final hosted acceptance is not asserted by this source comparison.', ev
    if d == 'infrastructure_coordination_metadata':
        return 'coordination_only', '', 'Dedicated integration-lock history; its apparent application deletions are not an application merge candidate.', ev
    if d == 'infrastructure_deployment_history':
        return 'deployment_history', '', 'Separate generated deployment history, not an application-source branch.', ev
    if d == 'partial_recovery_open_pr611':
        return 'selective_recovery_residual_held', 'Submitted-refund reservation source/tests and accurate plan-only specification selected.', 'Donor lifecycle and settlement modules remain incomplete; no whole-head merge is claimed.', ['docs/handoffs/REFUND_RESERVATION_RECOVERY_20261124.md']
    if d in {'open_successor_covered', 'coheld_code_open_prs'}:
        successors = concrete_successors(row['branch'])
        if successors:
            n, target, reason = successors[0]
            coverage = 'Exact head retained in descendant history' if d == 'open_successor_covered' else 'Historical remaining code postimages coheld in another branch'
            gap = f'{coverage}; this is not current integration. Concrete remaining contract via #{n}: {reason}'
            if len(successors) > 1:
                gap += ' Additional linked families: ' + ', '.join('#' + str(x[0]) for x in successors[1:5]) + '.'
            return 'held_related_source', '', gap, ['BASELINE_696.csv', 'RESIDUAL_OVERLAY.json']
        paths = row.get('code_path_examples', '').split(';')[:2]
        return 'held_source_comparison', '', 'Unselected related source needs current comparison at ' + ', '.join(paths) + '. Successor/coholder history alone does not prove behavior is missing or preserved.', ev
    if d == 'owner_qualification_or_duplicate':
        return 'retained_qualification_reference', row['note'], 'Distinct historical qualification is retained; its parent feature is not selected by this helper branch.', ev
    return 'held_source_comparison', '', row.get('note', 'New ref requires explicit source disposition.'), ev

output_rows = []
for ref in refs:
    name, head = ref['branch'], ref['head']
    old = baseline_map.get(name, {})
    d, selected, gap, ev = default_classification(dict(old, branch=name), head)
    manual = note_for(name)
    if manual:
        d, selected, gap, ev = manual['disposition'], manual.get('selected', ''), manual.get('gap', ''), list(manual.get('evidence', []))
    units = mixed_units.get(name, [])
    if units:
        selected = '; '.join(u['scope'] for u in units) + '. Whole historical head remains unmerged.'
        ev += [u['evidence'] for u in units] + ['docs/handoffs/NATIVE_IDB_CI_20261124.md']
    code = code_map.get(name)
    if code and not code['different_paths'] and head not in ancestors['published_core'] and head not in ancestors['local_combined']:
        d = 'equivalent_selected_delta'
        selected = f"All {len(code['donor_delta_code_paths'])} previously unmatched code/test paths have identical mode/type/blob in bda2af. This is delta-path equivalence, not whole-tree or ancestry equivalence."
        gap = 'No unique implementation established in those historical residual paths. Fresh combined gates remain separate from this structural comparison.'
        ev = ['CURRENT_SOURCE_COMPARISONS.json']
    if name == ledger_branch:
        d, selected = 'evidence_only', ''
        gap = 'Latest f2b420-to-21009fb advancement adds only semantic-overlay-20261124T1205Z.json. Complete merge-base and incremental deltas are documentation-only; historical scan observations are not final-head qualification.'
        ev = ['LEDGER_REFRESH_1224.json']
    if name == 'integration/all-branch-review-20261124':
        d = 'published_selected_core'
        selected = 'Published core advanced from baseline 100de400 to 87bee. Its source is retained in the current composed implementation; 87bee itself is not a local ancestor.'
        gap = 'Snapshot main remains 706188. This index does not assert completed hosted gates or main promotion.'
        ev = ['branch-refresh-698.json', 'SOURCE.json']
    output_rows.append(dict(
        branch=name, baseline_head=old.get('head', ''),
        baseline_census_status=old.get('census_status', 'new_since_696'),
        baseline_disposition=old.get('disposition', 'new_since_696'), baseline_prs=old.get('prs', ''),
        head=head, prs=';'.join(map(str, prs_for(name))),
        ancestor_main=head in ancestors['main'], ancestor_published_core=head in ancestors['published_core'],
        ancestor_local_combined=head in ancestors['local_combined'], ancestor_equivalent_remote_source=head in ancestors['equivalent_remote_source'],
        current_disposition=d, selected_or_equivalent_scope=selected, remaining_gap=gap,
        evidence=';'.join(dict.fromkeys(ev))))
index_map = {r['branch']: r for r in output_rows}
assert len(index_map) == 698
for row in baseline:
    new = index_map[row['branch']]
    for old_key, new_key in [('head', 'baseline_head'), ('census_status', 'baseline_census_status'), ('disposition', 'baseline_disposition'), ('prs', 'baseline_prs')]:
        assert row[old_key] == new[new_key]
for row in output_rows:
    assert row['selected_or_equivalent_scope'] or row['remaining_gap']
    assert len(row['head']) == 40
columns = list(output_rows[0])
save_json('INDEX_DATA.json', dict(columns=columns, rows=output_rows))

comparison617 = load('branch-617-comparison.json')
current617 = []
for row in comparison617['paths']:
    current = tree_entry(LOCAL, row['path'])
    current617.append(dict(row, current=current, current_exact=current == row['donor']))
assert sum(x['current_exact'] for x in current617) == 11
assert [x['path'] for x in current617 if not x['current_exact']] == ['apps/web/src/lib/qrKinds.test.ts', 'apps/web/src/lib/qrKinds.ts']
comparison614 = code_map['integration/near-finished-20261124']
assert comparison614['different_paths'] == ['apps/web/src/lib/format.test.ts', 'apps/web/src/lib/format.ts',
    'packages/qr-exchange/src/vendor.provenance.test.ts', 'packages/qr-exchange/src/vendor/jsqr-1.4.0.mjs']
save_json('CURRENT_SOURCE_COMPARISONS.json', dict(
    source=LOCAL, tree=TREE, historical_code_path_comparisons=code_comparisons,
    pr617=dict(source=comparison617['donor'], donor_base=comparison617['donor_base'], paths=current617),
    pr614=dict(source=comparison614['head'], remaining_different_paths=comparison614['different_paths'],
      interpretation='Current parseUnits runtime guard/regressions and canonical QR bounded retry/provenance account for the four differences; no additional QR runtime remains unselected.'),
    canonical_json_fixture_delta=git('diff', 'fbcf69223a524b8e3d74fb093dfc71d8b91bdc27', LOCAL, '--', 'packages/invoice-schema/src/json.test.ts'),
    mixed_source_units=mixed_units,
    additional_bounded_comparisons=[dict(pr=n, head=baseline_map[pr_map[n]]['head'],
        diff=git('diff', baseline_map[pr_map[n]]['head'], LOCAL, '--', *paths))
        for n, paths in [(384, ['apps/web/src/lib/format.ts']), (405, ['apps/web/src/lib/format.ts', 'apps/web/src/lib/format.test.ts']),
                         (250, ['packages/chain-adapters/src/deployments.ts', 'packages/chain-adapters/src/rpc.ts']),
                         (271, ['packages/chain-adapters/src/deployments.ts', 'packages/chain-adapters/src/rpc.ts'])]]))
(OUT / 'BASELINE_696.csv').write_bytes(baseline_bytes)
(OUT / 'HISTORICAL_67.json').write_bytes((BASE / 'held-branch-eligibility.json').read_bytes())
(OUT / 'HISTORICAL_67.md').write_bytes(git_bytes('show', LOCAL + ':' + HISTORICAL_MD))
assert sha((OUT / 'BASELINE_696.csv').read_bytes()) == sha(baseline_bytes)
assert sha((OUT / 'HISTORICAL_67.json').read_bytes()) == sha((BASE / 'held-branch-eligibility.json').read_bytes())

overlay_rows = []
for old in audit['rows']:
    now = index_map[old['branch']]
    overlay_rows.append(dict(branch=old['branch'], historical_head=old['head'], current_head=now['head'], prs=old['prs'],
        historical_eligibility=old['eligibility'], historical_hold_reason=old['hold_reason'],
        current_disposition=now['current_disposition'], selected_or_equivalent_scope=now['selected_or_equivalent_scope'],
        remaining_gap=now['remaining_gap'], evidence=now['evidence'].split(';'),
        ancestor_main=now['ancestor_main'], ancestor_published_core=now['ancestor_published_core'],
        ancestor_local_combined=now['ancestor_local_combined'], ancestor_equivalent_remote_source=now['ancestor_equivalent_remote_source'],
        recovered_subsets=mixed_units.get(old['branch'], [])))
extra_branches = {
    pr_map[581], pr_map[617], pr_map[618], ledger_branch,
    'backup/individual-stealth-keypair-export-20261123-28bba11c',
    'recover/ghostpay-canonical-json-descriptors-20261121-r10',
    'qualification/pr504-main-package-rollup-20261124',
    'evidence/ghostpay-vault-rekey-qualification-20261120',
    'qualification/pr525-main-package-rollup-20261124',
    'qualification/pr531-main-package-rollup-20261124',
    'qualify/ghostpay-hygiene-composition-20261120-9a4ab6',
    *[r['branch'] for r in helper['rows']],
    *[pr_map[n] for n in [566, 559, 556, 558, 384, 405, 250, 271]],
}
overlay = dict(format='ghostpay-residual-overlay/1', source=LOCAL, tree=TREE, equivalent_remote_source=REMOTE_SOURCE,
    branch_observation=snapshot['observed_at'],
    historical_audit=dict(observed_at=audit['observed_at'], source_comparison=audit['source_comparison'],
      final_local_source=audit['final_local_source'], published_pr611=audit['published_pr611'], rows=67,
      preserved_file='HISTORICAL_67.json', sha256=sha((OUT / 'HISTORICAL_67.json').read_bytes())),
    interpretation='Additive corrections at pinned source. Historical decisions remain intact. Ancestry is not a feature count; broad-stack semantic certification, fresh hosted success and main integration are not claimed.',
    historical_eligibility_counts=audit['eligibility_counts'],
    current_disposition_counts=dict(sorted(collections.Counter(r['current_disposition'] for r in overlay_rows).items())),
    rows=overlay_rows, additional_corrections=[index_map[b] for b in sorted(extra_branches)],
    native_gate_correction='Original React/Pages and PIR/IDB handoffs described missing direct PR-native invocation at their isolated pins. Current NATIVE_IDB_CI_20261124 adds the unchanged IDB harness to full E2E and the nine-view Pages smoke to the PR site-artifact job. Wiring is present; fresh successful hosted execution is not asserted.')
save_json('RESIDUAL_OVERLAY.json', overlay)

input_paths = ['branch-refresh-698.json', 'branch-ref-snapshot-final.json', 'branch-617-comparison.json',
 'held-branch-eligibility.json', 'mixed-scope-deeper-review.md', 'branch-census-695.json',
 'branch-current-code-comparisons.json', 'branch-index-notes.json', 'residual-index-notes.json',
 'final-selected-composition-independent-review.json']
inputs = [dict(path=str(BASE / name), sha256=sha((BASE / name).read_bytes())) for name in input_paths]
inputs.append(dict(path=BASELINE_PATH, commit=LOCAL, sha256=sha(baseline_bytes)))
palette_path = 'docs/handoffs/RESPONSIVE_PALETTE_ELIGIBILITY_20261124.md'
inputs.append(dict(path=palette_path, commit=LOCAL, sha256=sha(git_bytes('show', LOCAL + ':' + palette_path))))
row_counts = {key: sum(r['head'] in a for r in refs) for key, a in ancestors.items()}
head_counts = {key: len({r['head'] for r in refs if r['head'] in a}) for key, a in ancestors.items()}
union = ancestors['published_core'] | ancestors['local_combined']
intersection = ancestors['published_core'] & ancestors['local_combined']
row_counts.update(selected_either=sum(r['head'] in union for r in refs),
 selected_both=sum(r['head'] in intersection for r in refs),
 published_only=sum(r['head'] in ancestors['published_core'] - ancestors['local_combined'] for r in refs),
 local_only=sum(r['head'] in ancestors['local_combined'] - ancestors['published_core'] for r in refs))
head_counts.update(selected_either=len({r['head'] for r in refs if r['head'] in union}),
 selected_both=len({r['head'] for r in refs if r['head'] in intersection}))
remote_union_ref_equivalence = all((r['head'] in union) == (r['head'] in ancestors['equivalent_remote_source']) for r in refs)
source = dict(format='ghostpay-698-branch-index/1', generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
 source=LOCAL, tree=TREE, main=MAIN, published_core=PUBLISHED, equivalent_remote_source=REMOTE_SOURCE,
 equivalent_remote_tree=git('rev-parse', REMOTE_SOURCE + '^{tree}'),
 published_core_tree=git('rev-parse', PUBLISHED + '^{tree}'),
 branch_observation=snapshot['observed_at'], row_count=698, unique_head_count=len({r['head'] for r in refs}),
 baseline_row_count=696, historical_residual_row_count=67,
 post_snapshot_publication='Equivalent source commit c6efee6 existed and was fetched after the frozen snapshot; no later publication branch is added to the 698-row census. A subsequent branch creation must be recorded as an explicit later event.',
 new_refs=new_refs, advanced_refs=advanced_refs, unchanged_baseline_ref_count=694, deleted_refs=[],
 ancestry_method='git rev-list of each immutable target, testing all snapshot heads for membership. Counts include main itself and aliases. They count refs, not features or eligible changes.',
 ancestry_row_counts=row_counts, ancestry_unique_head_counts=head_counts,
 equivalent_remote_matches_local_published_union_on_snapshot_refs=remote_union_ref_equivalence,
 published_only_rows=[r for r in refs if r['head'] in ancestors['published_core'] - ancestors['local_combined']],
 local_only_rows=[r for r in refs if r['head'] in ancestors['local_combined'] - ancestors['published_core']],
 current_disposition_counts=dict(sorted(collections.Counter(r['current_disposition'] for r in output_rows).items())),
 baseline_disposition_counts=dict(sorted(collections.Counter(r['disposition'] for r in baseline).items())), inputs=inputs,
 limits=[
  'Current means pinned bda2af source and the frozen 12:24:48 UTC ref snapshot, not a new live remote census.',
  'Baseline CSV and 67-row audit are preserved byte-for-byte; corrections are additive overlay fields.',
  'Exact head ancestry, donor-delta mode/type/blob equality and bounded semantic source review are different evidence.',
  'A selected subset does not select its whole broad parent. Code-path and branch counts are not feature counts.',
  'Remaining rows specify contract or qualification gaps; they are not exhaustive broad-stack certification or blanket ownership prohibitions.',
  'Historical donor CI does not establish fresh combined qualification. This artifact claims no final hosted green or main merge.',
  'No application tests, vulnerability reproductions, stress tasks, repository changes or remote mutations were performed for this report.'])
save_json('SOURCE.json', source)

def cell(value):
    return str(value).replace('|', '\\|').replace('\n', ' ')

md = [
 '# Branch disposition overlay — 698 observed refs', '',
 f'Combined source: `{LOCAL}`. Tree: `{TREE}`.', '',
 f'Ref snapshot: **{snapshot["observed_at"]}**. Snapshot main: `{MAIN}`. Published core: `{PUBLISHED}`.', '',
 f'The later fetched equivalent remote commit is `{REMOTE_SOURCE}`, with the same tree. Its ancestry is recorded separately; no post-snapshot publication branch has been silently added.', '',
 'This is an additive source assessment. `BASELINE_696.csv`, `HISTORICAL_67.json` and `HISTORICAL_67.md` preserve the earlier records. Their old held/check wording remains historical. Current columns in `BRANCH_INDEX_698.csv` and this overlay describe the pinned composition. No final hosted success or main promotion is claimed.', '',
 '## Ancestry accounting', '',
 '| Target relationship | Branch rows | Unique heads |', '| --- | ---: | ---: |']
for key, label in [('main', 'Ancestor of snapshot main, including main'),
 ('published_core', 'Ancestor of published core'), ('local_combined', 'Ancestor of local combined source'),
 ('selected_both', 'Ancestor of both local and published targets'), ('selected_either', 'Ancestor of either local or published target'),
 ('equivalent_remote_source', 'Ancestor of equivalent remote source')]:
    md.append(f'| {label} | {row_counts[key]} | {head_counts[key]} |')
md += ['',
 f'There are **{row_counts["local_only"]} local-only ancestry rows** and **{row_counts["published_only"]} published-only rows**. The latter are the two input-followup donor heads and the published core ref itself. Their behavior is retained locally through different history. These are ref counts, not feature counts; source preservation and delta-path equivalence are separate evidence.', '',
 '## Corrections to the earlier held audit', '',
 '- #410, #341 and #220: the named source/regression subsets are selected; broader historical stacks remain unselected.',
 '- #581 and #605: both original histories are retained in one canonical ESM QR implementation, including both semantic corrections and existing tests/provenance. #614 has no additional missing runtime unit after composition.',
 '- #608: print completion is selected with current receipt archive ownership and QR policies preserved.',
 '- #563: the public-profile viewer is selected with its default-off/full-only contract and three additional hosted native scenarios.',
 '- #572: individual export, verification, codec and recovery CLI are selected with current session/Scan/custody contracts. Wider seller recovery, master/archive UI and suspended-session features remain separate.',
 '- #583: presentation remains held on exact typed-lint, asset-assertion and forced-colors contrast failures. Donor native zoom and saved-theme controls passed; those successes do not resolve the other failures.',
 '- Seven mixed-stack rows now record portable-keystore cleanup, React/Pages diagnostics, IDB caller repair and release-key subsets. #262 and #264 also carry the selected PIR normalization subset. Remaining protocol/authority/lifecycle changes are not represented as merged.',
 '- #617 adds no missing runtime delta: all 13 paths match the published core, with only two QR-kind paths later strengthened locally. #618 changes only its dependent dashboard rejection fixture and documentation.',
 '- Four older coholder rows have exact equality for every formerly unmatched code path: vault-rekey qualification, PR525 qualification, PR531 qualification and hygiene composition. This is delta-path equality, not whole-tree/head equivalence.', '',
 'The original React/Pages and IDB handoffs recorded missing direct PR-native coverage at their isolated pins. Current `NATIVE_IDB_CI_20261124.md` documents later additive wiring: the IDB harness runs in full E2E and the nine-view Pages smoke runs against the PR site artifact. Fresh hosted execution remains required.', '',
 '## Further bounded eligibility corrections', '',
 '**#377 is a small eligible dependency-recovery candidate awaiting qualification, not a generic owner hold.** All three donor preimages match bda2af exactly. The unit contains a version-scoped Sentry cookie override, one lock record and its original consumer test. Matching resolution and authored tooling/contract qualification remain before selection; this report does not import it.', '',
 'The read-only provenance tool #358, Mythril summarizer #468 and standalone native compatibility test #578 also have no intrinsic source blocker established by the bounded pass. Their stated schema/source-provenance or current native/static qualification remains outstanding. Action-pin upgrades #492 likewise require actual current workflow qualification. These are unselected candidates, not asserted failures.', '',
 'The old cloud secret-alias behavior and secret-loader/queue-deadline/adaptive-window/plain-revert intents are already covered by selected source. #253’s SOCKS source and full test file are exact in current source; its remaining major dependency train retains compiler/plugin incompatibilities. Detailed evidence is in the additional-corrections table and `residual-index-notes.json`.', '',
 '## Complete overlay of the original 67 rows', '',
 '| Branch / PR | Historical eligibility | Current disposition | Selected or equivalent scope | Remaining source or qualification gap |',
 '| --- | --- | --- | --- | --- |']
for row in overlay_rows:
    label = ', '.join('#' + str(p) for p in row['prs']) or row['branch']
    md.append('| ' + ' | '.join(cell(v) for v in [label, row['historical_eligibility'], row['current_disposition'],
       row['selected_or_equivalent_scope'] or '—', row['remaining_gap'] or '—']) + ' |')
md += ['', '## Additional corrections outside the original 67 rows', '',
 '| Branch / PR | Current disposition | Source assessment |', '| --- | --- | --- |']
for row in overlay['additional_corrections']:
    label = '#' + row['prs'].replace(';', ', #') if row['prs'] else row['branch']
    md.append('| ' + ' | '.join(cell(v) for v in [label, row['current_disposition'],
       ' '.join([row['selected_or_equivalent_scope'], row['remaining_gap']]).strip()]) + ' |')
md += ['', '## Latest ref refresh', '',
 'The 11:37 refresh added #617 and #618 and advanced the published core and ledger refs. The 12:24 refresh changed only the ledger, from `f2b42056de2df4ebe1e0d3b93fbf495a0b6e666c` to `21009fb406eb1059f6cce22c0133873aba465f57`. Its complete incremental delta adds only `docs/consolidation/autonomous-20261121/semantic-overlay-20261124T1205Z.json`. Both its complete merge-base delta and the delta from the 696-row ledger head contain documentation only. Raw entry modes and blob IDs are retained in `LEDGER_REFRESH_1224.json`.', '',
 '## Reading the index', '',
 '`baseline_*` columns are unchanged historical values, with blank baseline heads only for the two newly observed refs. `ancestor_*` columns are independent Git facts. `current_disposition`, `selected_or_equivalent_scope`, `remaining_gap` and `evidence` are additive. Repository evidence paths are pinned to the combined source unless an explicit donor hash precedes the path. Scratch input hashes and all source pins are in `SOURCE.json`.', '',
 'The CSV is a branch-level navigation aid. Broad stacks still require the specified API, provider, lifecycle or qualification work. This report does not convert an unresolved blob difference into a missing feature or an ownership claim into a prohibition.', '']
(OUT / 'RESIDUAL_OVERLAY.md').write_text('\n'.join(md))
verification = dict(source=LOCAL, tree=TREE, equivalent_remote_source=REMOTE_SOURCE,
 expected_rows=698, actual_rows=len(output_rows), unique_branches=len(index_map), snapshot_ref_set_equal=True,
 baseline_rows_preserved=696, new_refs=2, advanced_baseline_refs=2, deleted_refs=0, historical_rows_preserved=67,
 baseline_csv_sha256=sha(baseline_bytes), historical_json_sha256=sha((OUT / 'HISTORICAL_67.json').read_bytes()),
 ledger_full_and_incremental_documentation_only=True, pr617_current_exact_paths=11, pr617_strengthened_qr_paths=2,
 pr614_remaining_different_paths=comparison614['different_paths'],
 exact_residual_delta_equivalent_rows=[r['branch'] for r in output_rows if r['current_disposition'] == 'equivalent_selected_delta'],
 no_repository_or_remote_writes=True, authored_csv_validation='Pending artifact-tool authoring and round-trip check')
save_json('VERIFY.json', verification)
print(json.dumps(dict(output=str(OUT), row_count=len(output_rows), ancestry_rows=row_counts,
 dispositions=source['current_disposition_counts'], historical_overlay_dispositions=overlay['current_disposition_counts']), indent=2))
