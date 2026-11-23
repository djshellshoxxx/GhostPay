import { describe, expect, it } from 'vitest';
import { ChunkWriter } from './encoder.js';
import { ExportError } from './errors.js';

describe('ChunkWriter header ownership', () => {
  it('rejects a second header before flushing and preserves the original CSV', () => {
    const writer = new ChunkWriter({ eol: 'lf' });
    expect(writer.header(['id'])).toBeUndefined();
    expect(() => writer.header(['replacement'])).toThrow(ExportError);
    expect(() => writer.header(['replacement'])).toThrow(/header already written/);
    expect(writer.row(['one'])).toBeUndefined();
    expect(writer.flush()).toBe('id\none\n');
  });

  it('rejects a second header after chunks have been emitted', () => {
    const writer = new ChunkWriter({ chunkChars: 1 });
    expect(writer.header(['id'])).toBe('id\r\n');
    expect(writer.row(['one'])).toBe('one\r\n');
    expect(() => writer.header(['again'])).toThrow(/header already written/);
    expect(writer.flush()).toBe('');
  });

  it('retains one UTF-8 BOM and normal subsequent rows', () => {
    const writer = new ChunkWriter({ bom: true, eol: 'lf' });
    expect(writer.header(['id'])).toBeUndefined();
    expect(writer.row(['one'])).toBeUndefined();
    expect(writer.row(['two'])).toBeUndefined();
    expect(writer.flush()).toBe('\ufeffid\none\ntwo\n');
  });
});
