// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextHelp } from './ContextHelp';
import { Field } from './Common';

afterEach(cleanup);

describe('contextual help', () => {
  it('opens on keyboard focus, dismisses with Escape without moving focus, and can be reopened', async () => {
    const user = userEvent.setup();
    render(<><ContextHelp label="About receipts">Keep the original digital receipt.</ContextHelp><button>Next control</button></>);
    const button = screen.getByRole('button', { name: 'About receipts' });
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip.hasAttribute('hidden')).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe(tip.id);
    await user.tab();
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole('tooltip').textContent).toBe('Keep the original digital receipt.');
    await user.keyboard('{Escape}');
    expect(tip.hasAttribute('hidden')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    await user.keyboard('{Enter}');
    expect(tip.hasAttribute('hidden')).toBe(false);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next control' }));
    expect(tip.hasAttribute('hidden')).toBe(true);
  });

  it('remains available while the pointer crosses from the trigger into its explanation', () => {
    render(<ContextHelp label="About RPC">The RPC provider sees your requests.</ContextHelp>);
    const root = screen.getByRole('button').parentElement!;
    fireEvent.pointerEnter(root, { pointerType: 'mouse' });
    const tip = screen.getByRole('tooltip');
    fireEvent.pointerEnter(tip, { pointerType: 'mouse' });
    expect(tip.hasAttribute('hidden')).toBe(false);
    fireEvent.pointerLeave(root, { pointerType: 'mouse' });
    expect(tip.hasAttribute('hidden')).toBe(true);
  });

  it('supports tap toggling and outside dismissal without a hover prerequisite', () => {
    render(<><ContextHelp label="About public pairing">Public configuration does not contain private keys.</ContextHelp><button>Outside</button></>);
    const button = screen.getByRole('button', { name: 'About public pairing' });
    const tip = screen.getByRole('tooltip', { hidden: true });
    fireEvent.click(button);
    expect(tip.hasAttribute('hidden')).toBe(false);
    fireEvent.click(button);
    expect(tip.hasAttribute('hidden')).toBe(true);
    fireEvent.click(button);
    expect(tip.hasAttribute('hidden')).toBe(false);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }), { pointerType: 'touch' });
    expect(tip.hasAttribute('hidden')).toBe(true);
  });

  it('keeps field hints and help attached to the control, including when it is disabled', () => {
    render(<Field label="Receipt file" hint="JSON file" help={{ label: 'About receipt files', text: 'A signature is not independent payment verification.' }}>{(id, describedBy) => <input id={id} disabled aria-describedby={describedBy} />}</Field>);
    const input = screen.getByLabelText('Receipt file');
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0]!)?.textContent).toBe('JSON file');
    expect(document.getElementById(ids[1]!)?.textContent).toBe('A signature is not independent payment verification.');
    expect(screen.getByRole('button', { name: 'About receipt files' }).hasAttribute('disabled')).toBe(false);
  });

  it('uses independent descriptions and renders supplied help as text through updates', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<><ContextHelp label="First">First explanation</ContextHelp><ContextHelp label="Second">Second explanation</ContextHelp></>);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]?.getAttribute('aria-describedby')).not.toBe(buttons[1]?.getAttribute('aria-describedby'));
    await user.click(buttons[0]!);
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    rerender(<><ContextHelp label="Primero">{'<script>untrusted()</script>'}</ContextHelp><ContextHelp label="Second">Second explanation</ContextHelp></>);
    const first = screen.getByRole('button', { name: 'Primero' }).parentElement!;
    expect(within(first).getByRole('tooltip').textContent).toBe('<script>untrusted()</script>');
    expect(first.querySelector('script')).toBeNull();
  });
});
