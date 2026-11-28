// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ControlTipsProvider, ControlTipsSwitch } from './ControlTips';
import { CredentialFields, EMPTY_CREDENTIAL } from './StealthExportCommon';

afterEach(cleanup);

function Credentials({ disabled }: { readonly disabled: boolean }) {
  const [value, setValue] = useState(EMPTY_CREDENTIAL);
  return <ControlTipsProvider><ControlTipsSwitch />
    <CredentialFields value={value} onChange={setValue} disabled={disabled} />
  </ControlTipsProvider>;
}

it('gives each credential radio its own instructions and keeps the selected method when reading help', () => {
  render(<Credentials disabled={false} />);
  const [vault, file] = screen.getAllByRole<HTMLInputElement>('radio');
  expect(vault!.getAttribute('aria-description')).toMatch(/local vault/);
  expect(file!.getAttribute('aria-description')).toMatch(/keystore file/);
  fireEvent.click(file!);
  const passphrase = screen.getByLabelText<HTMLInputElement>(/passphrase/i, { selector: 'input[type=password]' });
  fireEvent.change(passphrase, { target: { value: 'synthetic-private-text' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show control tips' }));
  expect(file!.checked).toBe(true);
  expect(vault!.checked).toBe(false);
  expect(screen.getByLabelText(/passphrase/i, { selector: 'input[type=password]' })).toBe(passphrase);
  expect(passphrase.value).toBe('synthetic-private-text');
  expect(document.querySelector('.control-tip-inline')?.textContent).toBeTruthy();
  expect(screen.queryByText('synthetic-private-text')).toBeNull();
});

it('shows explanations for both disabled radio choices without enabling or selecting them', () => {
  render(<Credentials disabled />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show control tips' }));
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio.matches(':disabled')).toBe(true);
    expect(radio.nextElementSibling?.textContent).toBe(radio.getAttribute('aria-description'));
  }
});
