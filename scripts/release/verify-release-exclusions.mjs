#!/usr/bin/env node
// Emitted-artifact release-exclusion check (owner stop-work directive, AGENTS.md 2026-11-25).
//
// Verifies a built lean site, not its source: every module the lean module report says was rendered into the site
// (application chunks and Worker chunks), every public file copied into it, and every emitted file name must belong to
// no stopped or deferred product. The product table lives in apps/web/scripts/stoppedProducts.mjs, which the lean
// build guard also uses, so the build and this check cannot drift apart.
//
// Usage: node scripts/release/verify-release-exclusions.mjs <ghostpay-lean-build.json> [<site-dir>]
// Exit 0 with a one-line summary when clean; exit 1 listing every problem otherwise.
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOPPED_PRODUCTS, stoppedProductForModule } from '../../apps/web/scripts/stoppedProducts.mjs';

function describe(product) {
  return `${product.id} ${product.name} (${product.status})`;
}

/** Module groups of a lean report: application chunks plus each Worker build's chunks. */
function moduleGroups(report) {
  const chunks = Array.isArray(report.chunks) ? report.chunks : [];
  const workers = Array.isArray(report.workers) ? report.workers.flatMap((w) => (Array.isArray(w?.chunks) ? w.chunks : [])) : [];
  return [...chunks, ...workers];
}

/**
 * Checks a parsed ghostpay-lean-build/1 report. Returns { problems, modules } where modules counts rendered modules
 * inspected. A report that cannot prove what it rendered is a problem, never a pass.
 */
export function checkReportExclusions(report) {
  const problems = [];
  if (report === null || typeof report !== 'object' || Array.isArray(report)) return { problems: ['lean report is not an object'], modules: 0 };
  if (report.format !== 'ghostpay-lean-build/1') problems.push('lean report has an unexpected format');
  if (report.profile !== 'lean') problems.push('release exclusions are only verified for the lean profile');
  const groups = moduleGroups(report);
  if (groups.length === 0) problems.push('lean report lists no chunks to verify');
  let modules = 0;
  for (const chunk of groups) {
    if (!Array.isArray(chunk?.modules)) {
      problems.push(`lean report chunk ${String(chunk?.fileName)} has no module list`);
      continue;
    }
    for (const m of chunk.modules) {
      const id = typeof m?.id === 'string' ? m.id : '';
      if (id === '') {
        problems.push(`lean report chunk ${String(chunk.fileName)} has a module without id`);
        continue;
      }
      const rendered = m.renderedLength;
      if (rendered !== undefined && (typeof rendered !== 'number' || !Number.isFinite(rendered) || rendered < 0)) {
        problems.push(`lean report module ${id} has a malformed renderedLength`);
        continue;
      }
      if ((rendered ?? 0) === 0) continue;
      modules += 1;
      const product = stoppedProductForModule(id);
      if (product !== undefined) problems.push(`stopped product ${describe(product)} module rendered into the site: ${id}`);
    }
  }
  const copied = report.publicCopied === undefined ? [] : report.publicCopied;
  if (!Array.isArray(copied)) problems.push('lean report publicCopied is not a list');
  else {
    for (const name of copied) {
      const product = typeof name === 'string' ? stoppedProductForModule(`public/${name}`) : undefined;
      if (typeof name !== 'string') problems.push('lean report publicCopied has a non-string entry');
      else if (product !== undefined) problems.push(`stopped product ${describe(product)} public file copied into the site: ${name}`);
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

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
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
