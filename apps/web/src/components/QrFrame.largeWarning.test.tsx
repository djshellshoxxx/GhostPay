// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { QrFrame } from './QrFrame';

afterEach(() => { cleanup(); });

describe('full-screen QR keeps the kind warning', () => {
  it.each([
    ['bearer', /Anyone who sees this code can read the invoice\./],
    ['secret', /Do not screenshot or photograph this in public\./],
    ['caution', /Check where this came from before you rely on it\./],
  ] as const)('shows the %s warning inside the large dialog', async (kind, warning) => {
    const user = userEvent.setup();
    render(<QrFrame kind={kind} text="payload" caption="Cap" />);
    if (kind === 'secret') await user.click(screen.getByRole('button', { name: 'Reveal secret QR code' }));
    await user.click(screen.getByRole('button', { name: 'Show larger' }));
    expect(within(screen.getByRole('dialog')).getByText(warning)).toBeTruthy();
  });
});
