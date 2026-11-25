import argparse,collections,concurrent.futures,csv,datetime,gzip,hashlib,io,json,pathlib,subprocess
ROOT=pathlib.Path('/workspace/scratch/f80482f352bc')
IN=ROOT/'branch-index-current-main-20261124'
FROZEN=ROOT/'branch-index-final-698'
OBJ=ROOT/'branch-index-refresh-objects.git'
p=argparse.ArgumentParser()
p.add_argument('--candidate',default='7852931fecc8bdd2ab17e3e70813f36e502c50b0')
p.add_argument('--remote-source',default='851e86ce8b6fed659e499e69d1c174b86b646e4c')
p.add_argument('--output',type=pathlib.Path,default=IN)
p.add_argument('--diagnostics-evidence',default='Separately assigned bounded recovery; final qualification is pending.')
args=p.parse_args();OUT=args.output;OUT.mkdir(exist_ok=True)
MAIN='cc090bf80bbf35c1db81ecbe6acae694a518bed0';CORE='87bee07895679deaef345c3dd4aaf2e8f8651f1c';BDA='bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8'
LOCAL,REMOTE=args.candidate,args.remote_source
def git(*a):return subprocess.check_output(['git','--git-dir='+str(OBJ),*a],text=True).rstrip('\n')
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(n,x):(OUT/n).write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n')
def changed(a,b):return git('diff','--no-ext-diff','--no-textconv','--name-only','--no-renames',a,b).splitlines()
def entry(c,p):return git('ls-tree',c,'--',p) or None
snapshot=load(IN/'REMOTE_SNAPSHOT.json');refs=snapshot['refs'];changes=load(IN/'REF_CHANGES.json')
assert len(refs)==len({x['branch'] for x in refs})==699
assert next(x['head'] for x in refs if x['branch']=='main')==MAIN
assert git('rev-parse',LOCAL+'^{tree}')==git('rev-parse',REMOTE+'^{tree}')
assert git('rev-parse',MAIN+'^{tree}')==git('rev-parse',CORE+'^{tree}')
frozen=list(csv.DictReader(io.StringIO((FROZEN/'BRANCH_INDEX_698.csv').read_text())));old={r['branch']:r for r in frozen}
with gzip.open(IN/'STRUCTURAL_MAIN.json.gz','rt') as f:census=json.load(f)
assert census['main']==MAIN
struct={r['branch']:r for r in census['branches']};assert set(struct)=={r['branch'] for r in refs}
targets=dict(current_main=MAIN,published_core=CORE,final_local=LOCAL,final_remote_source=REMOTE)
anc={k:set(git('rev-list',v).splitlines()) for k,v in targets.items()}
units=load(IN/'CURRENT_SELECTIONS.json');unitmap={u['branch']:u for u in units}
for u in units:
 u['donor_ancestor_local']=u['donor'] in anc['final_local'];u['donor_ancestor_remote']=u['donor'] in anc['final_remote_source']
 u['entries']=[dict(path=x,donor=entry(u['donor'],x),candidate=entry(LOCAL,x)) for x in u['paths']]
 assert all(e['donor']==e['candidate'] for e in u['entries'])
 assert u['selected_commit'] in anc['final_local']
assert not units[1]['donor_ancestor_remote'] and not units[2]['donor_ancestor_remote']
diag=load(IN/'DEPLOYMENT_DIAGNOSTIC_REVIEW.json');diagpaths=[r['path'] for r in diag['entries']]
diagselected=all(entry(LOCAL,x)==entry(diag['source'],x) for x in diagpaths)
diag['current_callers']='No current production callers; only tests call this retained helper. No live UI banner is activated by the bounded recovery.'
diag['selected_in_updated_candidate']=diagselected;diag['updated_candidate']=LOCAL;diag['later_qualification']=args.diagnostics_evidence
save('DEPLOYMENT_DIAGNOSTIC_REVIEW.json',diag)
def compare(r):
 allcode=sorted(set(r.get('code_paths',[]))|set(r.get('equal_code_paths',[])))
 if not allcode:return r['head'],dict(donor_code_paths=[],remaining_candidate_code_paths=[])
 different=set(changed(LOCAL,r['head']))
 return r['head'],dict(donor_code_paths=allcode,remaining_candidate_code_paths=[p for p in allcode if p in different])
