// W5 independent payment-state verifier: oracle for invariants I1–I8 (see ../SAFETY_MODEL.md).
// Original work. Inputs are only harness-owned facts: wallet handoffs, deliberate clears, the synthetic chain's
// truth and black-box observations. Output: violations (product-defect candidates) and ambiguities (A-items).

const RECORD_WINDOW_MS = 2_000; // I4 applies once a returned hash had this long in an open page (A5 / R5)
const SUCCESS_IN_BLOCK = /Status: included in block (\d+)/;

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
      // I1: the checkout's own done panel claiming inclusion.
      const m = SUCCESS_IN_BLOCK.exec(o.mainText);
      if (m !== null && intent !== null) {
        const shownHashes = o.mainHashes.filter((h) => this.w.hashes[intent].has(h));
        const key = `${intent}:${m[0]}:${shownHashes.join(',')}`;
        if (this.seenSuccess.get(tab) !== key) {
          this.seenSuccess.set(tab, key);
          for (const h of shownHashes) {
            const t = this.w.chain.truth(h);
            const ok = t.state === 'mined' && t.success && t.block === Number(m[1]);
            if (!ok) (chainMutating ? this.ambiguous.bind(this, 'A1') : this.violation.bind(this, 'I1'))(stepIndex, { tab, intent, hash: h, shown: m[0], truth: t });
          }
        } else if (chainMutating) {
          for (const h of shownHashes) {
            const t = this.w.chain.truth(h);
            if (!(t.state === 'mined' && t.success)) this.ambiguous('A1', stepIndex, { tab, intent, hash: h, staleShown: m[0], truth: t });
          }
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
      // I3: records of every un-cleared handoff are visible on the screens that show the journal.
      const journalScreen = o.headings.some((x) => x === 'Review payment' || x === 'Pay an invoice');
      if (journalScreen) {
        const expected = this.expectedRecordIntents();
        const rows = o.journal.length;
        if (rows < expected.all.length) {
          const inv = rows >= expected.nonReject.length ? 'A4' : 'I3';
          (inv === 'A4' ? this.ambiguous.bind(this) : this.violation.bind(this))(inv, stepIndex, { tab, rows, expected: expected.all, journal: o.journal });
        }
      }
    }
    this.checkRetention(stepIndex, obs);
  }

  /** Intents with at least one wallet handoff after their last deliberate clear. */
  expectedRecordIntents() {
    const all = [];
    const nonReject = [];
    for (const intent of ['X', 'C']) {
      const since = this.w.lastClearSeq[intent] ?? 0;
      const live = this.handoffsFor(intent).filter((h) => h.seq > since);
      if (live.length > 0) all.push(intent);
      if (live.some((h) => h.behaviour !== 'reject')) nonReject.push(intent);
    }
    return { all, nonReject };
  }

  /** I4: a hash the wallet returned to a page that stayed open long enough must survive until deliberately cleared. */
  checkRetention(stepIndex, obs) {
    const open = Object.values(obs).filter((o) => !o.closed && o.storedHashes !== undefined);
    if (open.length === 0) return;
    const visibleAnywhere = new Set();
    for (const o of open) {
      for (const h of o.storedHashes) visibleAnywhere.add(h);
      for (const row of o.journal) for (const h of row.match(/0x[0-9a-fA-F]{64}/g) ?? []) visibleAnywhere.add(h.toLowerCase());
    }
    for (const h of this.w.wallet.handoffs) {
      if (h.hash === undefined || h.repliedAt === undefined) continue;
      if (this.w.clearedHashes.has(h.hash)) continue;
      if (h.seq <= (this.w.lastClearSeq[h.intent] ?? 0)) continue;
      const closedAt = this.w.closedAt.get(h.pageId);
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
