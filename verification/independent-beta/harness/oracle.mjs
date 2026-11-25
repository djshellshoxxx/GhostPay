// W5 independent payment-state verifier: oracle for invariants I1–I8 (see ../SAFETY_MODEL.md).
// Original work. Inputs are only harness-owned facts: wallet handoffs, deliberate clears, the synthetic chain's
// truth and black-box observations. Output: violations (product-defect candidates) and ambiguities (A-items).

const RECORD_WINDOW_MS = 2_000; // I4 applies once a returned hash had this long in an open page (A5 / R5)
const SUCCESS_IN_BLOCK = /Status: included in block (\d+)/;
// A privacy-masked hash as a UI may render it: 0x + leading digits + ellipsis + trailing digits.
const MASKED_HASH = /0x([0-9a-fA-F]{4,})(?:\u2026|\.{3})([0-9a-fA-F]{4,})/g;
const FULL_HASH = /0x[0-9a-fA-F]{64}/g;

/** Hashes from `candidates` that `text` shows in full or in masked form (prefix…suffix). */
export function referencedHashes(text, candidates) {
  const lower = String(text).toLowerCase();
  const full = new Set((lower.match(FULL_HASH) ?? []).map((h) => h.toLowerCase()));
  const masked = [...lower.matchAll(MASKED_HASH)].map((m) => ({ pre: m[1], suf: m[2] }));
  const out = { full: [], masked: [] };
  for (const h of candidates) {
    if (full.has(h)) out.full.push(h);
    else if (masked.some(({ pre, suf }) => h.slice(2).startsWith(pre) && h.endsWith(suf))) out.masked.push(h);
  }
  return out;
}

/** True when the text shows any hash at all (full or masked), whether or not it is one the harness knows. */
// Non-global regexes: a /g regex keeps lastIndex between .test() calls and would alternate results.
const showsAnyHash = (text) => /0x[0-9a-fA-F]{64}/.test(String(text)) || /0x[0-9a-fA-F]{4,}(?:\u2026|\.{3})[0-9a-fA-F]{4,}/.test(String(text));

export class Oracle {
  constructor(world) {
    this.w = world;
    this.violations = [];
    this.ambiguities = [];
    this.notes = [];
    this.seenSuccess = new Map(); // tab -> success text already judged
  }

  flag(list, inv, step, detail) {
    const key = `${inv}:${JSON.stringify(detail)}`;
    if (list.some((v) => v.key === key)) return;
    list.push({ key, inv, step, detail });
  }
  violation(inv, step, detail) {
    this.flag(this.violations, inv, step, detail);
  }
  ambiguous(inv, step, detail) {
    this.flag(this.ambiguities, inv, step, detail);
  }

  handoffsFor(intent) {
    return this.w.wallet.handoffs.filter((h) => h.intent === intent);
  }

  /** I2/I6: wallet requests per intent never exceed 1 + deliberate clears; I5a: authority of each request. */
  checkHandoffs(stepIndex) {
    for (const intent of ['X', 'C']) {
      const n = this.handoffsFor(intent).length;
      const allowed = 1 + this.w.clears[intent];
      if (n > allowed) {
        // A6: the only extra handoffs came from a different account than every earlier one.
        const accounts = new Set(this.handoffsFor(intent).map((h) => String(h.params?.from ?? h.account).toLowerCase()));
        const detail = { intent, handoffs: n, allowed, accounts: [...accounts] };
        if (accounts.size > 1 && this.perAccountWithinLimit(intent)) this.ambiguous('A6', stepIndex, detail);
        else this.violation('I2', stepIndex, detail);
      }
    }
    for (const h of this.w.wallet.handoffs) {
      if (h.judged === true) continue;
      h.judged = true;
      const from = String(h.params?.from ?? '').toLowerCase();
      if (from !== '' && from !== h.account.toLowerCase()) this.violation('I5a', stepIndex, { seq: h.seq, from, walletAccount: h.account });
      if (h.chainId !== '0x14a34') this.violation('I5a', stepIndex, { seq: h.seq, walletChain: h.chainId });
      if (h.params?.chainId !== undefined && String(h.params.chainId).toLowerCase() !== h.chainId) {
        this.violation('I5a', stepIndex, { seq: h.seq, txChain: h.params.chainId, walletChain: h.chainId });
      }
    }
  }

