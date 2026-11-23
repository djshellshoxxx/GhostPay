import { installTestLocks } from './locks';

// jsdom has no Web Locks API. Browser-environment tests get an in-process exclusive lock (src/test/locks.ts) so the
// durable wallet attempt journal can run; tests of the missing-locks path remove it explicitly. Never in production.
if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && (navigator as { locks?: unknown }).locks === undefined) installTestLocks();
