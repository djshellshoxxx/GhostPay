/**
 * Exact, fail-closed GitHub patch-hunk coverage across two divergent histories.
 * Source containment only: never evidence of mainline merge or safety approval.
 * Inputs: {id, changedFiles, files} for a commit and a PR with ALL changed-file pages.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function parsePatch(text, label) {
  if (typeof text !== 'string' || !text) throw Error(label + ': missing patch');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const hunks = [];
  let current = null, adds = 0, deletes = 0;
  function finish() {
    if (!current) return;
    if (current.old !== current.actualOld || current.next !== current.actualNext)
      throw Error(label + ': incomplete or invalid hunk');
    if (!current.lines.some(line => line[0] === '+' || line[0] === '-'))
      throw Error(label + ': no edited lines');
    hunks.push(JSON.stringify(current.lines));
  }
  for (const line of lines) {
    if (line.startsWith('@@ ')) {
      finish();
      const match = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?:.*)$/.exec(line);
      if (!match) throw Error(label + ': malformed hunk header');
      current = {old: match[1] === undefined ? 1 : Number(match[1]), next: match[2] === undefined ? 1 : Number(match[2]), actualOld: 0, actualNext: 0, lines: []};
    } else {
      if (!current || !line || ![' ', '+', '-'].includes(line[0]))
        throw Error(label + ': unsupported patch line or newline marker');
      current.lines.push(line);
      if (line[0] !== '+') current.actualOld++;
      if (line[0] !== '-') current.actualNext++;
      if (line[0] === '+') adds++;
      if (line[0] === '-') deletes++;
    }
  }
  finish();
  if (!hunks.length) throw Error(label + ': no hunks');
  return {hunks, adds, deletes};
}

function normalize(input, label) {
  if (!input || typeof input.id !== 'string' || !input.id || !Array.isArray(input.files) ||
      !Number.isSafeInteger(input.changedFiles) || input.changedFiles < 1 ||
      input.files.length !== input.changedFiles)
    throw Error(label + ': incomplete file inventory');
  const map = new Map();
  for (const file of input.files) {
    if (!file || typeof file.filename !== 'string' || !file.filename || file.filename.startsWith('/') ||
        file.filename.includes('\\') || file.filename.split('/').some(part => !part || part === '.' || part === '..') ||
        map.has(file.filename) || file.status !== 'modified' ||
        !Number.isSafeInteger(file.additions) || file.additions < 0 ||
        !Number.isSafeInteger(file.deletions) || file.deletions < 0 ||
        !Number.isSafeInteger(file.changes) || file.changes !== file.additions + file.deletions)
      throw Error(label + ': unsupported file, incomplete or duplicate path');
    const parsed = parsePatch(file.patch, label + '/' + file.filename);
    if (parsed.adds !== file.additions || parsed.deletes !== file.deletions)
      throw Error(label + ': patch count mismatch');
    map.set(file.filename, parsed);
  }
  return map;
}

export function compareDonorPrPatches(donorInput, ownerInput) {
  const donor = normalize(donorInput, 'donor');
  const owner = normalize(ownerInput, 'owner PR');
  const covered = [], unmatched = [], extraOwnerEdits = [];
  for (const [path, entry] of donor) {
    const other = owner.get(path);
    const counts = new Map();
    for (const h of other?.hunks || []) counts.set(h, (counts.get(h) || 0) + 1);
    const missing = [];
    for (let i = 0; i < entry.hunks.length; i++) {
      const h = entry.hunks[i];
      if ((counts.get(h) || 0) > 0) counts.set(h, counts.get(h) - 1);
      else missing.push(i);
    }
    if (missing.length) unmatched.push({path, missingDonorHunkIndices: missing});
    else covered.push({path, hunkCount: entry.hunks.length});
  }
  for (const [path, entry] of owner) {
    if (!donor.has(path)) extraOwnerEdits.push({path, hunks: entry.hunks.length});
    else if (entry.hunks.length > donor.get(path).hunks.length)
      extraOwnerEdits.push({path, extraHunks: entry.hunks.length - donor.get(path).hunks.length});
  }
  covered.sort((a,b)=>a.path.localeCompare(b.path));
  unmatched.sort((a,b)=>a.path.localeCompare(b.path));
  extraOwnerEdits.sort((a,b)=>a.path.localeCompare(b.path));
  return {
    schema: 'ghostpay-donor-hunk-coverage/1',
    donor: donorInput.id, ownerPr: ownerInput.id,
    donorChangedFiles: donor.size, ownerChangedFiles: owner.size,
    allDonorHunksPresent: unmatched.length === 0,
    covered, unmatched, extraOwnerEdits,
    caveats: [
      'Only exact context-bearing patch hunks on matching paths count as covered.',
      'This does not prove whole-branch equivalence, main integration, runtime safety or independent review.',
      'The owner PR remains an integration obligation until actually qualified and merged.',
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) { process.stderr.write('Usage: compare-donor-pr-patches.mjs donor.json owner.json\n'); process.exitCode=2; }
  else {
    try {
      const d=JSON.parse(readFileSync(process.argv[2],'utf8'));
      const p=JSON.parse(readFileSync(process.argv[3],'utf8'));
      process.stdout.write(JSON.stringify(compareDonorPrPatches(d,p),null,2)+'\n');
    } catch (e) { process.stderr.write('Unproven donor coverage: '+(e instanceof Error?e.message:'unknown')+'\n'); process.exitCode=1; }
  }
}
