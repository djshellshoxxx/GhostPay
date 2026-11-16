// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { InvoicePaymentSummary } from './InvoicePaymentSummary';

afterEach(cleanup);
describe('invoice linked-amount disclosures', () => {
  it.each([
    ['below', 'Linked total is below the expected net amount.'],
    ['equal', 'Linked total equals the expected net amount.'],
    ['above', 'Linked total is above the expected net amount.'],
  ] as const)('labels %s as a local comparison with the evidence boundary', (kind, label) => {
    render(<InvoicePaymentSummary summary={{ kind, observedMinorUnits: '9007199254740993', expectedMinorUnits: '100', observationCount: 1 }} />);
    expect(screen.getByRole('region', { name: 'Linked invoice amounts' })).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('Linked observation total: 9007199254740993 of 100 base units.')).toBeTruthy();
    expect(screen.getByText('Distinct linked observations: 1.')).toBeTruthy();
    expect(screen.getByText(/Only live observations verified as final when scanned/)).toBeTruthy();
    expect(screen.getByText(/do not prove attribution or current settlement/)).toBeTruthy();
    expect(screen.queryByText(/review possible duplicate payments/)).toBeNull();
  });

  it('asks for review of multiple observations even if their total exactly matches', () => {
    render(<InvoicePaymentSummary summary={{ kind: 'equal', observedMinorUnits: '100', expectedMinorUnits: '100', observationCount: 2 }} />);
    expect(screen.getByText('Distinct linked observations: 2.')).toBeTruthy();
    expect(screen.getByText('Multiple linked observations; review possible duplicate payments.')).toBeTruthy();
  });

  it('does not turn absent evidence into an unpaid claim or zero-amount result', () => {
    render(<InvoicePaymentSummary summary={{ kind: 'unlinked', observedMinorUnits: '0', expectedMinorUnits: '100', observationCount: 0 }} />);
    expect(screen.getByText('No eligible linked observations to compare.')).toBeTruthy();
    expect(screen.queryByText(/Linked observation total/)).toBeNull();
  });

  it('fails closed without showing amount totals for unavailable evidence', () => {
    render(<InvoicePaymentSummary summary={{ kind: 'unavailable' }} />);
    expect(screen.getByText('Linked amounts cannot be compared because the local evidence is inconsistent.')).toBeTruthy();
    expect(screen.queryByText(/Linked observation total/)).toBeNull();
    expect(screen.getByText(/Pending, imported and reorg-invalidated observations are excluded/)).toBeTruthy();
  });
});
