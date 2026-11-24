/**
 * EXTRA-05 crypto review: EIP-712 code paths checked against the worked example published in the EIP-712 text
 * (the "Ether Mail" domain, the `cow` key and its signature), and domain binding of sweep signatures
 * (wrong verifyingContract, chainId, name, version must not recover to the owner).
 */
import { secretScalarFromBytes } from '@ghostpay/core-crypto';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { getAddress, hashTypedData, recoverAddress } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { FAKE } from './fixtures.testutil.js';
import {
  addressOfSecret,
  buildSweepTypedData,
  eip712DomainSeparator,
  signDigest,
  signSweep,
  sweepDigestManual,
} from './sweep.js';
import type { Hex } from './types.js';

const MAIL_DOMAIN = {
  name: 'Ether Mail',
  version: '1',
  chainId: 1,
  verifyingContract: getAddress('0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'),
};
const MAIL_TYPES = {
  Person: [
    { name: 'name', type: 'string' },
    { name: 'wallet', type: 'address' },
  ],
  Mail: [
    { name: 'from', type: 'Person' },
    { name: 'to', type: 'Person' },
    { name: 'contents', type: 'string' },
  ],
} as const;
const MAIL_MESSAGE = {
  from: { name: 'Cow', wallet: getAddress('0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826') },
  to: { name: 'Bob', wallet: getAddress('0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB') },
  contents: 'Hello, Bob!',
};

describe('EIP-712 published example (Ether Mail)', () => {
  it('domain separator, digest and the cow-key signature match the EIP text', async () => {
    expect(eip712DomainSeparator(MAIL_DOMAIN)).toBe(
      '0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f',
    );
    const digest = hashTypedData({
      domain: MAIL_DOMAIN,
      types: MAIL_TYPES,
      primaryType: 'Mail',
      message: MAIL_MESSAGE,
    });
    expect(digest).toBe('0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2');
    const cow = secretScalarFromBytes(keccak_256(new TextEncoder().encode('cow')));
    expect(addressOfSecret(cow)).toBe(MAIL_MESSAGE.from.wallet);
    const sig = await signDigest(digest, cow);
    expect(sig.v).toBe(28);
    expect(sig.r).toBe('0x4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9d');
    expect(sig.s).toBe('0x07299936d304c153f6443dfa05f40ff007d72911b6f72307f996231605b91562');
  });
});

describe('sweep signatures are bound to the full EIP-712 domain', () => {
  const secret = secretScalarFromBytes(Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 0x2a : 0x11)));
  const owner = addressOfSecret(secret);
  const order = {
    token: getAddress('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
    owner,
    destination: getAddress('0x00000000000000000000000000000000000000a2'),
    feeTo: getAddress('0x00000000000000000000000000000000000000a3'),
    amount: 1_000_000n,
    fee: 5_000n,
    deadline: 2_000_000_000n,
    nonce: 7n,
  };

  it('wrong verifyingContract, chainId, name or version never recovers to the owner', async () => {
    const td = buildSweepTypedData(84532, FAKE.relayer, order);
    const sig = await signSweep(td, secret);
    expect(await recoverAddress({ hash: sweepDigestManual(td), signature: sig.signature })).toBe(owner);
    const variants: Hex[] = [
      sweepDigestManual({
        ...td,
        domain: { ...td.domain, verifyingContract: getAddress('0x0000000000000000000000000000000000000c34') },
      }),
      sweepDigestManual({ ...td, domain: { ...td.domain, chainId: 8453 } }),
      sweepDigestManual({
        ...td,
        domain: { ...td.domain, name: 'GhostPaySweepRelayeR' as 'GhostPaySweepRelayer' },
      }),
      sweepDigestManual({ ...td, domain: { ...td.domain, version: '2' as '1' } }),
      sweepDigestManual({ ...td, message: { ...td.message, nonce: 8n } }),
    ];
    for (const h of variants)
      expect(await recoverAddress({ hash: h, signature: sig.signature })).not.toBe(owner);
  });
});
