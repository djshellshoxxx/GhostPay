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

describe('policy record downloads preserve the complete seller identity', () => {
  it.each(variants)('keeps separate recovery files when only the $name key differs', async ({ record }) => {
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

    expect(filenames).toHaveLength(3);
    expect(filenames[0]).not.toBe(filenames[1]);
    expect(filenames[2]).toBe(filenames[0]);
    for (const filename of filenames) expect(filename).toMatch(/^ghostpay-policy-[0-9a-f-]+\.json$/);
    expect(blobs).toHaveBeenCalledTimes(3);
    const exported = await Promise.all(blobs.mock.calls.map(([blob]) => (blob as Blob).text()));
    expect(exported).toEqual([serializePolicyRecord(first), serializePolicyRecord(record), serializePolicyRecord(first)]);
    expect(exported.map((text) => parsePolicyRecord(text).metaAddress)).toEqual([first.metaAddress, record.metaAddress, first.metaAddress]);
  });
});
