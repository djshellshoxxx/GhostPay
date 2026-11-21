// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AddressReuseNotice } from './AddressReuseNotice';

afterEach(cleanup);

describe('address reuse disclosure', () => {
  it('describes a different invoice request without repeating addresses or claiming on-chain proof', () => {
    const view = render(<AddressReuseNotice status="reused" />);
    expect(screen.getByText(/A payment request for another invoice named this destination/)).toBeTruthy();
    expect(screen.getByText(/does not check the blockchain, verify the transaction's actual destination, confirm payment, or prove/)).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/0x[0-9a-f]{40}/i);
  });

  it('distinguishes a retry from a fresh-destination claim', () => {
    render(<AddressReuseNotice status="same-payment" />);
    expect(screen.getByText(/An earlier payment request for this same invoice/)).toBeTruthy();
    expect(screen.queryByText(/A payment request for another invoice/)).toBeNull();
  });

  it('states incomplete history at the observation limit', () => {
    render(<AddressReuseNotice status="limited-history" />);
    expect(screen.getByText(/Some later submissions were not recorded/)).toBeTruthy();
  });

  it('does not call a previously unobserved destination globally fresh', () => {
    const view = render(<AddressReuseNotice status="not-observed" />);
    expect(view.container.textContent).not.toContain('fresh destination');
    expect(screen.getByText(/only intended destinations from payment requests with a transaction hash recorded in memory/)).toBeTruthy();
  });
});
