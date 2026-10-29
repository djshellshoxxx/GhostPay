// Claude Code Workflow script (reference copy). Runs only in Claude Code's Workflow tool, which provides agent(),
// parallel(), pipeline(), phase() and args. Other agents can reuse the prompts and the process; see scripts/agents/README.md.
// Written by Claude Code (AI agent) for GhostPay, 2026-10; same licence as the repository.
export const meta = {
  name: 'verify-audit-findings',
  description: 'Adversarially verify GhostPay security-audit findings per module batch (refute lens + impact lens, adjudicate disputes and High+ claims)',
  phases: [
    { title: 'Verify', detail: 'two independent lenses per batch: reproduce/refute and impact/context' },
    { title: 'Adjudicate', detail: 'third opinion on disputed findings and on every High/Critical claim' },
  ],
}

const SCRATCH = args.scratch  // a scratch directory outside the repository
const NOTES = SCRATCH + '/audit'
const RANK = { None: 0, Info: 1, Low: 2, Medium: 3, High: 4, Critical: 5 }
const NAMES = ['None', 'Info', 'Low', 'Medium', 'High', 'Critical']

const VERDICTS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'Info', 'None'] },
          known_status: { type: 'string', enum: ['new', 'known-open', 'known-accepted', 'already-fixed'] },
          reasoning: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['id', 'verdict', 'severity', 'known_status', 'reasoning', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
}

function common(batch, lens) {
  const dir = `${SCRATCH}/verify/${batch.id}-${lens}`
  return `You are verifying security-audit findings for GhostPay: client-side stealth-address payments. Lean beta scope = one EVM chain, invoice -> pay -> detect/receipt -> sweep -> encrypted backup/restore; Base Sepolia (84532) is the beta test chain. BTC/Solana/Tron views ship in the bundle but are later-preserved; policy accounts are behind VITE_GHOSTPAY_EXPERIMENTAL_POLICY (default off); most other packages are later-preserved and not shipped. Repository: <repo> at HEAD 6a3e85c. Application source there is identical to the audited commit 9ce5614 (only package.json, package-lock.json and docs differ).

RULES: read-only. Do not create, edit or delete any file in <repo>; no state-changing git commands; no npm install/ci/build; no docker. You may read and grep anything, use git log/show, run existing tests without coverage, and write reproductions ONLY under ${dir}/ (create it). For web-app reproductions copy the pattern of the auditors' scratch vitest configs (${SCRATCH}/audit-lane1/vitest.scratch.config.ts or ${SCRATCH}/audit-lane2/vitest.config.mts) into your own dir and point it at your own test files. The auditors' own reproductions live under ${SCRATCH}/audit-lane<N>/.

FINDINGS TO VERIFY (batch ${batch.id}: ${batch.title}): ${batch.ids.join(', ')}.
Their full text is in these notes files (find the lines starting with each ID): ${batch.notes.map((n) => NOTES + '/' + n).join(', ')}.${batch.extra ? '\nBatch note: ' + batch.extra : ''}

Severity rubric: Critical = theft or permanent loss of funds or keys without user error. High = plausible fund loss, key exposure, auth bypass, forged payment acceptance, a cheap attacker causing a service-wide outage, or a break of the core privacy promise. Medium = bounded loss or denial needing realistic preconditions, or a safety control that silently does not work. Low = defense in depth or unlikely preconditions. Info = no direct impact.
known_status: 'new' (not documented anywhere), 'known-open' (already documented as open; still real), 'known-accepted' (documented AND explicitly accepted by the owner/spec), 'already-fixed' (the code already handles it).

Return one entry per finding ID, in order. Keep reasoning <= 500 characters, evidence <= 500 characters (file:line refs, commands you ran and their key output), fix <= 400 characters (the minimal correct fix, or 'none').`
}

function lensA(batch) {
  return common(batch, 'A') + `

YOUR LENS: REPRODUCE / REFUTE. For each finding, open the cited code and try hard to refute it. Is the code really as described? Does the failure path really happen? Re-run the auditor's reproduction if one exists and check it exercises the real code path (not a mock that cannot occur in production); otherwise write your own minimal reproduction or trace. Answer 'refuted' (with evidence) when the claim is wrong or cannot happen, 'confirmed' only with concrete evidence, 'uncertain' if you cannot decide. Your severity is your own calibrated rating, not the auditor's.`
}

