// Test-only subprocess fault injection. Not imported by the runner.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const native = { open:fs.openSync, write:fs.writeSync, sync:fs.fsyncSync, rename:fs.renameSync };
const paths = new Map();
const target = process.env.GHOSTPAY_TEST_STATE;
const point = process.env.GHOSTPAY_TEST_FAULT;
let directoryPhase = '';
function hit(name) {
  if (point !== name) return;
  if (process.env.GHOSTPAY_TEST_PAUSE) {
    fs.writeFileSync(process.env.GHOSTPAY_TEST_PAUSE,'ready',{mode:0o600});
    process.kill(process.pid,'SIGSTOP');
  } else process.kill(process.pid,'SIGKILL');
}
function kind(path) {
  if (typeof path !== 'string') return '';
  if (path.startsWith(`${target}.outbox.jsonl.`) && path.endsWith('.tmp')) return 'outbox';
  if (path.startsWith(`${target}.`) && path.endsWith('.tmp')) return 'state';
  return '';
}
fs.openSync = function(path,...args) { const fd = native.open(path,...args); paths.set(fd,path); if(kind(path))hit(`${kind(path)}-open`); return fd; };
fs.writeSync = function(fd,...args) {
  const k = kind(paths.get(fd));
  if (k && point === `${k}-partial`) {
    const bytes = args[0]; native.write(fd,bytes,0,Math.min(13,bytes.length)); hit(`${k}-partial`);
  }
  const n = native.write(fd,...args); if(k)hit(`${k}-write`); return n;
};
fs.fsyncSync = function(fd) { const k=kind(paths.get(fd)); if(!k && directoryPhase)hit(`${directoryPhase}-dir-before`); const r=native.sync(fd); if(k)hit(`${k}-fsync`); else if(directoryPhase) { hit(`${directoryPhase}-dir-after`); directoryPhase=''; } return r; };
fs.renameSync = function(from,to) { const r=native.rename(from,to); if(to===target) { directoryPhase='state';hit('state-rename'); } if(to===`${target}.outbox.jsonl`) { directoryPhase='outbox';hit('outbox-rename'); } return r; };
syncBuiltinESMExports();
