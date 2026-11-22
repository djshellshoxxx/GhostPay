import { describe, expect, it } from 'vitest';
import { classifyQrText } from './qrClassify';

// This is literal UTF-16 input, not a JSON \\u escape. TextEncoder would replace each
// isolated surrogate with U+FFFD, so the original scanned/pasted text is not round-trippable.
const settingsWith = (value: string): string =>
  `{"format":"ghostpay-settings","v":1,"settings":{"note":"${value}"}}`;

describe('QR classification requires lossless Unicode text', () => {
  it.each([
    ['isolated high surrogate', '\uD800'],
    ['isolated low surrogate', '\uDC00'],
    ['high surrogate before an ordinary character', '\uD800x'],
    ['ordinary character before an isolated low surrogate', 'x\uDC00'],
  ])('rejects %s before recognising a settings envelope', (_name, input) => {
    expect(classifyQrText(settingsWith(input))).toEqual({ family: 'unknown', reason: 'malformed' });
  });

  it('rejects malformed surrogate units even when valid Unicode surrounds them', () => {
    expect(classifyQrText(settingsWith('😀\uD800é'))).toEqual({ family: 'unknown', reason: 'malformed' });
  });

  it('preserves valid supplementary code points, including adjacent surrogate pairs', () => {
    expect(classifyQrText(settingsWith('😀🪙'))).toEqual({ family: 'settings', validated: false, version: 1 });
    expect(classifyQrText(settingsWith('Café'))).toEqual({ family: 'settings', validated: false, version: 1 });
  });
});
