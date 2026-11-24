import { describe, expect, it } from 'vitest';
import { classifyHwError } from './hwsigner.js';

describe('hardware-wallet message line compatibility', () => {
  it.each([
    ['Ethereum app is not open', 'app-not-open'],
    ['APP is CLOSED', 'app-not-open'],
    ['appnot', 'app-not-open'],
    ['app unavailable; another app is closed', 'app-not-open'],
    ['not open: app', 'unknown'],
    ['app\nnot open', 'unknown'],
    ['app\rclosed', 'unknown'],
    ['app\u2028not open', 'unknown'],
    ['app\u2029closed', 'unknown'],
    ['app\nanother app is closed', 'app-not-open'],
    ['app\vnot open', 'app-not-open'],
    ['app\fclosed', 'app-not-open'],
    ['app\u0085not open', 'app-not-open'],
    ['open the\nEthereum app', 'app-not-open'],
    ['app\nplease open the Ethereum app', 'app-not-open'],
    ['open\nthe Ethereum app', 'unknown'],
  ])('%j classifies as %s', (message, expected) => {
    expect(classifyHwError({ message }).code).toBe(expected);
  });

  it.each([
    [{ message: 'user rejected; app not open' }, 'user-rejected'],
    [{ message: 'device locked; app not open' }, 'device-locked'],
    [{ message: 'blind signing disabled; app not open' }, 'blind-signing-disabled'],
    [{ code: 4001, message: 'app not open' }, 'user-rejected'],
    [{ code: '0x6e00', message: 'unsupported method' }, 'app-not-open'],
    [{ code: 4200, message: 'app not open' }, 'app-not-open'],
    [{ message: 'app not connected' }, 'app-not-open'],
    [{ message: 'app\nnot connected' }, 'device-disconnected'],
  ])('preserves taxonomy priority for %j', (raw, expected) => {
    expect(classifyHwError(raw).code).toBe(expected);
  });
});
