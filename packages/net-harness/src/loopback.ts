import net from 'node:net';
import type { Server } from 'node:http';

/** Hosts the harness will ever bind or connect to. */
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * True when `host` is a loopback literal the harness accepts.
 *
 * @param host Host string (no port).
 */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host);
}

/**
 * Throws unless `host` is loopback.
 *
 * @security The harness must never bind a routable interface or dial a non-loopback address.
 * @param host Host string.
 * @param what Label used in the error text (fixed by the caller, not user data).
 */
export function assertLoopback(host: string, what: string): void {
  if (!isLoopbackHost(host)) throw new Error(`net-harness: ${what} must be loopback`);
}

/** A started local server. */
export interface Running {
  /** Bound loopback host. */
  readonly host: string;
  /** Bound ephemeral port. */
  readonly port: number;
  /** Stops listening and destroys every open socket. Safe to call twice. */
  close(): Promise<void>;
}

/** @internal Tracks sockets of a net/http server so `close()` cannot hang on keep-alive. */
export function trackSockets(server: net.Server | Server): Set<net.Socket> {
  const set = new Set<net.Socket>();
  server.on('connection', (s: net.Socket) => {
    set.add(s);
    s.once('close', () => set.delete(s));
  });
  return set;
}

/** @internal Listens on an ephemeral loopback port and returns a {@link Running}. */
export async function listenLoopback(
  server: net.Server | Server,
  host: string,
  sockets: Set<net.Socket>,
): Promise<Running> {
  assertLoopback(host, 'bind host');
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const addr = server.address();
  /* c8 ignore next */
  if (addr === null || typeof addr === 'string') throw new Error('net-harness: no address');
  let closed = false;
  return {
    host,
    port: addr.port,
    async close() {
      if (closed) return;
      closed = true;
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
