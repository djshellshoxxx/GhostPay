#!/usr/bin/env python3
"""Generate docs/audits/24-ai-assisted-security-audit-2026-10-28.md from the audit 24 data set.

Purpose: keep the published report reproducible from the verified findings and the fix status, instead of editing a
long Markdown table by hand. Written by Claude Code (AI agent) for the GhostPay project, 2026-10-29. Same licence as
the repository.

Inputs (docs/audits/data/24/):
  all-verified.json  verified findings: severity, known/new, verifier verdicts
  full-text.json     untruncated finding text: why, evidence, fix
  titles.tsv         id <TAB> area <TAB> one-line title
  commit-map.json    finding id -> fix commits on the PR branch (absent = not fixed)
  status.json        per-item fix outcomes and per-round review results of the fix clusters (record-cluster.py)
Usage: python3 scripts/audit/gen-audit24-report.py [--data DIR] [OUT.md]
  defaults: --data docs/audits/data/24, OUT = docs/audits/24-ai-assisted-security-audit-2026-10-28.md
  paths stay inside docs/audits/data and docs/audits respectively; output must end in .md
To change a status: edit commit-map.json (fixed) or DEFERRED/ACCEPTED below (open), then re-run and review the diff.
"""
import argparse
import json
import os
import re
import tempfile
from pathlib import Path
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('--data', default=os.path.join(ROOT, 'docs', 'audits', 'data', '24'))
ap.add_argument('out', nargs='?', default=os.path.join(ROOT, 'docs', 'audits', '24-ai-assisted-security-audit-2026-10-28.md'))
args = ap.parse_args()
DATA_ROOT = Path(ROOT, 'docs', 'audits', 'data').resolve()
REPORT_ROOT = Path(ROOT, 'docs', 'audits').resolve()


def within(value, boundary):
    resolved = Path(value).resolve()
    if not resolved.is_relative_to(boundary):
        ap.error(f'path must stay within {boundary}')
    return resolved


A = within(args.data, DATA_ROOT)
OUT = within(args.out, REPORT_ROOT)
if OUT.suffix != '.md':
    ap.error('report output must be a Markdown (.md) file')


def audit_file(name):
    # Fixed filenames may still be symlinks; resolve each before reading it.
    return within(A / name, DATA_ROOT)

verified = json.load(open(audit_file('all-verified.json')))
titles = {}
areas = {}
for line in open(audit_file('titles.tsv')):
    fid, area, title = line.rstrip('\n').split('\t')
    titles[fid] = title
    areas[fid] = area
commits = json.load(open(audit_file('commit-map.json')))
fulltext = json.load(open(audit_file('full-text.json')))  # untruncated verifier text
status_data = json.load(open(audit_file('status.json')))

SEV_ORDER = ['High', 'Medium', 'Low', 'Info']

# Status of every finding that is not fixed on this branch. Keep in sync with the fix plan in the handoff.
IN_PROGRESS = {}  # cluster -> ids with unreviewed local work (none: every cluster was reviewed and merged)
PLANNED = {}  # cluster -> ids with a designed fix not started (none)
DEFERRED = {
    'L2-I1': 'Latent: the beta chain has no price feed and fiat quotes are later-preserved. Cap the price age and re-read the price before send before any feed is enabled.',
    'L2-I4': 'Info: bundled manifests are release-signed, so a lying RPC can only confirm an already-wrong signed manifest. Wire the secondary RPC into the read-back later.',
    'L4-I1': 'Release-format decision: add the domain prefix before the first real release signature (build validator, web loader, relayer config, ops monitor and the e2e fixture change together).',
    'L3-F8': 'Dead code. The underlying CSP/SRI build steps (S3-10/S3-11) stay open and are recorded in apps/web/DEVIATIONS.md.',
    'L5-08': 'Pricing default for the owner to tune; no effect on the beta chain.',
    'F1': 'Policy-scheme contracts are behind a flag that is off, and nothing is deployed. Fix before any deployment.',
    'F2': 'Only the flagged policy-scheme builder can produce it; remove or guard the buffer option before the flag is enabled.',
    'F3': 'Documentation drift for flagged contracts (PRIVACY-E2E-05 stays open).',
    'F4': 'Defense in depth for flagged contracts; tracked in DEVIATIONS R6/R9.',
    'G1-02': 'Embedding is later-preserved and off in the shipped build; the docs now state that frame-ancestors is the only gate (c4e3aea). Bind the profile to the invoice signer before enabling it.',
    'L8-02': 'Preserved package with no importer; must be sandboxed before any wiring.',
    'L8-03': 'Preserved package with no importer; needs a durable store before any use.',
    'L8-05': 'Preserved package with no importer (BITCOIN-08).',
    'L8-07': 'Preserved package used only by pool-relayer (not shipped).',
    'L8-08': 'Preserved package with no entry point or deploy recipe.',
    'L3-F9': 'Info: needs access to the browser profile and reveals the device-seller link and scan progress, no keys or funds (PRIVACY-E2E-09, ADR-0025). Open: list the identifiers in the THREAT_MODEL browser-profile row and add a confirmed "forget this seller\'s local scan data" action.',
}
ACCEPTED = ['F6', 'L8-01', 'L8-06', 'L8-09']  # previously accepted by design or by the owner

