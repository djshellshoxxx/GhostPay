#!/usr/bin/env python3
"""Offline exact-SHA branch census. Python stdlib and Git only; no Git writes.

Usage: python build_branch_ledger.py --snapshot live-snapshot.json \
    --git-dir /path/to/repository.git --output-dir /path/to/evidence

Branch names are labels, never comparison operands. Content and stable-patch-ID
matches are evidence, not semantic equivalence, supersession or qualification.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import hashlib
import itertools
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time

SCHEMA = "ghostpay-exact-branch-ledger/1"
DOC_SUFFIXES = (".md", ".markdown", ".mdown", ".mkdn", ".mdx")
DOC_NAMES = ("license", "licence", "notice", "changelog")
DOC_NAME_SUFFIXES = ("", ".txt", ".rst")
ABSENT = ("000000", None)
STARTED = time.monotonic()


def progress(message):
    print(f"[{time.monotonic()-STARTED:.1f}s] {message}", file=sys.stderr, flush=True)


def is_documentation(path):
    if path.startswith(("docs/", "doc/", ".agents/")):
        return True
    lower = path.lower()
    if lower.endswith(DOC_SUFFIXES):
        return True
    basename = lower.rsplit("/", 1)[-1]
    return any(basename == name+suffix for name in DOC_NAMES for suffix in DOC_NAME_SUFFIXES)


def non_document_pathspec():
    result = [":(top,glob)**"]
    result += [f":(top,glob,exclude){d}/**" for d in ("docs", "doc", ".agents")]
    result += [f":(top,glob,icase,exclude)**/*{s}" for s in DOC_SUFFIXES]
    result += [f":(top,glob,icase,exclude)**/{n}{s}" for n in DOC_NAMES for s in DOC_NAME_SUFFIXES]
    return result


class Git:
    def __init__(self, git_dir):
        self.prefix = ["git", "--no-optional-locks", "--git-dir="+str(git_dir)]
        self.env = dict(os.environ, GIT_OPTIONAL_LOCKS="0", GIT_NO_REPLACE_OBJECTS="1", LC_ALL="C")

    def run(self, *args, input_bytes=None, allow_failure=False):
        p = subprocess.run(self.prefix+list(args), input=input_bytes, capture_output=True, env=self.env)
        if p.returncode and not allow_failure:
            raise RuntimeError(f"Git failed ({p.returncode}) {args[:5]!r}: "+p.stderr.decode("utf-8", "replace")[:2000])
        return p.returncode, p.stdout

    def text(self, *args, **kwargs):
        return self.run(*args, **kwargs)[1].decode("utf-8", "surrogateescape")

    def lines(self, *args, **kwargs):
        return self.text(*args, **kwargs).splitlines()

    def patch_ids(self, arguments):
        """Stream real Git patches through Git's stable patch-ID implementation."""
        left = subprocess.Popen(self.prefix+list(arguments), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env)
        errors = []
        reader = threading.Thread(target=lambda: errors.append(left.stderr.read()), daemon=True)
        reader.start()
        right = subprocess.Popen(self.prefix+["patch-id", "--stable"], stdin=left.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env)
        left.stdout.close()
        out, error = right.communicate()
        code = left.wait()
        reader.join()
        if code or right.returncode:
            raise RuntimeError("patch-ID pipeline failed: "+b"\n".join(errors+[error]).decode("utf-8", "replace")[:2000])
        result = []
        for line in out.decode("ascii").splitlines():
            pid, commit = line.split()
            if not re.fullmatch(r"[0-9a-f]{40,64}", pid):
                raise RuntimeError("Invalid patch-ID output")
            result.append((pid, commit))
        return result


def read_tree(git, sha, non_document_only=False):
    result = {}
    for entry in git.run("ls-tree", "-r", "-z", "--full-tree", sha)[1].split(b"\0"):
        if not entry:
            continue
        metadata, raw_path = entry.split(b"\t", 1)
        mode, kind, oid = metadata.decode("ascii").split()
        path = raw_path.decode("utf-8", "surrogateescape")
        if not non_document_only or not is_documentation(path):
            result[path] = (mode, oid)
    return result


