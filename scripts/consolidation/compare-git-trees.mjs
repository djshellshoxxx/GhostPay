/**
 * Lossless path/blob comparison for complete GitHub recursive-tree API responses.
 * This is structural evidence, NOT a merge/patch-equivalence or safety judgment.
 * Never turn a tree comparison into an automatic finalized disposition.
 *
 * node scripts/consolidation/compare-git-trees.mjs BASE_TREE.json DONOR_TREE.json
 * Both inputs must be complete GET /git/trees/{sha}?recursive=1 response bodies.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OBJECT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const VALID_MODES = { blob: new Set(['100644', '100755', '120000']), commit: new Set(['160000']), tree: new Set(['040000', '40000']) };

function entries(response, label) {
  if (!response || typeof response !== 'object' || response.truncated !== false || !Array.isArray(response.tree)) {
    throw new Error(`${label}: complete recursive Git tree required (truncated must be false)`);
  }
  if (response.sha !== undefined && (typeof response.sha !== 'string' || !OBJECT_SHA.test(response.sha))) {
    throw new Error(`${label}: invalid tree identity`);
  }
  const found = new Map();
  const seen = new Set();
  for (const item of response.tree) {
    if (!item || typeof item !== 'object' || !['tree', 'blob', 'commit'].includes(item.type) ||
        typeof item.path !== 'string' || !item.path || item.path.startsWith('/') || item.path.includes('\\') ||
        item.path.split('/').some(part => !part || part === '.' || part === '..') ||
        typeof item.sha !== 'string' || !OBJECT_SHA.test(item.sha) ||
        typeof item.mode !== 'string' || !VALID_MODES[item.type]?.has(item.mode)) {
      throw new Error(`${label}: invalid tree entry`);
    }
    if (seen.has(item.path)) throw new Error(`${label}: duplicate path ${item.path}`);
    seen.add(item.path);
    if (item.type === 'tree') continue;
    // Submodule refs are gitlink commit objects and must not disappear from comparisons.
    found.set(item.path, { sha: item.sha, type: item.type, mode: item.mode });
  }
  // A Git blob or gitlink cannot simultaneously be an ancestor of another tracked path.
  for (const path of found.keys()) {
    const parts = path.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      const parent = parts.slice(0, depth).join('/');
      if (found.has(parent)) throw new Error(`${label}: conflicting tracked path ${parent} / ${path}`);
    }
  }
  return found;
}

/** Compare two complete recursive Git trees without GitHub's 300-file compare cap. */
export function compareGitTrees(baseTree, donorTree) {
  const base = entries(baseTree, 'base');
  const donor = entries(donorTree, 'donor');
  const added = [], deleted = [], changed = [], identical = [];
  for (const [path, item] of donor) {
    const old = base.get(path);
    if (!old) added.push({ path, ...item });
    else if (old.sha !== item.sha || old.type !== item.type || old.mode !== item.mode) changed.push({ path, baseSha: old.sha, donorSha: item.sha, baseType: old.type, donorType: item.type, baseMode: old.mode, donorMode: item.mode });
    else identical.push(path);
  }
  for (const [path, item] of base) {
    if (!donor.has(path)) deleted.push({ path, ...item });
  }
  added.sort((a,b) => a.path.localeCompare(b.path));
  deleted.sort((a,b) => a.path.localeCompare(b.path));
  changed.sort((a,b) => a.path.localeCompare(b.path));
  identical.sort();
  return {
    schema: 'ghostpay-complete-git-tree-delta/2',
    baseTree: baseTree.sha ?? null,
    donorTree: donorTree.sha ?? null,
    summary: { baseObjects: base.size, donorObjects: donor.size, added: added.length, deleted: deleted.length,
      changed: changed.length, identical: identical.length, totalDifferingPaths: added.length + deleted.length + changed.length },
    added, deleted, changed, identical,
    caveats: [
      'This compares exact tracked blob/gitlink identity AND file modes, not patch equivalence or commit ancestry.',
      'Identical blobs do not prove runtime behavior, complete test coverage, or main integration.',
      'Review executable and documentation changes manually; no branch disposition is inferred.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) {
    process.stderr.write('Usage: node compare-git-trees.mjs BASE_TREE.json DONOR_TREE.json\n');
    process.exitCode = 2;
  } else {
    try {
      const base = JSON.parse(readFileSync(process.argv[2], 'utf8'));
      const donor = JSON.parse(readFileSync(process.argv[3], 'utf8'));
      process.stdout.write(JSON.stringify(compareGitTrees(base, donor), null, 2) + '\n');
    } catch (error) {
      process.stderr.write(`Incomplete or invalid comparison: ${error instanceof Error ? error.message : 'unknown error'}\n`);
      process.exitCode = 1;
    }
  }
}
