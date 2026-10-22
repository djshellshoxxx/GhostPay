// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Trans } from './Trans';
import { I18nProvider } from './context';
import type { Catalog } from './catalog';

afterEach(cleanup);

describe('<Trans>', () => {
  it('maps catalog tags to React elements and keeps interpolated content inert', async () => {
    const catalog: Catalog = {
      _meta: { locale: 'es', status: 'test' },
      messages: { 'i18n.picker.current': 'Idioma: {#strong}{name}{/strong}.' },
    };
    render(
      <I18nProvider initialPreference="es" loader={(locale) => Promise.resolve(locale === 'es' ? catalog : undefined)} target={null}>
        <Trans
          id="i18n.picker.current"
          values={{ name: '<img src=x onerror=alert(1)>' }}
          tags={{ strong: (children) => <strong>{children}</strong> }}
        />
      </I18nProvider>,
    );
    const strong = await screen.findByText('<img src=x onerror=alert(1)>');
    expect(strong.tagName).toBe('STRONG');
    expect(document.querySelector('img')).toBeNull();
    expect(document.body.textContent).toContain('Idioma:');
  });

  it('leaves an unknown tag wrapper off while keeping its translated text', () => {
    render(<I18nProvider initialPreference="en" target={null}><Trans id="i18n.picker.current" values={{ name: 'Docs' }} /></I18nProvider>);
    expect(document.body.textContent).toContain('Current language: Docs.');
    expect(document.querySelector('strong')).toBeNull();
    expect(document.body.textContent).toContain('Current language: Docs.');
  });
});
