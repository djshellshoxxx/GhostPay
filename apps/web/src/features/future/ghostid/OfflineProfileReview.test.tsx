// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MAX_PROFILE_BYTES, merchantIdFor, signMerchantProfile, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineProfileReview } from './OfflineProfileReview';

const now = 1_800_000_000;
const key = new Uint8Array(32).fill(4);
const signer = signerPublicKeyHex(key);
const merchant = signMerchantProfile({
  v: 1, merchantId: merchantIdFor(signer), name: 'Harbour Books', signer,
  origins: ['https://books.example'], chains: [1], tokens: ['ETH'], templates: [], exp: now + 20,
}, key);
const bytes = new TextEncoder().encode(JSON.stringify(merchant));
const fileLabel = 'Signed merchant profile file';
const keyLabel = 'Enter the full signer public key verified through an independent channel';
const match = 'The profile signer matches the full key you entered.';
const conflict = 'This profile was signed by a different key.';

function select(file?: Pick<File, 'size' | 'arrayBuffer'>): void {
  fireEvent.change(screen.getByLabelText(fileLabel), { target: { files: file === undefined ? [] : [file] } });
}
function compare(value: string): void {
  fireEvent.change(screen.getByLabelText(keyLabel), { target: { value } });
}
function withBytes(data: Uint8Array<ArrayBuffer>) {
  return { size: data.length, arrayBuffer: () => Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) };
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('GhostID offline profile import', () => {
  it('compares every digit of the separately entered key and keeps the origin a text claim', async () => {
    render(<OfflineProfileReview nowMs={() => now * 1000} />);
    select(withBytes(bytes));
    await screen.findByText('Harbour Books');
    expect(screen.getByText(signer)).toBeTruthy();
    expect(screen.getByText('https://books.example')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(match)).toBeNull();
    compare(signer.slice(0, 16));
    expect(screen.queryByText(match)).toBeNull();
    compare(signer);
    expect(screen.getByText(match)).toBeTruthy();
    compare(signerPublicKeyHex(new Uint8Array(32).fill(6)));
    expect(screen.getByText(conflict)).toBeTruthy();
    compare('');
    expect(screen.queryByText(conflict)).toBeNull();
  });

  it.each([
    ['changed name', new TextEncoder().encode(JSON.stringify({ ...merchant, name: 'Another merchant' }))],
    ['unknown avatar', new TextEncoder().encode(JSON.stringify({ ...merchant, avatar: 'https://img.example/p' }))],
    ['malformed UTF-8', Uint8Array.of(0xff, 0xfe)],
    ['empty file', new Uint8Array()],
    ['duplicate field', new TextEncoder().encode(JSON.stringify(merchant).replace('{"v":1,', '{"v":1,"v":1,'))],
  ])('clears prior verified details for %s', async (_label, data) => {
    render(<OfflineProfileReview nowMs={() => now * 1000} />);
    select(withBytes(bytes));
    await screen.findByText('Harbour Books');
    select(withBytes(data));
    expect(screen.queryByText('Harbour Books')).toBeNull();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('accepts the exact byte limit and refuses a larger file before reading it', async () => {
    render(<OfflineProfileReview nowMs={() => now * 1000} />);
    const padded = new Uint8Array(MAX_PROFILE_BYTES).fill(0x20);
    padded.set(bytes);
    select(withBytes(padded));
    await screen.findByText('Harbour Books');
    const arrayBuffer = vi.fn(() => Promise.resolve(bytes.buffer));
    select({ size: MAX_PROFILE_BYTES + 1, arrayBuffer });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it.each([now + 20, Infinity, NaN])('refuses invalid or expired review time %s at completion of the read', async (seconds) => {
    let sampled = now;
    render(<OfflineProfileReview nowMs={() => sampled * 1000} />);
    select(withBytes(bytes));
    sampled = seconds;
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Harbour Books')).toBeNull();
  });

  it('ignores a delayed read after replacement and clearing, including late read failures', async () => {
    let finish!: (bytes: ArrayBuffer) => void;
    let fail!: (reason: Error) => void;
    const first = new Promise<ArrayBuffer>((resolve) => { finish = resolve; });
    const second = new Promise<ArrayBuffer>((_resolve, reject) => { fail = reject; });
    render(<OfflineProfileReview nowMs={() => now * 1000} />);
    select({ size: bytes.length, arrayBuffer: () => first });
    select({ size: bytes.length, arrayBuffer: () => second });
    select(withBytes(bytes));
    await screen.findByText('Harbour Books');
    await act(async () => { fail(new Error('unreadable')); await Promise.resolve(); });
    expect(screen.queryByRole('alert')).toBeNull();
    select();
    await act(async () => { finish(bytes.buffer); await first; });
    expect(screen.queryByText('Harbour Books')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses every truncated key and every single-digit substitution', async () => {
    render(<OfflineProfileReview nowMs={() => now * 1000} />);
    select(withBytes(bytes));
    await screen.findByText('Harbour Books');
    for (let i = 0; i < signer.length; i++) {
      compare(signer.slice(0, i));
      expect(screen.queryByText(match)).toBeNull();
      const changed = signer.slice(0, i) + (signer[i] === 'a' ? 'b' : 'a') + signer.slice(i + 1);
      compare(changed);
      expect(screen.queryByText(match)).toBeNull();
    }
    compare(signer + '0');
    expect(screen.queryByText(match)).toBeNull();
    compare(signer);
    expect(screen.getByText(match)).toBeTruthy();
  });

  it('refuses a newly entered match after expiry even before the next timer or focus event', async () => {
    let clock = now;
    render(<OfflineProfileReview nowMs={() => clock * 1000} />);
    select(withBytes(bytes));
    await screen.findByText('Harbour Books');
    clock = now + 20;
    compare(signer);
    expect(screen.queryByText(match)).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/expired/i);
  });

  it('allows clearing a read error and retrying the same file', async () => {
    render(<OfflineProfileReview nowMs={() => now * 1000} />);
    select({ size: 100, arrayBuffer: () => Promise.reject(new Error('read error')) });
    expect((await screen.findByRole('alert')).textContent).toContain('could not be read');
    fireEvent.click(screen.getByRole('button', { name: 'Clear local review' }));
    expect(screen.queryByRole('alert')).toBeNull();
    select(withBytes(bytes));
    expect(await screen.findByText('Harbour Books')).toBeTruthy();
  });

  it('removes the comparison when the imported profile expires while open', async () => {
    let clock = now;
    render(<OfflineProfileReview nowMs={() => clock * 1000} />);
    select(withBytes(bytes));
    await screen.findByText('Harbour Books');
    compare(signer);
    expect(screen.getByText(match)).toBeTruthy();
    clock = now + 20;
    fireEvent.focus(window);
    expect(screen.queryByText(match)).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/expired/i);
  });
});
