import { handleWorkerRequest, type WorkerRequest } from './prover.js';

/**
 * Web Worker / worker-thread entry: receives `{ id, req }`, replies `{ id, ok, ... }`.
 * Excluded from coverage (thin glue); the logic is `handleWorkerRequest`.
 */
const scope = globalThis as unknown as {
  onmessage: ((e: { data: WorkerRequest }) => void) | null;
  postMessage(m: unknown): void;
};
scope.onmessage = (e) => {
  void handleWorkerRequest(e.data).then((r) => {
    scope.postMessage(r);
  });
};
