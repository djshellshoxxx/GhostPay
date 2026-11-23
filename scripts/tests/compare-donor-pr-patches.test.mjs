import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDonorPrPatches as compare } from '../consolidation/compare-donor-pr-patches.mjs';
const h=(a='old',b='new',n=2)=>'@@ -'+n+',3 +'+n+',3 @@ x\n before\n-'+a+'\n+'+b+'\n after';
const f=(filename,patch,additions=1,deletions=1)=>({filename,status:'modified',patch,additions,deletions,changes:additions+deletions});
const input=(id,files)=>({id,changedFiles:files.length,files});
test('same patch with shifted hunk coordinates is covered',()=>{
  const r=compare(input('donor',[f('x',h())]),input('PR',[f('x',h('old','new',20))]));
  assert.equal(r.allDonorHunksPresent,true); assert.equal(r.covered.length,1);
});
test('subset within owner PR containing additional hunks and files is covered',()=>{
  const d=input('donor',[f('x',h())]);
  const p=input('PR',[f('x',h('other','fix',1)+'\n'+h('old','new',20),2,2),f('extra',h())]);
  const r=compare(d,p);
  assert.equal(r.allDonorHunksPresent,true); assert.equal(r.extraOwnerEdits.length,2);
});
test('different same-line content context is not proof',()=>{
  const d=input('donor',[f('x',h())]);
  const p=input('PR',[f('x',h().replace(' before',' unrelated'))]);
  assert.equal(compare(d,p).allDonorHunksPresent,false);
});
test('a matching patch on a different path is not proof',()=>{
  const r=compare(input('donor',[f('x',h())]),input('PR',[f('y',h())]));
  assert.deepEqual(r.unmatched,[{path:'x',missingDonorHunkIndices:[0]}]);
});
test('requires all donor hunks, even if one is duplicated',()=>{
  const d=input('donor',[f('x',h()+'\n'+h(),2,2)]);
  const r=compare(d,input('PR',[f('x',h())]));
  assert.deepEqual(r.unmatched[0].missingDonorHunkIndices,[1]);
});
test('requires every declared changed-file page, rejects malformed paths and status',()=>{
  const d=input('donor',[f('x',h())]);
  assert.throws(()=>compare(d,{id:'pr',changedFiles:2,files:[f('x',h())]}),/incomplete file inventory/);
  assert.throws(()=>compare(d,input('pr',[f('../bad',h())])),/unsupported file/);
  assert.throws(()=>compare(d,input('pr',[{...f('x',h()),status:'renamed'}])),/unsupported file/);
});
test('rejects absent, truncated and edit-count-mismatched patches',()=>{
  const d=input('donor',[f('x',h())]);
  for(const bad of [f('x',''),f('x',h(),2,1),f('x','@@ -2,3 +2,3 @@\n before\n-old\n+new'),f('x',h()+'\n\\ No newline at end of file')])
    assert.throws(()=>compare(d,input('pr',[bad])),/missing patch|patch count mismatch|incomplete or invalid hunk|unsupported patch line/);
});
test('rejects exact duplicate file inventory entries',()=>{
  const d=input('donor',[f('x',h())]);
  assert.throws(()=>compare(d,input('pr',[f('x',h()),f('x',h())])),/duplicate path/);
});

test('context-free hunks cannot prove source containment across divergent histories',()=>{
  const patch='@@ -2 +2 @@\n-old\n+new';
  assert.throws(()=>compare(input('donor',[f('x',patch)]),input('PR',[f('x',patch)])),/missing unchanged context/);
  assert.throws(()=>compare(input('donor',[f('x',h())]),input('PR',[f('x',patch)])),/missing unchanged context/);
});
