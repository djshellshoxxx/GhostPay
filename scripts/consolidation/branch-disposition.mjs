import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[0-9a-f]{40}$/;
const ordinaryDoc = /^(docs\/|\.github\/ISSUE_TEMPLATE\/|README(?:\.md)?$|CHANGELOG(?:\.md)?$|LICENSE(?:\..*)?$)/;
const canRetry = new Set([429, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function assertSha(sha) {
  if (!shaPattern.test(sha)) throw new Error(`Invalid Git SHA: ${String(sha)}`);
  return sha;
}

export function asTreeMap(tree) {
  if (tree?.truncated === true || !Array.isArray(tree?.tree)) return null;
  const map = new Map();
  for (const entry of tree.tree) {
    if (entry.type !== 'blob' && entry.type !== 'commit') continue;
    if (typeof entry.path !== 'string' || typeof entry.sha !== 'string') return null;
    if (map.has(entry.path)) return null;
    map.set(entry.path, { sha: entry.sha, mode: entry.mode, type: entry.type });
  }
  return map;
}

export function diffTrees(baseTree, headTree) {
  const before = asTreeMap(baseTree), after = asTreeMap(headTree);
  if (!before || !after) return { complete: false, paths: [], reason: 'tree-truncated-or-invalid' };
  const paths = [];
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(path), b = after.get(path);
    if (a?.sha === b?.sha && a?.mode === b?.mode && a?.type === b?.type) continue;
    paths.push({ path, status: !a ? 'added' : !b ? 'deleted' : 'changed', before: a?.sha ?? null, after: b?.sha ?? null });
  }
  paths.sort((a,b) => a.path.localeCompare(b.path, 'en'));
  return { complete: true, paths };
}

export function classifyBranch({ compare, diff, ownerPrs = [] }) {
  if (compare?.ahead_by === 0 && (compare?.status === 'behind' || compare?.status === 'identical')) {
    return { disposition: 'ancestor-in-main', reviewRequired: false, evidence: 'GitHub compare ahead_by=0' };
  }
  if (!diff.complete) return { disposition: 'indeterminate', reviewRequired: true, evidence: diff.reason };
  if (diff.paths.length === 0) return { disposition: 'tree-equivalent', reviewRequired: false, evidence: 'Exact complete Git-tree path/mode/blob comparison' };
  if (diff.paths.every(x => ordinaryDoc.test(x.path))) return { disposition: 'documentation-or-evidence-only', reviewRequired: true, evidence: 'All changed paths are documentation; semantic disposition still requires review' };
  if (ownerPrs.length) return { disposition: 'unique-under-active-pr', reviewRequired: true, evidence: 'Unique path/blob differences are owned by open PRs' };
  return { disposition: 'unique-needs-review', reviewRequired: true, evidence: 'Unique path/blob differences; safety and semantic value not established' };
}

export function summarize(records) {
  const counts = {};
  for (const r of records) counts[r.disposition] = (counts[r.disposition] || 0) + 1;
  return { ...counts, total: records.length, unresolved: records.filter(x => x.reviewRequired !== false).length };
}

export function makeGitHubReader({ fetchImpl = fetch, token = process.env.GITHUB_TOKEN, baseUrl = 'https://api.github.com' } = {}) {
  return async (route) => {
    const url = new URL(route, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) throw new Error('Cross-origin API URL refused');
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'GhostPay-read-only-branch-audit' };
    if (token) headers.Authorization = `Bearer ${token}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetchImpl(url, { headers, method: 'GET' });
      if (response.ok) return response.json();
      if (!canRetry.has(response.status) || attempt === 2) {
        throw new Error(`GitHub API ${response.status} ${url.pathname}; no data accepted`);
      }
      const retryAfter = Number(response.headers?.get('retry-after') || 0);
      await sleep(retryAfter > 0 && retryAfter <= 10 ? retryAfter * 1000 : 250 * (attempt + 1));
    }
    throw new Error('Unexpected retry state');
  };
}

export async function paginate(read, route, perPage = 100) {
  const entries = [];
  for (let page = 1; page <= 1000; page++) {
    const connector = route.includes('?') ? '&' : '?';
    const part = await read(`${route}${connector}per_page=${perPage}&page=${page}`);
    if (!Array.isArray(part)) throw new Error(`Invalid page ${page} at ${route}`);
    if (!part.length) return entries;
    entries.push(...part);
    if (part.length < perPage) return entries;
  }
  throw new Error(`Pagination safety bound exceeded for ${route}`);
}

export async function audit({ read, repo, prior = null, max = Infinity, selected = null, now = () => new Date().toISOString() }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repository must be owner/name');
  const api = `/repos/${repo}`;
  const initial = await read(`${api}/git/ref/heads/main`);
  const main = assertSha(initial.object?.sha);
  const [branchesRaw, prsRaw] = await Promise.all([
    paginate(read, `${api}/branches`),
    paginate(read, `${api}/pulls?state=open`),
  ]);
  const branches = branchesRaw.map(b => ({ branch: b.name, sha: assertSha(b.commit?.sha) }));
  const branchNames = new Set(branches.map(b => b.branch));
  if (branchNames.size !== branches.length) throw new Error('Duplicate branch in paginated census; retry');
  const activePrs = prsRaw.map(p => ({ number: p.number, title: p.title, head: p.head?.ref, headSha: p.head?.sha, base: p.base?.ref, draft: p.draft, state: p.state }));
  const prsByBranch = new Map();
  for (const p of activePrs) if (branchNames.has(p.head)) (prsByBranch.get(p.head) ?? (prsByBranch.set(p.head, []), prsByBranch.get(p.head))).push(p);
  const priorRecords = new Map((prior?.records || []).map(x => [x.branch, x]));
  let mainTree;
  async function getTree(sha) {
    const commit = await read(`${api}/git/commits/${sha}`);
    const treeSha = assertSha(commit.tree?.sha);
    return read(`${api}/git/trees/${treeSha}?recursive=1`);
  }
  const records = [];
  let scanned = 0;
  for (const b of branches) {
    const ownerPrs = prsByBranch.get(b.branch) || [];
    const existing = priorRecords.get(b.branch);
    if (existing?.sha === b.sha && prior.main === main && existing?.disposition !== 'pending' && existing?.disposition !== 'scan-error') {
      records.push({ ...existing, openPrs: ownerPrs.map(x => x.number) });
      continue;
    }
    if ((selected && !selected.has(b.branch)) || scanned >= max) {
      records.push({ branch:b.branch, sha:b.sha, disposition:'pending', reviewRequired:true, openPrs:ownerPrs.map(x=>x.number) });
      continue;
    }
    scanned++;
    try {
      if (b.branch === 'main') {
        records.push({ branch:b.branch, sha:b.sha, disposition:'ancestor-in-main', reviewRequired:false, openPrs:[] });
        continue;
      }
      const compare = await read(`${api}/compare/${main}...${encodeURIComponent(b.branch)}`);
      const ancestry = { status: compare.status, ahead: compare.ahead_by, behind: compare.behind_by, mergeBase: compare.merge_base_commit?.sha || null, compareListedFiles: compare.files?.length ?? null, compareFileListMayBeCapped: (compare.files?.length ?? 0) >= 300 };
      if (compare.ahead_by === 0 && (compare.status === 'behind' || compare.status === 'identical')) {
        records.push({ branch:b.branch, sha:b.sha, ...ancestry, ...classifyBranch({compare, diff:{complete:true,paths:[]},ownerPrs}), openPrs:ownerPrs.map(x=>x.number), files:[] });
        continue;
      }
      mainTree ??= await getTree(main);
      const headTree = await getTree(b.sha);
      const diff = diffTrees(mainTree, headTree);
      const proof = classifyBranch({ compare, diff, ownerPrs });
      const currentHead = await read(`${api}/git/ref/heads/${encodeURIComponent(b.branch)}`);
      if (currentHead.object?.sha !== b.sha) {
        records.push({ branch:b.branch, sha:b.sha, disposition:'scan-error', reviewRequired:true, reason:'branch-head-changed-during-scan', observedHead:currentHead.object?.sha || null, openPrs:ownerPrs.map(x=>x.number) });
      } else {
        records.push({ branch:b.branch, sha:b.sha, ...ancestry, ...proof, totalChangedPaths:diff.paths.length, completeTree:diff.complete, files:diff.paths, openPrs:ownerPrs.map(x=>x.number) });
      }
    } catch(e) {
      records.push({ branch:b.branch, sha:b.sha, disposition:'scan-error', reviewRequired:true, reason:String(e), openPrs:ownerPrs.map(x=>x.number) });
    }
  }
  const finalMain = await read(`${api}/git/ref/heads/main`);
  if (finalMain.object?.sha !== main) throw new Error(`Main changed from ${main} during scan; discard snapshot and retry`);
  return {schema:'ghostpay-branch-disposition/1', repository:repo, checkedAt:now(), main, branches:branches.length, openPRs:activePrs.length, scannedThisRun:scanned, counts:summarize(records), records, prs:activePrs};
}

function parseArgs(argv) {
  const opts = { repo: 'djshellshoxxx/GhostPay', out: 'ghostpay-branch-disposition.json', max: Infinity, include: [] };
  for(let i=0; i<argv.length; i++) {
    const key=argv[i];
    if (['--repo','--out','--max','--resume','--branch'].includes(key)) {
      if (!argv[i+1]) throw new Error(`Missing value for ${key}`);
      const val=argv[++i];
      if(key==='--repo') opts.repo=val;
      if(key==='--out') opts.out=val;
      if(key==='--max') { opts.max=Number(val); if(!Number.isSafeInteger(opts.max)||opts.max<1) throw new Error('Invalid --max'); }
      if(key==='--resume') opts.resume=val;
      if(key==='--branch') opts.include.push(val);
    } else throw new Error(`Unknown argument: ${key}`);
  }
  return opts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const prior = args.resume ? JSON.parse(await readFile(args.resume, 'utf8')) : null;
    const selected = args.include.length ? new Set(args.include) : null;
    const result = await audit({ read:makeGitHubReader(), repo:args.repo, prior, max:args.max, selected });
    await writeFile(args.out, JSON.stringify(result, null, 2) + '\n', { flag:'w', mode:0o600 });
    process.stdout.write(JSON.stringify({out:args.out, main:result.main, branches:result.branches, openPRs:result.openPRs, scannedThisRun:result.scannedThisRun, counts:result.counts})+'\n');
  } catch(e) { process.stderr.write(`Branch audit failed: ${e.message}\n`); process.exitCode=1; }
}
