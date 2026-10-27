// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collisionKey, compareUtf8, isInside, pathRuleCode, validateRelativePath } from '../../src/core/paths.mjs';
import { DEFAULT_LIMITS } from '../../src/policy.mjs';
import { SMALL_LIMITS } from './helpers.mjs';

/** @param {unknown} p @param {import('../../src/types.mjs').Limits} [limits] */
function rule(p, limits = DEFAULT_LIMITS) {
  const r = validateRelativePath(p, limits);
  return r.ok ? 'ok' : r.rule;
}

test('accepts ordinary portable paths', () => {
  for (const p of ['index.html', 'assets/app-3f9a.js', '.well-known/security.txt', 'locales/caf\u00e9.json', '_headers', 'a b/c d.txt', 'emoji-\u{1f600}.png']) {
    assert.equal(rule(p), 'ok', p);
  }
});

test('rejects traversal, absolute, drive and backslash paths', () => {
  assert.equal(rule('../etc/passwd'), 'dot-segment');
  assert.equal(rule('a/../../b'), 'dot-segment');
  assert.equal(rule('./a'), 'dot-segment');
  assert.equal(rule('a/./b'), 'dot-segment');
  assert.equal(rule('..'), 'dot-segment');
  assert.equal(rule('/etc/passwd'), 'absolute');
  assert.equal(rule('C:/Windows/x'), 'drive-letter');
  assert.equal(rule('c:x'), 'drive-letter');
  assert.equal(rule('a\\b'), 'backslash');
  assert.equal(rule('..\\x'), 'backslash');
  assert.equal(rule('a//b'), 'empty-segment');
  assert.equal(rule('a/'), 'empty-segment');
  assert.equal(rule(''), 'empty');
  assert.equal(rule(42), 'empty');
});

test('rejects non-NFC, control, bidi, replacement and lone-surrogate characters', () => {
  assert.equal(rule('cafe\u0301.json'), 'not-nfc');
  assert.equal(rule('a\nb'), 'control-char');
  assert.equal(rule('a\u0000b'), 'control-char');
  assert.equal(rule('a\u007fb'), 'control-char');
  assert.equal(rule('a\u0085b'), 'control-char');
  assert.equal(rule('invoice\u202egpj.exe'), 'bidi-char');
  assert.equal(rule('a\u2066b'), 'bidi-char');
  assert.equal(rule('a\ufeffb'), 'bidi-char');
  assert.equal(rule('a\ufffdb'), 'replacement-char');
  assert.equal(rule('a\ud800b'), 'lone-surrogate');
});

test('rejects URL-special and Windows-invalid characters, reserved names, trailing dot/space', () => {
  for (const c of ['?', '#', '%']) assert.equal(rule(`a${c}b.html`), 'url-special-char', c);
  for (const c of [':', '*', '"', '<', '>', '|']) assert.equal(rule(`ab${c}c.html`), 'windows-invalid-char', c);
  for (const n of ['CON', 'con.html', 'Nul.txt', 'aux', 'COM1.js', 'lpt9', 'dir/PRN/x.html', 'COM\u00b9.txt', 'con .txt']) {
    assert.equal(rule(n), 'windows-reserved-name', n);
  }
  assert.equal(rule('console.html'), 'ok');
  assert.equal(rule('COM10.js'), 'ok');
  assert.equal(rule('a.'), 'trailing-dot-or-space');
  assert.equal(rule('dir /x'), 'trailing-dot-or-space');
  assert.equal(rule('...'), 'trailing-dot-or-space');
});

test('enforces byte-length and depth limits', () => {
  const seg = 'a'.repeat(SMALL_LIMITS.maxSegmentBytes);
  assert.equal(rule(seg, SMALL_LIMITS), 'ok');
  assert.equal(rule(`${seg}a`, SMALL_LIMITS), 'segment-too-long');
  // multi-byte: 30 x 2-byte chars = 60 bytes ok, 31 = 62 bytes too long
  assert.equal(rule('\u00e9'.repeat(30), SMALL_LIMITS), 'ok');
  assert.equal(rule('\u00e9'.repeat(31), SMALL_LIMITS), 'segment-too-long');
  assert.equal(rule(Array(3).fill('b'.repeat(50)).join('/'), SMALL_LIMITS), 'path-too-long');
  assert.equal(rule('a/b/c/d/e/f', SMALL_LIMITS), 'ok');
  assert.equal(rule('a/b/c/d/e/f/g', SMALL_LIMITS), 'too-deep');
  assert.equal(pathRuleCode('too-deep'), 'E_LIMIT');
  assert.equal(pathRuleCode('dot-segment'), 'E_PATH');
});

test('collisionKey folds case and Unicode normalization', () => {
  assert.equal(collisionKey('A.html'), collisionKey('a.html'));
  assert.equal(collisionKey('caf\u00e9'), collisionKey('cafe\u0301'));
  assert.equal(collisionKey('STRASSE'), collisionKey('stra\u00dfe'));
  assert.notEqual(collisionKey('a.html'), collisionKey('b.html'));
});

test('compareUtf8 orders by UTF-8 bytes, not UTF-16 code units', () => {
  // U+FF61 (EF BD A1) sorts before U+1F600 (F0 9F 98 80) in UTF-8, after it in UTF-16 (FF61 > D83D).
  assert.equal(compareUtf8('\uff61', '\u{1f600}'), -1);
  assert.equal('\uff61' < '\u{1f600}', false);
  assert.equal(compareUtf8('B', 'a'), -1);
  assert.equal(compareUtf8('a', 'a'), 0);
  assert.equal(compareUtf8('a/b', 'a-b'), 1);
});

test('isInside is strict and lexical', () => {
  assert.equal(isInside('/srv/site', '/srv/site/a.zip'), true);
  assert.equal(isInside('/srv/site', '/srv/site'), false);
  assert.equal(isInside('/srv/site', '/srv/site-out/a.zip'), false);
  assert.equal(isInside('/srv/site', '/srv/site/../x'), false);
  assert.equal(isInside('/srv/site', '/srv/site/sub/../a'), true);
});

test('"$" is rejected (it starts an nginx variable)', () => {
  const r = validateRelativePath('pay$/index.html', DEFAULT_LIMITS);
  assert.equal(r.ok ? 'ok' : r.rule, 'nginx-special-char');
  assert.match(r.ok ? '' : r.reason, /nginx variable/);
});
