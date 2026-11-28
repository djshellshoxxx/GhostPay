// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider, useI18n } from './context';
import { MirrorNoticeLanguage } from './MirrorNoticeLanguage';

function ChangeLocale() {
  const { setPreference } = useI18n();
  return <button onClick={() => { setPreference('en'); }}>English</button>;
}
afterEach(() => { cleanup(); document.getElementById('gp-pages-mirror')?.remove(); });

it('updates the static notice on locale changes, preserves the chain list and labels English fallback text', async () => {
  const note = document.createElement('div');
  note.id = 'gp-pages-mirror';
  document.body.prepend(note);
  const heading = document.createElement('strong');
  heading.dataset.mirror = 'title';
  const state = document.createElement('strong');
  state.dataset.mirror = 'beta';
  state.dataset.chains = 'Base Sepolia (84532)';
  const label = document.createElement('span');
  label.dataset.mirrorLanguage = '';
  note.append(heading, state, label);
  render(<I18nProvider initialPreference="ar"><MirrorNoticeLanguage /><ChangeLocale /></I18nProvider>);
  await waitFor(() => expect(heading.lang).toBe('ar'));
  expect(note.dir).toBe('rtl');
  expect(state.lang).toBe('en');
  expect(state.dir).toBe('ltr');
  expect(state.textContent).toContain('Base Sepolia (84532)');
  expect(state.textContent).toContain('Never send real funds');
  expect(label.hidden).toBe(false);
  expect(label.textContent).toContain('الإنجليزية');
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  await waitFor(() => expect(heading.lang).toBe('en'));
  expect(note.dir).toBe('ltr');
  expect(label.hidden).toBe(true);
  expect(heading.textContent).toBe('GitHub Pages mirror.');
});
