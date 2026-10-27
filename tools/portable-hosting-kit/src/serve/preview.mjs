// @ts-check
// Loopback-only preview server. Serves exactly the listed files with the same status codes and kit-controlled
// headers as the generated nginx profile (checked by test/profiles/differential.test.mjs). No request logging,
// no directory listings, GET and HEAD only, never follows symlinks.
//
// Where nginx's own request handling decides the outcome before the kit's configuration applies (request-line
// errors -> 400, conditional requests -> 304/412, ETag/Last-Modified), this module mirrors nginx 1.24 behaviour.

import * as nodeFs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { KitError, ERROR_CODES } from '../errors.mjs';
import { contentTypeFor } from '../policy.mjs';
import { assertServableHeaders, kitResponseHeaders } from './headers.mjs';
import {
  checkBasePath, createRouter, hasControlChar, isRejectedByUriParser, nginxRequestUri, requestHeaderPath, servableFiles,
} from './routing.mjs';

/** @typedef {import('../types.mjs').HeaderPolicy} HeaderPolicy */
/** @typedef {import('../types.mjs').HostConfig} HostConfig */
/** @typedef {import('../types.mjs').Listener} Listener */
/** @typedef {import('../types.mjs').RouteResult} RouteResult */
/** @typedef {Pick<typeof nodeFs, 'lstat' | 'open' | 'realpath'>} PreviewFs */
/** @typedef {(listener: http.RequestListener) => http.Server} CreateServer */
/** @typedef {Array<[string, string]>} HeaderList */
/** @typedef {{ status: number, headers: HeaderList, body: Buffer, contentLength: number | null }} Reply */
/** @typedef {{ data: Buffer, mtimeSec: number }} FileRead */
/**
 * @typedef {object} Conditionals request validators (header values, if present)
 * @property {string} [ifMatch]
 * @property {string} [ifNoneMatch]
 * @property {string} [ifModifiedSince]
 * @property {string} [ifUnmodifiedSince]
 */

export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', '::1']);
export const ALLOWED_METHODS = 'GET, HEAD';

/** Content-Type of server-generated bodies, as nginx sends them (301 bypasses its charset filter). */
const ERROR_CONTENT_TYPE = 'text/html; charset=utf-8';
const REDIRECT_CONTENT_TYPE = 'text/html';
/** Method tokens nginx's parser accepts (it answers unknown ones with 405 via the kit config). */
const NGINX_METHOD_RE = /^[A-Z_-]+$/;
/** Final statuses before which nginx answers "Expect: 100-continue" with an interim 100. */
const CONTINUE_STATUSES = [200, 301, 304, 412];
const ABSOLUTE_FORM_RE = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Throw KitError(E_NETWORK_SCOPE) unless the listener is loopback TCP (127.0.0.1 / ::1) or an absolute unix path.
 * @param {Listener} listener
 */
