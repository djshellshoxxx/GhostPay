import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { redactDiagnostics } from './redact.mjs';

function resultStatus(test, result) {
  if (result.status === 'skipped') return 'skipped';
  if (result.status === test.expectedStatus) return 'passed';
  return 'failed';
}

function getTitle(test) {
  return (test.titlePath?.() ?? [test.title]).filter(Boolean).join(' › ');
}

function getFile(test) {
  return test.location?.file ?? '';
}

function lifecycleEvent(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  if (/page (?:has )?crashed|renderer (?:process )?crashed|target.*crash/.test(message)) return 'page-crash';
  if (/browser.*disconnected|browser.*closed|connection.*closed|target.*closed/.test(message)) return 'browser-disconnect';
  return undefined;
}

export default class StressReplayReporter {
  constructor(options = {}) {
    this.resultsDir = resolve(options.resultsDir ?? process.env.GHOSTPAY_RESULTS_DIR ?? 'stress-results');
    this.fileSystem = options.fileSystem ?? { openSync, writeSync, fsyncSync, closeSync, mkdirSync };
    this.stderr = options.stderr ?? process.stderr;
    this.fd = undefined;
    this.storageError = undefined;
    this.total = 0;
    this.statusByTest = new Map();
    this.lastCompletedStep = new Map();
    this.emittedStorageFailure = false;
  }

  onBegin(_config, suite) {
    this.total = suite.allTests().length;
    try {
      this.fileSystem.mkdirSync(this.resultsDir, { recursive: true, mode: 0o700 });
      this.fd = this.fileSystem.openSync(resolve(this.resultsDir, 'cases.jsonl'), 'a', 0o600);
    } catch (error) {
      this.#storageFailed(error);
    }
    this.#writeStderr({ type: 'stress-plan', total: this.total, resultsDir: this.resultsDir });
  }

  onStepEnd(test, _result, step) {
    if (step.error || step.annotations?.some((annotation) => annotation.type === 'skip')) return;
    if (step.category === 'test.step') this.lastCompletedStep.set(test.id, redactDiagnostics(step.title, 180));
    if (step.category === 'pw:api' || step.category === 'expect') {
      const action = String(step.title).match(/^[A-Za-z][\w.]*/)?.[0] ?? 'action';
      this.lastCompletedStep.set(test.id, `${step.category} ${action}`);
    }
  }

  onTestEnd(test, result) {
    const status = resultStatus(test, result);
    this.statusByTest.set(test.id, status);
    const failureKind = lifecycleEvent(result.error?.message);
    const record = {
      type: 'case',
      title: redactDiagnostics(getTitle(test), 300),
      file: redactDiagnostics(getFile(test), 240),
      line: test.location?.line,
      project: redactDiagnostics(test.parent?.project?.()?.name ?? '', 80),
      attempt: result.retry ?? 0,
      status,
      durationMs: result.duration,
      lastCompletedStep: this.lastCompletedStep.get(test.id) ?? null,
      ...(failureKind ? { failureKind } : {}),
    };
    this.#append(record);
    this.#writeStderr({ type: 'stress-progress', ...this.#counts(), storageError: this.storageError?.code });
  }

  onError(error) {
    this.#writeStderr({ type: 'stress-runner-error', failureKind: lifecycleEvent(error) ?? 'runner-error' });
  }

  onEnd(result) {
    this.#close();
    const summary = { type: 'stress-summary', ...this.#counts(), storageError: this.storageError?.code };
    this.#writeStderr(summary);
    if (this.storageError) return { status: 'failed' };
    return { status: result.status };
  }

  #counts() {
    const completed = this.statusByTest.size;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    for (const status of this.statusByTest.values()) {
      if (status === 'passed') passed += 1;
      else if (status === 'failed') failed += 1;
      else skipped += 1;
    }
    return { total: this.total, completed, passed, failed, skipped, unrun: Math.max(0, this.total - completed) };
  }

  #append(record) {
    if (this.fd === undefined || this.storageError) return;
    try {
      const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
      const written = this.fileSystem.writeSync(this.fd, bytes, 0, bytes.length);
      if (written !== bytes.length) {
        const error = new Error('incomplete results record write');
        error.code = 'EIO';
        throw error;
      }
      this.fileSystem.fsyncSync(this.fd);
    } catch (error) {
      this.#storageFailed(error);
    }
  }

  #storageFailed(error) {
    this.storageError ??= error;
    if (!this.emittedStorageFailure) {
      this.emittedStorageFailure = true;
      this.#writeStderr({ type: 'stress-results-write-failed', code: error?.code ?? 'UNKNOWN', message: redactDiagnostics(error?.message ?? error, 240) });
    }
    this.#close();
  }

  #close() {
    if (this.fd === undefined) return;
    try {
      this.fileSystem.closeSync(this.fd);
    } catch (error) {
      this.storageError ??= error;
    }
    this.fd = undefined;
  }

  #writeStderr(value) {
    try {
      this.stderr.write(`STRESS ${JSON.stringify(value)}\n`);
    } catch {
      // The reporting stream is the fallback when the result volume is full.
    }
  }
}