SCRATCH = re.compile(r'/tmp/claude-0/\S+|/root/\.claude/\S+')


def clean(text):
    text = SCRATCH.sub('(scratch)', text or '')
    text = re.sub(r"\b[AB]:(confirmed|uncertain|refuted)/\w+\b", '', text)
    text = text.replace("The auditor's fix is right.", '').replace("The auditor's fix is right;", '')
    return re.sub(r'\s+', ' ', text).strip()


def status_of(fid):
    if fid in commits:
        return 'fixed', ', '.join(f'`{c}`' for c in commits[fid])
    for c, ids in IN_PROGRESS.items():
        if fid in ids:
            return 'progress', c
    for c, ids in PLANNED.items():
        if fid in ids:
            return 'planned', c
    if fid in ACCEPTED:
        return 'accepted', ''
    if fid in DEFERRED:
        return 'deferred', DEFERRED[fid]
    raise SystemExit(f'no status for {fid}')


LABEL = {
    'fixed': 'Fixed in this branch',
    'progress': 'Fix in progress (local, unreviewed, not in this branch)',
    'planned': 'Fix planned (not started)',
    'deferred': 'Open (deferred)',
    'accepted': 'Accepted by design',
}

ids = sorted(verified, key=lambda k: (SEV_ORDER.index(verified[k]['severity']), k))
assert set(ids) == set(titles), (set(ids) ^ set(titles))
st = {k: status_of(k) for k in ids}
sev = Counter(verified[k]['severity'] for k in ids)
known = Counter(verified[k].get('known') for k in ids)
by = Counter((verified[k]['severity'], st[k][0]) for k in ids)


def row_counts():
    names = {'fixed': 'Fixed', 'progress': 'In progress', 'planned': 'Planned', 'deferred': 'Deferred', 'accepted': 'Accepted'}
    tot = Counter(st[k][0] for k in ids)
    cols = [c for c in names if tot[c]]
    head = '| Severity | Total | ' + ' | '.join(names[c] for c in cols) + ' |'
    sep = '|---|---:|' + '---:|' * len(cols)
    lines = [head, sep]
    for s in SEV_ORDER:
        lines.append(f'| {s} | {sev[s]} | ' + ' | '.join(str(by[(s, c)]) for c in cols) + ' |')
    lines.append(f'| **All** | **{len(ids)}** | ' + ' | '.join(f'**{tot[c]}**' for c in cols) + ' |')
    return '\n'.join(lines)


# Fix clusters and their review rounds: the last round's review issues are the open follow-ups, except those fixed
# later (FOLLOWUP_FIXED: (round, index in that round's issue list) -> commit).
CHAINS = [('A', 'scanning', ['A', 'AR', 'AR2']), ('B', 'sweep guards', ['B', 'BR']), ('B2', 'pay', ['B2', 'B2R']),
          ('C', 'seller keys', ['C', 'CR', 'CR2']), ('D', 'relayer', ['D', 'D2', 'D3']), ('E', 'hosting', ['E']),
          ('G', 'non-EVM chains', ['G', 'GR']), ('H', 'merchant plugins', ['H', 'H2', 'H3'])]
FOLLOWUP_FIXED = {('BR', 0): '97c86ab (B-R8)', ('GR', 1): '9a00a7a', ('CR2', 0): '2fcab7f (C-R12)', ('E', 0): 'a2b8e73 (E-R1)', ('E', 1): '583bfeb (E-R2)',
                  ('E', 2): '7d0f9c1 (E-R3)', ('E', 3): '583bfeb (E-R4)', ('E', 6): 'f6a20af (E-R7)'}


