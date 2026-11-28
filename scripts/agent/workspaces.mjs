// Workspace graph helpers shared by the agent tooling (package-map.mjs, affected.mjs).
// Pure functions take plain data so they can be unit tested without touching the repo; only loadRepo() reads disk.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Foundry projects have no package.json. Their tests run with `forge test` in the project directory.
export const FORGE_PROJECTS = [
  'packages/contracts',
  'packages/pool-contracts',
  'packages/payer-hiding-contracts',
];

// Workspaces whose tests consume packages/contracts build output (ABIs, artifacts, the pinned solc), as wired in
// .github/workflows/ci.yml (ts-test: chain-adapters and policy-scheme run with anvil; web runs the registry test).
export const CONTRACT_CONSUMERS = ['packages/chain-adapters', 'packages/policy-scheme', 'apps/web'];

// A change under any of these paths can affect every workspace: run the full suite instead of a subset.
export const GLOBAL_PATHS = [
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
  'eslint.config.js',
  '.prettierrc',
  'scripts/build-workspaces.mjs',
  '.github/actions/',
];

// Paths that never need a test run.
const DOC_ONLY = /(^docs\/)|(\.md$)/;

/** Read every workspace manifest under packages/ and apps/. */
export function loadRepo(root) {
  const workspaces = [];
  for (const group of ['packages', 'apps']) {
    for (const dir of readdirSync(join(root, group)).sort()) {
      const location = `${group}/${dir}`;
      const manifestPath = join(root, location, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      workspaces.push({
        location,
        name: m.name,
        description: m.description ?? '',
        scripts: Object.keys(m.scripts ?? {}),
        license: m.license ?? '',
        deps: Object.keys({
          ...m.dependencies,
          ...m.devDependencies,
          ...m.peerDependencies,
          ...m.optionalDependencies,
        }),
      });
    }
  }
  const forge = FORGE_PROJECTS.filter((p) => existsSync(join(root, p, 'foundry.toml')));
  return { workspaces, forge };
}

/** Internal dependency edges only: location -> [location]. */
export function internalDeps(workspaces) {
  const byName = new Map(workspaces.map((w) => [w.name, w.location]));
  const edges = new Map();
  for (const w of workspaces)
    edges.set(
      w.location,
      w.deps
        .filter((d) => byName.has(d))
        .map((d) => byName.get(d))
        .sort(),
    );
  return edges;
}

/** Reverse edges: location -> [locations that depend on it]. */
export function dependents(workspaces) {
  const rev = new Map(workspaces.map((w) => [w.location, []]));
  for (const [from, tos] of internalDeps(workspaces)) for (const to of tos) rev.get(to).push(from);
  for (const list of rev.values()) list.sort();
  return rev;
}

/** Topological order (dependencies first) of the given locations, restricted to that set. Throws on a cycle. */
export function topoOrder(workspaces, subset) {
  const edges = internalDeps(workspaces);
  const want = new Set(subset);
  const done = new Set();
  const visiting = new Set();
  const order = [];
  const visit = (loc) => {
    if (done.has(loc)) return;
    if (visiting.has(loc)) throw new Error(`Workspace dependency cycle at ${loc}`);
    visiting.add(loc);
    for (const d of edges.get(loc) ?? []) visit(d);
    visiting.delete(loc);
    done.add(loc);
    if (want.has(loc)) order.push(loc);
  };
  for (const loc of [...want].sort()) visit(loc);
  return order;
}

/**
 * Classify changed paths.
 * Returns { global, direct: Set<location>, forge: Set<project>, nodeScripts: boolean, unmapped: string[] }.
 * `direct` are workspaces containing a changed file; dependents are added by affectedSet().
 */
export function classifyChanges(files, { workspaces, forge }) {
  const locations = workspaces
    .map((w) => w.location)
    .concat(forge)
    .sort((a, b) => b.length - a.length);
  const out = { global: false, direct: new Set(), forge: new Set(), nodeScripts: false, unmapped: [] };
  for (const raw of files) {
    const f = raw.replace(/^\.\//, '');
    if (!f) continue;
    if (GLOBAL_PATHS.some((g) => (g.endsWith('/') ? f.startsWith(g) : f === g))) {
      out.global = true;
      continue;
    }
    const owner = locations.find((l) => f === l || f.startsWith(`${l}/`));
    if (owner) {
      // Docs inside a workspace never change behaviour.
      if (DOC_ONLY.test(f)) continue;
      if (forge.includes(owner)) out.forge.add(owner);
      else out.direct.add(owner);
      continue;
    }
    if (/^scripts\/(testnet|regtest|agent|tests)\//.test(f)) {
      out.nodeScripts = true;
      continue;
    }
    if (DOC_ONLY.test(f)) continue;
    out.unmapped.push(f);
  }
  // A packages/contracts change reaches the TS workspaces that test against its artifacts.
  if (out.forge.has('packages/contracts')) {
    for (const c of CONTRACT_CONSUMERS) if (workspaces.some((w) => w.location === c)) out.direct.add(c);
  }
  return out;
}

/** Direct workspaces plus every transitive dependent, sorted. */
export function affectedSet(workspaces, direct) {
  const rev = dependents(workspaces);
  const seen = new Set();
  const stack = [...direct];
  while (stack.length) {
    const loc = stack.pop();
    if (seen.has(loc)) continue;
    seen.add(loc);
    for (const d of rev.get(loc) ?? []) stack.push(d);
  }
  return [...seen].sort();
}

/**
 * Libraries that must be rebuilt before testing `affected`: every workspace with a build script that an affected
 * workspace depends on (directly or transitively), in dependency order. Consumers import dependencies from dist/,
 * so a stale dist/ makes tests pass or fail against old code.
 */
export function buildsNeeded(workspaces, affected) {
  const edges = internalDeps(workspaces);
  const byLoc = new Map(workspaces.map((w) => [w.location, w]));
  const need = new Set();
  const stack = [...affected];
  while (stack.length) {
    for (const d of edges.get(stack.pop()) ?? [])
      if (!need.has(d)) {
        need.add(d);
        stack.push(d);
      }
  }
  // `need` already includes affected workspaces that other affected workspaces import (e.g. a changed library).
  return topoOrder(workspaces, [...need]).filter((l) => byLoc.get(l).scripts.includes('build'));
}
