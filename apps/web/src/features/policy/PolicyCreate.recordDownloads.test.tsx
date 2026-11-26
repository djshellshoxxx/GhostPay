// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildPolicyRecord, decodeScheme2MetaAddress, encodeScheme2MetaAddress, parsePolicyRecord, serializePolicyRecord } from '@ghostpay/policy-scheme';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../../lib/session';
import { makeServices, renderApp } from '../../test/render';
import { POLICY_FLAG } from './flag';
import { account, clientVectors } from './fixtures.testutil';

const first = parsePolicyRecord(clientVectors.records.valid.find((v) => v.id === 'acct-001')!.canonical);
const firstKeys = decodeScheme2MetaAddress(first.metaAddress);
const otherKeys = decodeScheme2MetaAddress(account('acct-002').metaAddress);
const variants = [
  { name: 'viewing', spendingPublicKey: firstKeys.spendingPublicKey, viewingPublicKey: otherKeys.viewingPublicKey },
  { name: 'spending', spendingPublicKey: otherKeys.spendingPublicKey, viewingPublicKey: firstKeys.viewingPublicKey },
].map(({ name, ...keys }) => ({
  name,
  record: buildPolicyRecord({
    metaAddress: encodeScheme2MetaAddress({ ...keys, policyHash: first.policyHash }),
    policy: first.policy,
    limits: first.limits,
  }),
}));

beforeEach(() => {
  vi.stubEnv(POLICY_FLAG, '1');
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// #286 item 5: the suggested name is fixed, so neither the policy hash nor a digest of the meta-address reaches the
// browser's download history. Each file's contents carry the complete identity, which is what import checks.
describe('policy record downloads preserve the complete seller identity', () => {
  it.each(variants)('keeps the identity in the contents when only the $name key differs, under a fixed name', async ({ record }) => {
    const blobs = vi.fn<(value: Blob | MediaSource) => string>(() => 'blob:policy-record');
    URL.createObjectURL = blobs;
    URL.revokeObjectURL = vi.fn();
    const filenames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      filenames.push(this.download);
    });

    const user = userEvent.setup();
    renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' }))
      .getByRole('button', { name: 'Policy accounts (experimental)' }));
    const input = screen.getByLabelText('Paste a policy record (JSON)');
    for (const item of [first, record]) {
      await user.clear(input);
      await user.click(input);
      await user.paste(serializePolicyRecord(item));
      await user.click(screen.getByRole('button', { name: 'Import record' }));
    }

    expect(record.policyHash).toBe(first.policyHash);
    const downloads = screen.getAllByRole('button', { name: 'Download policy record' });
    expect(downloads).toHaveLength(2);
    await user.click(downloads[0]!);
    await user.click(downloads[1]!);
    await user.click(downloads[0]!);

    expect(filenames).toEqual(['ghostpay-policy-record.json', 'ghostpay-policy-record.json', 'ghostpay-policy-record.json']);
    for (const filename of filenames) expect(filename).not.toContain(first.policyHash.slice(2, 10));
    expect(blobs).toHaveBeenCalledTimes(3);
    const exported = await Promise.all(blobs.mock.calls.map(([blob]) => (blob as Blob).text()));
    expect(exported).toEqual([serializePolicyRecord(first), serializePolicyRecord(record), serializePolicyRecord(first)]);
    expect(exported.map((text) => parsePolicyRecord(text).metaAddress)).toEqual([first.metaAddress, record.metaAddress, first.metaAddress]);
  });
});
