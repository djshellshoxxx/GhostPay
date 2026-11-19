// Read-only ESLint file-discovery receipt. Does not parse or lint source files.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const repo = '/workspace/scratch/13855ecc035c/GhostPay';
const cwd = path.join(repo, 'apps/web');
if (process.cwd() !== cwd) throw new Error('Run from the original npm workspace cwd.');
const require = createRequire(path.join(repo, 'package.json'));
const { ESLint } = require('eslint');
const eslintLib = path.dirname(require.resolve('eslint'));
const helpers = require(path.join(eslintLib, 'eslint/eslint-helpers.js'));
const { WarningService } = require(path.join(eslintLib, 'services/warning-service.js'));
const { hfs } = await import(path.join(repo, 'node_modules/@humanfs/node/src/index.js'));
const rawOptions = { cwd, overrideConfigFile: '../../eslint.config.js' };
const options = helpers.processOptions(rawOptions);
const warnings = new WarningService();
const loader = helpers.createConfigLoader(options, helpers.createDefaultConfigs(), helpers.createLinter(options, warnings), warnings);
const actual = (await helpers.findFiles({
  patterns: ['src', 'e2e'], cwd, globInputPaths: options.globInputPaths,
  configLoader: loader, errorOnUnmatchedPattern: options.errorOnUnmatchedPattern,
})).sort();
const eslint = new ESLint(rawOptions);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const configs = {};
const selected = [];
const ignored = [];
const allFiles = [];
for (const folder of ['src', 'e2e']) {
  for await (const entry of hfs.walk(path.join(cwd, folder))) {
    if (entry.isDirectory) continue;
    const absolute = path.resolve(cwd, folder, entry.path);
    const relative = path.relative(cwd, absolute).replaceAll(path.sep, '/');
    allFiles.push(relative);
    if (await eslint.isPathIgnored(absolute)) {
      ignored.push(relative);
      continue;
    }
    const config = await eslint.calculateConfigForFile(absolute);
    const configValue = config.toJSON();
    const configHash = sha(JSON.stringify(configValue));
    configs[configHash] ??= configValue;
    const source = await fs.readFile(absolute);
    selected.push({ path: relative, sha256: sha(source), bytes: source.length, config_sha256: configHash });
  }
}
selected.sort((a,b) => a.path.localeCompare(b.path, 'en'));
ignored.sort(); allFiles.sort();
const selectedAbsolute = selected.map(f=>path.join(cwd, f.path)).sort();
if (JSON.stringify(actual) !== JSON.stringify(selectedAbsolute)) throw new Error('Public API walk differs from exact ESLint findFiles selection.');
const counts = files => files.reduce((out,file)=>{ const ext=path.extname(typeof file==='string'?file:file.path)||'[none]';out[ext]=(out[ext]||0)+1;return out;},{});
const inputs = {};
for (const file of ['eslint.config.js', 'apps/web/package.json', 'apps/web/tsconfig.json', 'tsconfig.base.json', 'package-lock.json']) inputs[file] = sha(await fs.readFile(path.join(repo,file)));
const libraryInputs = {};
for(const file of ['eslint/eslint.js','eslint/eslint-helpers.js','config/default-config.js','config/config-loader.js']) libraryInputs[`eslint/lib/${file}`]=sha(await fs.readFile(path.join(eslintLib,file)));
const head = execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const tree = execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:repo,encoding:'utf8'}).trim();
const gitPaths = execFileSync('git',['ls-files','-z','apps/web/src','apps/web/e2e'],{cwd:repo,encoding:'utf8'}).split('\0').filter(Boolean).map(p=>p.replace(/^apps\/web\//,''));
const missingTracked = gitPaths.filter(p=>!allFiles.includes(p));
if(missingTracked.length) throw new Error(`Tracked files not walked: ${missingTracked}`);
const test = f => /\.(?:test|spec)\.[^.]+$/.test(f.path);
const partitions = [];
// Execution is deliberately not included: parent owns later qualification runs.
for (let i=0;i<selected.length;i+=24) {
  const files = selected.slice(i,i+24).map(f=>f.path);
  partitions.push({id:partitions.length+1,files,command_argv:['../../node_modules/eslint/bin/eslint.js','--config','../../eslint.config.js',...files]});
}
const receipt = {
  schema:1, observed_at:new Date().toISOString(), repository:repo, source_head:head, source_tree:tree,
  original_command:'npm run lint --workspace @ghostpay/web', original_script:'eslint --config ../../eslint.config.js src e2e', cwd,
  node:process.version, eslint:ESLint.version, typescript_eslint:require('typescript-eslint/package.json').version,
  method:'Installed ESLint findFiles used by lintFiles with the same processed defaults/config loader; independently identical to unfiltered humanfs directory walk filtered through public ESLint.isPathIgnored and calculateConfigForFile. No lintFiles, lintText, parser or TypeScript program API was invoked.',
  selected_count:selected.length, selected_by_extension:counts(selected), src_count:selected.filter(f=>f.path.startsWith('src/')).length,
  e2e_count:selected.filter(f=>f.path.startsWith('e2e/')).length, test_spec_count:selected.filter(test).length,
  all_walked_count:allFiles.length, all_walked_by_extension:counts(allFiles), ignored_count:ignored.length, ignored_by_extension:counts(ignored),
  tracked_file_count:gitPaths.length, missing_tracked_files:missingTracked, selected_manifest_sha256:sha(selected.map(f=>f.path).join('\n')+'\n'),
  inputs_sha256:inputs, discovery_implementation_sha256:libraryInputs, resolved_configs:configs,
  files:selected, ignored_files:ignored, partition_size:24, partitions,
  qualification:'Discovery only. No file has been linted by this enumeration and no full lint pass is claimed.',
};
const destination='/workspace/scratch/13855ecc035c/web-lint-manifest.json';
await fs.writeFile(destination,JSON.stringify(receipt,null,2)+'\n');
await fs.writeFile('/workspace/scratch/13855ecc035c/web-lint-files.txt',selected.map(f=>f.path).join('\n')+'\n');
console.log(JSON.stringify({destination,head,node:process.version,eslint:ESLint.version,selected:receipt.selected_count,extensions:receipt.selected_by_extension,src:receipt.src_count,e2e:receipt.e2e_count,test_spec:receipt.test_spec_count,walked:receipt.all_walked_count,ignored:receipt.ignored_count,ignored_extensions:receipt.ignored_by_extension,configs:Object.keys(configs).length,partitions:partitions.length,selection_sha256:receipt.selected_manifest_sha256,rss:process.memoryUsage().rss},null,2));