def first_sentence(text, limit=260):
    text = re.sub(r'\s+', ' ', SCRATCH.sub('(scratch)', text or '')).strip()
    m = re.match(r'(.+?[.;])(\s|$)', text)
    out = m.group(1) if m else text
    return out if len(out) <= limit else out[:limit - 1].rstrip() + '…'


def followups():
    clusters = status_data['_clusters']
    lines = ['| Cluster | Round | Severity | Where | Problem |', '|---|---|---|---|---|']
    n = Counter()
    for cid, area, rounds in CHAINS:
        last = rounds[-1]
        for i, issue in enumerate(clusters[last].get('review_issues', [])):
            if (last, i) in FOLLOWUP_FIXED:
                continue
            n[issue['severity']] += 1
            where = re.sub(r'\s+', ' ', issue['where']).strip().replace('|', '/').replace('`', "'")
            where = where if len(where) <= 110 else where[:109].rstrip() + '…'
            problem = first_sentence(issue['problem']).replace('|', '/')
            lines.append(f"| {cid} ({area}) | {last} | {issue['severity']} | `{where}` | {problem} |")
    return '\n'.join(lines), n


def table(filter_fn, with_detail):
    lines = ['| ID | Severity | Area | Finding | ' + ('Commits' if with_detail == 'fixed' else 'Status') + ' |',
             '|---|---|---|---|---|']
    for k in ids:
        if not filter_fn(k):
            continue
        s, extra = st[k]
        if with_detail == 'fixed':
            cell = extra
        elif s == 'progress':
            cell = f'In progress (cluster {extra})'
        elif s == 'planned':
            cell = f'Planned (cluster {extra})'
        elif s == 'deferred':
            cell = 'Deferred: ' + extra
        else:
            cell = 'Accepted by design'
        lines.append(f'| [{k}](#{k.lower()}) | {verified[k]["severity"]} | {areas[k]} | {titles[k]} | {cell} |')
    return '\n'.join(lines)


out = []
w = out.append
w('# AI-assisted security audit of the completed modules (2026-10-28)\n')
w('> **This is not a professional security audit.** It was carried out by AI agents (Claude Code) in one working session. '
  'It is evidence for the owner\'s own review: it is not an independent assessment, a certification or a guarantee that the code is secure. '
  'The findings were reproduced or traced in code by AI verifiers, and their severities are those agents\' judgment. '
  'The limits and the areas that were not covered are listed at the end.\n')
