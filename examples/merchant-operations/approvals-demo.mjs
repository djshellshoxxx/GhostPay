import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approvalFixture } from './approvals-fixture.mjs';
import { initializeApprovals, inspectApprovals, updateApprovals } from './approvals-store.mjs';

const temp = await mkdtemp(join(tmpdir(), 'ghostpay-approvals-demo-'));
try {
  const directory = join(temp, 'account');
  const fixture = approvalFixture();
  await initializeApprovals(directory, fixture.policy);
  const queued = await updateApprovals(directory, 0, { kind: 'queue', exchange: fixture.exchange }, fixture.now);
  const restored = await inspectApprovals(directory);
  const result = await updateApprovals(directory, restored.revision, { kind: 'execute', digest: queued.queued.digest }, fixture.now + 60);
  console.log(JSON.stringify({ fixtureOnly: true, offChainApprovalOnly: true, fundsMoved: false, revision: result.revision, pending: result.state.queued.length }));
} finally { await rm(temp, { recursive: true, force: true }); }
