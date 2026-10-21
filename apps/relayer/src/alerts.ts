import { nullLogger, type Logger } from './log.js';

/** Fixed alert kinds; the payload never carries request data. */
export type AlertKind = 'breaker_open' | 'low_balance' | 'loss_budget_exhausted' | 'daily_budget_exhausted' | 'mined_revert';

/** An operator alert. */
export interface AlertEvent {
  readonly kind: AlertKind;
  readonly chainId?: number;
}

/** Receives operator alerts; must never throw or block the request path. */
export interface AlertSink {
  send(event: AlertEvent): void;
}

/** Sink that drops everything. */
export const nullAlerts: AlertSink = { send: () => undefined };

/** Options of {@link createWebhookAlerts}. */
export interface WebhookAlertOptions {
  /** https URL (validated by the config loader). */
  readonly url: string;
  readonly logger?: Logger;
  /** Monotonic ms clock. */
  readonly now: () => number;
  /** Minimum gap between deliveries of the same kind and chain (default 60 s). */
  readonly minIntervalMs?: number;
  /** Replaces `fetch` (tests). */
  readonly fetchImpl?: typeof fetch;
  /** Delivery timeout (default 5 s). */
  readonly timeoutMs?: number;
}

/**
 * Posts alerts as `{"kind","chainId","text"}` JSON to a webhook (Slack/Discord/PagerDuty-compatible
 * `text` field). Fire-and-forget, de-duplicated per kind and chain, failure logged by class only.
 *
 * @param o Options.
 * @returns The sink.
 */
export function createWebhookAlerts(o: WebhookAlertOptions): AlertSink {
  const logger = o.logger ?? nullLogger;
  const gap = o.minIntervalMs ?? 60_000;
  const doFetch = o.fetchImpl ?? fetch;
  const last = new Map<string, number>();
  return {
    send(e) {
      const key = `${e.kind}:${String(e.chainId ?? 0)}`;
      const t = o.now();
      const prev = last.get(key);
      if (prev !== undefined && t - prev < gap) return;
      last.set(key, t);
      const text = `ghostpay-relayer alert: ${e.kind}${e.chainId === undefined ? '' : ` chain ${String(e.chainId)}`}`;
      const body = JSON.stringify({ kind: e.kind, ...(e.chainId === undefined ? {} : { chainId: e.chainId }), text });
      void doFetch(o.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(o.timeoutMs ?? 5000),
      }).then(
        (r) => {
          if (!r.ok) logger.log('warn', 'alert_delivery_failed', { errorClass: 'http_status' });
        },
        () => logger.log('warn', 'alert_delivery_failed', { errorClass: 'network' }),
      );
    },
  };
}
