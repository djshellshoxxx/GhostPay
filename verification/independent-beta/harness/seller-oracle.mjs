// W5 independent payment-state verifier: seller-side oracle SI1–SI8 (milestone 2; see ../SAFETY_MODEL.md).
// Original work. Inputs: harness-owned payment/action records, synthetic chain truth, and the seller's rendered text.

const FINALITY = 100; // finalityDepth for 84532 (SA1: configuration, used as the app's own rule)
export const CARD_STATES = [
  { cls: 'linked', re: /Linked to a verified observation\.|Verified late payment accepted by seller\.|Linked total equals the expected net amount/ },
  { cls: 'acceptedLate', re: /Verified late payment accepted by seller\./ },
  { cls: 'pending', re: /Pending transfer evidence/ },
  { cls: 'lateVerified', re: /Verified late transfer — invoice decision pending/ },
  { cls: 'onTimePending', re: /Verified on-time transfer — invoice link pending/ },
  { cls: 'invalidated', re: /Reorg invalidated earlier payment evidence|Invalidated after a reorg/ },
  { cls: 'possible', re: /Possible payment/ },
  { cls: 'unverified', re: /Unverified observation/ },
  { cls: 'above', re: /Linked total is above the expected net amount/ },
  { cls: 'multiple', re: /Multiple linked observations/ },
];
export const cardClasses = (text) => CARD_STATES.filter((s) => s.re.test(text)).map((s) => s.cls);
const PAYMENT_STATES = ['linked', 'pending', 'lateVerified', 'onTimePending', 'invalidated', 'possible', 'unverified', 'above', 'multiple'];

export class SellerOracle {
  constructor(world, intents) {
    this.w = world;
    this.intents = intents; // { X: { units }, C: { units } }
    this.violations = [];
    this.ambiguities = [];
    this.notes = [];
  }

  flag(list, inv, step, detail) {
    const key = `${inv}:${JSON.stringify(detail)}`;
    if (!list.some((v) => v.key === key)) list.push({ key, inv, step, detail });
  }
  violation(inv, step, detail) { this.flag(this.violations, inv, step, detail); }
  ambiguous(inv, step, detail) { this.flag(this.ambiguities, inv, step, detail); }

  intentOfCard(card) {
    for (const [intent, v] of Object.entries(this.intents)) if (card.units === v.units) return intent;
    return null;
  }

  /** Canonical successful payments of an intent, with depth relative to `head`. */
  canonicalPayments(intent, head) {
    return this.w.payments[intent]
      .map((p) => ({ ...p, truth: this.w.chain.truth(p.hash) }))
      .filter((p) => p.truth.state === 'mined' && p.truth.success)
      .map((p) => ({ ...p, depth: head - p.truth.block + 1 }));
  }