unique={r['head']:r for r in struct.values()}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:candidate=dict(pool.map(compare,unique.values()))
model=dict(source=LOCAL,tree=git('rev-parse',LOCAL+'^{tree}'),uncapped=True,records=[dict(head=h,**candidate[h]) for h in sorted(candidate)])
(OUT/'STRUCTURAL_CANDIDATE.json.gz').write_bytes(gzip.compress((json.dumps(model,separators=(',',':'))+'\n').encode(),mtime=0))
rows=[]
for ref in refs:
 name,head=ref['branch'],ref['head'];previous=old.get(name,{});s=struct[name];c=candidate[head]
 disposition=previous.get('current_disposition','new_ref_pending');scope=previous.get('selected_or_equivalent_scope','');gap=previous.get('remaining_gap','')
 evidence=['STRUCTURAL_MAIN.json.gz','STRUCTURAL_CANDIDATE.json.gz','../branch-index-final-698/BRANCH_INDEX_698.csv']
 if name=='main':disposition,scope,gap='current_main','Core #611 is merged. Current main has parents706188+87bee and the exact87bee tree.',''
 elif head in anc['current_main']:disposition,scope,gap='integrated_current_main_ancestry','Exact snapshot head is in current-main history. Merge resolutions may retain stronger postimages; ancestry is not a feature count.',''
 elif head in anc['final_remote_source'] or head in anc['final_local']:
  disposition='selected_final_candidate_ancestry';scope=(scope+' ' if scope else '')+'Exact head is retained in candidate history; whole-file identity is a separate fact.';gap='Fresh applicable hosted qualification of the final combined source remains required before promotion.'
 elif s['status']=='code-tree-equivalent':disposition,scope,gap='code_delta_equivalent_current_main','All authored code/test/config delta postimages match current main by mode/type/content.',''
 elif s['status']=='evidence-only':disposition,scope,gap='evidence_only','','Uncapped all-merge-base delta is documentation/evidence only; historical observations do not qualify current application source.'
 elif s['status']=='no-net-delta':disposition,scope,gap='no_net_delta','No authored tree delta remains from the merge bases with current main.',''
 elif c['donor_code_paths'] and not c['remaining_candidate_code_paths']:
  disposition,scope,gap='code_delta_equivalent_final_candidate','All authored code/test/config delta postimages match the selected candidate. Whole-head ancestry is tracked separately.','Fresh combined hosted gates remain separate from structural equality.'
 if disposition=='equivalent_main_delta':
  disposition='previously_main_equivalent_now_superseded'
  reason={'chatgpt/ghostpay-six-fixes-combined-20261112':'Scheduled cancellation now avoids terminal clock reads and uses one instant for expiry and timestamp.', 'chatgpt/zero-codex/ux-confirm-clock-boundary-20261111':'Scheduled cancellation now avoids terminal clock reads and uses one instant for expiry and timestamp.', 'chatgpt/zero-codex/pages-negative-fiat-regression-20261114':'Formatting retains the original behavior with later parseUnits and finite-time runtime guards.', 'chatgpt/zero-codex/ux-guide-plain-object-20261111':'Profile detection now treats extra settings keys as custom.'}[name]
  scope='Donor code postimages were already equivalent to706188. Current main supersedes one of those paths through the merged core: '+reason
  gap='No missing unique implementation remains in the superseded path; exact equality to current main is not claimed.';evidence+=['PRIOR_EQUIVALENCE_REFRESH.json']
 if name in unitmap:
  u=unitmap[name];disposition='selected_final_candidate_ancestry' if u['donor_ancestor_remote'] else 'selected_bounded_tooling_subset';scope=u['scope'];gap=u['qualification']+' Fresh final-head hosted gates remain required.';evidence+=u['evidence']+['SELECTION_OVERLAY.json']
 if name=='automation/ghostpay-integration-lock':
  disposition,scope,gap='coordination_only','Lease generation18 release at c69bca; incremental change is one coordination file.','Dedicated coordination history is not an application merge candidate.';evidence+=['REF_COMPARISONS.json']
 if name=='gh-pages':disposition,scope,gap='deployment_history','','Generated deployment history is separate from application-source integration.'
 if name=='dependabot/npm_and_yarn/npm-minor-patch-f6308e442e':
  disposition,scope='held_dependency_build_incompatible',''
  gap='Current51160bcb is based on current main and changes68 manifest/lock paths. Exact-head CI45400074310/job138466092956 fails confidential-amounts build with TS2322 at zama-sdk.ts between nestedViem2.58.4 and rootViem2.57.13. Reconcile SDK/Viem types and a matching lock, retain selected cookie0.7.2, then qualify the dependency train. Build/native qualification is not reached.'
  evidence+=['DEPENDABOT_DIFF.json','DEPENDABOT_FAILED_BUILD.log','DEPENDABOT_CI_JOBS.json']
 elif '#493' in gap:
  gap+=' Current related #493 @51160bcb has a concrete SDK/Viem TS2322 build failure; this does not independently diagnose every older related head.';evidence+=['DEPENDABOT_FAILED_BUILD.log']
 if name=='automation/20261124T1237Z/bug/deployment-diagnostic-fixture':
  disposition='selected_diagnostic_subset_parent_remainder_held' if diagselected else 'eligible_bounded_diagnostic_candidate_pending'
  scope=('Exact three-file diagnostic utility/test subset selected. ' if diagselected else 'Independent three-file diagnostic utility/test unit identified, not yet selected at7852931. ')+'No current production caller and no live banner activation. Whole #570/#619 histories are not selected.'
  gap=args.diagnostics_evidence if diagselected else 'Neutral-message deployment.ts and its companion regression from #570 must accompany corrected hardening.test.ts from #619. Separate current qualification assigned; broad privacy/export remainder remains held.'
  evidence+=['DEPLOYMENT_DIAGNOSTIC_REVIEW.json','DEPLOYMENT_DIAGNOSTIC_BOUNDED.patch']
 if name=='codex/286-private-export-surfaces':
  disposition='selective_recovery_residual_held' if diagselected else 'held_runtime_contract_with_bounded_candidate'
  scope=('The diagnostic utility/test subset is selected. ' if diagselected else 'The diagnostic utility/test subset is independently eligible and assigned for qualification. ')+'No current production caller; whole #570 head remains unmerged.'
  gap='Other download/export/notification privacy changes intersect clipboard/masking grants and #572 verification authority across #580/#613; broad composition remains unqualified. Diagnostic subset tracked under #619.';evidence+=['DEPLOYMENT_DIAGNOSTIC_REVIEW.json']
 scope=scope.replace('Represented in selected source; not in snapshot main.','Represented in selected source; current-main ancestry and exact postimage comparisons are reported separately.')
 assert scope or gap,name
 row={k:previous.get(k,'') for k in ['baseline_head','baseline_census_status','baseline_disposition','baseline_prs']}
 row=dict(branch=name,**row,frozen_698_head=previous.get('head',''),frozen_698_disposition=previous.get('current_disposition',''),head=head,prs='619' if name.startswith('automation/20261124T1237Z/') else previous.get('prs',''),ref_change='new' if not previous else 'advanced' if previous['head']!=head else 'unchanged',ancestor_current_main=head in anc['current_main'],ancestor_published_core=head in anc['published_core'],ancestor_final_local=head in anc['final_local'],ancestor_final_remote_source=head in anc['final_remote_source'],current_main_structural_status=s['status'],all_best_merge_bases=';'.join(s.get('all_best_merge_bases',[head] if s['status'] in ['ancestor','main'] else [])),ahead_current_main=s.get('ahead',''),behind_current_main=s.get('behind',''),donor_delta_code_path_count=len(c['donor_code_paths']),remaining_code_path_count_main=len(s['code_paths']),remaining_code_path_count_candidate=len(c['remaining_candidate_code_paths']),current_disposition=disposition,selected_or_equivalent_scope=scope,remaining_gap=gap,evidence=';'.join(dict.fromkeys(evidence)))
 rows.append(row)
