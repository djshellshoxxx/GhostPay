import { SecretBox, SecretBoxError, wipe } from './secretBox.js';

/**
 * Collects temporary secret buffers and boxes so one `close()` wipes all of them, on success and on
 * every error path.
 *
 * Fixes the pattern behind haiku audit L8 / S3-15 (`scanClient.runScan` skipped zeroization when
 * `createWorker()` threw before the `try`) and code-tslibs I-02 (`generateKeySet` left copies when a
 * later step threw): register each buffer the moment it exists, inside {@link withScope}.
 *
 * @security Best-effort zeroization (see {@link wipe}).
 */
export class SecretScope {
  private buffers: Uint8Array[] = [];
  private boxes: SecretBox[] = [];
  private closed = false;

  /**
   * Registers a buffer for wiping at {@link close}.
   *
   * @returns The same buffer, for inline use: `const k = scope.track(derive())`.
   * @throws SecretBoxError DISPOSED if the scope is already closed (the buffer is wiped first);
   *   INVALID_INPUT if `buffer` is not a `Uint8Array` (nothing is registered).
   */
  public track<T extends Uint8Array>(buffer: T): T {
    if (!(buffer instanceof Uint8Array)) throw new SecretBoxError('INVALID_INPUT', 'track() needs a Uint8Array');
    if (this.closed) {
      wipe(buffer);
      throw new SecretBoxError('DISPOSED', 'scope is closed');
    }
    this.buffers.push(buffer);
    return buffer;
  }

  /**
   * Boxes a copy of `bytes` (wiping `bytes`) and registers the box for disposal at {@link close}.
   *
   * @param bytes Secret bytes.
   * @param label Redaction label.
   */
  public box(bytes: Uint8Array, label?: string): SecretBox {
    const b = SecretBox.copyOf(bytes, label === undefined ? {} : { label });
    if (this.closed) {
      b.dispose();
      throw new SecretBoxError('DISPOSED', 'scope is closed');
    }
    this.boxes.push(b);
    return b;
  }

  /**
   * Removes `box` from the scope so it survives {@link close} (the caller takes ownership, for
   * example to return a long-lived key from a derivation).
   *
   * @returns The same box.
   */
  public keep(box: SecretBox): SecretBox {
    this.boxes = this.boxes.filter((b) => b !== box);
    return box;
  }

  /**
   * Wipes every tracked buffer and disposes every tracked box. Idempotent. Each entry is handled on
   * its own, so one bad entry cannot leave the others live (audit L-1).
   *
   * @throws SecretBoxError INVALID_INPUT after everything else was cleaned, if some entry could not
   *   be wiped.
   */
  public close(): void {
    this.closed = true;
    const { buffers, boxes } = this;
    this.buffers = [];
    this.boxes = [];
    let failed = false;
    for (const b of buffers) {
      try {
        wipe(b);
      } catch {
        failed = true;
      }
    }
    for (const b of boxes) {
      try {
        b.dispose();
      } catch {
        failed = true;
      }
    }
    if (failed) throw new SecretBoxError('INVALID_INPUT', 'scope held an entry that could not be wiped');
  }
}

/**
 * Runs a synchronous `fn` with a fresh {@link SecretScope} and closes it in `finally`.
 *
 * @throws SecretBoxError ASYNC_IN_SYNC_USE if `fn` returns a thenable (the scope would close before
 *   the awaited work ran); use {@link withScopeAsync}.
 */
export function withScope<T>(fn: (scope: SecretScope) => T): T {
  const scope = new SecretScope();
  let result: T;
  try {
    result = fn(scope);
    if (typeof result === 'object' && result !== null && typeof (result as { then?: unknown }).then === 'function') {
      throw new SecretBoxError('ASYNC_IN_SYNC_USE', 'withScope() callback returned a promise; use withScopeAsync()');
    }
  } catch (e) {
    closeQuietly(scope);
    throw e;
  }
  scope.close();
  return result;
}

/** Closes while another error is propagating, so the close report cannot mask it. */
function closeQuietly(scope: SecretScope): void {
  try {
    scope.close();
  } catch {
    /* the original error wins; everything else was still wiped */
  }
}

/** Async variant of {@link withScope}: the scope closes when `fn`'s promise settles. */
export async function withScopeAsync<T>(fn: (scope: SecretScope) => Promise<T>): Promise<T> {
  const scope = new SecretScope();
  let result: T;
  try {
    result = await fn(scope);
  } catch (e) {
    closeQuietly(scope);
    throw e;
  }
  scope.close();
  return result;
}