export function assertLoopbackListener(listener) {
  if (listener && listener.kind === 'unix') {
    if (typeof listener.path !== 'string' || !path.posix.isAbsolute(listener.path) || /[\s;{}"'\\$#]/.test(listener.path) || hasControlChar(listener.path)) {
      throw new KitError(ERROR_CODES.NETWORK_SCOPE, `unix socket path must be absolute without whitespace or config metacharacters: ${JSON.stringify(listener.path)}`);
    }
    return;
  }
  if (!listener || listener.kind !== 'tcp' || !LOOPBACK_HOSTS.includes(listener.host)) {
    throw new KitError(ERROR_CODES.NETWORK_SCOPE, `listener must be loopback TCP (${LOOPBACK_HOSTS.join(', ')}) or a unix socket, got ${JSON.stringify(listener)}`);
  }
  if (!Number.isInteger(listener.port) || listener.port < 0 || listener.port > 65535) {
    throw new KitError(ERROR_CODES.NETWORK_SCOPE, `invalid port ${JSON.stringify(listener.port)}`);
  }
}

/**
 * Request-targets nginx rejects with 400 while parsing the request line, before configuration applies.
 * @param {string} target
 * @returns {boolean}
 */
export function isBadRequestLine(target) {
  return !(target.startsWith('/') || ABSOLUTE_FORM_RE.test(target)) || isRejectedByUriParser(target);
}

/**
 * Host header values nginx accepts. nginx 1.30 validates natively (RFC 3986-like: reg-name of unreserved,
 * sub-delims and "%", or a bracketed literal; optional numeric port <= 65535; no ".."); nginx 1.24 only rejects
 * a subset, so the nginx profile applies this same regex in its configuration and both versions agree.
 */
export const VALID_HOST_REGEX = "^(?:\\[[A-Za-z0-9:._~!$&'()*+,;=-]*\\]|(?!\\.(?::|$))(?![^:]*\\.\\.)[A-Za-z0-9._~!$&'()*+,;=%-]+)(?::0*(?:6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[0-9]{1,4})?)?$";
const VALID_HOST_RE = new RegExp(VALID_HOST_REGEX);

/**
 * @param {string} host
 * @returns {boolean}
 */
export function isValidNginxHost(host) {
  return VALID_HOST_RE.test(host);
}

/**
 * True if nginx would reject the request's Host header(s) with 400: missing on HTTP/1.1, repeated, or invalid.
 * @param {string} httpVersion
 * @param {string[]} rawHeaders alternating names and values, as received
 * @returns {boolean}
 */
export function isBadHost(httpVersion, rawHeaders) {
  const hosts = [];
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    if (/** @type {string} */ (rawHeaders[i]).toLowerCase() === 'host') hosts.push(/** @type {string} */ (rawHeaders[i + 1]));
  }
  if (hosts.length === 0) return httpVersion === '1.1';
  return hosts.length > 1 || !isValidNginxHost(/** @type {string} */ (hosts[0]));
}

/**
 * HTTP date -> seconds since epoch, or -1, following nginx's ngx_parse_http_time (RFC 1123, RFC 850, asctime;
 * weekday and zone are not checked).
 * @param {string} value
 * @returns {number}
 */
export function parseHttpDate(value) {
  const lead = /^[^, ]*([, ]) */.exec(value);
  if (!lead) return -1;
  const rest = value.slice(lead[0].length);
  /** @type {RegExpExecArray | null} */
  let m;
  let day;
  let mon;
  let year;
  let hms;
  if (lead[1] === ',' && (m = /^(\d\d) ([A-Z][a-z]{2}) (\d{4}) (\d\d):(\d\d):(\d\d)/.exec(rest))) {
    [day, mon, year, hms] = [Number(m[1]), m[2], Number(m[3]), m.slice(4, 7)];
  } else if (lead[1] === ',' && (m = /^(\d\d)-([A-Z][a-z]{2})-(\d\d) (\d\d):(\d\d):(\d\d)/.exec(rest))) {
    const yy = Number(m[3]);
    [day, mon, year, hms] = [Number(m[1]), m[2], yy + (yy < 70 ? 2000 : 1900), m.slice(4, 7)];
  } else if (lead[1] === ' ' && (m = /^([A-Z][a-z]{2})[\s\S] ?(\d\d?) (\d\d):(\d\d):(\d\d) (\d{4})/.exec(rest))) {
    [day, mon, year, hms] = [Number(m[2]), m[1], Number(m[6]), m.slice(3, 6)];
  } else {
    return -1;
  }
  const month = MONTHS.indexOf(/** @type {string} */ (mon));
  const [hour, min, sec] = hms.map(Number);
  if (month < 0 || /** @type {number} */ (hour) > 23 || /** @type {number} */ (min) > 59 || /** @type {number} */ (sec) > 59) return -1;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (day === 29 && month === 1 ? !leap : day > /** @type {number} */ (MONTH_DAYS[month])) return -1;
  return Date.UTC(year, month, day, /** @type {number} */ (hour), min, sec) / 1000;
}

/**
 * nginx's ngx_http_test_if_match: "*" matches; otherwise compare the response ETag against a comma list
 * (with `weak`, a "W/" prefix in the list is ignored).
 * @param {string} header
 * @param {string | null} etag
 * @param {boolean} weak
 * @returns {boolean}
 */
function testIfMatch(header, etag, weak) {
  if (header === '*') return true;
  if (etag === null) return false;
  let i = 0;
  while (i < header.length) {
    if (weak && header.length - i > 2 && header.startsWith('W/', i)) i += 2;
    if (etag.length > header.length - i) return false;
    if (header.startsWith(etag, i)) {
      let j = i + etag.length;
      while (j < header.length && (header[j] === ' ' || header[j] === '\t')) j++;
      if (j === header.length || header[j] === ',') return true;
    }
    while (i < header.length && header[i] !== ',') i++;
    while (i < header.length && (header[i] === ' ' || header[i] === '\t' || header[i] === ',')) i++;
  }
  return false;
}

