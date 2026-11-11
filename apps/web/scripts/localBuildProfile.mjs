// Selection/public-copy basis: GhostPay371d235; current guards add actual build evidence.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (parseProfile(profile) !== 'lean' || source !== './App' || importer === undefined) return undefined;
  const normalize = (id) => id.replaceAll('\\', '/').split('?')[0];
  return normalize(importer) === normalize(leanPath).replace(/\/AppLean\.tsx$/, '/main.tsx') ? leanPath : undefined;
}

/**
 * Copies publicDir into outDir, skipping only the given top-level file names. Symlinks and special
 * files are refused (never followed or copied). Returns the copied relative paths (posix separators).
 */
export function copyPublicFiltered(srcRoot, outRoot, skipTopLevel, rejectExecutable = false) {
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
      if (rejectExecutable && /\.(?:[cm]?js|wasm|html?)$/i.test(name)) {
        throw new Error(`lean public asset is executable and has no module proof: ${relPath}`);
      }
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

function cleanId(id) {
  const plain = id.replace(/^\0/, '').replaceAll('\\', '/').split('?')[0];
  return plain.startsWith('file:') ? fileURLToPath(plain).replaceAll('\\', '/') : plain;
}

function collectLeanChunks(bundle, webRoot) {
  const chunks = collectChunkModules(bundle);
  if (chunks.length === 0) throw new Error('lean build chunk metadata is missing');
  for (const chunk of chunks) {
    if (chunk.modules.length === 0) throw new Error('lean chunk module provenance is missing');
    const original = Object.values(bundle).find((item) => item.type === 'chunk' && item.fileName === chunk.fileName);
    for (const module of chunk.modules) {
      const detail = original.modules[module.id];
      const exports = detail.renderedExports;
      if ((module.renderedLength > 0 && !Array.isArray(exports))
          || (exports !== undefined && (!Array.isArray(exports) || exports.some((name) => typeof name !== 'string')))) {
        throw new Error(`lean rendered export metadata unavailable: ${module.id}`);
      }
      const id = cleanId(module.id);
      const path = `/${id}`;
      if (module.renderedLength > 0) {
        const feature = /\/src\/features\/(?:btc|solana|tron|policy)\//.test(path);
        const entry = /\/src\/App\.tsx$/.test(path);
        const archive = /\/src\/(?:components\/(?:TagArchive|BackupPanel)\.tsx|lib\/tagArchive\.ts)$/.test(path);
        const embedProtocol = /\/src\/lib\/embedProtocol\.ts$/.test(path);
        const deferredPackage = /\/(?:packages|node_modules\/@ghostpay)\/(?:btc-silent-payments|btc-family|btc-payjoin|chain-solana|chain-tron|chain-evm-extra|solana-stealth|tron-adapter|policy-scheme|pool-[^/]+|external-pools(?:-[^/]+)?|pir-[^/]+)(?:\/|$)/.test(path);
        if (feature || entry || archive || embedProtocol || deferredPackage) throw new Error(`lean build rendered excluded module: ${id}`);
        if (/\/src\/lib\/embedHost\.ts$/.test(path) && exports.some((name) => name !== 'notifyEmbedDone')) {
          throw new Error('lean build rendered embedding startup/profile exports');
        }
      }
      const sourceId = isAbsolute(id) ? relative(webRoot, id).replaceAll('\\', '/') : id;
      if (isAbsolute(sourceId)) throw new Error('lean module metadata cannot be made source-relative');
      module.id = `${module.id.startsWith('\0') ? 'virtual:' : ''}${sourceId}`;
      module.renderedExports = exports ?? [];
    }
  }
  return chunks;
}

function reportOutsideOutput(reportPath, outDir) {
  if (reportPath === undefined) return;
  const rel = relative(outDir, resolve(reportPath));
  if (rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))) {
    throw new Error(`${REPORT_ENV} must not be inside the web output directory`);
  }
}

