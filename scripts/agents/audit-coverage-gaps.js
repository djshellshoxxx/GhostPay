// Claude Code Workflow script (reference copy). Runs only in Claude Code's Workflow tool, which provides agent(),
// parallel(), pipeline(), phase() and args. Other agents can reuse the prompts and the process; see scripts/agents/README.md.
// Written by Claude Code (AI agent) for GhostPay, 2026-10; same licence as the repository.
export const meta = {
  name: 'audit-coverage-gaps',
  description: 'Find security issues in areas the lane audits did not cover, then verify each finder batch with refute + impact lenses',
  phases: [
    { title: 'Find', detail: 'one deep auditor per uncovered area' },
    { title: 'Verify', detail: 'refute lens and impact lens per area' },
    { title: 'Adjudicate', detail: 'third opinion on disputed and High/Critical findings' },
  ],
}

const SCRATCH = args.scratch  // a scratch directory outside the repository
const RANK = { None: 0, Info: 1, Low: 2, Medium: 3, High: 4, Critical: 5 }
const NAMES = ['None', 'Info', 'Low', 'Medium', 'High', 'Critical']

const FOUND = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'Info'] },
          location: { type: 'string' },
          claim: { type: 'string' },
          path: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
          confidence: { type: 'string', enum: ['confirmed', 'likely', 'speculative'] },
        },
        required: ['id', 'severity', 'location', 'claim', 'path', 'evidence', 'fix', 'confidence'],
      },
    },
    checked_ok: { type: 'string' },
    not_covered: { type: 'string' },
  },
  required: ['findings', 'checked_ok', 'not_covered'],
}

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

const CONTEXT = `GhostPay: client-side stealth-address payments. Lean beta scope = one EVM chain, invoice -> pay -> detect/receipt -> sweep -> encrypted backup/restore; Base Sepolia (84532) is the beta test chain. BTC/Solana/Tron views ship in the web bundle but are later-preserved; policy accounts are behind VITE_GHOSTPAY_EXPERIMENTAL_POLICY (default off). Repository: <repo> at HEAD 6a3e85c.`

const RUBRIC = `Severity rubric: Critical = theft or permanent loss of funds or keys without user error. High = plausible fund loss, key exposure, auth bypass, forged payment acceptance, a cheap attacker causing a service-wide outage, or a break of the core privacy promise. Medium = bounded loss or denial needing realistic preconditions, or a safety control that silently does not work. Low = defense in depth or unlikely preconditions. Info = no direct impact.`

function rules(dir) {
  return `RULES: read-only. Do not create, edit or delete any file in <repo>; no state-changing git commands; no npm install/ci/build; no docker. You may read and grep anything, use git log/show, run existing tests without coverage, and write scratch files/reproductions ONLY under ${dir}/ (create it). For web-app reproductions copy the pattern of ${SCRATCH}/audit-lane1/vitest.scratch.config.ts into your dir. Prior audit docs: docs/audits/*.md, docs/threat-model/THREAT_MODEL.md; avoid re-reporting items documented as fixed or explicitly accepted, but check whether documented fixes really hold.`
}

function finderPrompt(g) {
  return `You are a security auditor. ${CONTEXT}
${rules(SCRATCH + '/gap/' + g.id + '-find')}

YOUR AREA (${g.id}: ${g.title}): ${g.scope}

${RUBRIC}
Report concrete findings only (no generic advice). IDs: ${g.id}-01, ${g.id}-02, ... For each: severity, location (file:line), claim (what is wrong, <= 500 chars), path (realistic exploit/failure path with preconditions, <= 500 chars), evidence (quoted code and/or a reproduction you ran with its output, <= 500 chars), fix (minimal, <= 300 chars), confidence. Also checked_ok (<= 800 chars) and not_covered (<= 400 chars). An empty findings list is a valid answer if the area is clean.`
}

function verifyPrompt(g, found, lens) {
  const dir = `${SCRATCH}/gap/${g.id}-${lens}`
  const list = found.findings.map((f) => `- ${f.id} [${f.severity}, ${f.confidence}] ${f.location}: ${f.claim} PATH: ${f.path} EVIDENCE: ${f.evidence} FIX: ${f.fix}`).join('\n')
  const lensText = lens === 'A'
    ? `YOUR LENS: REPRODUCE / REFUTE. Open the cited code and try hard to refute each claim; reproduce where feasible (real code paths, not impossible mocks). 'refuted' with evidence if wrong, 'confirmed' only with concrete evidence, else 'uncertain'.`
    : `YOUR LENS: IMPACT AND CONTEXT. Determine reachability in what actually ships (default web build/flags, default relayer config, documented deploy/distribution), realism of preconditions, mitigations elsewhere, whether already documented (docs/audits, handoffs, DEVIATIONS.md, threat model), correct severity, and whether the fix is correct and minimal (give a better one if not).`
  return `You are verifying security findings. ${CONTEXT}
${rules(dir)}

FINDINGS (area ${g.id}: ${g.title}):
${list}

${RUBRIC}
known_status: 'new', 'known-open', 'known-accepted' (documented AND accepted), 'already-fixed'.
${lensText}
Return one entry per finding ID. reasoning <= 500 chars, evidence <= 500 chars, fix <= 400 chars.`
}

