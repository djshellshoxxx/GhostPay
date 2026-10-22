// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QrView } from './QrView';

afterEach(cleanup);

describe('QrView legacy renderer', () => {
  it('renders only the QR image when embedded as a bare frame child', () => {
    render(<QrView text="https://example.test/invoice" caption="Invoice link" bare />);
    expect(screen.getByRole('img', { name: 'Invoice link' })).toBeTruthy();
    expect(screen.queryByText('Invoice link', { selector: 'figcaption' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download QR (SVG)' })).toBeNull();
  });

  it('shows the specific user-facing explanation when the QR payload exceeds capacity', () => {
    render(<QrView text={'x'.repeat(5000)} caption="Too long" />);
    expect(screen.getByText('This link is too long for a QR code. Share the link as text instead.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
