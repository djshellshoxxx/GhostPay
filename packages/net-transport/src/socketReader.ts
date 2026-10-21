import type net from 'node:net';
import { NetTransportError, type NetTransportErrorCode } from './errors.js';

/**
 * Buffered pull-reader over a socket with one overall deadline. After {@link SocketReader.detach} any
 * unread bytes are pushed back onto the socket so a following TLS or HTTP layer sees them.
 *
 * @internal
 */
export class SocketReader {
  private buf = Buffer.alloc(0);
  private failure: NetTransportError | undefined;
  private wake: (() => void) | undefined;
  private readonly timer: NodeJS.Timeout;
  private readonly onData = (d: Buffer): void => {
    this.buf = Buffer.concat([this.buf, d]);
    this.notify();
  };
  private readonly onEnd = (): void => {
    this.fail('PROXY_CONNECT', 'connection closed during handshake');
  };
  private readonly onError = (): void => {
    this.fail('PROXY_CONNECT', 'connection to proxy failed');
  };

  /**
   * @param sock Connected or connecting socket.
   * @param timeoutMs Deadline for everything read through this reader.
   * @param timeoutCode Code used when the deadline passes.
   */
  public constructor(
    private readonly sock: net.Socket,
    timeoutMs: number,
    timeoutCode: NetTransportErrorCode = 'PROXY_CONNECT',
  ) {
    sock.on('data', this.onData);
    sock.on('close', this.onEnd);
    sock.on('end', this.onEnd);
    sock.on('error', this.onError);
    this.timer = setTimeout(() => {
      this.fail(timeoutCode, 'proxy handshake timed out');
    }, timeoutMs);
  }

  private notify(): void {
    const w = this.wake;
    this.wake = undefined;
    w?.();
  }

  /** Records a failure (first one wins), destroys the socket and wakes any waiter. */
  public fail(code: NetTransportErrorCode, message: string): void {
    this.failure ??= new NetTransportError(code, message);
    this.sock.destroy();
    this.notify();
  }

  private async until(ready: () => boolean): Promise<void> {
    while (!ready()) {
      if (this.failure !== undefined) throw this.failure;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  /** Reads exactly `n` bytes. */
  public async take(n: number): Promise<Buffer> {
    await this.until(() => this.buf.length >= n);
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }

  /**
   * Reads up to and including `marker`.
   *
   * @param marker Byte sequence to look for.
   * @param max Maximum bytes buffered before failing with `tooLong`.
   * @param tooLong Error raised when `max` is exceeded.
   */
  public async takeUntil(marker: string, max: number, tooLong: NetTransportError): Promise<Buffer> {
    let idx = -1;
    await this.until(() => {
      idx = this.buf.indexOf(marker);
      return idx >= 0 || this.buf.length > max;
    });
    if (idx < 0 || idx + marker.length > max) throw tooLong;
    return this.take(idx + marker.length);
  }

  /** Stops reading, clears the deadline, and pushes unread bytes back onto the socket. */
  public detach(): void {
    clearTimeout(this.timer);
    this.sock.off('data', this.onData);
    this.sock.off('close', this.onEnd);
    this.sock.off('end', this.onEnd);
    this.sock.off('error', this.onError);
    if (this.buf.length > 0) this.sock.unshift(this.buf);
    this.buf = Buffer.alloc(0);
    this.sock.pause();
  }

  /** Clears the deadline without touching the socket (failure path). */
  public dispose(): void {
    clearTimeout(this.timer);
  }
}
