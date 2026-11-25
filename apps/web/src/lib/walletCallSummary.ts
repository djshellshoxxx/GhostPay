import { erc20Abi, erc6538RegistryAbi, ghostPayRouterAbi } from '@ghostpay/chain-adapters';
import type { Abi, AbiParameter, Hex } from 'viem';
import { decodeFunctionData, encodeFunctionData, getAbiItem } from 'viem/utils';

const coreAbi = [...erc20Abi, ...erc6538RegistryAbi, ...ghostPayRouterAbi];

export interface WalletCallSummary {
  readonly name: string;
  readonly fields: readonly (readonly [name: string, value: string])[];
}

function collectFields(input: AbiParameter, value: unknown, name: string, fields: (readonly [string, string])[]): void {
  if (input.type === 'tuple' && 'components' in input && typeof value === 'object' && value !== null) {
    for (const part of input.components) {
      if (part.name) collectFields(part, (value as Record<string, unknown>)[part.name], name + '.' + part.name, fields);
    }
  } else if ((input.type === 'address' || input.type === 'bytes32') && typeof value === 'string') {
    fields.push(Object.freeze([name, value] as const));
  } else if (input.type.startsWith('uint') && (typeof value === 'bigint' || typeof value === 'number')) {
    fields.push(Object.freeze([name, value.toString()] as const));
  }
}

/** Only label canonical calldata from a locally known ABI. A decoded call describes arguments, not its eventual effects. */
export function summarizeWalletCall(calldata: Hex, abi: Abi = coreAbi): WalletCallSummary | undefined {
  if (calldata.length < 10) return undefined;
  try {
    const item = getAbiItem({ abi, name: calldata.slice(0, 10).toLowerCase() });
    if (item?.type !== 'function' || item.stateMutability === 'view' || item.stateMutability === 'pure') return undefined;
    const single: Abi = [item];
    const { functionName, args = [] } = decodeFunctionData({ abi: single, data: calldata });
    if (encodeFunctionData({ abi: single, functionName, args }).toLowerCase() !== calldata.toLowerCase()) return undefined;
    const fields: (readonly [string, string])[] = [];
    item.inputs.forEach((input, i) => {
      if (input.name) collectFields(input, args[i], input.name, fields);
    });
    return Object.freeze({ name: functionName, fields: Object.freeze(fields) });
  } catch {
    return undefined;
  }
}
