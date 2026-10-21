import { ScanProtocol, type FromWorker, type ToWorker } from '../lib/scannerCore';
import type { ScanWorkerLike } from '../lib/scanClient';

/** Runs the real worker protocol in-process (asynchronously, like postMessage). */
export class InlineWorker implements ScanWorkerLike {
  public onmessage: ((e: { readonly data: FromWorker }) => void) | null = null;
  public onerror: ((e: unknown) => void) | null = null;
  public terminated = false;
  public readonly received: ToWorker[] = [];
  private readonly protocol = new ScanProtocol();
  public postMessage(m: ToWorker): void {
    this.received.push(m);
    queueMicrotask(() => {
      if (this.terminated) return;
      this.protocol.handle(m, (r) => this.onmessage?.({ data: r }));
    });
  }
  public terminate(): void {
    this.terminated = true;
  }
}
