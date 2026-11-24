// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalBytes, canonicalJson } from '../../src/core/canonical-json.mjs';
import { throwsCode } from './helpers.mjs';

test('sorts keys by UTF-16 code units and emits no whitespace (RFC 8785)', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, false, null], c: { z: 'x', y: '' } }), '{"a":[true,false,null],"b":1,"c":{"y":"","z":"x"}}');
  // RFC 8785 3.2.3 example ordering: "\r" < "1" < "\u0080" < "\u00f6" < "\u20ac" < "\ud83d\ude00" < "\ufb33"
  const keys = ['\u20ac', '\r', '\ufb33', '1', '\u{1f600}', '\u0080', '\u00f6'];
  const obj = Object.fromEntries(keys.map((k, i) => [k, i]));
  assert.equal(canonicalJson(obj), '{"\\r":1,"1":3,"\u0080":5,"\u00f6":6,"\u20ac":0,"\u{1f600}":4,"\ufb33":2}');
});

test('escapes strings like ECMAScript JSON.stringify', () => {
  assert.equal(canonicalJson('a"b\\c\n\u000f\u2028'), '"a\\"b\\\\c\\n\\u000f\u2028"');
  assert.deepEqual([...canonicalBytes({ e: '\u00e9' })], [...Buffer.from('{"e":"\u00e9"}', 'utf8')]);
});

test('accepts safe integers only; rejects everything outside the subset', () => {
  assert.equal(canonicalJson([0, -0, 9007199254740991, -5]), '[0,0,9007199254740991,-5]');
  throwsCode(() => canonicalJson(1.5), 'E_USAGE');
  throwsCode(() => canonicalJson(9007199254740992), 'E_USAGE');
  throwsCode(() => canonicalJson(NaN), 'E_USAGE');
  throwsCode(() => canonicalJson({ a: undefined }), 'E_USAGE');
  throwsCode(() => canonicalJson(new Date(0)), 'E_USAGE');
  throwsCode(() => canonicalJson(10n), 'E_USAGE');
  throwsCode(() => canonicalJson('\ud800'), 'E_USAGE');
});
