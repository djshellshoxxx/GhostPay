import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Build internal dependencies before their consumers, including newly migrated workspaces.
const root = fileURLToPath(new URL('../', import.meta.url));
const librariesOnly = process.argv.includes('--libraries');
const workspaces = new Map();
for (const group of ['packages', 'apps']) {
  for (const dir of readdirSync(join(root, group)).sort()) {
    const path = join(root, group, dir, 'package.json');
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (workspaces.has(manifest.name)) throw new Error(`Duplicate workspace: ${manifest.name}`);
    workspaces.set(manifest.name, { manifest, group });
  }
}
const done = new Set();
const visiting = new Set();
const order = [];
function visit(name) {
  if (done.has(name)) return;
  if (visiting.has(name)) throw new Error(`Workspace dependency cycle at ${name}`);
  visiting.add(name);
  const workspace = workspaces.get(name);
  const deps = { ...workspace.manifest.dependencies, ...workspace.manifest.devDependencies, ...workspace.manifest.optionalDependencies };
  for (const dependency of Object.keys(deps).sort()) if (workspaces.has(dependency)) visit(dependency);
  visiting.delete(name);
  done.add(name);
  if (workspace.manifest.scripts?.build) order.push(name);
}
for (const [name, workspace] of workspaces) if (!librariesOnly || workspace.group === 'packages') visit(name);
for (const name of order) {
  const result = spawnSync('npm', ['run', 'build', '--workspace', name], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