  check(stepIndex, step, before, obs, result) {
    const freshScan = step.op === 'scan' && result?.outcome === 'finished';
    for (const [tab, o] of Object.entries(obs)) {
      if (o.closed || o.cards === undefined || o.ledgerLocked) continue;
      const fresh = freshScan && step.tab === tab;
      const scanHead = this.w.scans[tab]?.head ?? this.w.chain.head;
      for (const card of o.cards) {
        const intent = this.intentOfCard(card);
        if (intent === null) {
          this.notes.push({ step: stepIndex, note: 'card with unknown amount', tab, text: card.text.slice(0, 200) });
          continue;
        }
        const cls = cardClasses(card.text);
        const expiresAt = card.validUntil === null ? null : Math.floor(Date.parse(card.validUntil) / 1000);
        const pays = this.canonicalPayments(intent, scanHead);
        const final = pays.filter((p) => p.depth >= FINALITY);
        const detail = { tab, intent, card: card.text.slice(0, 300), payments: pays.map((p) => ({ hash: p.hash, kind: p.kind, block: p.truth.block, depth: p.depth, ts: p.truth.timestamp })), scanHead };
        // SI11 (LATE-LM1, #716): an invoice whose linked payment is quarantined (unverified) stays reserved: no exact
        // proposal for it may be offered for another payment.
        const decided = this.w.actions[intent].some((a) => ['confirm', 'manualLink', 'acceptLate'].includes(a.op));
        if (decided && cls.includes('unverified') && new Set(this.w.payments[intent].map((p) => p.hash)).size >= 2 && card.digest !== null && o.ledgerText.toLowerCase().includes(`exact local match proposed: invoice ${card.digest}`)) {
          this.violation('SI11', stepIndex, { ...detail, reason: 'exact proposal offered for an invoice reserved by a quarantined link' });
        }
        // SI12 (S3/S42/S44): after deleting observations, an imported backup is untrusted history: it never credits an
        // invoice, and an observation invalidated by a reorg is not revived.
        if (step.op === 'importBackup' && this.w.deletedObservations === true && cls.includes('linked')) {
          this.violation('SI12', stepIndex, { ...detail, reason: 'imported history credited an invoice' });
        }
        // SI7: the control never shows payment state without a payment of its own.
        if (this.w.payments[intent].length === 0 && cls.some((c) => PAYMENT_STATES.includes(c))) this.violation('SI7', stepIndex, detail);
        if (cls.includes('linked')) {
          // SI2: a link needs a recorded seller decision for this intent.
          if (this.w.actions[intent].length === 0) this.violation('SI2', stepIndex, detail);
          // SI1/SI4: a link needs final, canonical, successful evidence at the last scan. Strict right after a scan
          // in this tab; otherwise a stale display before any rescan is the recorded ambiguity SA6.
          if (final.length === 0) {
            const inv = this.w.payments[intent].some((p) => this.w.reorged.has(p.hash)) ? 'SI4' : 'SI1';
            if (fresh) this.violation(inv, stepIndex, detail);
            else this.ambiguous('SA6', stepIndex, { ...detail, after: step.op });
          }
          // SI3: on-time link of a payment whose only final evidence is late, without an explicit late acceptance.
          if (expiresAt !== null && final.length > 0 && final.every((p) => p.truth.timestamp >= expiresAt) && !this.w.actions[intent].some((a) => a.op === 'acceptLate')) {
            this.violation('SI3', stepIndex, { ...detail, expiresAt });
          }
        }
        if (cls.includes('acceptedLate') && !this.w.actions[intent].some((a) => a.op === 'acceptLate')) this.violation('SI3', stepIndex, { ...detail, reason: 'accepted late without an accept action' });
        // SI6: one distinct payment must not be counted above the expected net amount or as several.
        const distinct = new Set(pays.map((p) => p.hash)).size;
        if (distinct <= 1 && (cls.includes('above') || cls.includes('multiple'))) this.violation('SI6', stepIndex, detail);
        // SI4 (decision history): after an accepted-late decision, the decision time stays visible in the ledger.
        if (this.w.actions[intent].some((a) => a.op === 'acceptLate' && a.step < stepIndex) && !/Seller accepted this late payment at/.test(o.ledgerText)) {
          if (fresh || step.op === 'reload' || step.op === 'view') this.violation('SI4', stepIndex, { ...detail, reason: 'accepted-late decision history not visible' });
        }
        // SI4 (notice): a reorg that withdrew a link should be explained, not silently reopened (S29); recorded only.
        if (fresh && this.w.reorgSinceFreeze !== true && !cls.includes('linked') && this.w.actions[intent].length > 0 && this.w.payments[intent].some((p) => this.w.reorged.has(p.hash)) && !cls.includes('invalidated')) {
          this.ambiguous('SA7', stepIndex, { ...detail, reason: 'link withdrawn after reorg without a visible invalidation notice' });
        }
      }
      // SI5: an interrupted scan never adds a link.
      if (step.op === 'scan' && step.tab === tab && result?.outcome !== 'finished') {
        const linked = (x) => new Set((x?.cards ?? []).filter((c) => cardClasses(c.text).includes('linked')).map((c) => this.intentOfCard(c)));
        const was = linked(before[tab]);
        for (const i of linked(o)) if (!was.has(i)) this.violation('SI5', stepIndex, { tab, intent: i, outcome: result?.outcome, alerts: result?.alerts });
      }
    }
    const stateOf = (x) => Object.fromEntries((x?.cards ?? []).map((c) => [this.intentOfCard(c), cardClasses(c.text).filter((k) => ['linked', 'acceptedLate', 'invalidated'].includes(k)).sort().join('+')]));
    // SI9 (S20): a reorg reported by only one of two providers stops the scan; nothing is linked, rolled back or
    // invalidated on that pass.
    // Withholding credit (linked -> "Unverified observation") is accepted while providers disagree (S12, HO:48: a
    // failed recheck marks records unverified and a rescan restores credit); a NEW link or a NEW invalidation is not
    // (harness fix H11: an earlier version also flagged withheld credit).
    if (step.op === 'scan' && this.w.reorgSinceFreeze === true) {
      const was = stateOf(before[step.tab]);
      const now = stateOf(obs[step.tab]);
      for (const k of Object.keys({ ...was, ...now })) {
        if (k === 'null') continue;
        const a = (was[k] ?? '').split('+');
        const b = (now[k] ?? '').split('+');
        const gained = b.filter((c) => c !== '' && !a.includes(c));
        if (gained.includes('linked') || gained.includes('invalidated')) this.violation('SI9', stepIndex, { tab: step.tab, intent: k, gained, outcome: result?.outcome, before: was[k] ?? '', after: now[k] ?? '' });
        else if ((was[k] ?? '') !== (now[k] ?? '')) this.notes.push({ step: stepIndex, note: 'credit withheld while providers disagreed (S12)', tab: step.tab, intent: k, before: was[k] ?? '', after: now[k] ?? '' });
      }
      if (result?.outcome === 'finished') this.notes.push({ step: stepIndex, note: 'scan finished while providers disagreed about a reorg', tab: step.tab, text: result?.text });
    }
    // SI10 (S28): visible linked, accepted-late and invalidated evidence is durable across a full browser restart
    // when the chain did not change in between.
    if (step.op === 'restartSeller' && this.w.chain.log.length === this.w.chainLogLengthAtRestart) {
      for (const tab of ['S1', 'S2']) {
        const was = stateOf(before.S1);
        const now = stateOf(obs[tab]);
        for (const k of Object.keys({ ...was, ...now })) {
          if (k !== 'null' && (was[k] ?? '') !== (now[k] ?? '')) this.violation('SI10', stepIndex, { tab, intent: k, before: was[k] ?? '', after: now[k] ?? '' });
        }
      }
    }
    // SA8 (finding F2): a manual link accepted for an invoice that a quarantined link still reserves (LATE-LM1)
    // reaches the two-links/above state #716 describes, through the annotation path. Recorded, not scored: manual
    // links are seller annotations (ADR:247-248) and no accepted requirement forbids this.
    if (step.op === 'manualLink' && result?.linked === true) {
      const was = (before[step.tab]?.cards ?? []).find((c) => this.intentOfCard(c) === step.intent);
      if (was !== undefined && cardClasses(was.text).includes('unverified')) this.ambiguous('SA8', stepIndex, { tab: step.tab, intent: step.intent, before: was.text.slice(0, 300) });
    }
    // SI8: after both seller tabs re-rendered (scenario 'compareTabs' step), they agree on what is linked.
    if (step.op === 'compareTabs') {
      const linked = (x) => [...new Set((x?.cards ?? []).filter((c) => cardClasses(c.text).includes('linked')).map((c) => this.intentOfCard(c)))].sort().join(',');
      if (linked(obs.S1) !== linked(obs.S2)) this.violation('SI8', stepIndex, { S1: linked(obs.S1), S2: linked(obs.S2) });
    }
  }
}
