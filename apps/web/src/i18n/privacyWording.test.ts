import { describe, expect, it } from 'vitest';
import ar from '../../locales/ar.json';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import ja from '../../locales/ja.json';

type Messages = Readonly<Record<string, string>>;
const locales: readonly (readonly [string, Messages])[] = [['en', en.messages], ['es', es.messages], ['ja', ja.messages], ['ar', ar.messages]];

describe('opt-in encrypted draft hint (D2)', () => {
  it.each(locales)('has a non-empty create.draft.hint in %s', (_locale, messages) => {
    expect(typeof messages['create.draft.hint']).toBe('string');
    expect((messages['create.draft.hint'] ?? '').trim().length).toBeGreaterThan(40);
  });

  it('says what the draft stores and how long it stays, in the source text', () => {
    const hint = en.messages['create.draft.hint'];
    // What is stored: the memo and line text, unless minimal metadata leaves them out; passphrases are never saved.
    expect(hint).toMatch(/memo/i);
    expect(hint).toMatch(/line/i);
    expect(hint).toMatch(/privacy-minimal invoice/i);
    expect(hint).toMatch(/passphrase/i);
    // How long: no timer, and the four ways it ends.
    expect(hint).toMatch(/no timer/i);
    expect(hint).toMatch(/close the tab/i);
    expect(hint).toMatch(/invoice is created/i);
    expect(hint).toMatch(/remove it/i);
    expect(hint).toMatch(/seller keys are cleared/i);
    expect(hint).not.toMatch(/anonym|unlinkab|untraceab|secure|safe/i);
  });
});

describe('cover lookup setting wording (S1)', () => {
  it.each(locales)('softens the %s label to a non-absolute verb and keeps the cost note', (_locale, messages) => {
    const label = messages['settings.scanLanes.matchCover'] ?? '';
    expect(label).not.toMatch(/\bhide\b|ocultar|隠|紛れさせる|إخفاء/i);
    expect(label.length).toBeGreaterThan(20);
  });

  it('uses the agreed English label and keeps the hint caveats', () => {
    expect(en.messages['settings.scanLanes.matchCover']).toBe('Blur which payments matched among other lookups (costs more RPC calls)');
    const hint = en.messages['settings.scanLanes.matchCoverHint'];
    expect(hint).toMatch(/does not stop a provider that alters or fails its answers/);
    expect(hint).toMatch(/does not hide when you scanned or your IP address/);
    expect(hint).not.toMatch(/anonym|unlinkab|untraceab/i);
  });
});
