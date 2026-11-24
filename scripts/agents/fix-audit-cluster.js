// Claude Code Workflow script (reference copy). Runs only in Claude Code's Workflow tool, which provides agent(),
// parallel(), pipeline(), phase() and args. Other agents can reuse the prompts and the process; see scripts/agents/README.md.
// Written by Claude Code (AI agent) for GhostPay, 2026-10; same licence as the repository.
export const meta = {
  name: 'fix-audit-cluster',
  description: 'Implement verified audit fixes for one cluster in a prepared worktree, then adversarially review and revise until approved',
  phases: [
    { title: 'Implement', detail: 'regression test first (must fail), minimal fix, cluster checks' },
    { title: 'Review', detail: 'independent adversarial review of the diff' },
    { title: 'Revise', detail: 'address blocker/major review issues, then re-review' },
  ],
}

const c = args.cluster
const TRAILER = args.trailer ?? ''  // commit trailer lines required by the session, if any

const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    commits: { type: 'array', items: { type: 'string' } },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          outcome: { type: 'string', enum: ['fixed', 'deferred', 'not-reproduced', 'already-fixed'] },
          change: { type: 'string' },
          tests: { type: 'string' },
          fail_before: { type: 'string' },
        },
        required: ['id', 'outcome', 'change', 'tests', 'fail_before'],
      },
    },
    commands: { type: 'string' },
    open_questions: { type: 'string' },
  },
  required: ['status', 'commits', 'items', 'commands', 'open_questions'],
}

const REVIEW = {
  type: 'object',
  properties: {
    approve: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          where: { type: 'string' },
          problem: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'where', 'problem', 'suggestion'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['approve', 'issues', 'summary'],
}

const findings = c.items.map((f) => `- ${f.id} [${f.severity}]: ${f.what}\n  Recommended fix: ${f.fix}`).join('\n')

const SETUP = `Repository: GhostPay (client-side stealth-address payments; lean one-EVM beta). Work ONLY inside the prepared git worktree ${c.worktree} (branch ${c.branch}, based on ${c.base}; node_modules are installed and workspace packages built there; if you change a package under packages/, rebuild it with npm run build -w <pkg> before testing dependents). Do NOT modify <repo> or any other worktree, do not push, do not change git config, do not install new dependencies. Scratch files: ${c.scratch}/ only.
OWNERSHIP: you may modify only these paths: ${c.ownership.join(', ')}. If a correct fix needs another file, do not edit it; explain under open_questions.
CLUSTER CHECKS (all must pass before you finish): ${c.checks}`

function implementPrompt() {
  return `You are the implementer for audit-fix cluster ${c.id}: ${c.title}.
${SETUP}

VERIFIED FINDINGS TO FIX (independently confirmed; severities already calibrated):
${findings}
${c.notes ? '\nCLUSTER NOTES: ' + c.notes : ''}

METHOD for each finding:
1. Write a regression test (for docs/config-only items, an automated check where one fits, otherwise none) that FAILS on the current code. Run it and keep the failing output.
2. Implement the minimal correct fix that removes the root cause. Follow the surrounding code's style, comment density and naming. No unrelated refactors, no new dependencies, no feature flags flipped, no weakening/skipping/deleting tests or thresholds.
3. Re-run: the test passes. Then run the cluster checks.
If a finding needs an owner decision (cost, policy, deployment, legal), implement the obviously safe default if there is one; otherwise mark it 'deferred' with the reason. Commit coherent changes on ${c.branch} (git -C ${c.worktree} commit) with messages naming the finding IDs; every commit message must end with exactly these two lines:
${TRAILER}

RETURN: status, commit SHAs, per-finding outcome (change <= 300 chars, tests <= 200 chars, fail_before = the failing assertion/output before the fix <= 200 chars), commands you ran with results (<= 800 chars), open_questions (<= 500 chars).`
}

function reviewPrompt(impl, round) {
  return `You are an independent, adversarial code reviewer for audit-fix cluster ${c.id}: ${c.title} (review round ${round}).
Repository worktree: ${c.worktree}, branch ${c.branch}, base ${c.base}. Review the diff: git -C ${c.worktree} diff ${c.base}...${c.branch} and git -C ${c.worktree} log ${c.base}..${c.branch}.
You must not leave the worktree modified. To confirm a regression test really fails without the fix you may temporarily run git -C ${c.worktree} checkout ${c.base} -- <fixed source files>, run the test, then restore with git -C ${c.worktree} checkout ${c.branch} -- <same files>; before finishing, git -C ${c.worktree} status --porcelain must be empty. Scratch: ${c.scratch}/review-${round}/.

Findings the cluster had to fix:
${findings}

Implementer's report: ${JSON.stringify(impl).slice(0, 6000)}

Check adversarially: each finding is actually fixed at the root cause (not a symptom) and cannot be bypassed; no security or behavior regression elsewhere; edge cases and error paths; tests would fail without the fix and are not tautological or over-mocked; no scope creep or unrelated churn; matches surrounding style; docs/comments accurate; CI YAML and shell remain valid; ownership respected (${c.ownership.join(', ')}). Run the cluster checks yourself: ${c.checks}.
Approve only if there is no blocker or major issue. Keep problem/suggestion <= 300 chars each, summary <= 600 chars.`
}

function revisePrompt(review, round) {
  return `You are the implementer for audit-fix cluster ${c.id}: ${c.title} (revision ${round}).
${SETUP}

The independent reviewer did not approve. Address every blocker and major issue (and cheap minors) below, with tests where relevant, then re-run the cluster checks and commit on ${c.branch} (commit messages end with exactly these two lines:
${TRAILER}
).
REVIEW: ${JSON.stringify(review).slice(0, 6000)}

Findings of this cluster for reference:
${findings}

RETURN the same structure as before, describing the final state of every finding.`
}

phase('Implement')
let impl = await agent(implementPrompt(), { label: `${c.id}:implement`, phase: 'Implement', schema: RESULT })
let review = await agent(reviewPrompt(impl, 1), { label: `${c.id}:review-1`, phase: 'Review', schema: REVIEW })
let round = 1
while (review && !review.approve && round < 3) {
  round += 1
  log(`${c.id}: review ${round - 1} found ${review.issues.filter((i) => i.severity === 'blocker' || i.severity === 'major').length} blocker/major issue(s); revising`)
  impl = await agent(revisePrompt(review, round - 1), { label: `${c.id}:revise-${round - 1}`, phase: 'Revise', schema: RESULT })
  review = await agent(reviewPrompt(impl, round), { label: `${c.id}:review-${round}`, phase: 'Review', schema: REVIEW })
}
if (review && !review.approve) log(`${c.id}: NOT approved after ${round} review rounds; integrator must resolve the remaining issues`)
return { cluster: c.id, branch: c.branch, approved: Boolean(review && review.approve), rounds: round, impl, review }