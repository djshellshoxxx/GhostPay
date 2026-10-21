import type { ScanWorkerLike } from './scanClient';

/** Creates the real dedicated scanner worker (Vite bundles it as a same-origin file; CSP worker-src 'self'). */
export function createBrowserScanWorker(): ScanWorkerLike {
  return new Worker(new URL('./scanner.worker.ts', import.meta.url), { type: 'module' }) as unknown as ScanWorkerLike;
}