function lensB(batch) {
  return common(batch, 'B') + `

YOUR LENS: IMPACT AND CONTEXT. For each finding determine: reachability in what actually ships (default web build and flags, default relayer config, documented deploy recipes); how realistic the preconditions are; whether other code already mitigates it (other guards, contract checks, UI gates); whether it is already documented (search docs/audits, docs/handoffs, docs/threat-model, DEVIATIONS.md files, README audit follow-ups); the correct severity per the rubric; and whether the proposed fix is correct, minimal and free of side effects (give a better one if not). Verdict 'confirmed' if the issue is real as stated (even if you lower its severity), 'refuted' if it is not real or fully mitigated, 'uncertain' otherwise.`
}

function lensC(batch, contested) {
  const lines = contested.map((c) => `- ${c.id}: lens A said ${c.a ? c.a.verdict + '/' + c.a.severity + ' (' + c.a.reasoning.slice(0, 400) + ')' : 'nothing'}; lens B said ${c.b ? c.b.verdict + '/' + c.b.severity + ' (' + c.b.reasoning.slice(0, 400) + ')' : 'nothing'}`).join('\n')
  return common({ ...batch, ids: contested.map((c) => c.id) }, 'C') + `

YOUR LENS: ADJUDICATE. These findings were disputed by two independent verifiers, or at least one rated them High or Critical (which always gets a third opinion). Prior verdicts:
${lines}
Re-check each yourself from the code (do not just pick a side). Default to 'refuted' if the claimed failure cannot actually occur; 'confirmed' only with concrete evidence; calibrate severity strictly with the rubric.`
}

function byId(res) {
  const m = {}
  for (const f of (res && res.findings) || []) m[f.id] = f
  return m
}

function decide(id, a, b, c) {
  const votes = [a, b, c].filter(Boolean)
  const conf = votes.filter((v) => v.verdict === 'confirmed')
  const ref = votes.filter((v) => v.verdict === 'refuted').length
  let verdict = 'uncertain'
  if (votes.length === 2 && a && b && a.verdict === b.verdict) verdict = a.verdict
  else if (conf.length >= 2) verdict = 'confirmed'
  else if (ref >= 2) verdict = 'refuted'
  const sevs = (conf.length ? conf : votes).map((v) => RANK[v.severity] ?? 0).sort((x, y) => x - y)
  const severity = NAMES[sevs.length ? sevs[Math.floor((sevs.length - 1) / 2)] : 0]
  const known = (c || b || a || {}).known_status || 'new'
  const fix = ((b && b.fix) || (c && c.fix) || (a && a.fix) || '').slice(0, 400)
  const why = ((c && c.reasoning) || (b && b.reasoning) || (a && a.reasoning) || '').slice(0, 450)
  const tally = votes.map((v, i) => `${['A', 'B', 'C'][[a, b, c].indexOf(v)] || i}:${v.verdict}/${v.severity}`).join(' ')
  return { id, verdict, severity, known, tally, why, fix }
}

const batches = args.batches
log(`Verifying ${batches.reduce((n, b) => n + b.ids.length, 0)} findings in ${batches.length} batches`)

const results = await pipeline(
  batches,
  async (batch) => {
    const [a, b] = await parallel([
      () => agent(lensA(batch), { label: `${batch.id}:refute`, phase: 'Verify', schema: VERDICTS }),
      () => agent(lensB(batch), { label: `${batch.id}:impact`, phase: 'Verify', schema: VERDICTS }),
    ])
    return { batch, a: byId(a), b: byId(b) }
  },
  async (r) => {
    const contested = []
    for (const id of r.batch.ids) {
      const a = r.a[id]
      const b = r.b[id]
      const hi = (a && RANK[a.severity] >= 4) || (b && RANK[b.severity] >= 4)
      const split = !a || !b || a.verdict !== b.verdict || Math.abs((RANK[a.severity] ?? 0) - (RANK[b.severity] ?? 0)) >= 2
      if (hi || split) contested.push({ id, a, b })
    }
    let c = {}
    if (contested.length) {
      c = byId(await agent(lensC(r.batch, contested), { label: `${r.batch.id}:adjudicate`, phase: 'Adjudicate', schema: VERDICTS }))
    }
    return r.batch.ids.map((id) => decide(id, r.a[id], r.b[id], c[id]))
  },
)

const flat = results.filter(Boolean).flat()
const dropped = batches.length - results.filter(Boolean).length
if (dropped) log(`WARNING: ${dropped} batch(es) failed and returned no verdicts`)
return { verified: flat, failedBatches: dropped }