  perAccountWithinLimit(intent) {
    const by = new Map();
    for (const h of this.handoffsFor(intent)) {
      const a = String(h.params?.from ?? h.account).toLowerCase();
      by.set(a, (by.get(a) ?? 0) + 1);
    }
    return [...by.values()].every((n) => n <= 1 + this.w.clears[intent]);
  }

  /** I1/I8 on an explicit status check: a success class needs canonical successful evidence right now. */
  checkStatusResult(stepIndex, intent, hash, result) {
    if (!result.checked) return;
    const truth = this.w.chain.truth(hash);
    const success = result.cls.includes('success');
    if (success && !(truth.state === 'mined' && truth.success)) {
      this.violation(truth.state === 'mempool' && this.w.reorged.has(hash) ? 'I8' : 'I1', stepIndex, { intent, hash, shown: result.text, truth });
    }
    if (result.cls.includes('reverted') && !(truth.state === 'mined' && !truth.success)) {
      this.notes.push({ step: stepIndex, note: 'reverted shown without reverted truth (not a safety property)', hash, truth });
    }
  }

  /** Per-observation checks: I1 (done panel), I3 (unknown visible), I4 (hash retained), I5b/I7 (no cross-intent bleed). */
  checkObservations(stepIndex, step, obs) {
    const chainMutating = ['mine', 'reorg', 'drop', 'advance'].includes(step.op);
    for (const [tab, o] of Object.entries(obs)) {
      if (o.closed || o.headings === undefined) continue;
      const intent = this.w.intentOfTab[tab];
      // I1: the checkout's own done panel claiming inclusion. Never passes silently (review gap G1): the claim is
      // judged against the hashes it displays (full or masked); if it displays none the harness recognises, against
      // every hash the wallet returned for that intent; with no returned hash at all it is a violation.
      const m = SUCCESS_IN_BLOCK.exec(o.mainText);
      if (m !== null) {
        const block = Number(m[1]);
        const known = intent === null ? [...this.w.hashes.X, ...this.w.hashes.C] : [...this.w.hashes[intent]];
        const ref = referencedHashes(o.mainText, known);
        let judged = [...ref.full, ...ref.masked];
        let basis = ref.masked.length > 0 ? 'masked' : 'displayed';
        if (judged.length === 0) {
          judged = known;
          basis = intent === null ? 'intent-unknown' : showsAnyHash(o.mainText) ? 'foreign-or-unrecognised-hash' : 'no-displayed-hash';
        }
        const key = `${intent}:${m[0]}:${basis}:${judged.join(',')}`;
        const okFor = (h) => {
          const t = this.w.chain.truth(h);
          return t.state === 'mined' && t.success && t.block === block;
        };
        if (this.seenSuccess.get(tab) !== key) {
          this.seenSuccess.set(tab, key);
          if (basis !== 'displayed' && basis !== 'masked') this.notes.push({ step: stepIndex, note: `I1 judged without a displayed known hash (${basis})`, tab, intent });
          // Displayed hashes must each be canonical successful at that block; otherwise at least one known hash must be.
          const passed = judged.length > 0 && (basis === 'displayed' || basis === 'masked' ? judged.every(okFor) : judged.some(okFor));
          if (!passed) {
            const detail = { tab, intent, basis, shown: m[0], judged: judged.map((h) => ({ hash: h, truth: this.w.chain.truth(h) })) };
            if (chainMutating && judged.length > 0) this.ambiguous('A1', stepIndex, detail);
            else this.violation('I1', stepIndex, judged.length === 0 ? { ...detail, reason: 'success claimed with no wallet-returned hash for this intent' } : detail);
          }
        } else if (chainMutating) {
          const stillOk = judged.length > 0 && (basis === 'displayed' || basis === 'masked' ? judged.every(okFor) : judged.some((h) => {
            const t = this.w.chain.truth(h);
            return t.state === 'mined' && t.success;
          }));
          if (!stillOk) this.ambiguous('A1', stepIndex, { tab, intent, basis, staleShown: m[0], judged: judged.map((h) => ({ hash: h, truth: this.w.chain.truth(h) })) });
        }
      }
      // I5b / I7: a checkout for one intent must not present the other intent's hash outside the shared journal.
      if (intent !== null) {
        const other = intent === 'X' ? 'C' : 'X';
        // Disclosing the previous invoice's hash under its own labelled warning is correct, not bleed.
        const labelledPrevious = /Previous invoice transaction may have been submitted/.test(o.mainText);
        for (const h of o.mainHashes) {
          if (!this.w.hashes[other].has(h)) continue;
          if (labelledPrevious) this.notes.push({ step: stepIndex, note: 'previous-invoice hash disclosed under its warning', tab, intent, hash: h });
          else this.violation('I5b', stepIndex, { tab, intent, foreignHash: h, text: o.mainText.slice(0, 300) });
        }
      }
      // I3: each un-cleared handoff's OWN record is visible on the screens that show the journal (review gap G2:
      // identity, not row count). Rows carrying a known hash belong to that hash's intent and cannot stand in for
      // another intent; hash-less "Outcome unknown" rows are consumed one per expected unknown record.
      const journalScreen = o.headings.some((x) => x === 'Review payment' || x === 'Pay an invoice');
      if (journalScreen) this.checkJournalIdentity(stepIndex, tab, intent, o);
    }
    this.checkRetention(stepIndex, obs);
  }

