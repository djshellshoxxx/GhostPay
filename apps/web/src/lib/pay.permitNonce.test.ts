import { describe, expect, it } from 'vitest';
import { mockRpc } from '../test/mockRpc';
import { UserFacingError } from './errors';
import { permitReader } from './pay';

const TOKEN = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';

describe('LF-65392fcef-3: permit nonce RPC response is exactly one ABI word', () => {
  it.each(['0x', '0x01', `0x${'00'.repeat(31)}`, `0x${'00'.repeat(33)}`])('refuses malformed nonce %s with a fixed user-facing error', async (response) => {
    const nonce = permitReader(mockRpc(84532, () => response), '1').nonce(TOKEN, OWNER);
    await expect(nonce).rejects.toBeInstanceOf(UserFacingError);
    await expect(nonce).rejects.toThrow('Your RPC returned an unexpected result.');
  });

  it.each([0n, 1n, (1n << 256n) - 1n])('accepts a canonical uint256 nonce %s', async (expected) => {
    const response = `0x${expected.toString(16).toUpperCase().padStart(64, '0')}`;
    await expect(permitReader(mockRpc(84532, () => response), '1').nonce(TOKEN, OWNER)).resolves.toBe(expected);
  });
});