w('## Scope\n')
w('- **Baseline:** PR #37 head `6a3e85c` (lane reviews started at `9ce5614`; `6a3e85c` changes only the lockfile and an npm override).')
w('- **Covered:** what is complete or shipped.')
w('  - The lean one-EVM beta core: seller keys, vault, session and local storage; invoice creation and pay; scanning and the reconciliation ledger; sweeping and the sweep signing lock.')
w('  - The chain adapters and core crypto it uses.')
w('  - The sponsored-sweep relayer and its guard library.')
w('  - The hosting kit, deploy and infra recipes, and the CI and release workflows.')
w('  - The BTC, Solana and TRON views that ship in the default navigation (test networks only).')
w('  - The merchant plugins and examples.')
w('  - For preserved packages that are not shipped: reachability, i.e. whether anything ships or imports them.')
w('- **Not covered:** see [Limits](#limits). Contracts were reviewed only where the beta uses them (EIP-712 sweep, permit, nonces).\n')
w('## Method\n')
w('1. **Review lanes.** Eight lanes each reviewed one part of the code and wrote reproductions for their claims. The reproductions were scratch tests against the real code, and none is committed. The lanes were:')
w('   1. keys and storage')
w('   2. pay and sweep')
w('   3. scanning and privacy')
w('   4. chain adapters and non-EVM clients')
w('   5. the relayer')
w('   6. contracts in beta use')
w('   7. hosting, deploy and CI')
w('   8. preserved packages')
w('2. **Coverage-gap pass.** A second pass covered three areas the lanes did not reach:')
w('   - invoice links and embedding')
w('   - the non-EVM views and secret display')
w('   - the merchant plugins')
w('3. **Adversarial verification.** For every finding, one agent tried to refute it and another judged its real-world impact. A third agent adjudicated every disagreement and every High.')
w(f'   - All {len(ids)} reported findings were confirmed; none was refuted.')
w('   - Two lane notes were not sent for verification: L4-I2, a positive note that the in-house BTC BIP-32 derivation, Solana raw-scalar Ed25519 signing and the TRON protobuf and BTC header/Merkle/witness parsers were reviewed and found correct, and L5-09, an Info observation the lane itself marked "no action".')
w('   - Verification changed many lane severities. L4-01 went from Medium to High.')
w('   - L5-01 and L5-02 went from High to Medium, because the loss is relayer gas and the budgets cap it.')
w('   - L8-02 and L8-03 dropped to Info because nothing ships them.')
w('4. **Fixes.** For each area, one AI agent wrote a test that fails on the code before the change, then the smallest fix.')
w('   - A separate AI reviewer agent checked each fix. It re-ran the new tests against the base to confirm they fail there, and it ran the area\'s checks.')
w('   - When a reviewer approved a fix but raised issues, a follow-up round (A-R, B-R, ... items) fixed them and was reviewed again.')
w('   - Fixes are merged only after the combined test suites pass.')
w('   - Both the implementer and the reviewer are AI agents. Neither is a human reviewer.\n')
w('## Results\n')
w(f'{len(ids)} confirmed findings: {sev["High"]} High, {sev["Medium"]} Medium, {sev["Low"]} Low, {sev["Info"]} Info. '
  f'{known["new"]} are new. {known["known-open"]} were already recorded as open in earlier audits and {known["known-accepted"]} were already accepted by design.\n')
w(row_counts() + '\n')
w('Status meanings:')
w('- **Fixed:** the fix is in this branch with a test that fails before it, and an AI review approved it.')
w('- **Deferred:** left open on purpose, for the stated reason.')
w('- **Accepted:** already accepted by design or by the owner in earlier work.\n')
w('### The most important findings\n')
w('All High and Medium findings are fixed in this branch. The most important were:')
w('- **L1-01 (High), seller keys:** the idle lock could destroy the only copy of keys that were never backed up. Now each session records its custody (import, keystore download, vault save or waiver). The idle lock wipes keys only when a copy survives, otherwise it keeps them under a visible no-backup banner, and creating an invoice or publishing the meta-address waits for a backup.')
w('- **L4-01 (High), scanning:** a burst of ERC-5564 announcements in one block stopped every EVM scan behind it. Now read and log limits end a fetch at the last complete window, an oversized block is re-read for the manifest router only, and the scan reports the narrowed block instead of stopping.')
w('- **L2-F2 (Medium):** native direct sweeps failed on OP-stack chains because the L1 data fee was not reserved. The sweep now keeps back twice the oracle\'s L1 fee plus operator fee, and refuses clearly when the balance cannot cover it.')
w('- **L1-02 (Medium):** the per-sweep vault passphrase could be bypassed from an unlocked tab. The vault record is now bound to the session, and keystore export, a new vault save and deleting the loaded identity\'s vault all need its passphrase.')
w('- **L3-F1 and L3-F2 (Medium):** a missing checkpoint block could tombstone the reconciliation ledger, and spam or head lag stalled two-RPC scans. A null block is now an RPC failure, reorg invalidation compares canonical hashes from both RPCs, and pages end at the lower of the two heads.')
w('- **G2-01 (Medium):** the BTC view preselected every output. A scan now selects none, and selecting more than one shows a linkage warning.')
w('- **G3-01 and G3-02 (Medium), merchant plugins (not packaged):** webhook secrets now come only from constants or the environment, and amounts use the app\'s currency exponent table.\n')
w('## Fixed in this branch\n')
w(table(lambda k: st[k][0] == 'fixed', 'fixed') + '\n')
w('Notes on these fixes:')
w('- **Relayer defaults (L5-03, L5-02):** the new per-network quote limit (60/min, burst 20) and the 25% clean-source share of the global loss cap are untuned defaults for the owner to set.')
w('- **`/healthz`:** it now reports degraded on a sustained mined-revert rate, so it should not be used as a liveness probe.')
w('- **L5-06:** replace-by-fee and cancel for a stuck relayed transaction are deferred.')
w('- **Not run against real servers:** no Docker daemon was available, so the nginx and Compose changes were not run end to end. The relayer review ran the new `/api/` route allowlist and real-IP handling against a real nginx 1.24 on a scratch copy.\n')
w('### Open follow-ups from the fix reviews\n')
fu_table, fu_count = followups()
w('Each fix cluster went through rounds of implementation and adversarial AI review until the reviewer approved. '
  'The last review of each cluster approved the fixes and raised the issues below. They are open. None is a confirmed '
  f'audit finding, and none blocks the beta on test networks. {fu_count["minor"]} are minor and {fu_count["nit"]} are nits. '
  'The full text, with suggested fixes, is in `docs/audits/data/24/status.json` (`_clusters.<round>.review_issues`).\n')