function checkOutputModules(root, allowed) {
  if (!existsSync(root)) return;
  const walk = (rel) => {
    const path = rel === '' ? root : join(root, ...rel.split('/'));
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error(`lean output symlink refused: ${rel}`);
    if (info.isDirectory()) {
      for (const name of readdirSync(path)) walk(rel === '' ? name : posix.join(rel, name));
    } else if (!info.isFile()) throw new Error(`lean output special file refused: ${rel}`);
    else if (/\.(?:[cm]?js|wasm|html?)$/i.test(rel) && !allowed.has(rel)) throw new Error(`lean output executable has no module proof: ${rel}`);
  };
  walk('');
}

/**
 * Vite plugins for the profile. Full profile with no report requested returns an empty list so the
 * default build is unchanged.
 */
export function localBuildProfilePlugins(opts) {
  const profile = parseProfile(opts.env[PROFILE_ENV]);
  const reportPath = opts.env[REPORT_ENV];
  if (reportPath !== undefined && !isAbsolute(reportPath)) throw new Error(`${REPORT_ENV} must be an absolute path`);
  if (profile === 'full' && reportPath === undefined) return [];
  const plugins = [];
  const webRoot = dirname(dirname(opts.leanAppPath));
  const workerEvidence = opts.workerEvidence ?? [];
  if (profile === 'lean' && opts.worker !== true) {
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
  let configRoot;
  let publicCopied = [];
  let chunks;
  plugins.push({
    name: 'ghostpay-local-profile-output',
    apply: 'build',
    configResolved(config) {
      configRoot = config.root;
      outDir = resolve(config.root, config.build.outDir);
      if (opts.worker !== true) reportOutsideOutput(reportPath, outDir);
    },
    buildStart() {
      chunks = undefined;
      publicCopied = [];
      if (opts.worker !== true) workerEvidence.length = 0;
    },
    generateBundle(_o, bundle) {
      chunks = profile === 'lean' ? collectLeanChunks(bundle, webRoot) : collectChunkModules(bundle);
      if (opts.worker === true) workerEvidence.push({ chunks });
    },
    writeBundle(o, bundle) {
      if (opts.worker === true) return;
      const dest = o.dir === undefined ? outDir : resolve(configRoot, o.dir);
      reportOutsideOutput(reportPath, dest);
      if (profile === 'lean') {
        if (chunks === undefined) throw new Error('lean build module metadata is missing');
        if (bundle === undefined || bundle === null) throw new Error('lean final bundle metadata is missing');
        // Vite can emit HTML after our generateBundle hook. Only final writeBundle
        // metadata may admit emitted assets, and its chunks must pass the same proof.
        chunks = collectLeanChunks(bundle, webRoot);
        if (workerEvidence.length === 0) throw new Error('lean Worker build evidence is missing');
        const workerChunks = new Set(workerEvidence.flatMap((worker) => worker.chunks.map((chunk) => chunk.fileName)));
        const assets = Object.values(bundle).filter((item) => item.type === 'asset').map((item) => item.fileName);
        for (const name of assets) {
          if (/\.(?:[cm]?js|wasm)$/i.test(name) && !workerChunks.has(name)) throw new Error(`lean executable asset has no Worker module proof: ${name}`);
        }
        for (const sdk of EMBED_SDK_FILES) {
          if (existsSync(join(dest, sdk))) throw new Error(`lean output retains excluded embed asset: ${sdk}`);
        }
        const allowed = new Set([...chunks.map((chunk) => chunk.fileName), ...workerChunks, ...assets.filter((name) => /\.html?$/i.test(name))]);
        checkOutputModules(dest, allowed);
        publicCopied = copyPublicFiltered(opts.publicDir, dest, EMBED_SDK_FILES, true);
        checkOutputModules(dest, allowed);
        const report = { format: 'ghostpay-lean-build/1', profile, chunks, workers: workerEvidence, publicCopied };
        writeFileSync(join(dest, 'ghostpay-lean-build.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
      }
      if (reportPath !== undefined) writeReportExclusive(reportPath, { profile, chunks, workers: workerEvidence, publicCopied });
    },
  });
  return plugins;
}
