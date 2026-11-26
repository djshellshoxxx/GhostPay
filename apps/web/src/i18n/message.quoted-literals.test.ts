import { describe, expect, it } from 'vitest';
import { parseMessage, stringifyMessage } from './message';

describe('adjacent ICU quoted literals', () => {
  const cases = [
    "'{}'",
    "'}{'",
    "'{{}}'",
    "'{''}'",
    "'{}' {n}",
    "{n, plural, other {'##' #}}",
    "{n, plural, other {'{#}' #}}",
    "{n, plural, other {'#''#' #}}",
    "{#b}'{}'{/b}",
    "'{'x'}'",
    "'{it''s}'",
    "It''s {n}",
    "plain # outside plural",
    "''",
  ];
  for (const src of cases) {
    it(`round-trips ${JSON.stringify(src)} without changing literal text`, () => {
      const original = parseMessage(src);
      expect(parseMessage(stringifyMessage(original))).toEqual(original);
    });
  }
});
