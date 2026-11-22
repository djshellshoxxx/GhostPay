import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffTrees, classifyBranch, paginate, audit, summarize, makeGitHubReader } from '../consolidation/branch-disposition.mjs';

const S = (ch) => ch.repeat(40);
const file = (path, sha, mode='100644') => ({type:'blob', path, sha, mode});
const tree = (...entries) => ({truncated:false,tree:entries});

test('full trees capture changes beyond compare 300-file cap and deletes', () => {
  const base = tree(...Array.from({length:350},(_,i)=>file(`src/${i}.ts`,S('a'))));
  const next = tree(...Array.from({length:349},(_,i)=>file(`src/${i}.ts`, i===325?S('b'):S('a'))));
  const d = diffTrees(base,next);
  assert.equal(d.complete,true);
  assert.deepEqual(d.paths.map(x=>x.path),['src/325.ts','src/349.ts']);
  assert.deepEqual(d.paths.map(x=>x.status),['changed','deleted']);
});

test('tree mode changes are meaningful and truncation is explicitly unresolved', () => {
  assert.equal(diffTrees(tree(file('run',S('a'),'100644')),tree(file('run',S('a'),'100755'))).paths.length,1);
  const d = diffTrees({truncated:true,tree:[]},tree());
  assert.equal(d.complete,false);
  assert.equal(classifyBranch({compare:{status:'ahead',ahead_by:1},diff:d}).disposition,'indeterminate');
});

test('ancestor and exact tree equivalence do not become unique functionality', () => {
  const identical = {complete:true,paths:[]};
  assert.equal(classifyBranch({compare:{status:'behind',ahead_by:0},diff:identical}).disposition,'ancestor-in-main');
  assert.equal(classifyBranch({compare:{status:'diverged',ahead_by:8},diff:identical}).disposition,'tree-equivalent');
});

test('docs-only and open PRs distinguish unresolved work', () => {
  const compare={status:'ahead',ahead_by:2};
  assert.equal(classifyBranch({compare,diff:{complete:true,paths:[{path:'docs/notes.md'}]}}).disposition,'documentation-or-evidence-only');
  assert.equal(classifyBranch({compare,diff:{complete:true,paths:[{path:'src/fee.ts'}]},ownerPrs:[{number:12}]}).disposition,'unique-under-active-pr');
  assert.equal(summarize([{disposition:'indeterminate',reviewRequired:true},{disposition:'ancestor-in-main',reviewRequired:false}]).unresolved,1);
});

test('pagination includes last full page and validates the terminating empty page',async()=>{
  const hits=[];
  const got=await paginate(async url=>{const page=Number(new URL(url,'https://api.github.com').searchParams.get('page'));hits.push(page);return page<=2?[page]:[]},'/repos/o/r/branches',1);
  assert.deepEqual(got,[1,2]); assert.deepEqual(hits,[1,2,3]);
});

test('audit is source-pinned, PR-aware, resumable and detects stale branch heads',async()=>{
  const m=S('a'),h=S('b'),t=S('c'),record=S('d'); let head=h, lookups=0;
  const read=async(route)=>{
    if(route.endsWith('/git/ref/heads/main'))return {object:{sha:m}};
    if(route.endsWith('/git/ref/heads/topic')) return {object:{sha:head}};
    if(route.includes('/branches?'))return route.includes('page=1')?[{name:'main',commit:{sha:m}},{name:'topic',commit:{sha:h}}]:[];
    if(route.includes('/pulls?')) return route.includes('page=1')?[{number:6,title:'fix',head:{ref:'topic',sha:h},base:{ref:'main'},draft:true,state:'open'}]:[];
    if(route.includes('/compare/'))return {status:'ahead',ahead_by:1,behind_by:0,merge_base_commit:{sha:m},files:Array(300).fill({filename:'dummy'})};
    if(route.includes(`/git/commits/${m}`))return {tree:{sha:t}};
    if(route.includes(`/git/commits/${h}`))return {tree:{sha:record}};
    if(route.includes(`/git/trees/${t}`)) {lookups++;return tree(file('src/index.ts',S('f')))};
    if(route.includes(`/git/trees/${record}`))return tree(file('src/index.ts',S('e')));
    throw new Error(`Unexpected ${route}`)
  };
  const first=await audit({read,repo:'o/r',now:()=> '2026-11-22T12:00:00Z'});
  assert.equal(first.branches,2);assert.equal(first.openPRs,1);assert.equal(first.counts['unique-under-active-pr'],1);
  assert.equal(first.records[1].compareFileListMayBeCapped,true);
  assert.equal(first.records[1].completeTree,true);assert.equal(first.records[1].openPrs[0],6);
  const resumed=await audit({read,repo:'o/r',prior:first});
  assert.equal(resumed.scannedThisRun,0);assert.equal(lookups,1);
  head=m;
  const changed=await audit({read,repo:'o/r'});
  assert.equal(changed.records[1].disposition,'scan-error');
});

test('API reader never leaks response body or token in failures',async()=>{
  const token='super-secret';
  const read=makeGitHubReader({token,fetchImpl:async(_url,options)=>{assert.equal(options.headers.Authorization,`Bearer ${token}`);return {ok:false,status:403,headers:{get:()=>null}}}});
  await assert.rejects(read('/repos/x/y/branches'),e=>!e.message.includes(token)&&e.message.includes('403'));
  await assert.rejects(read('https://example.com/exfiltrate'),/Cross-origin/);
});

test('fork PR with same branch name does not claim local repository path',async()=>{
  const m=S('a'), h=S('b'), t=S('c'), u=S('d');
  const read=async route=>{
    if(route.endsWith('/git/ref/heads/main'))return {object:{sha:m}};
    if(route.endsWith('/git/ref/heads/topic'))return {object:{sha:h}};
    if(route.includes('/branches?'))return route.includes('page=1')?[{name:'main',commit:{sha:m}},{name:'topic',commit:{sha:h}}]:[];
    if(route.includes('/pulls?'))return route.includes('page=1')?[{number:91,head:{ref:'topic',sha:h,repo:{full_name:'outsider/GhostPay'}},base:{ref:'main'},state:'open',draft:false}]:[];
    if(route.includes('/compare/'))return {status:'ahead',ahead_by:1,behind_by:0};
    if(route.includes(`/git/commits/${m}`))return {tree:{sha:t}};
    if(route.includes(`/git/commits/${h}`))return {tree:{sha:u}};
    if(route.includes(`/git/trees/${t}`))return tree(file('src/index.ts',S('e')));
    if(route.includes(`/git/trees/${u}`))return tree(file('src/index.ts',S('f')));
    throw new Error(`Unexpected ${route}`)
  };
  const result=await audit({read,repo:'o/r'});
  assert.equal(result.records[1].disposition,'unique-needs-review');
  assert.deepEqual(result.records[1].openPrs,[]);
});