/**
 * nginx's not_modified filter (if_modified_since exact): 412, 304 or null (send 200).
 * @param {Conditionals} c
 * @param {string} etag
 * @param {number} mtimeSec
 * @returns {412 | 304 | null}
 */
export function conditionalStatus(c, etag, mtimeSec) {
  if (c.ifUnmodifiedSince !== undefined && !(parseHttpDate(c.ifUnmodifiedSince) >= mtimeSec)) return 412;
  if (c.ifMatch !== undefined && !testIfMatch(c.ifMatch, etag, false)) return 412;
  if (c.ifModifiedSince !== undefined || c.ifNoneMatch !== undefined) {
    if (c.ifModifiedSince !== undefined && parseHttpDate(c.ifModifiedSince) !== mtimeSec) return null;
    if (c.ifNoneMatch !== undefined && !testIfMatch(c.ifNoneMatch, etag, true)) return null;
    return 304;
  }
  return null;
}

/**
 * @param {number} status
 * @returns {Buffer}
 */
function errorBody(status) {
  const text = `${status} ${http.STATUS_CODES[status] ?? ''}`;
  return Buffer.from(`<html>\r\n<head><title>${text}</title></head>\r\n<body>\r\n<center><h1>${text}</h1></center>\r\n</body>\r\n</html>\r\n`);
}

/**
 * Read a listed file without following symlinks anywhere below siteDir. Null if missing or not a regular file.
 * @param {PreviewFs} fs
 * @param {string} siteRoot realpath of siteDir
 * @param {string} rel
 * @returns {Promise<FileRead | null>}
 */
async function readListedFile(fs, siteRoot, rel) {
  const segs = rel.split('/');
  let cur = siteRoot;
  try {
    for (let i = 0; i < segs.length - 1; i++) {
      cur = path.join(cur, /** @type {string} */ (segs[i]));
      if (!(await fs.lstat(cur)).isDirectory()) return null;
    }
    const abs = path.join(siteRoot, ...segs);
    if (!(await fs.lstat(abs)).isFile()) return null;
    const handle = await fs.open(abs, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const st = await handle.stat();
      if (!st.isFile()) return null;
      return { data: await handle.readFile(), mtimeSec: Math.floor(st.mtimeMs / 1000) };
    } finally {
      await handle.close();
    }
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP') return null;
    throw e;
  }
}

/**
 * @typedef {object} RequestInfo
 * @property {string} method
 * @property {string} target              raw request-target
 * @property {boolean} [badHost]        nginx would reject the Host header(s) (see isBadHost)
 * @property {Conditionals} [conditionals]
 */

/**
 * @typedef {object} Site
 * @property {(target: string) => RouteResult} route
 * @property {string} basePath
 * @property {(requestUri: string, headerPath: string) => HeaderList} headers kit headers for a response
 * @property {(rel: string) => Promise<FileRead | null>} read
 */

/**
 * A response generated by the server (no file body).
 * @param {Site} site
 * @param {{ status: number, method: string, requestUri: string, headerPath: string, extra?: HeaderList }} a
 * @returns {Reply}
 */
function generated(site, { status, method, requestUri, headerPath, extra = [] }) {
  const body = errorBody(status);
  /** @type {HeaderList} */
  const headers = [['Content-Type', status === 301 ? REDIRECT_CONTENT_TYPE : ERROR_CONTENT_TYPE], ...extra, ...site.headers(requestUri, headerPath)];
  if (status === 405) headers.push(['Allow', ALLOWED_METHODS]);
  return { status, headers, body: method === 'HEAD' ? Buffer.alloc(0) : body, contentLength: body.length };
}

/**
 * Compute the full response for a parsed request (exported for unit tests).
 * @param {Site} site
 * @param {RequestInfo} req
 * @returns {Promise<Reply>}
 */