w(fu_table + '\n')
w('## Not yet fixed\n')
w(table(lambda k: st[k][0] != 'fixed', 'status') + '\n')
w('## Verification of the fixes in this branch\n')
# The latest integration run is recorded in verification.md next to the data, so a re-run only edits that file.
with open(audit_file('verification.md')) as f:
    w(f.read().strip() + '\n')
w('## Limits\n')
w('- **Model and environment:** the review was done by AI agents with read access to the repository and a local toolchain. There were no live chains, mainnet or testnet RPCs, real wallets, Docker daemon, WordPress/WooCommerce/PrestaShop runtime, or mobile browsers.')
w('- **Verified from upstream source only:** platform behaviour for these was taken from upstream source code, not run:')
w('  - op-geth L1 fees')
w('  - electrs paging')
w('  - WooCommerce REST')
w('  - WordPress `add_option`')
w('  - PrestaShop Db')
w('- **Not covered:**')
w('  - contract formal verification, fuzzing (echidna) and vendored libraries (OpenZeppelin, Poseidon, fhEVM)')
w('  - the generated Groth16 verifiers and circuit compilation')
w('  - third-party SDKs')
w('  - timing side channels')
w('  - memory forensics and browser extensions')
w('  - password-manager, clipboard-history and mobile-keyboard behaviour (reasoned about, not run)')
w('  - real-browser CSP, SRI and storage partitioning')
w('  - ops-monitor')
w('  - the policy-scheme anvil tests')
w('  - SDK, CLI and `ux-links` packages')
w('  - GitHub repository settings (environment reviewers, tag protection, Pages source)')
w('  - container image digests')
w('- **Grep-level only:** many later-preserved packages were checked only for reachability.')
w('- **Severity is judgment.** It reflects the lean beta as shipped: test networks, no deployment, flags off. Several Info items become High if their packages are wired into the app.')
w('- **The usual gates still apply:** a professional audit, trusted setup, release and deployer custody, real deployments and funded-device testing are still required ([completion gates](08-completion-gates.md)).\n')
w('## All findings\n')
for k in ids:
    v = verified[k]
    s, extra = st[k]
    lab = LABEL[s] + (f' ({extra})' if s == 'fixed' else (f' (cluster {extra})' if s in ('progress', 'planned') else ''))
    w(f'### {k}\n')
    w(f'**{titles[k]}**  ')
    w(f'{v["severity"]} · {v.get("known")} · {areas[k]} · {lab}\n')
    t = fulltext[k]
    w(f'- **Finding:** {clean(t["why"])}')
    if t.get('evidence'):
        w(f'- **Evidence (scratch reproductions and code locations; reproductions are not committed):** {clean(t["evidence"])}')
    w(f'- **Recommended fix:** {clean(t["fix"])}')
    if s == 'deferred':
        w(f'- **Why deferred:** {extra}')
    w('')
# Publish atomically without following an output symlink inserted after argument validation.
with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=OUT.parent, prefix='.audit-report-', delete=False) as report:
    staged = report.name
    report.write('\n'.join(out).rstrip() + '\n')
try:
    # NamedTemporaryFile is owner-only (0600); keep the existing report's mode, else the umask default.
    try:
        mode = OUT.stat().st_mode & 0o777
    except FileNotFoundError:
        umask = os.umask(0)
        os.umask(umask)
        mode = 0o666 & ~umask
    os.chmod(staged, mode)
    os.replace(staged, OUT)
finally:
    if os.path.exists(staged):
        os.unlink(staged)
print('wrote', OUT, len(out), 'lines;', dict(Counter(x[0] for x in st.values())))
