import { secretScalarFromBytes, zeroize } from '@ghostpay/core-crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { buildCancelWithdrawTypedData, signPolicyTypedData, type AnyPolicyTypedData } from './index.js';
import { hexBytes, vectors, type VectorAccount } from './fixtures.testutil.js';

const account = vectors.accounts[0] as VectorAccount;
const owner = secretScalarFromBytes(hexBytes(account.ownerPrivateKey));
const data = buildCancelWithdrawTypedData(vectors.deployment.chainId, account.accountAddress, account.policyHash);
afterAll(() => { zeroize(owner); });

describe('policy typed-data runtime shape contract', () => {
  it('accepts a plain supported-format copy with the same deterministic signature', async () => {
    const copy = structuredClone(data);
    expect(await signPolicyTypedData(copy, owner, account.ownerAddress)).toEqual(
      await signPolicyTypedData(data, owner, account.ownerAddress),
    );
  });

  it.each([
    ['absent input', undefined],
    ['null input', null],
    ['primary type', { ...data, primaryType: undefined }],
    ['type definition', { ...data, types: undefined }],
    ['domain', { ...data, domain: undefined }],
    ['message', { ...data, message: undefined }],
    ['chain identifier', { ...data, domain: { ...data.domain, chainId: undefined } }],
    ['digest', { ...data, digest: undefined }],
  ])('reports a typed error for a missing %s', async (_name, input) => {
    await expect(signPolicyTypedData(input as unknown as AnyPolicyTypedData, owner, account.ownerAddress))
      .rejects.toMatchObject({ code: 'SIGNING_FAILED' });
  });
});