export async function respond(site, { method, target, badHost = false, conditionals = {} }) {
  // Order mirrors nginx: request-line errors, Host errors, then the kit configuration (method, routing).
  if (isBadRequestLine(target)) return generated(site, { status: 400, method, requestUri: '', headerPath: '/' });
  const requestUri = nginxRequestUri(target);
  const gen = (/** @type {number} */ status, /** @type {HeaderList} */ extra = [], headerPath = requestHeaderPath(target, site.basePath)) => generated(site, { status, method, requestUri, headerPath, extra });
  if (badHost) return gen(400);
  if (method !== 'GET' && method !== 'HEAD') return gen(405);
  const result = site.route(target);
  if (result.kind === 'redirect') return gen(301, [['Location', result.location]]);
  if (result.kind !== 'file' && result.kind !== 'fallback') return gen(404);
  const file = await site.read(result.path);
  if (file === null) return gen(404);
  const headerPath = `/${result.path}`;
  const etag = `"${file.mtimeSec.toString(16)}-${file.data.length.toString(16)}"`;
  const validators = /** @type {HeaderList} */ ([['Last-Modified', new Date(file.mtimeSec * 1000).toUTCString()], ['ETag', etag]]);
  const cond = conditionalStatus(conditionals, etag, file.mtimeSec);
  if (cond === 412) return gen(412, [], headerPath);
  if (cond === 304) {
    return { status: 304, headers: [...validators, ...site.headers(requestUri, headerPath)], body: Buffer.alloc(0), contentLength: null };
  }
  /** @type {HeaderList} */
  const headers = [['Content-Type', /** @type {string} */ (contentTypeFor(result.path))], ...validators, ...site.headers(requestUri, headerPath)];
  return { status: 200, headers, body: method === 'HEAD' ? Buffer.alloc(0) : file.data, contentLength: file.data.length };
}

/**
 * @param {http.ServerResponse} res
 * @param {Reply} r
 */
function send(res, r) {
  res.statusCode = r.status;
  for (const [name, value] of r.headers) res.setHeader(name, value);
  if (r.contentLength !== null) res.setHeader('Content-Length', String(r.contentLength));
  res.end(r.body);
}

/**
 * Write a raw response on a socket the HTTP parser gave up on (unknown method, bad URL bytes, CONNECT).
 * @param {import('node:stream').Duplex} socket
 * @param {Reply} r
 */
function sendRaw(socket, r) {
  const head = [`HTTP/1.1 ${r.status} ${http.STATUS_CODES[r.status] ?? ''}`, ...r.headers.map(([n, v]) => `${n}: ${v}`)];
  if (r.contentLength !== null) head.push(`Content-Length: ${r.contentLength}`);
  head.push('Connection: close', '', '');
  if (socket.writable) socket.end(Buffer.concat([Buffer.from(head.join('\r\n'), 'latin1'), r.body]));
  else socket.destroy();
}

/**
 * Response for a request Node's parser rejected or diverted (it never reaches 'request'). CONNECT gets 405 as the
 * routing contract says; nginx answers CONNECT itself, before any configuration, with 400 or 405 depending on its
 * version and the request-target form (documented exception to preview/nginx equality).
 * @param {Site} site
 * @param {string} method
 * @param {string} target
 * @param {'invalid-method' | 'connect' | 'other'} why
 * @returns {Reply}
 */
export function parserRejectReply(site, method, target, why) {
  if (why === 'connect') {
    const origin = target.startsWith('/');
    return generated(site, { status: 405, method, requestUri: origin ? target : '', headerPath: origin ? requestHeaderPath(target, site.basePath) : '/' });
  }
  const nginxParses = NGINX_METHOD_RE.test(method) && !isBadRequestLine(target);
  if (!nginxParses) return generated(site, { status: 400, method, requestUri: '', headerPath: '/' });
  const requestUri = nginxRequestUri(target);
  if (why === 'other') return generated(site, { status: 400, method, requestUri, headerPath: '/' });
  // why === 'invalid-method': an upper-case method nginx accepts and the kit configuration answers with 405.
  return generated(site, { status: 405, method, requestUri, headerPath: requestHeaderPath(target, site.basePath) });
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Conditionals}
 */
