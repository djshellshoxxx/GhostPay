import { toFunctionSelector } from 'viem';
import { describe, expect, it } from 'vitest';
import { ROUTER, approve, buildTx, buildTyped, permitSig } from './build.testutil.js';
import { decodeTx, decodeTypedData } from './decode.js';
import type { TxInput, TypedDataInput } from './types.js';

/** Research safety-user-protection R7/R15: drainer-style asks must decode to Unknown (refuse). */
const SIGS = [
  'setApprovalForAll(address,bool)',
  'increaseAllowance(address,uint256)',
  'decreaseAllowance(address,uint256)',
  'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
  'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)',
  'permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)',
  'transferFrom(address,address,uint256)',
  'approve(address,address,uint160,uint48)',
];

describe('exotic approvals are Unknown', () => {
  it.each(SIGS)('%s', (sig) => {
    const sel = toFunctionSelector(sig);
    const r = decodeTx({ ...buildTx(approve()), data: `${sel}${'00'.repeat(128)}` });
    expect(r).toEqual({ kind: 'unknown', reason: 'UNKNOWN_SELECTOR' });
  });

  it.each(['PermitSingle', 'PermitBatch', 'PermitTransferFrom', 'PermitBatchTransferFrom', 'Authorization', 'SetCode'])(
    'typed data %s',
    (primaryType) => {
      const base = buildTyped(permitSig());
      const td: TypedDataInput = { ...base, primaryType, types: { [primaryType]: [{ name: 'spender', type: 'address' }] } };
      expect(decodeTypedData(td)).toEqual({ kind: 'unknown', reason: 'UNKNOWN_TYPED_DATA' });
    },
  );

  it('EIP-7702 authorization list on a transaction is refused', () => {
    const t: TxInput = { ...buildTx(approve()), authorizationList: [{ chainId: 1, address: ROUTER, nonce: 0 }] };
    expect(decodeTx(t)).toEqual({ kind: 'unknown', reason: 'UNSUPPORTED_TX_FEATURE' });
    expect(decodeTx({ ...t, authorizationList: [] })).toEqual({ kind: 'unknown', reason: 'UNSUPPORTED_TX_FEATURE' });
    expect(decodeTx({ ...buildTx(approve()), authorizationList: undefined }).kind).toBe('erc20_approve');
  });
});