  /**
   * Records the journal must show: one per intent with a wallet handoff after its last deliberate clear.
   * `hashes` = returned hashes delivered to a live document (the record should carry one of them);
   * `mayBeUnknown` = a hash-less unknown row is also acceptable (no delivered hash, or the delivering document ended
   * inside the record window, R5/A5); `rejectOnly` = only 4001 rejections (A4: record presence not settled).
   */
  expectedRecords() {
    const out = [];
    for (const intent of ['X', 'C']) {
      const since = this.w.lastClearSeq[intent] ?? 0;
      const live = this.handoffsFor(intent).filter((h) => h.seq > since);
      if (live.length === 0) continue;
      const delivered = live.filter((h) => h.hash !== undefined && this.w.deliveredToOpenPage.has(h.hash) && !this.w.clearedHashes.has(h.hash));
      const settled = delivered.filter((h) => {
        const end = this.w.docEndedAt.get(`${h.pageId}:${h.doc}`);
        return end === undefined || end - h.repliedAt >= RECORD_WINDOW_MS;
      });
      out.push({
        intent,
        hashes: delivered.map((h) => h.hash),
        mayBeUnknown: settled.length === 0,
        rejectOnly: live.every((h) => h.behaviour === 'reject'),
      });
    }
    return out;
  }

  /** Back-compat view used by older callers and the summary: which intents must have a record. */
  expectedRecordIntents() {
    const rec = this.expectedRecords();
    return { all: rec.map((r) => r.intent), nonReject: rec.filter((r) => !r.rejectOnly).map((r) => r.intent) };
  }