function conditionalsOf(req) {
  /** @type {Conditionals} */
  const c = {};
  const pick = (/** @type {string} */ name) => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const im = pick('if-match');
  const inm = pick('if-none-match');
  const ims = pick('if-modified-since');
  const iums = pick('if-unmodified-since');
  if (im !== undefined) c.ifMatch = im;
  if (inm !== undefined) c.ifNoneMatch = inm;
  if (ims !== undefined) c.ifModifiedSince = ims;
  if (iums !== undefined) c.ifUnmodifiedSince = iums;
  return c;
}

/**
 * Start the preview server.
 * @param {{ siteDir: string, files: string[], entrypoint: string, basePath: string, policy: HeaderPolicy, hostConfig?: HostConfig | null, host?: string, port?: number, createServer?: CreateServer, fs?: PreviewFs }} opts
 *   hostConfig (optional, additive to the contract) adds the transport headers nginx would send for that host.
 * @returns {Promise<{ url: string, port: number, close(): Promise<void> }>}
 */
export async function startPreview({ siteDir, files, entrypoint, basePath, policy, hostConfig = null, host = '127.0.0.1', port = 0, createServer, fs = nodeFs }) {
  assertLoopbackListener({ kind: 'tcp', host, port });
  checkBasePath(basePath);
  if (hostConfig && hostConfig.basePath !== basePath) {
    throw new KitError(ERROR_CODES.USAGE, `basePath ${basePath} differs from hostConfig.basePath ${hostConfig.basePath}`);
  }
  const route = createRouter({ files, entrypoint, basePath });
  const servable = servableFiles(files);
  assertServableHeaders(policy, servable);
  let siteRoot;
  try {
    siteRoot = await fs.realpath(siteDir);
  } catch (e) {
    throw new KitError(ERROR_CODES.IO, `cannot open site directory ${siteDir}: ${/** @type {Error} */ (e).message}`);
  }
  /** @type {Site} */
  const site = {
    route,
    basePath,
    headers: (requestUri, headerPath) => kitResponseHeaders({ policy, hostConfig, headerPath, requestTarget: requestUri }),
    read: (rel) => readListedFile(fs, siteRoot, rel),
  };

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {boolean} [expectContinue] the client sent "Expect: 100-continue" (HTTP/1.1)
   */
  const onRequest = (req, res, expectContinue = false) => {
    const info = {
      method: req.method ?? '',
      target: req.url ?? '',
      badHost: isBadHost(req.httpVersion, req.rawHeaders),
      conditionals: conditionalsOf(req),
    };
    respond(site, info)
      .then((r) => {
        // nginx sends "100 Continue" when it reaches the static handler or a location-level redirect, but not
        // before its error responses (400, 404, 405).
        if (expectContinue && CONTINUE_STATUSES.includes(r.status)) res.writeContinue();
        send(res, r);
      })
      .catch(() => {
        if (res.headersSent) return void res.destroy();
        send(res, generated(site, { status: 500, method: info.method, requestUri: nginxRequestUri(info.target), headerPath: '/' }));
      });
  };

  const server = createServer
    ? createServer((req, res) => onRequest(req, res))
    : http.createServer({ requireHostHeader: false, headersTimeout: 10_000, requestTimeout: 15_000, keepAliveTimeout: 15_000 }, (req, res) => onRequest(req, res));

  // nginx ignores Expect values other than 100-continue (Node would answer 417); 100-continue is answered with
  // "100 Continue" by both before the final response.
  server.on('checkExpectation', (req, res) => onRequest(req, res));
  server.on('checkContinue', (req, res) => onRequest(req, res, true));
  server.on('clientError', (err, socket) => {
    const rawPacket = /** @type {{ rawPacket?: Buffer }} */ (err).rawPacket;
    const line = rawPacket ? rawPacket.toString('latin1').split('\r\n', 1)[0] ?? '' : '';
    const [method = '', target = ''] = line.split(' ');
    const why = /** @type {NodeJS.ErrnoException} */ (err).code === 'HPE_INVALID_METHOD' ? 'invalid-method' : 'other';
    sendRaw(socket, parserRejectReply(site, method, target, why));
  });
  server.on('connect', (req, socket) => {
    sendRaw(socket, parserRejectReply(site, 'CONNECT', req.url ?? '', 'connect'));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(undefined);
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new KitError(ERROR_CODES.IO, 'preview server has no TCP address');
  const hostPart = host.includes(':') ? `[${host}]` : host;
  return {
    url: `http://${hostPart}:${address.port}${basePath}`,
    port: address.port,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}
