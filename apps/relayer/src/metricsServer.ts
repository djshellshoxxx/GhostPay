import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RelayerConfig } from './config.js';
import type { Metrics } from './metrics.js';

/** Private HTTP listener for metrics. It has no route to the payment service. */
export class MetricsHttpServer {
  private readonly server: Server;
  private closing: Promise<void> | undefined;

  public constructor(private readonly config: RelayerConfig, private readonly metrics: Metrics) {
    this.server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
      const path = req.url ?? '/';
      if (req.method !== 'GET' || !['/metrics', '/v1/stats'].includes(path)) {
        res.writeHead(404, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      const token = config.metricsToken;
      if (token !== undefined) {
        const expected = Buffer.from(`Bearer ${token}`);
        const given = Buffer.from(req.headers.authorization ?? '');
        if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
          res.writeHead(401, { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer' });
          res.end();
          return;
        }
      }
      const isStats = path === '/v1/stats';
      const body = isStats ? JSON.stringify(metrics.stats()) : metrics.render();
      res.writeHead(200, {
        'Content-Type': isStats ? 'application/json; charset=utf-8' : 'text/plain; version=0.0.4; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    });
    this.server.headersTimeout = 5_000;
    this.server.requestTimeout = 5_000;
    this.server.keepAliveTimeout = 1_000;
    this.server.maxConnections = 64;
  }

  public listen(): Promise<AddressInfo> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.metricsPort, this.config.metricsBind, () => {
        this.server.removeListener('error', reject);
        resolve(this.server.address() as AddressInfo);
      });
    });
  }

  public close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    if (!this.server.listening) return Promise.resolve();
    this.closing = new Promise<void>((resolve) => {
      this.server.close(() => resolve());
      this.server.closeIdleConnections();
      this.server.closeAllConnections();
    });
    return this.closing;
  }
}
