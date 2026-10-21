import net from 'node:net';
import { assertLoopback, isLoopbackHost, listenLoopback, trackSockets, type Running } from './loopback.js';

/** One CONNECT request as seen by the fake proxy. */
export interface SocksRecord {
  /** Methods offered in the greeting. */
  readonly methods: readonly number[];
  /** RFC 1929 username, when the client authenticated. */
  readonly username?: string;
  /** RFC 1929 password, when the client authenticated. */
  readonly password?: string;
  /** Command byte (1 = CONNECT). */
  readonly cmd: number;
  /** Address type byte: 1 IPv4, 3 domain, 4 IPv6. */
  readonly atyp: number;
  /** Destination as the client wrote it (domain text, or textual IP). */
  readonly host: string;
  /** Destination port. */
  readonly port: number;
  /** Reply code the proxy sent. */
  readonly reply: number;
}

/** Misbehaviours the fake proxy can simulate. */
export type SocksMisbehaviour =
  | 'none'
  | 'bad-greeting-version'
  | 'bad-reply-version'
  | 'truncated-reply'
  | 'garbage-reply'
  | 'hang-after-greeting'
  | 'hang-after-auth'
  | 'close-after-greeting'
  | 'reply-domain-bound-address'
  | 'reply-ipv6-bound-address'
  | 'reply-bad-atyp';

/** Options for {@link startSocks5Server}. */
export interface Socks5ServerOptions {
  /** Loopback bind host. Default `127.0.0.1`. */
  readonly host?: string;
  /**
   * `none`: accept method 0x00. `userpass`: require method 0x02 (RFC 1929). Default `none`.
   */
  readonly auth?: 'none' | 'userpass';
  /** For `userpass`: return false to reject the credentials. Default accepts all. */
  readonly checkCredentials?: (username: string, password: string) => boolean;
  /**
   * Fake name resolution performed BY THE PROXY: domain -> loopback host to dial. Names not listed get
   * reply 0x04. Dials always go to the requested port.
   */
  readonly hosts?: Readonly<Record<string, string>>;
  /** Force this reply code (0x01..0x08) instead of connecting. */
  readonly forceReply?: number;
  /** Simulated misbehaviour. */
  readonly misbehave?: SocksMisbehaviour;
}

/** A running fake SOCKS5 proxy. */
export interface Socks5Server extends Running {
  /** Every completed CONNECT request, in order. */
  readonly records: readonly SocksRecord[];
  /** Greetings seen, including ones that never reached a request. */
  readonly greetings: readonly (readonly number[])[];
  /** Currently open client connections (tunnels count as one each). */
  readonly openConnections: () => number;
}

