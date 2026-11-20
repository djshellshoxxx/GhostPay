import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const [input, verifier] = process.argv.slice(2);
assert.ok(input && verifier, 'usage: node hosted-artifact-probes.mjs <extracted-dir> <verifier-path>');
const commit = 'a7ceff94269cddfbc725677dd03737d96a449039';
const cases = [
  { name: 'intact exact-source hosted artifact', expected: 0 },
  { name: 'different SHA even with equivalent tree', expected: 1, expectedCommit: 'd74af79ebabdc8cead843361c3497b46d8c421f9', diagnostic: /unexpected source commit/ },
  { name: 'changed application bytes', expected: 1, mutate(site) { writeFileSync(join(site, 'index.html'), 'changed'); }, diagnostic: /SHA-256 mismatch/ },
  { name: 'extra executable file', expected: 1, mutate(site) { writeFileSync(join(site, 'unexpected.js'), 'throw new Error()'); }, diagnostic: /unlisted artifact file/ },
  { name: 'missing required file', expected: 1, mutate(site) { unlinkSync(join(site, '.nojekyll')); }, diagnostic: /required Pages file missing/ },
  { name: 'matching bytes through symlink', expected: 1, mutate(site, sums, root) { const p=join(site, 'index.html'); const outside=join(root, 'outside.html'); writeFileSync(outside,readFileSync(p));unlinkSync(p);symlinkSync(outside,p); }, diagnostic: /symlink refused/ },
  { name: 'duplicate manifest record', expected: 1, mutate(site,sums) {const text=readFileSync(sums,'utf8');writeFileSync(sums,text+text.split('\n')[0]+'\n');}, diagnostic: /duplicate SHA256SUMS record/ },
  { name: 'unsafe manifest traversal', expected: 1, mutate(site,sums) {writeFileSync(sums,readFileSync(sums,'utf8')+'0'.repeat(64)+'  ./../outside\n');}, diagnostic: /invalid or unsafe record/ },
  { name: 'ambiguous CRLF manifest', expected: 1, mutate(site,sums) {writeFileSync(sums,readFileSync(sums,'utf8').replaceAll('\n','\r\n'));}, diagnostic: /canonical LF-terminated/ },
  { name: 'manifest symlink', expected: 1, mutate(site,sums,root) {const outside=join(root,'manifest-outside');writeFileSync(outside,readFileSync(sums));unlinkSync(sums);symlinkSync(outside,sums);}, diagnostic:/must be a regular file/ },
  { name: 'invalid full commit argument', expected: 1, expectedCommit:'short', diagnostic:/full 40-hex SHA/ },
];
const results=[];
for (const item of cases) {
 const root=mkdtempSync(join(tmpdir(),'gp-independent-artifact-'));
 try {
  const site=join(root,'site');const sums=join(root,'SHA256SUMS');
  cpSync(join(resolve(input),'site'),site,{recursive:true});writeFileSync(sums,readFileSync(join(resolve(input),'evidence/SHA256SUMS')));
  item.mutate?.(site,sums,root);
  const run=spawnSync(process.execPath,[resolve(verifier),site,sums,'--expect-commit',item.expectedCommit??commit],{encoding:'utf8'});
  assert.equal(run.status,item.expected,item.name+'\n'+run.stderr);
  if(item.diagnostic)assert.match(run.stderr,item.diagnostic,item.name);
  if(item.expected===0)assert.match(run.stdout,/16 files match trusted SHA256SUMS/);
  results.push({case:item.name,expectedExit:item.expected,observedExit:run.status,stdout:run.stdout.trim(),stderr:run.stderr.trim()});
 }finally{rmSync(root,{recursive:true,force:true});}
}
const usage=spawnSync(process.execPath,[resolve(verifier)],{encoding:'utf8'});assert.equal(usage.status,2);results.push({case:'CLI usage',observedExit:usage.status,expectedExit:2});
console.log(JSON.stringify({node:process.version,verifierSha256:createHash('sha256').update(readFileSync(verifier)).digest('hex'),sourceCommit:commit,tests:results.length,passed:results.length,failed:0,results},null,2));
