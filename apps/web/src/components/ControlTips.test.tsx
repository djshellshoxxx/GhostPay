// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ControlTip, ControlTipsProvider, ControlTipsSwitch } from './ControlTips';
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
  fireEvent.click(screen.getByRole('switch', { name: 'Show control tips' }));
  expect(file!.checked).toBe(true);
  expect(vault!.checked).toBe(false);
  expect(screen.getByLabelText(/passphrase/i, { selector: 'input[type=password]' })).toBe(passphrase);
  expect(passphrase.value).toBe('synthetic-private-text');
  expect(document.querySelector('.control-tip-inline')?.textContent).toBeTruthy();
  expect(screen.queryByText('synthetic-private-text')).toBeNull();
});

it('shows explanations for both disabled radio choices without enabling or selecting them', () => {
  render(<Credentials disabled />);
  fireEvent.click(screen.getByRole('switch', { name: 'Show control tips' }));
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio.matches(':disabled')).toBe(true);
    expect(radio.nextElementSibling?.textContent).toBe(radio.getAttribute('aria-description'));
  }
});


it('keeps file status and adds the control instruction to the accessible description', () => {
  const { container } = render(<div>
    <p id="selected-file">A file is selected.</p>
    <ControlTip message="tips.verifyFile"><input aria-describedby="selected-file" type="file" /></ControlTip>
  </div>);
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  const ids = input.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
  expect(ids).toContain('selected-file');
  const description = ids.map((id) => document.getElementById(id)?.textContent).join(' ');
  expect(description).toMatch(/A file is selected/);
  expect(description).toMatch(/Decrypt the selected backup locally/);
});

it('does not repeat a control instruction already supplied by aria-describedby', () => {
  render(<div>
    <p id="existing-tip">Show or hide instructions beside each control. You can read a tip before using the control.</p>
    <ControlTip message="tips.toggleHint"><button aria-describedby="existing-tip">Action</button></ControlTip>
  </div>);
  expect(screen.getByRole('button', { name: 'Action' }).getAttribute('aria-describedby')).toBe('existing-tip');
});
