// Reusable webhook handler: raw-body capture, HMAC verification, replay + idempotency protection.
// Only depends on @ghostpay/merchant-hooks and node:http types.
import { IdempotencyGuard, MemoryNonceStore, parseWebhookEvent, verifyWebhook } from '@ghostpay/merchant-hooks';

export const MAX_BODY_BYTES = 64 * 1024;
export const PATH = '/webhooks/ghostpay';

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function reply(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}

/**
 * @param {{ secret: Uint8Array, now?: () => number, onEvent: (event: object) => Promise<void> | void,
 *           toleranceSeconds?: number }} opts
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createReceiver(opts) {
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const nonces = new MemoryNonceStore();
  const seen = new IdempotencyGuard();
  return async (req, res) => {
    try {
      if (req.url !== PATH) return reply(res, 404, { ok: false });
      if (req.method !== 'POST') return reply(res, 405, { ok: false });
      const header = req.headers['ghostpay-signature'];
      if (typeof header !== 'string') return reply(res, 400, { ok: false });
      // Verify the EXACT bytes received, before any JSON parsing.
      const body = await readBody(req, MAX_BODY_BYTES);
      const v = verifyWebhook(opts.secret, body, header, {
        now: now(),
        nonces,
        ...(opts.toleranceSeconds === undefined ? {} : { toleranceSeconds: opts.toleranceSeconds }),
      });
      // Same coarse answer for every failure: do not tell the caller which check failed.
      if (!v.ok) return reply(res, 400, { ok: false });
      let event;
      try {
        event = parseWebhookEvent(body);
      } catch {
        return reply(res, 400, { ok: false });
      }
      // Idempotency: a redelivery of an event already handled is acknowledged but not processed twice. A redelivery
      // that arrives while an earlier delivery is still in onEvent() gets a retryable 503: that attempt may still
      // fail, and a 2xx would stop the sender's retries.
      const claim = seen.begin(event.id);
      if (claim === 'done') return reply(res, 200, { ok: true, duplicate: true });
      if (claim === 'processing') return reply(res, 503, { ok: false, retry: true });
      try {
        await opts.onEvent(event);
      } catch {
        seen.release(event.id); // let the sender's retry schedule try again
        return reply(res, 500, { ok: false });
      }
      seen.complete(event.id);
      return reply(res, 200, { ok: true });
    } catch (e) {
      return reply(res, e?.status === 413 ? 413 : 400, { ok: false });
    }
  };
}
