import type { BtcScanWorker, BtcScanWorkerFactory } from './scanWorkerClient';
import { BtcScanProtocol } from './scanWorkerProtocol';
import type { BtcScanRequest } from './scanWorkerMessages';

// Node's structuredClone returns Node-realm typed arrays even inside jsdom. A real Worker reconstructs
// buffers in the receiving realm. Rehome them here to reproduce that boundary faithfully.
function cloneMessage<T>(message: T): T {
  const rehome = (v: unknown): unknown => {
    if (ArrayBuffer.isView(v) && Object.prototype.toString.call(v) === '[object Uint8Array]') {
      const raw = v as Uint8Array; const copy = new Uint8Array(raw); raw.fill(0); return copy;
    }
    if (Array.isArray(v)) return v.map(rehome);
    if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, rehome(item)]));
    return v;
  };
  return rehome(structuredClone(message)) as T;
}

/** Uses the production message protocol and structured-clone boundaries without browser Worker support. */
export class InlineBtcScanWorker implements BtcScanWorker {
  public onmessage: BtcScanWorker['onmessage'] = null;
  public onerror: BtcScanWorker['onerror'] = null;
  public onmessageerror: BtcScanWorker['onmessageerror'] = null;
  public terminated = false;
  public readonly received: BtcScanRequest[] = [];
  private readonly protocol: BtcScanProtocol;
  public constructor() {
    this.protocol = new BtcScanProtocol((message) => {
      const copy = cloneMessage(message);
      queueMicrotask(() => { if (!this.terminated) this.onmessage?.({ data: copy }); });
    });
  }
  public postMessage(message: BtcScanRequest): void {
    const copy = cloneMessage(message); this.received.push(copy);
    queueMicrotask(() => { this.protocol.handle(copy); });
  }
  public terminate(): void { this.terminated = true; this.protocol.dispose(); }
}
export const inlineBtcScanWorker: BtcScanWorkerFactory = () => new InlineBtcScanWorker();
