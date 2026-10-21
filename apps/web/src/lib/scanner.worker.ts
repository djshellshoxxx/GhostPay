// Thin worker entry: all logic lives in scannerCore.ts. No network APIs are used here (verified by a test).
import { ScanProtocol, type FromWorker, type ToWorker } from './scannerCore';

interface WorkerScope {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(m: FromWorker): void;
}

const scope = self as unknown as WorkerScope;
const protocol = new ScanProtocol();
scope.onmessage = (e: MessageEvent<ToWorker>): void => {
  protocol.handle(e.data, (m) => {
    scope.postMessage(m);
  });
};
