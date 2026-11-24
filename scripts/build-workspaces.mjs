import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Build internal dependencies before their consumers, including newly migrated workspaces.
const root = fileURLToPath(new URL('../', import.meta.url));
const librariesOnly = process.argv.includes('--libraries');
const targetIndex = process.argv.indexOf('--workspace');
const target = targetIndex === -1 ? undefined : process.argv[targetIndex + 1];
if (targetIndex !== -1 && (target === undefined || target.startsWith('--') || librariesOnly))
  throw new Error('Use --workspace NAME or --libraries, with one build scope.');
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
if (target !== undefined) {
  if (!workspaces.has(target)) throw new Error('Unknown target workspace.');
  visit(target);
} else for (const [name, workspace] of workspaces) if (!librariesOnly || workspace.group === 'packages') visit(name);
for (const name of order) {
  // npm_execpath is supplied by `npm run`; execute its JS entry directly so Windows
  // does not require a shell or command-file interpolation.
  const npmCli = process.env.npm_execpath;
  if (process.platform === 'win32' && !npmCli) throw new Error('On Windows run workspace builds through npm run build or npm run build:cli.');
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, 'run', 'build', '--workspace', name], { cwd: root, stdio: 'inherit' })
    : spawnSync('npm', ['run', 'build', '--workspace', name], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
