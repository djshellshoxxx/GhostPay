export const JAN31 = Date.UTC(2026, 0, 31, 12, 34, 56) / 1000;

export function planFixture(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'ghostpay.recurring-plan/1', planId: 'plan-1', revision: 'terms-1',
    anchorSeconds: JAN31, cadence: { kind: 'monthly', every: 1 }, templateRef: 'template-1',
    assetId: 'eip155:1/slip44:60', amountAtomic: '1000000000000000001',
    displayTimeZone: 'UTC', status: 'active', ...overrides,
  };
}

export function snapshotFixture(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'ghostpay.recurring-snapshot/1', profileRef: 'profile-1', revision: 'snapshot-1',
    plans: [{ plan: planFixture(overrides), nextPeriodIndex: 0 }],
    outbox: [] as Record<string, unknown>[],
  };
}

export function invoiceReference(periodIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    eventId: `plan-1:period:${periodIndex}:invoice`, planId: 'plan-1', planRevision: 'terms-1',
    periodIndex, kind: 'invoice', artifactRef: `artifact-${periodIndex}`, status: 'issued', ...overrides,
  };
}
