#!/usr/bin/env node
// Emitted-artifact release-exclusion check (owner stop-work directive, AGENTS.md 2026-11-25).
//
// Verifies a built lean site, not its source: every module the lean module report says was rendered into the site
// (application chunks and Worker chunks), every public file copied into it, and every emitted file name must belong to
// no stopped or deferred product. The product table lives in apps/web/scripts/stoppedProducts.mjs, which the lean
// build guard also uses, so the build and this check cannot drift apart.
//
// Usage: node scripts/release/verify-release-exclusions.mjs <ghostpay-lean-build.json> [<site-dir>]
// The site-dir check only sees emitted file names (Vite hashes chunk names), so the module report is the primary proof.
// Exit 0 with a one-line summary when clean; exit 1 listing every problem otherwise.
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOPPED_PRODUCTS, stoppedProductForModule } from '../../apps/web/scripts/stoppedProducts.mjs';

function describe(product) {
  return `${product.id} ${product.name} (${product.status})`;
}

/**
 * Validates the report's container shapes exactly as localBuildProfile.mjs writes them:
 * `chunks: Array<{ fileName: string, modules: Array }>` (nonempty), `workers: Array<{ chunks: Array<chunk> }>`
 * (may be empty) and `publicCopied: string[]` (may be empty). Returns the chunk groups to inspect, each labelled.
 * Missing or malformed containers are problems; they are never read as empty.
 */
function reportGroups(report, problems) {
  const groups = [];
  const chunkShape = (chunk, where) => {
    if (chunk === null || typeof chunk !== 'object' || Array.isArray(chunk)) problems.push(`${where} is not an object`);
    else if (typeof chunk.fileName !== 'string' || chunk.fileName === '') problems.push(`${where} has no fileName`);
    else if (!Array.isArray(chunk.modules)) problems.push(`${where} ${chunk.fileName} has no module list`);
    else return true;
    return false;
  };
  if (!Array.isArray(report.chunks)) problems.push('lean report chunks is missing or not a list');
  else if (report.chunks.length === 0) problems.push('lean report lists no application chunks');
  else report.chunks.forEach((chunk, i) => { if (chunkShape(chunk, `lean report chunk ${String(i)}`)) groups.push({ chunk, worker: false }); });
  if (!Array.isArray(report.workers)) problems.push('lean report workers is missing or not a list');
  else {
    report.workers.forEach((w, i) => {
      if (w === null || typeof w !== 'object' || Array.isArray(w) || !Array.isArray(w.chunks)) {
        problems.push(`lean report worker ${String(i)} has no chunk list`);
        return;
      }
      w.chunks.forEach((chunk, j) => { if (chunkShape(chunk, `lean report worker ${String(i)} chunk ${String(j)}`)) groups.push({ chunk, worker: true }); });
    });
  }
  if (!Array.isArray(report.publicCopied)) problems.push('lean report publicCopied is missing or not a list');
  return groups;
}

/**
 * Checks a parsed ghostpay-lean-build/1 report. Returns { problems, modules } where modules counts rendered modules
 * inspected. A report that cannot prove what it rendered is a problem, never a pass.
 *
 * Limitation: this proves which source modules were rendered, by path. It cannot prove that product code copied into
 * a core module is dormant; that is a separate source and shared-core retention review.
 */
export function checkReportExclusions(report) {
  const problems = [];
  if (report === null || typeof report !== 'object' || Array.isArray(report)) return { problems: ['lean report is not an object'], modules: 0 };
  if (report.format !== 'ghostpay-lean-build/1') problems.push('lean report has an unexpected format');
  if (report.profile !== 'lean') problems.push('release exclusions are only verified for the lean profile');
  const groups = reportGroups(report, problems);
  let modules = 0;
  let appModules = 0;
  for (const { chunk, worker } of groups) {
    for (const m of chunk.modules) {
      const id = typeof m?.id === 'string' ? m.id : '';
      if (id === '') {
        problems.push(`lean report chunk ${chunk.fileName} has a module without id`);
        continue;
      }
      // The writer always records a number; a missing or malformed length cannot prove the module was tree-shaken.
      const rendered = m.renderedLength;
      if (typeof rendered !== 'number' || !Number.isFinite(rendered) || rendered < 0) {
        problems.push(`lean report module ${id} has a missing or malformed renderedLength`);
        continue;
      }
      if (rendered === 0) continue;
      modules += 1;
      if (!worker) appModules += 1;
      const product = stoppedProductForModule(id);
      if (product !== undefined) problems.push(`stopped product ${describe(product)} module rendered into the site: ${id}`);
    }
  }
  if (Array.isArray(report.chunks) && report.chunks.length > 0 && appModules === 0) {
    problems.push('lean report has no rendered application module evidence');
  }
  if (Array.isArray(report.publicCopied)) {
    for (const name of report.publicCopied) {
      if (typeof name !== 'string' || name === '') {
        problems.push('lean report publicCopied has a non-string or empty entry');
        continue;
      }
      const product = stoppedProductForModule(`public/${name}`);
      if (product !== undefined) problems.push(`stopped product ${describe(product)} public file copied into the site: ${name}`);
    }
  }
  return { problems, modules };
}

/** Checks emitted file names under siteDir. Symlinks are reported, never followed. */
export function checkSiteExclusions(siteDir) {
  const problems = [];
  let files = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const rel = relative(siteDir, full).split(sep).join('/');
      const st = lstatSync(full);
      if (st.isSymbolicLink()) problems.push(`${rel}: symlink in site output`);
      else if (st.isDirectory()) walk(full);
      else {
        files += 1;
        const product = stoppedProductForModule(`site/${rel}`);
        if (product !== undefined) problems.push(`stopped product ${describe(product)} file emitted into the site: ${rel}`);
      }
    }
  };
  walk(siteDir);
  return { problems, files };
}

/** Full check of a lean report file and, optionally, its emitted site directory. */
export function verifyReleaseExclusions(reportPath, siteDir) {
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (e) {
    return { problems: [`cannot read lean report: ${e instanceof Error ? e.message : String(e)}`], modules: 0, files: 0 };
  }
  const fromReport = checkReportExclusions(report);
  const fromSite = siteDir === undefined ? { problems: [], files: 0 } : checkSiteExclusions(siteDir);
  return { problems: [...fromReport.problems, ...fromSite.problems], modules: fromReport.modules, files: fromSite.files };
}

/** True when this file is the process entry point, also when invoked through a symlink or a relative path. */
function isMain() {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMain()) {
  const [reportPath, siteDir] = process.argv.slice(2);
  if (reportPath === undefined) {
    console.error('usage: verify-release-exclusions.mjs <ghostpay-lean-build.json> [<site-dir>]');
    process.exit(2);
  }
  const { problems, modules, files } = verifyReleaseExclusions(reportPath, siteDir);
  if (problems.length > 0) {
    console.error('Release-exclusion verification FAILED:');
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }
  const ids = STOPPED_PRODUCTS.map((p) => p.id).join(', ');
  console.log(`Release exclusions verified: ${String(modules)} rendered modules${siteDir === undefined ? '' : ` and ${String(files)} site files`} contain no ${ids} module.`);
}
