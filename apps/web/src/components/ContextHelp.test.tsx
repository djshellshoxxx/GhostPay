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

  it('retains hovered help when keyboard focus leaves and closes it when the pointer leaves too', async () => {
    const user = userEvent.setup();
    render(<><ContextHelp label="About RPC">The RPC provider sees your requests.</ContextHelp><button>Next control</button></>);
    const button = screen.getByRole('button', { name: 'About RPC' });
    const root = button.parentElement!;
    const tip = screen.getByRole('tooltip', { hidden: true });
    fireEvent.pointerEnter(root, { pointerType: 'mouse' });
    await user.tab();
    await user.keyboard('{Enter}');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next control' }));
    expect(tip.hasAttribute('hidden')).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.pointerLeave(root, { pointerType: 'mouse' });
    expect(tip.hasAttribute('hidden')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
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
    // A whole outside tap: dismissal happens at its click, after the tapped control was activated.
    const outside = screen.getByRole('button', { name: 'Outside' });
    fireEvent.pointerDown(outside, { pointerType: 'touch' });
    fireEvent.pointerUp(outside, { pointerType: 'touch' });
    fireEvent.click(outside);
    expect(tip.hasAttribute('hidden')).toBe(true);
  });

  it('keeps an open in-flow explanation in place while a control below it is pressed, so the click still lands', () => {
    // The explanation is in the page flow: hiding it at pointerdown moves the pressed control away before the release,
    // and the click then lands elsewhere or nowhere (a keystore "Decrypt and load" press did nothing).
    let submitted = 0;
    render(<><ContextHelp label="About keystore files">Choose the original encrypted keystore.</ContextHelp><button type="button" onClick={() => { submitted += 1; }}>Decrypt and load</button></>);
    const help = screen.getByRole('button', { name: 'About keystore files' });
    const tip = screen.getByRole('tooltip', { hidden: true });
    const below = screen.getByRole('button', { name: 'Decrypt and load' });
    for (const pointerType of ['mouse', 'touch'] as const) {
      fireEvent.click(help);
      expect(tip.hasAttribute('hidden')).toBe(false);
      fireEvent.pointerDown(below, { pointerType });
      expect(tip.hasAttribute('hidden')).toBe(false);
      fireEvent.pointerUp(below, { pointerType });
      expect(tip.hasAttribute('hidden')).toBe(false);
      fireEvent.click(below);
      expect(tip.hasAttribute('hidden')).toBe(true);
      expect(help.getAttribute('aria-expanded')).toBe('false');
    }
    expect(submitted).toBe(2);
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
  it('keeps an explanation opened by focus in place until a press elsewhere has delivered its click', async () => {
    const user = userEvent.setup();
    let clicks = 0;
    render(<><ContextHelp label="About keystore">Choose the encrypted file.</ContextHelp><button onClick={() => { clicks++; }}>Decrypt</button></>);
    const tip = screen.getByRole('tooltip', { hidden: true });
    const next = screen.getByRole('button', { name: 'Decrypt' });
    await user.tab();
    expect(tip.hasAttribute('hidden')).toBe(false);
    // The press moves focus to the button, but the explanation must not collapse before the release.
    await user.pointer({ keys: '[MouseLeft>]', target: next });
    expect(document.activeElement).toBe(next);
    expect(tip.hasAttribute('hidden')).toBe(false);
    await user.pointer({ keys: '[/MouseLeft]', target: next });
    expect(clicks).toBe(1);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(tip.hasAttribute('hidden')).toBe(true);
    // Keyboard blur still closes at once.
    await user.tab({ shift: true });
    expect(tip.hasAttribute('hidden')).toBe(false);
    await user.tab();
    expect(tip.hasAttribute('hidden')).toBe(true);
  });
});
