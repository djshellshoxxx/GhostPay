import { runCli } from './cli-lib.js';

// Thin entrypoint (excluded from coverage): wires process globals to the tested runCli.
const ac = new AbortController();
process.once('SIGINT', () => { ac.abort(); });
const out = await runCli(process.argv.slice(2), process.env, fetch, ac.signal);
process.stdout.write(`${out.output}\n`);
process.exitCode = out.exitCode;
