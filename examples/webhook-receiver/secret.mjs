import { constants, openSync, fstatSync, readSync, closeSync } from 'node:fs';
// Descriptor-bound, bounded, regular private file; no path re-open after validation.
export function loadWebhookSecret(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const st = fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077) !== 0 || st.size > 4096 ||
        (process.getuid && st.uid !== process.getuid())) throw new Error('unsafe-secret-file');
    const bytes = Buffer.alloc(4097);
    let size = 0;
    while (size < bytes.length) {
      const n = readSync(fd, bytes, size, bytes.length - size, null);
      if (n === 0) break;
      size += n;
    }
    const hex = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)).trim();
    bytes.fill(0);
    if (size > 4096 || !/^(?:[0-9a-f]{2}){32,2048}$/.test(hex)) throw new Error('invalid-secret-file');
    return Uint8Array.from(Buffer.from(hex, 'hex'));
  } finally { if (fd !== undefined) closeSync(fd); }
}
