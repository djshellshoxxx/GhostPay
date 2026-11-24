import { describe, expect, it } from 'vitest';
import { parseArgs, type OptKind } from './args.js';

describe('CLI end-of-options delimiter and required option values', () => {
  it.each(['value', 'multi'] as const)(
    'rejects a bare -- delimiter as the missing %s option value',
    kind => {
      const spec: Record<string, OptKind> = { input: kind };
      expect(() => parseArgs(['--input', '--'], spec)).toThrowError('needs a value');
    },
  );

  it('retains -- as an end-of-options marker when no option value is pending', () => {
    const parsed = parseArgs(['--input', 'file.json', '--', '--literal', 'argument'], { input: 'value' });
    expect(parsed.values.get('input')).toBe('file.json');
    expect(parsed.positionals).toEqual(['--literal', 'argument']);
  });

  it('permits a literal -- value only with unambiguous equals syntax', () => {
    const parsed = parseArgs(['--input=--'], { input: 'value' });
    expect(parsed.values.get('input')).toBe('--');
    expect(parsed.positionals).toEqual([]);
  });
});