def raw_diff(git, base, head):
    result = {}
    data = git.run("diff", "--raw", "-z", "--no-abbrev", "--no-renames", "--no-ext-diff", "--no-textconv", base, head, "--")[1].split(b"\0")
    i = 0
    while i < len(data) and data[i]:
        header = data[i].decode("ascii").split()
        path = data[i+1].decode("utf-8", "surrogateescape")
        if len(header) != 5 or header[4][0] in "RC":
            raise RuntimeError("Unexpected raw diff header")
        mode, oid = header[1], header[3]
        result[path] = {"state": ABSENT if mode == "000000" else (mode, oid), "changes": [header[4]]}
        i += 2
    return result


def donor_diff(git, base, head):
    code, raw = git.run("merge-base", "--all", base, head, allow_failure=True)
    if code not in (0, 1):
        raise RuntimeError("merge-base failed")
    bases = sorted(raw.decode("ascii").split())
    delta = {}
    for common in bases:
        for path, record in raw_diff(git, common, head).items():
            if path in delta:
                if delta[path]["state"] != record["state"]:
                    raise RuntimeError("Different final donor state across merge bases")
                delta[path]["changes"] = sorted(set(delta[path]["changes"]+record["changes"]))
            else:
                delta[path] = record
    return {"merge_bases": bases, "delta": delta, "ambiguous_merge_base": len(bases)>1}


