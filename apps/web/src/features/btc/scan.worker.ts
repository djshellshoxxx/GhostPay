import { BtcScanProtocol } from './scanWorkerProtocol';
import type { BtcScanRequest, BtcScanResponse } from './scanWorkerMessages';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<BtcScanRequest>) => void) | null;
  postMessage: (message: BtcScanResponse) => void;
};
const protocol = new BtcScanProtocol((message) => { scope.postMessage(message); });
scope.onmessage = (event): void => { protocol.handle(event.data); };