function byId(res) {
  const m = {}
  for (const f of (res && res.findings) || []) m[f.id] = f
  return m
}

function decide(f, a, b, c) {
  const votes = [a, b, c].filter(Boolean)
  const conf = votes.filter((v) => v.verdict === 'confirmed')
  const ref = votes.filter((v) => v.verdict === 'refuted').length
  let verdict = 'uncertain'
  if (votes.length === 2 && a && b && a.verdict === b.verdict) verdict = a.verdict
  else if (conf.length >= 2) verdict = 'confirmed'
  else if (ref >= 2) verdict = 'refuted'
  const sevs = (conf.length ? conf : votes).map((v) => RANK[v.severity] ?? 0).sort((x, y) => x - y)
  const severity = NAMES[sevs.length ? sevs[Math.floor((sevs.length - 1) / 2)] : 0]
  const tally = [['A', a], ['B', b], ['C', c]].filter((p) => p[1]).map((p) => `${p[0]}:${p[1].verdict}/${p[1].severity}`).join(' ')
  return {
    id: f.id,
    claimed: f.severity,
    location: f.location.slice(0, 200),
    claim: f.claim.slice(0, 400),
    verdict,
    severity,
    known: (c || b || a || {}).known_status || 'new',
    tally,
    why: ((c && c.reasoning) || (b && b.reasoning) || (a && a.reasoning) || '').slice(0, 400),
    fix: ((b && b.fix) || (c && c.fix) || f.fix || '').slice(0, 400),
  }
}

const results = await pipeline(
  args.gaps,
  (g) => agent(finderPrompt(g), { label: `${g.id}:find`, phase: 'Find', schema: FOUND }),
  async (found, g) => {
    if (!found || !found.findings.length) return { g, found, a: {}, b: {} }
    const [a, b] = await parallel([
      () => agent(verifyPrompt(g, found, 'A'), { label: `${g.id}:refute`, phase: 'Verify', schema: VERDICTS }),
      () => agent(verifyPrompt(g, found, 'B'), { label: `${g.id}:impact`, phase: 'Verify', schema: VERDICTS }),
    ])
    return { g, found, a: byId(a), b: byId(b) }
  },
  async (r) => {
    if (!r.found || !r.found.findings.length) {
      return { area: r.g.id, findings: [], checked_ok: r.found ? r.found.checked_ok : 'finder failed', not_covered: r.found ? r.found.not_covered : '' }
    }
    const contested = r.found.findings.filter((f) => {
      const a = r.a[f.id]
      const b = r.b[f.id]
      const hi = (a && RANK[a.severity] >= 4) || (b && RANK[b.severity] >= 4)
      return hi || !a || !b || a.verdict !== b.verdict || Math.abs((RANK[a.severity] ?? 0) - (RANK[b.severity] ?? 0)) >= 2
    })
    let c = {}
    if (contested.length) {
      const prior = contested.map((f) => {
        const a = r.a[f.id]
        const b = r.b[f.id]
        return { ...f, claim: `${f.claim} [lens A: ${a ? a.verdict + '/' + a.severity + ' ' + a.reasoning.slice(0, 300) : 'none'}] [lens B: ${b ? b.verdict + '/' + b.severity + ' ' + b.reasoning.slice(0, 300) : 'none'}]` }
      })
      c = byId(await agent(verifyPrompt(r.g, { findings: prior }, 'C') + `\nYOUR LENS: ADJUDICATE. Two verifiers disagreed or one rated High/Critical; their verdicts are appended to each claim. Re-check from the code yourself; default to 'refuted' if the failure cannot actually occur.`, { label: `${r.g.id}:adjudicate`, phase: 'Adjudicate', schema: VERDICTS }))
    }
    return {
      area: r.g.id,
      findings: r.found.findings.map((f) => decide(f, r.a[f.id], r.b[f.id], c[f.id])),
      checked_ok: r.found.checked_ok.slice(0, 800),
      not_covered: r.found.not_covered.slice(0, 400),
    }
  },
)

return { areas: results.filter(Boolean) }