def state_matches(state, tree, path):
    return state == tree.get(path, ABSENT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--git-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.workers <= 16:
        parser.error("--workers must be 1..16")
    snapshot_bytes = args.snapshot.read_bytes()
    snapshot = json.loads(snapshot_bytes)
    branches = sorted(snapshot["branches"], key=lambda b: b["name"])
    prs = sorted(snapshot["open_prs"], key=lambda p: p["number"])
    baseline = snapshot["main"]
    branch_head_by_name = {b['name']:b['sha'] for b in branches}
    if branch_head_by_name.get('main', baseline) != baseline:
        raise RuntimeError('Snapshot main field and main branch disagree')
    if len({b["name"] for b in branches}) != len(branches) or len({p["number"] for p in prs}) != len(prs):
        raise RuntimeError("Duplicate branch or PR in snapshot")
    git = Git(args.git_dir.resolve())
    frozen_heads = sorted({baseline}|{b["sha"] for b in branches}|{p['head']['sha'] for p in prs}|{p['base']['sha'] for p in prs})
    if any(not re.fullmatch(r"[0-9a-f]{40}", sha) for sha in frozen_heads):
        raise RuntimeError("Full SHA-1 commit IDs required")
    progress(f"Verify {len(frozen_heads)} frozen commits; {len(branches)} branches / {len(prs)} PRs")
    checked = git.text("cat-file", "--batch-check=%(objectname) %(objecttype)", input_bytes=("\n".join(frozen_heads)+"\n").encode()).splitlines()
    if checked != [sha+" commit" for sha in frozen_heads]:
        raise RuntimeError("Frozen object missing or not a commit")
    main_reachable = set(git.lines("rev-list", baseline))
    all_reachable = set(git.lines("rev-list", *frozen_heads))
    main_tree = read_tree(git, baseline)
    open_by_head, open_by_ref = defaultdict(list), defaultdict(list)
    for pr in prs:
        open_by_head[pr['head']['sha']].append(pr['number'])
        open_by_ref[pr['head']['ref']].append(pr['number'])
    open_heads = sorted(open_by_head)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        open_reachable = dict(pool.map(lambda sha: (sha, set(git.lines("rev-list", sha))), open_heads))
        open_trees = dict(pool.map(lambda sha: (sha, read_tree(git, sha, True)), open_heads))

    def branch_source(sha):
        behind, ahead = map(int, git.text("rev-list", "--left-right", "--count", baseline+"..."+sha).split())
        result = donor_diff(git, baseline, sha)
        result.update(sha=sha, ahead=ahead, behind=behind, tree=git.text("rev-parse", sha+"^{tree}").strip())
        if (ahead == 0) != (sha in main_reachable):
            raise RuntimeError("Ancestry/count invariant failed")
        return sha, result

    progress("Compute full donor deltas, frozen-current PR-base deltas and advertised-base provenance")
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        sources = dict(pool.map(branch_source, sorted({b['sha'] for b in branches})))
        advertised_pr_sources = dict(pool.map(lambda p: (p['number'], donor_diff(git, p['base']['sha'], p['head']['sha'])), prs))
        pr_sources = dict(pool.map(
            lambda p: (p['number'], donor_diff(git, branch_head_by_name[p['base']['ref']], p['head']['sha'])
                       if p['base']['ref'] in branch_head_by_name else
                       {'merge_bases':[], 'delta':{}, 'ambiguous_merge_base':False, 'base_ref_missing':True}), prs))
    metadata_names = set()
    for branch in branches:
        if branch['name'] == "automation/ghostpay-integration-lock":
            if git.lines("ls-tree", "--name-only", branch['sha']) != ['integration-lock.json']:
                raise RuntimeError("Unexpected integration-lock root tree")
            metadata_names.add(branch['name'])
            sources[branch['sha']] = dict(sources[branch['sha']], delta={}, source_diff_excluded=True)
    path_set = set()
    for source in list(sources.values())+list(pr_sources.values())+list(advertised_pr_sources.values()):
        path_set.update(source['delta'])
    paths = sorted(path_set)
    path_index = {p:i for i,p in enumerate(paths)}
    state_keys = sorted({(p,r['state'][0],r['state'][1] or '') for source in list(sources.values())+list(pr_sources.values())+list(advertised_pr_sources.values()) for p,r in source['delta'].items()})
    state_index = {s:i for i,s in enumerate(state_keys)}

    progress("Compare exact changed states with main and every open PR head")
    branch_records, branch_path_records = [], []
    for index, branch in enumerate(branches):
        name, sha = branch['name'], branch['sha']
        source = sources[sha]
        delta = source['delta']
        non_docs = {p:r for p,r in delta.items() if not is_documentation(p)}
        matched_main = [p for p,r in non_docs.items() if state_matches(r['state'], main_tree, p)]
        different_main = sorted(set(non_docs)-set(matched_main))
        containing = sorted(n for h in open_heads if sha in open_reachable[h] for n in open_by_head[h])
        strict_containing = sorted(n for h in open_heads if h != sha and sha in open_reachable[h] for n in open_by_head[h])
        content_candidates = sorted(n for h in open_heads if h != sha and non_docs and all(state_matches(r['state'],open_trees[h],p) for p,r in non_docs.items()) for n in open_by_head[h])
        if sha == baseline:
            classification, action = 'main-baseline', 'Use this frozen baseline; refresh main before integration.'
        elif name in metadata_names:
            classification, action = 'coordination-metadata', 'Preserve the integration-lock protocol; never merge its sparse metadata tree as source.'
        elif name == 'gh-pages':
            classification, action = 'publication-ref', 'Preserve Pages output separately; do not merge publication history as source.'
        elif not source['merge_bases']:
            classification, action = 'unrelated-history', 'Inspect origin and source provenance explicitly; there is no common source ancestor.'
        elif source['ahead'] == 0:
            classification, action = 'history-in-main', 'Do not re-integrate this exact historical tip. Ancestry does not prove old behavior survives later commits.'
        elif source['ambiguous_merge_base']:
            classification, action = 'unresolved-content', 'Inspect all merge bases; changed paths are their complete union. No single net-patch equivalence is inferred.'
        elif not delta:
            classification, action = 'no-net-content-delta', 'Preserve commit provenance; this donor has no net tree delta from its merge base.'
        elif not non_docs:
            classification, action = 'docs-only', 'Review unique documentation within existing ownership; no runtime completion is inferred.'
        elif not different_main:
            classification, action = 'changed-content-present-main', 'Avoid reimplementing these exact changed-path states; review semantic scope and documentation before declaring supersession.'
        elif strict_containing:
            classification, action = 'history-in-open-candidate', 'Continue the containing candidate after comparing its current source; history containment does not prove preservation or qualification.'
        elif content_candidates:
            classification, action = 'changed-content-present-open-candidate', 'Coordinate with the matching candidate; changed-path identity is not whole-tree or behavioral equivalence.'
        else:
            classification, action = 'unresolved-content', 'Preserve the donor; review unmatched paths semantically and resolve ownership/acceptance before selective recovery.'
        record = {
            'branch_index':index, 'name':name, 'head_sha':sha, 'tree_sha':source['tree'],
            'ahead_of_main':source['ahead'], 'behind_main':source['behind'],
            'merge_base_shas':source['merge_bases'], 'multiple_merge_bases':source['ambiguous_merge_base'],
            'classification':classification, 'next_action':action,
            'source_diff_applicable':name not in metadata_names and bool(source['merge_bases']) and name != 'gh-pages',
            'changed_path_count':len(delta), 'non_document_changed_path_count':len(non_docs),
            'non_document_states_matching_main':len(matched_main), 'non_document_states_differing_from_main':len(different_main),
            'differing_main_path_indices':[path_index[p] for p in different_main],
            'open_prs_at_equal_head':sorted(open_by_head.get(sha,[])),
            'open_prs_on_named_branch':sorted(open_by_ref.get(name,[])),
            'history_contained_in_open_prs':containing, 'strict_history_contained_in_open_prs':strict_containing,
            'changed_content_present_in_other_open_prs':content_candidates,
            'historical_containers_with_same_changed_content':sorted(set(strict_containing)&set(content_candidates)),
            'historical_containers_with_different_changed_content':sorted(set(strict_containing)-set(content_candidates)) if non_docs else [],
            'qualified':False, 'ownership_released':False,
        }
        branch_records.append(record)
        branch_path_records.append({
            'branch_index':index, 'name':name, 'head_sha':sha,
            'path_indices':[path_index[p] for p in sorted(delta)],
            'source_state_indices':[state_index[(p,delta[p]['state'][0],delta[p]['state'][1] or '')] for p in sorted(delta)],
            'change_kinds':[delta[p]['changes'] for p in sorted(delta)],
        })

    pr_records, pr_path_records, advertised_pr_path_records = [], [], []
    pr_by_number = {p['number']:p for p in prs}
    pr_path_sets, path_prs = {}, defaultdict(list)
    for pr in prs:
        number, sha = pr['number'], pr['head']['sha']
        source = pr_sources[number]
        advertised_source = advertised_pr_sources[number]
        current_base = branch_head_by_name.get(pr['base']['ref'])
        current_base_contained = current_base in open_reachable[sha] if current_base else None
        direct_parents = sorted(n for n in open_by_ref.get(pr['base']['ref'],[]) if n != number)
        relationships = [{
            'parent_pr':n, 'parent_head_sha':pr_by_number[n]['head']['sha'],
            'parent_head_matches_frozen_base_ref':pr_by_number[n]['head']['sha']==current_base,
            'parent_head_is_ancestor_of_child':pr_by_number[n]['head']['sha'] in open_reachable[sha],
            'parent_head_equals_child':pr_by_number[n]['head']['sha']==sha,
        } for n in direct_parents]
        if current_base is None:
            dependency_status = 'base-ref-missing-from-frozen-snapshot'
        elif pr['base']['ref']=='main':
            dependency_status = 'main-target'
        elif current_base in main_reachable:
            dependency_status = 'nonmain-base-tip-already-in-main'
        elif current_base_contained:
            dependency_status = 'frozen-parent-tip-contained'
        else:
            dependency_status = 'frozen-parent-tip-not-contained'
        dependency_action = {
            'base-ref-missing-from-frozen-snapshot':'Resolve the missing base ref; do not substitute advertised API metadata for a current base.',
            'main-target':'Review the exact head against refreshed main and current required checks; no qualification is inferred.',
            'nonmain-base-tip-already-in-main':'Review retargeting to main and recompute the combined delta/qualification. The old parent ref being in main does not qualify this child.',
            'frozen-parent-tip-contained':'Preserve the stack and verify current parent/child heads before integration.',
            'frozen-parent-tip-not-contained':'Reconcile the advanced or diverged parent before treating this child as up to date; preserve both owners.',
        }[dependency_status]
        indexes = {path_index[p] for p in source['delta']}
        pr_path_sets[number] = indexes
        for i in sorted(indexes):
            path_prs[i].append(number)
        non_docs = {i for i in indexes if not is_documentation(paths[i])}
        parents = sorted(n for h in open_heads if h != sha and h in open_reachable[sha] for n in open_by_head[h])
        pr_records.append({
            'pr':number, 'title':pr['title'], 'url':pr['url'], 'draft':pr['draft'],
            'head_ref':pr['head']['ref'], 'head_sha':sha,
            'head_ref_snapshot_sha':branch_head_by_name.get(pr['head']['ref']),
            'head_metadata_matches_live_snapshot':branch_head_by_name.get(pr['head']['ref'])==sha if pr['head']['ref'] in branch_head_by_name else None,
            'base_ref':pr['base']['ref'], 'base_sha':current_base,
            'advertised_base_sha':pr['base']['sha'], 'base_ref_snapshot_sha':current_base,
            'base_metadata_matches_live_snapshot':pr['base']['sha']==current_base if current_base else None,
            'comparison_base_sha':current_base,
            'merge_base_shas':source['merge_bases'],
            'multiple_merge_bases':source['ambiguous_merge_base'],
            'current_base_is_ancestor_of_head':current_base_contained,
            'nonmain_base_tip_already_in_main':bool(current_base and pr['base']['ref']!='main' and current_base in main_reachable),
            'dependency_status':dependency_status, 'next_action':dependency_action,
            'direct_base_prs':direct_parents, 'direct_base_pr_relationships':relationships,
            'strict_ancestor_open_prs':parents,
            'changed_path_count':len(indexes), 'non_document_changed_path_count':len(non_docs),
            'diff_applicable':bool(current_base and source['merge_bases']),
            'advertised_base_diff':{
                'base_sha':pr['base']['sha'], 'merge_base_shas':advertised_source['merge_bases'],
                'changed_path_count':len(advertised_source['delta']),
                'non_document_changed_path_count':sum(not is_documentation(p) for p in advertised_source['delta']),
                'use':'Historical API metadata only; current overlaps use comparison_base_sha.',
            }, 'qualified':False,
        })
        pr_path_records.append({
            'pr':number, 'head_sha':sha, 'base_sha':current_base, 'base_ref':pr['base']['ref'],
            'base_metadata_matches_live_snapshot':pr['base']['sha']==current_base if current_base else None,
            'diff_basis':'frozen-current-base-ref-tip',
            'path_indices':sorted(indexes), 'non_document_path_indices':sorted(non_docs),
            'source_state_indices':[state_index[(p,source['delta'][p]['state'][0],source['delta'][p]['state'][1] or '')] for p in sorted(source['delta'])],
        })
        advertised_pr_path_records.append({
            'pr':number, 'head_sha':sha, 'base_sha':pr['base']['sha'],
            'diff_basis':'advertised-API-base-metadata',
            'path_indices':[path_index[p] for p in sorted(advertised_source['delta'])],
            'non_document_path_indices':[path_index[p] for p in sorted(advertised_source['delta']) if not is_documentation(p)],
            'source_state_indices':[state_index[(p,advertised_source['delta'][p]['state'][0],advertised_source['delta'][p]['state'][1] or '')] for p in sorted(advertised_source['delta'])],
        })
    pair_counts = []
    for left,right in itertools.combinations(sorted(pr_path_sets),2):
        overlap = pr_path_sets[left]&pr_path_sets[right]
        if overlap:
            pair_counts.append({'left_pr':left, 'right_pr':right, 'changed_path_overlap':len(overlap),
                                'non_document_path_overlap':sum(not is_documentation(paths[p]) for p in overlap)})

    progress('Run Git stable patch IDs for all reachable non-document nonmerge history')
    common_log = ['log','--full-history','--no-merges','--root','--no-renames','--no-ext-diff','--no-textconv']
    def touched_paths(specs):
        data = git.run(*common_log,'--format=','--name-only','-z',*frozen_heads,'--',*specs)[1]
        return {p.decode('utf-8','surrogateescape') for p in data.split(b'\0') if p}
    all_touched = touched_paths([])
    filtered_touched = touched_paths(non_document_pathspec())
    expected_touched = {p for p in all_touched if not is_documentation(p)}
    if filtered_touched != expected_touched:
        raise RuntimeError('Git/Python documentation policy mismatch: '+repr(sorted(filtered_touched^expected_touched)[:20]))
    commit_pairs = git.patch_ids(common_log+['--format=%H','-p','--binary','--full-index']+frozen_heads+['--']+non_document_pathspec())
    commit_patch = {}
    for pid,commit in commit_pairs:
        if commit in commit_patch and commit_patch[commit] != pid:
            raise RuntimeError('One commit yielded inconsistent patch IDs')
        if commit not in all_reachable:
            raise RuntimeError('Patch commit outside frozen reachability')
        commit_patch[commit] = pid
    nonmerge_commits = sorted(set(git.lines('rev-list','--no-merges',*frozen_heads)))
    if not set(commit_patch) <= set(nonmerge_commits):
        raise RuntimeError('Merge commit entered patch table')
    commit_index = {c:i for i,c in enumerate(nonmerge_commits)}
    by_patch, main_by_patch = defaultdict(list), defaultdict(list)
    for commit,pid in commit_patch.items():
        by_patch[pid].append(commit)
        if commit in main_reachable:
            main_by_patch[pid].append(commit)
    for values in list(by_patch.values())+list(main_by_patch.values()):
        values.sort()

    progress('Compute stable net-delta patches and per-branch history matches')
    eligible = sorted({b['sha'] for b in branches if b['name'] not in metadata_names and b['name'] != 'gh-pages'
                       and len(sources[b['sha']]['merge_bases']) == 1
                       and any(not is_documentation(p) for p in sources[b['sha']]['delta'])})
    def net_patch(sha):
        source = sources[sha]
        pairs = git.patch_ids(['diff','--no-ext-diff','--no-textconv','--no-renames','--binary','--full-index',
                              source['merge_bases'][0],sha,'--']+non_document_pathspec())
        if len(pairs)>1:
            raise RuntimeError('One net diff yielded multiple patch IDs')
        return sha,pairs[0][0] if pairs else None
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        net_patches = dict(pool.map(net_patch,eligible))
        ahead_commits = dict(pool.map(lambda sha:(sha,git.lines('rev-list','--no-merges',baseline+'..'+sha)),sorted(sources)))
    net_groups = defaultdict(list)
    branch_patch_records = []
    for record in branch_records:
        sha,name = record['head_sha'],record['name']
        pid = net_patches.get(sha)
        if pid:
            net_groups[pid].append(record['branch_index'])
        commits = ahead_commits[sha]
        with_patch = [c for c in commits if c in commit_patch]
        matching = [c for c in with_patch if commit_patch[c] in main_by_patch]
        unmatched = sorted(set(with_patch)-set(matching))
        record['patch_evidence'] = {
            'applicable_to_source_recovery':record['source_diff_applicable'], 'net_delta_patch_id':pid,
            'net_delta_patch_matches_main_commits':main_by_patch.get(pid,[]),
            'nonmerge_ahead_commits':len(commits), 'non_document_patch_commits':len(with_patch),
            'non_document_patch_commits_matching_main':len(matching),
            'non_document_patch_commits_not_matching_main':len(unmatched),
            'no_non_document_patch_commits':len(commits)-len(with_patch),
            'patch_matches_do_not_establish_supersession':True,
        }
        branch_patch_records.append({
            'branch_index':record['branch_index'], 'name':name, 'net_delta_patch_id':pid,
            'nonmerge_ahead_commit_indices':sorted(commit_index[c] for c in commits),
            'matching_main_patch_commit_indices':sorted(commit_index[c] for c in matching),
            'unmatched_non_document_patch_commit_indices':sorted(commit_index[c] for c in unmatched),
        })

    same_heads,same_trees = defaultdict(list),defaultdict(list)
    for record in branch_records:
        same_heads[record['head_sha']].append(record['branch_index'])
        same_trees[record['tree_sha']].append(record['branch_index'])
    provenance = {
        'schema':SCHEMA, 'repository':snapshot['repository'], 'observed_at_utc':snapshot['observed_at_utc'],
        'frozen_main':baseline, 'snapshot_sha256':hashlib.sha256(snapshot_bytes).hexdigest(),
        'generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'git_version':git.text('--version').strip(),
    }
    policies = {
        'donor_diff':'Complete changed-path union of exact merge-base(s)..frozen donor head. No old-tip-to-new-main deletion inference. Renames are add/delete.',
        'pr_diff':'Resolve each advertised base.ref against the frozen branch inventory and compare that exact current base-tip SHA with the advertised exact head. base_sha/comparison_base_sha are the frozen current tip. Advertised API base.sha and its separate diff are provenance only. Missing current base refs remain unresolved.',
        'documentation':{'directories':['docs/','doc/','.agents/'], 'suffixes_case_insensitive':list(DOC_SUFFIXES),
                         'basenames_case_insensitive':[n+s for n in DOC_NAMES for s in DOC_NAME_SUFFIXES],
                         'other_paths':'Workflow, config, dependency, test and asset files remain non-document unless an explicit documentation rule matches.'},
        'content_equality':'All non-document donor changed-path final modes and Git object IDs (or absence) equal target states; unchanged paths, whole trees and semantics are not asserted.',
        'history_containment':'Donor tip reachable from candidate head; does not establish surviving current behavior, required checks or review approval.',
        'self_candidate':'Equal-SHA PRs are listed separately and excluded from strict containment and other-candidate content classification.',
        'patch_ids':'Actual git patch-id --stable on binary/full-index, non-renamed, non-document diffs. Git normalizes whitespace and line numbers. Matches never auto-supersede, qualify or release ownership. Empty/doc-only patches are not equivalence evidence.',
        'metadata':'Sparse integration-lock metadata and gh-pages publication refs are not product source recovery candidates.',
    }
    counts = dict(sorted(Counter(b['classification'] for b in branch_records).items()))
    verification = {
        'all_frozen_commit_objects_present':len(frozen_heads),
        'all_snapshot_branches_accounted_for':len(branch_records)==len(branches),
        'all_open_prs_accounted_for':len(pr_records)==len(prs), 'main_ancestry_count_invariant':True,
        'pr_overlap_uses_frozen_current_base_ref_tip':True,
        'git_python_document_path_policy_equal':filtered_touched==expected_touched,
        'unique_history_paths_checked_for_policy':len(all_touched),
        'all_nonmerge_patch_commits_within_frozen_reachability':True,
        'branch_name_used_as_git_comparison_operand':False, 'api_file_truncation':False,
        'qualification_inferred':False, 'remote_mutations':False,
    }
    summary = {
        'branches':len(branches), 'open_prs':len(prs), 'classification_counts':counts,
        'unique_frozen_commit_objects':len(frozen_heads), 'reachable_commits':len(all_reachable),
        'reachable_nonmerge_commits':len(nonmerge_commits), 'non_document_commit_patches':len(commit_patch),
        'net_delta_patch_groups_with_multiple_branches':sum(len(v)>1 for v in net_groups.values()),
        'branch_deltas_over_300_paths':sum(b['changed_path_count']>300 for b in branch_records),
        'pr_deltas_over_300_paths':sum(p['changed_path_count']>300 for p in pr_records),
        'pr_base_metadata_mismatches':sum(p['base_metadata_matches_live_snapshot'] is False for p in pr_records),
        'pr_base_refs_missing_from_snapshot':sum(p['base_ref_snapshot_sha'] is None for p in pr_records),
        'pr_nonmain_base_tips_already_in_main':sum(p['nonmain_base_tip_already_in_main'] for p in pr_records),
        'pr_head_metadata_mismatches':sum(p['head_metadata_matches_live_snapshot'] is False for p in pr_records),
        'overlapping_pr_pairs':len(pair_counts),
    }
    ledger = dict(provenance, policies=policies, snapshot_pagination=snapshot.get('pagination'), summary=summary,
                  verification=verification, branches=branch_records, pull_requests=pr_records,
                  equal_head_groups=[{'head_sha':sha,'branch_indices':ids} for sha,ids in sorted(same_heads.items()) if len(ids)>1],
                  equal_tree_groups=[{'tree_sha':sha,'branch_indices':ids} for sha,ids in sorted(same_trees.items()) if len(ids)>1],
                  companion_files={'paths_and_states':'branch-paths.json','patch_evidence':'patch-equivalence.json'})
    path_output = dict(provenance,
        encoding={'source_state_table_columns':['path_index','mode','object_id_or_null'],
                  'source_state_indices':'Aligned with sorted path_indices; exact final state after donor changes.',
                  'overlaps':'Complete per-PR path sets and inverted path index recover every overlapping path; pair counts are untruncated.',
                  'mode_000000':'Absent/deleted path; matching requires target absence.'},
        path_table=[{'path':p,'documentation':is_documentation(p),
                     'main_mode':main_tree.get(p,ABSENT)[0],'main_object':main_tree.get(p,ABSENT)[1]} for p in paths],
        source_state_table=[[path_index[p],mode,oid or None] for p,mode,oid in state_keys],
        branches=branch_path_records, pull_requests=pr_path_records, advertised_base_pull_requests=advertised_pr_path_records,
        pr_overlap_by_path=[{'path_index':i,'prs':numbers} for i,numbers in sorted(path_prs.items()) if len(numbers)>1],
        pr_pair_overlap_counts=pair_counts)
    patch_output = dict(provenance, policy=policies['patch_ids'], documentation_policy=policies['documentation'],
        coverage={'frozen_head_count':len(frozen_heads),'all_reachable_commits':len(all_reachable),
                  'nonmerge_commits':len(nonmerge_commits),'non_document_patch_commits':len(commit_patch),
                  'commits_without_non_document_patch':len(nonmerge_commits)-len(commit_patch),
                  'all_touched_paths':len(all_touched),'non_document_touched_paths':len(filtered_touched),
                  'documentation_pathspec_verified':True},
        commit_table=[{'sha':c,'patch_id':commit_patch.get(c),'in_main_history':c in main_reachable} for c in nonmerge_commits],
        duplicate_commit_patch_groups=[{'patch_id':pid,'commit_indices':sorted(commit_index[c] for c in cs),
                                       'main_commit_indices':sorted(commit_index[c] for c in main_by_patch.get(pid,[]))}
                                      for pid,cs in sorted(by_patch.items()) if len(cs)>1],
        duplicate_net_delta_patch_groups=[{'patch_id':pid,'branch_indices':ids} for pid,ids in sorted(net_groups.items()) if len(ids)>1],
        branches=branch_patch_records)
    assert len(branch_path_records)==len(branch_patch_records)==len(branch_records)
    assert {b['name'] for b in branch_records} == {b['name'] for b in branches}
    assert sum(counts.values())==len(branches)
    assert all(p['comparison_base_sha']==branch_head_by_name.get(p['base_ref']) for p in pr_records)
    for record,data in zip(branch_records,branch_path_records):
        assert record['changed_path_count']==len(data['path_indices'])==len(data['source_state_indices'])
        assert [path_output['source_state_table'][i][0] for i in data['source_state_indices']]==data['path_indices']
    args.output_dir.mkdir(parents=True,exist_ok=True)
    outputs = {'branch-ledger.json':ledger,'branch-paths.json':path_output,'patch-equivalence.json':patch_output}
    sizes = {}
    for name,data in outputs.items():
        content = json.dumps(data,ensure_ascii=True,separators=(',',':'))+'\n'
        (args.output_dir/name).write_text(content,encoding='utf-8')
        sizes[name] = len(content.encode())
    progress('All source invariants passed; complete artifacts written')
    print(json.dumps({'summary':summary,'verification':verification,'output_bytes':sizes},indent=2))


if __name__ == '__main__':
    main()
