// Test fixture: disposable state only. Never used by the receiver server.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DurableWebhookStore } from './durable-store.mjs';
process.once('message', (m) => {
  const store = new DurableWebhookStore(m.directory);
  const claim = store.accept(Uint8Array.from(m.secret), m.body, m.header, { now: m.now });
  if (claim.kind === 'claimed' && m.phase === 'after-effect') writeFileSync(join(m.directory, 'synthetic-effect'), claim.event.id, { flag: 'wx', mode: 0o600 });
  if (claim.kind === 'claimed' && m.phase === 'after-completion') store.complete(claim.event.id, claim.token, m.now);
  process.send(claim, () => {
    if (m.hold) { setInterval(() => {}, 1000); return; } // test kills process after the committed claim, before completion
    store.close(); process.exit(0);
  });
});