index={r['branch']:r for r in rows}
for r in frozen:
 for k in ['baseline_head','baseline_census_status','baseline_disposition','baseline_prs']:assert index[r['branch']][k]==r[k]
 assert index[r['branch']]['frozen_698_head']==r['head']
save('INDEX_DATA.json',dict(columns=list(rows[0]),rows=rows))
historic=load(FROZEN/'RESIDUAL_OVERLAY.json')
save('SELECTION_OVERLAY.json',dict(format='ghostpay-additive-selection-overlay/2',source=LOCAL,remote_source=REMOTE,main=MAIN,branch_observation=snapshot['observed_at'],newly_selected_units=units,diagnostic_subset_selected=diagselected,diagnostic_qualification=args.diagnostics_evidence,historical67=[dict(historical=r,current=index[r['branch']]) for r in historic['rows']],additional_rows=[index[n] for n in sorted(set(unitmap)|{'automation/20261124T1237Z/bug/deployment-diagnostic-fixture','codex/286-private-export-surfaces','dependabot/npm_and_yarn/npm-minor-patch-f6308e442e'})]))
counts={k:sum(r['head'] in v for r in refs) for k,v in anc.items()};unique_counts={k:len({r['head'] for r in refs}&v) for k,v in anc.items()}
extensions=changed(BDA,LOCAL)
source=dict(format='ghostpay-current-main699-index/2',generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),branch_observation=snapshot['observed_at'],row_count=len(rows),unique_head_count=len(unique),main=MAIN,main_tree=git('rev-parse',MAIN+'^{tree}'),main_parents=git('show','-s','--format=%P',MAIN).split(),main_commit_date=git('show','-s','--format=%cI',MAIN),published_core=CORE,source=LOCAL,remote_equivalent_source=REMOTE,tree=git('rev-parse',LOCAL+'^{tree}'),remote_parents=git('show','-s','--format=%P',REMOTE).split(),ancestry_row_counts=counts,ancestry_unique_head_counts=unique_counts,structural_status_counts=census['counts'],disposition_counts=dict(sorted(collections.Counter(r['current_disposition'] for r in rows).items())),ref_changes=changes,historical_files=[dict(path=str(FROZEN/n),sha256=sha(FROZEN/n)) for n in ['BRANCH_INDEX_698.csv','SOURCE.json','RESIDUAL_OVERLAY.json','HISTORICAL_67.json']],source_specific_application_coverage=BDA,extension_paths=extensions,app_runtime_package_sources_equal_bda=not any(x.startswith(('apps/web/src/','packages/')) for x in extensions),diagnostic_subset_selected=diagselected,remote_publication='Immutable remote object exists; no final followup ref/PR at this cutoff. Later publication is separate.',limits=['Git ancestry and exact mode/type/blob postimages are separate from semantic selection and qualification.','Counts are refs/heads/paths, not features.','Whole #358/#468 donor heads are not ancestors; five exact files were selected.','Historical PR associations are retained; not a fresh all-PR-state census.','No baseline20MB archive duplication, root repository writes, remote mutation, or application tests.','Fresh final combined hosted gates remain required.'])
save('SOURCE.json',source)
save('VERIFY.json',dict(rows=len(rows),unique_branches=len(index),exact_snapshot_refs=True,baseline_fields_preserved=True,frozen698_rows_preserved=698,historical67_rows_preserved=67,actual_ancestry_counts=counts,remote_and_local_tree_equal=True,core_and_main_tree_equal=True,csv_validation='pending',tests_run=False))
lines=['# Current-main branch accounting — 2026-11-24','','**699 branches / 693 unique heads**, cutoff '+snapshot['observed_at']+'.','',f'Current main `{MAIN}` contains core #611. Local source `{LOCAL}` and remote equivalent `{REMOTE}` share tree `{source["tree"]}`. No final followup ref or PR existed at the cutoff.','','| Target | Ref rows in ancestry | Unique heads |','| --- | ---: | ---: |']
for k in targets:lines.append(f'| {k} | {counts[k]} | {unique_counts[k]} |')
lines+=['','These are ancestry counts, not feature counts. #358/#468 are selected as five exact source/test files, without merging their entire historical heads.','','## Ref changes','','One new branch: #619 deployment diagnostic fixture3107b816. Three advanced refs: main706188→cc090bf8; integration lock89107c26→c69bca41 (generation18 released); #49314635ec8→51160bcb. None deleted. Ledger remains21009fb4. Later automation lies outside this cutoff.','','## Selection and remaining gates','','#377 scoped cookie repair, #358/#468 read-only tooling, and #578 HTTPS compatibility coverage are composed. Their exact donor files and source-specific receipts are in SELECTION_OVERLAY.json. Fresh applicable final-head hosted qualification remains mandatory. The prior bda2af application-coverage result is retained with its source pin.','','#619 is '+('selected as a bounded three-file retained utility/test subset. '+args.diagnostics_evidence if diagselected else 'an eligible bounded three-file retained utility/test recovery assigned for separate qualification; it is not yet selected at7852931.')+' The helper has no current production callers. No live UI banner activation is claimed. Broad #570 privacy/export remainder remains held.','','#493 has a concrete exact-head SDK/Viem TS2322 build failure in confidential-amounts. DEPENDABOT_FAILED_BUILD.log records the failure; current source changes68 manifest/lock paths. It needs coherent SDK/Viem and lock reconciliation followed by qualification, not a blanket ownership hold.','','## Files and scope','','INDEX_DATA.json and the CSV cover every cutoff ref. STRUCTURAL_MAIN.json.gz and STRUCTURAL_CANDIDATE.json.gz contain complete uncapped path comparisons. REF_COMPARISONS.json retains full raw mode/blob deltas for every new/advanced ref. SELECTION_OVERLAY.json preserves all original67 findings as history with an additive current row. Frozen698 history remains unchanged and is referenced by hash; its old20MB census archive is not copied.','','No application testing or repository/remote mutation was performed for this inventory. Re-run build-current699-overlay.py with final --candidate and --remote-source pins to refresh semantic/source overlay without another remote census.']
(OUT/'README.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(dict(rows=len(rows),columns=len(rows[0]),ancestry_rows=counts,unique_heads=unique_counts,diagnostic_selected=diagselected),indent=2))
