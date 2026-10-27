import { copyFileSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

export const PROFILE_ENV = 'GHOSTPAY_LOCAL_BUILD_PROFILE';
export const REPORT_ENV = 'GHOSTPAY_LOCAL_MODULE_REPORT';
/** Public embed SDK assets suppressed by the lean profile (exact top-level file names). */
export const EMBED_SDK_FILES = Object.freeze(['ghostpay-embed-v1.js', 'ghostpay-embed-v2.js']);

/** Returns 'full' (default) or 'lean'; any other supplied value is rejected. */
export function parseProfile(value) {
  if (value === undefined) return 'full';
  if (value === 'full' || value === 'lean') return value;
  throw new Error(`${PROFILE_ENV} must be exactly "full" or "lean"`);
}

/** Lean only: the './App' import issued by src/main.tsx resolves to the lean entry. Otherwise undefined. */
export function selectAppEntry(profile, source, importer, leanPath) {
  if (profile !== 'lean' || source !== './App' || importer === undefined) return undefined;
  return /(^|[\\/])src[\\/]main\.tsx$/.test(importer.split('?')[0]) ? leanPath : undefined;
}

/**
 * Copies publicDir into outDir, skipping only the given top-level file names. Symlinks and special
 * files are refused (never followed or copied). Returns the copied relative paths (posix separators).
 */
export function copyPublicFiltered(srcRoot, outRoot, skipTopLevel) {
  const rootStat = lstatSync(srcRoot);
  if (rootStat.isSymbolicLink()) throw new Error('public source root is a symlink (refused)');
  if (!rootStat.isDirectory()) throw new Error('public source root is not a directory (refused)');
  const skip = new Set(skipTopLevel);
  const copied = [];
  const walk = (rel) => {
    const dir = rel === '' ? srcRoot : join(srcRoot, ...rel.split('/'));
    for (const name of readdirSync(dir).sort()) {
      const relPath = rel === '' ? name : posix.join(rel, name);
      if (rel === '' && skip.has(name)) continue;
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) throw new Error(`public asset is a symlink (refused): ${relPath}`);
      if (st.isDirectory()) {
        mkdirSync(join(outRoot, ...relPath.split('/')), { recursive: true });
        walk(relPath);
      } else if (st.isFile()) {
        mkdirSync(join(outRoot, ...rel.split('/').filter(Boolean)), { recursive: true });
        copyFileSync(full, join(outRoot, ...relPath.split('/')));
        copied.push(relPath);
      } else {
        throw new Error(`public asset is a special file (refused): ${relPath}`);
      }
    }
  };
  mkdirSync(outRoot, { recursive: true });
  walk('');
  return copied;
}

/** Extracts rendered module ids/lengths of every JS chunk; throws if the bundler gave no module metadata. */
export function collectChunkModules(bundle) {
  const out = [];
  for (const item of Object.values(bundle)) {
    if (item.type !== 'chunk') continue;
    if (item.modules === null || typeof item.modules !== 'object') {
      throw new Error(`bundler module metadata unavailable for chunk ${String(item.fileName)}`);
    }
    const modules = [];
    for (const [id, m] of Object.entries(item.modules)) {
      if (m === null || typeof m !== 'object') {
        throw new Error(`malformed module entry ${id} in chunk ${String(item.fileName)}`);
      }
      const len = m.renderedLength;
      if (typeof len !== 'number' || !Number.isFinite(len) || len < 0) {
        throw new Error(`invalid renderedLength for module ${id} in chunk ${String(item.fileName)}`);
      }
      modules.push({ id, renderedLength: len });
    }
    out.push({
      fileName: item.fileName,
      modules: modules.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    });
  }
  return out.sort((a, b) => (a.fileName < b.fileName ? -1 : 1));
}

/** Writes JSON to a NEW absolute file (create-exclusive); never overwrites an existing path. */
export function writeReportExclusive(path, report) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error(`${REPORT_ENV} must be an absolute path`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

/**
 * Vite plugins for the profile. Full profile with no report requested returns an empty list so the
 * default build is unchanged.
 */
export function localBuildProfilePlugins(opts) {
  const profile = parseProfile(opts.env[PROFILE_ENV]);
  const reportPath = opts.env[REPORT_ENV];
  if (reportPath !== undefined && !isAbsolute(reportPath)) throw new Error(`${REPORT_ENV} must be an absolute path`);
  const plugins = [];
  if (profile === 'lean') {
    plugins.push({
      name: 'ghostpay-local-lean-entry',
      enforce: 'pre',
      apply: 'build',
      resolveId(source, importer) {
        return selectAppEntry(profile, source, importer, opts.leanAppPath);
      },
    });
  }
  let outDir;
  let publicCopied = [];
  let chunks;
  plugins.push({
    name: 'ghostpay-local-profile-output',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      if (reportPath !== undefined) {
        const rel = relative(outDir, resolve(reportPath));
        const inside = rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
        if (inside) {
          throw new Error(`${REPORT_ENV} must not be inside the web output directory`);
        }
      }
    },
    generateBundle(_o, bundle) {
      if (reportPath !== undefined) chunks = collectChunkModules(bundle);
    },
    writeBundle(o) {
      const dest = o.dir ?? outDir;
      if (profile === 'lean') publicCopied = copyPublicFiltered(opts.publicDir, dest, EMBED_SDK_FILES);
      if (reportPath !== undefined) writeReportExclusive(reportPath, { profile, chunks, publicCopied });
    },
  });
  return plugins;
}