  checkJournalIdentity(stepIndex, tab, intent, o) {
    const expected = this.expectedRecords();
    if (expected.length === 0) return;
    const allKnown = [...this.w.hashes.X, ...this.w.hashes.C];
    const rows = o.journal.map((text) => {
      const ref = referencedHashes(text, allKnown);
      const hashes = [...ref.full, ...ref.masked];
      // A row is a hash-less unknown record when it says so and references no known hash. (A masked account
      // address such as 0x5555…5555 must not disqualify it, so unrecognised masked tokens are ignored here.)
      return { text, hashes, unknown: /Outcome unknown/.test(text) && hashes.length === 0 && !/0x[0-9a-fA-F]{64}/.test(text), used: false };
    });
    const unknownPool = rows.filter((r) => r.unknown);
    const competing = expected.filter((e) => e.mayBeUnknown).length;
    if (competing > 1 && unknownPool.length >= 1) {
      this.notes.push({ step: stepIndex, note: 'I3 unknown-row identity unjudgeable: several intents may each own a hash-less row; matched by count only', tab, intents: expected.filter((e) => e.mayBeUnknown).map((e) => e.intent) });
    }
    for (const e of expected) {
      const own = rows.find((r) => !r.used && r.hashes.some((h) => e.hashes.includes(h)));
      if (own !== undefined) {
        own.used = true;
        continue;
      }
      if (e.mayBeUnknown) {
        const u = unknownPool.find((r) => !r.used);
        if (u !== undefined) {
          u.used = true;
          continue;
        }
      }
      const detail = {
        tab,
        missingIntent: e.intent,
        expectedHashes: e.hashes,
        acceptsUnknownRow: e.mayBeUnknown,
        sendButton: intent === e.intent ? o.sendButton : undefined,
        journal: o.journal,
      };
      if (e.rejectOnly) this.ambiguous('A4', stepIndex, detail);
      else this.violation('I3', stepIndex, detail);
    }
    // Explicitly classified, never silent: a checkout for an intent whose own record IS visible may keep its pay
    // action enabled, because R20 only requires refusal before the wallet is asked (I2 judges that click).
    const mine = expected.find((e) => e.intent === intent);
    if (mine !== undefined && o.sendButton === 'enabled' && !this.violations.some((v) => v.inv === 'I3' && v.step === stepIndex && v.detail.missingIntent === intent)) {
      this.payEnabledWithRecord = (this.payEnabledWithRecord ?? 0) + 1;
    }
  }

  /** I4: a hash the wallet returned to a page that stayed open long enough must survive until deliberately cleared. */
  checkRetention(stepIndex, obs) {
    // Evidence lives in the app origin's storage; a tab on about:blank (e.g. right after a restart) shows none
    // (harness fix H6).
    const open = Object.values(obs).filter((o) => !o.closed && o.storedHashes !== undefined && o.origin === this.w.origin);
    if (open.length === 0) return;
    const visibleAnywhere = new Set();
    for (const o of open) {
      for (const h of o.storedHashes) visibleAnywhere.add(h);
      for (const row of o.journal) {
        for (const h of row.match(/0x[0-9a-fA-F]{64}/g) ?? []) visibleAnywhere.add(h.toLowerCase());
        const ref = referencedHashes(row, this.w.wallet.handoffs.map((x) => x.hash).filter(Boolean));
        for (const h of ref.masked) visibleAnywhere.add(h);
      }
    }
    for (const h of this.w.wallet.handoffs) {
      if (h.hash === undefined || h.repliedAt === undefined) continue;
      if (this.w.clearedHashes.has(h.hash)) continue;
      if (h.seq <= (this.w.lastClearSeq[h.intent] ?? 0)) continue;
      const closedAt = this.w.docEndedAt.get(`${h.pageId}:${h.doc}`);
      const delivered = this.w.deliveredToOpenPage.has(h.hash);
      if (!delivered) continue; // reply went to a closed page: R5 allows the hash to be absent (A5)
      if (closedAt !== undefined && closedAt - h.repliedAt < RECORD_WINDOW_MS) continue;
      if (Date.now() - h.repliedAt < RECORD_WINDOW_MS) continue;
      if (!visibleAnywhere.has(h.hash)) this.violation('I4', stepIndex, { intent: h.intent, hash: h.hash, behaviour: h.behaviour });
    }
  }

  /** I7 liveness for the control intent, judged right after a send of C that should have reached the wallet. */
  checkControlReached(stepIndex, before, sendResult, prepared) {
    if (sendResult !== 'clicked' || !prepared) return;
    const after = this.handoffsFor('C').length;
    if (before === 0 && after === 0) this.violation('I7', stepIndex, { note: 'control intent C never reached the wallet' });
  }
}
