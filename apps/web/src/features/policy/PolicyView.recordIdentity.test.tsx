// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildPolicyRecord, decodeScheme2MetaAddress, encodeScheme2MetaAddress, parsePolicyRecord, serializePolicyRecord } from '@ghostpay/policy-scheme';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../../lib/session';
import { makeServices, renderApp } from '../../test/render';
import { POLICY_FLAG } from './flag';
import { account, clientVectors } from './fixtures.testutil';
import { selectPolicyRecordForSeller } from './recordIdentity';

const firstSeller = account('acct-001');
const otherSeller = account('acct-002');
const canonical = clientVectors.records.valid.find((v) => v.id === 'acct-001')!.canonical;
const first = parsePolicyRecord(canonical);
const otherKeys = decodeScheme2MetaAddress(otherSeller.metaAddress);
const firstKeys = decodeScheme2MetaAddress(first.metaAddress);
// Same policy terms and policy hash, but a different seller identity.
const second = buildPolicyRecord({
  metaAddress: encodeScheme2MetaAddress({
    spendingPublicKey: otherKeys.spendingPublicKey,
    viewingPublicKey: otherKeys.viewingPublicKey,
    policyHash: first.policyHash,
  }),
  policy: first.policy,
  limits: first.limits,
});

beforeEach(() => {
  vi.stubEnv(POLICY_FLAG, '1');
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => vi.unstubAllEnvs());

describe('policy records are keyed by seller identity as well as terms (GP-BUG-08)', () => {
  it.each([
    { key: 'viewing', spendingPublicKey: firstKeys.spendingPublicKey, viewingPublicKey: otherKeys.viewingPublicKey, sellerSpending: firstSeller.spendingPublicKey, sellerViewing: otherSeller.viewingPublicKey },
    { key: 'spending', spendingPublicKey: otherKeys.spendingPublicKey, viewingPublicKey: firstKeys.viewingPublicKey, sellerSpending: otherSeller.spendingPublicKey, sellerViewing: firstSeller.viewingPublicKey },
  ])('requires the matching $key key even when the other key and policy match', ({ spendingPublicKey, viewingPublicKey, sellerSpending, sellerViewing }) => {
    const record = buildPolicyRecord({
      metaAddress: encodeScheme2MetaAddress({ spendingPublicKey, viewingPublicKey, policyHash: first.policyHash }),
      policy: first.policy,
      limits: first.limits,
    });
    expect(selectPolicyRecordForSeller([record], first.policyHash, firstSeller.spendingPublicKey, firstSeller.viewingPublicKey)).toBeUndefined();
    expect(selectPolicyRecordForSeller([first, record], first.policyHash, sellerSpending, sellerViewing)).toBe(record);
  });

  it('selects the record owned by the active seller, not the first record sharing a policy hash', () => {
    expect(second.policyHash).toBe(first.policyHash);
    expect(second.metaAddress).not.toBe(first.metaAddress);
    expect(selectPolicyRecordForSeller([second, first], first.policyHash, firstSeller.spendingPublicKey, firstSeller.viewingPublicKey)?.metaAddress).toBe(first.metaAddress);
    expect(selectPolicyRecordForSeller([first, second], second.policyHash, otherSeller.spendingPublicKey, otherSeller.viewingPublicKey)?.metaAddress).toBe(second.metaAddress);
    expect(selectPolicyRecordForSeller([first], second.policyHash, otherSeller.spendingPublicKey, otherSeller.viewingPublicKey)).toBeUndefined();
  });

  it('imports both sellers with equal terms, then correctly warns on exact duplicate import', async () => {
    const user = userEvent.setup();
    renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' }))
      .getByRole('button', { name: 'Policy accounts (experimental)' }));

    const input = screen.getByLabelText('Paste a policy record (JSON)');
    const importRecord = async (serialized: string) => {
      await user.clear(input);
      await user.click(input);
      await user.paste(serialized);
      await user.click(screen.getByRole('button', { name: 'Import record' }));
    };
    await importRecord(serializePolicyRecord(first));
    await importRecord(serializePolicyRecord(second));
    expect(screen.getAllByText(first.metaAddress)).toHaveLength(1);
    expect(screen.getAllByText(second.metaAddress)).toHaveLength(1);

    await importRecord(serializePolicyRecord(second));
    expect(screen.getAllByText(first.metaAddress)).toHaveLength(1);
    expect(screen.getAllByText(second.metaAddress)).toHaveLength(1);
    expect(screen.getByText('Policy record already loaded.')).toBeTruthy();
  });
});