/** @internal Reads exactly what a state needs from a growing buffer. */
class Cursor {
  private buf = Buffer.alloc(0);
  public push(d: Buffer): void {
    this.buf = Buffer.concat([this.buf, d]);
  }
  public take(n: number): Buffer | null {
    if (this.buf.length < n) return null;
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
  public peek(n: number): Buffer | null {
    return this.buf.length < n ? null : this.buf.subarray(0, n);
  }
  public rest(): Buffer {
    const r = this.buf;
    this.buf = Buffer.alloc(0);
    return r;
  }
}

function ipText(atyp: number, raw: Buffer): string {
  if (atyp === 1) return [...raw].join('.');
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(raw.readUInt16BE(i).toString(16));
  return groups.join(':') === '0:0:0:0:0:0:0:1' ? '::1' : groups.join(':');
}

/**
 * Starts a fake SOCKS5 proxy on loopback. Hostnames (ATYP 0x03) are "resolved" by the proxy from the
 * `hosts` table, which is exactly what SOCKS5h requires of a real proxy such as Tor.
 *
 * @security test-only; refuses any non-loopback bind or dial target.
 * @param opts Options.
 * @returns A handle with recorded requests.
 */
export async function startSocks5Server(opts: Socks5ServerOptions = {}): Promise<Socks5Server> {
  const host = opts.host ?? '127.0.0.1';
  assertLoopback(host, 'socks bind host');
  const auth = opts.auth ?? 'none';
  const misbehave = opts.misbehave ?? 'none';
  const records: SocksRecord[] = [];
  const greetings: (readonly number[])[] = [];
  const server = net.createServer((client) => {
    handleClient(client);
  });
  const sockets = trackSockets(server);

  function reply(client: net.Socket, code: number, bound: net.Socket | null): void {
    const port = bound?.localPort ?? 0;
    const portBuf = Buffer.alloc(2);
    portBuf.writeUInt16BE(port);
    let atypBody: Buffer = Buffer.concat([Buffer.from([1, 127, 0, 0, 1]), portBuf]);
    if (misbehave === 'reply-domain-bound-address') {
      atypBody = Buffer.concat([Buffer.from([3, 3]), Buffer.from('abc'), portBuf]);
    } else if (misbehave === 'reply-ipv6-bound-address') {
      atypBody = Buffer.concat([Buffer.from([4]), Buffer.alloc(16), portBuf]);
    } else if (misbehave === 'reply-bad-atyp') {
      atypBody = Buffer.from([9, 0, 0]);
    }
    const ver = misbehave === 'bad-reply-version' ? 4 : 5;
    const msg = Buffer.concat([Buffer.from([ver, code, 0]), atypBody]);
    if (misbehave === 'truncated-reply') {
      client.write(msg.subarray(0, 5));
      client.end();
    } else if (misbehave === 'garbage-reply') {
      client.write(Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55]));
    } else client.write(msg);
  }

  function handleClient(client: net.Socket): void {
    client.on('error', () => undefined);
    const cur = new Cursor();
    let state: 'greet' | 'auth' | 'req' | 'tunnel' = 'greet';
    let methods: number[] = [];
    let username: string | undefined;
    let password: string | undefined;
    const step = (): void => {
      for (;;) {
        if (state === 'greet') {
          const head = cur.peek(2);
          if (head === null) return;
          const n = head.readUInt8(1);
          const all = cur.take(2 + n);
          if (all === null) return;
          if (all.readUInt8(0) !== 5 || misbehave === 'bad-greeting-version') {
            client.end(Buffer.from([0x05, 0xff]));
            return;
          }
          methods = [...all.subarray(2)];
          greetings.push(methods);
          if (misbehave === 'close-after-greeting') {
            client.destroy();
            return;
          }
          const want = auth === 'userpass' ? 2 : 0;
          if (!methods.includes(want)) {
            client.end(Buffer.from([0x05, 0xff]));
            return;
          }
          client.write(Buffer.from([0x05, want]));
          if (misbehave === 'hang-after-greeting') {
            state = 'tunnel';
            return;
          }
          state = auth === 'userpass' ? 'auth' : 'req';
        } else if (state === 'auth') {
          const h = cur.peek(2);
          if (h === null) return;
          const ulen = h.readUInt8(1);
          const h2 = cur.peek(2 + ulen + 1);
          if (h2 === null) return;
          const plen = h2.readUInt8(2 + ulen);
          const all = cur.take(2 + ulen + 1 + plen);
          if (all === null) return;
          username = all.subarray(2, 2 + ulen).toString('utf8');
          password = all.subarray(3 + ulen).toString('utf8');
          const ok = opts.checkCredentials === undefined || opts.checkCredentials(username, password);
          if (!ok) {
            client.end(Buffer.from([0x01, 0x01]));
            return;
          }
          client.write(Buffer.from([0x01, 0x00]));
          if (misbehave === 'hang-after-auth') {
            state = 'tunnel';
            return;
          }
          state = 'req';
        } else if (state === 'req') {
          const h = cur.peek(5);
          if (h === null) return;
          const atyp = h.readUInt8(3);
          let alen: number;
          if (atyp === 1) alen = 4;
          else if (atyp === 4) alen = 16;
          else if (atyp === 3) alen = 1 + h.readUInt8(4);
          else {
            client.end();
            return;
          }
          const all = cur.take(4 + alen + 2);
          if (all === null) return;
          const cmd = all.readUInt8(1);
          const addr = all.subarray(4, 4 + alen);
          const destHost = atyp === 3 ? addr.subarray(1).toString('utf8') : ipText(atyp, addr);
          const destPort = all.readUInt16BE(4 + alen);
          state = 'tunnel';
          dial(client, cmd, atyp, destHost, destPort, cur.rest());
          return;
        } else return;
      }
    };
    const dial = (
      c: net.Socket,
      cmd: number,
      atyp: number,
      destHost: string,
      destPort: number,
      early: Buffer,
    ): void => {
      const rec = (code: number): void => {
        records.push({
          methods,
          ...(username !== undefined ? { username } : {}),
          ...(password !== undefined ? { password } : {}),
          cmd,
          atyp,
          host: destHost,
          port: destPort,
          reply: code,
        });
      };
      let code = 0;
      let target: string | undefined;
      if (opts.forceReply !== undefined) code = opts.forceReply;
      else if (cmd !== 1) code = 7;
      else if (atyp === 3) {
        target = opts.hosts?.[destHost];
        if (target === undefined) code = 4;
      } else target = destHost;
      if (code === 0 && (target === undefined || !isLoopbackHost(target))) code = 2;
      if (code !== 0 || target === undefined) {
        rec(code);
        reply(c, code, null);
        if (misbehave === 'none') c.end();
        return;
      }
      const upstream = net.connect({ host: target, port: destPort });
      sockets.add(upstream);
      upstream.once('close', () => sockets.delete(upstream));
      let connected = false;
      upstream.on('error', () => {
        if (connected) {
          c.destroy();
          return;
        }
        rec(5);
        reply(c, 5, null);
        c.end();
      });
      upstream.once('connect', () => {
        connected = true;
        rec(0);
        reply(c, 0, upstream);
        if (misbehave === 'truncated-reply' || misbehave === 'garbage-reply') {
          upstream.destroy();
          return;
        }
        if (early.length > 0) upstream.write(early);
        c.pipe(upstream);
        upstream.pipe(c);
        c.on('close', () => upstream.destroy());
        upstream.on('close', () => c.destroy());
      });
    };
    client.on('data', (d) => {
      if (state === 'tunnel') return;
      cur.push(d);
      step();
    });
  }

  const running = await listenLoopback(server, host, sockets);
  return Object.assign(running, {
    records,
    greetings,
    openConnections: () => sockets.size,
  });
}
