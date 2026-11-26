// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { PrivacyBoundary } from './SensitiveContent';

const SECRET = 'Synthetic draft 9c41';
afterEach(cleanup);

function Draft(): React.ReactNode {
  const [value, setValue] = useState('');
  return <input aria-label="draft" value={value} onChange={(e) => { setValue(e.target.value); }} />;
}
function Harness({ hidden }: { readonly hidden: boolean }): React.ReactNode {
  return <><button type="button" data-privacy-safe-control>safe</button><PrivacyBoundary hidden={hidden}><Draft /></PrivacyBoundary></>;
}
const absent = (): boolean => !document.body.outerHTML.includes(SECRET)
  && [...document.querySelectorAll('input')].every((field) => !field.value.includes(SECRET));

it('moves focus to the neutral control and keeps a single host across 500 rapid mask flips (stress)', () => {
  const view = render(<Harness hidden={false} />);
  const field = screen.getByLabelText<HTMLInputElement>('draft');
  act(() => { field.focus(); });
  fireEvent.change(field, { target: { value: SECRET } });
  view.rerender(<Harness hidden />);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'safe' }));
  expect(absent()).toBe(true);
  for (let i = 0; i < 500; i++) {
    view.rerender(<Harness hidden={i % 2 === 0} />);
    if (i % 2 === 0) expect(screen.queryByLabelText('draft')).toBeNull();
    else expect(screen.getAllByLabelText('draft')).toHaveLength(1);
  }
  view.rerender(<Harness hidden />);
  expect(absent()).toBe(true);
  view.rerender(<Harness hidden={false} />);
  const restored = screen.getByLabelText<HTMLInputElement>('draft');
  expect(restored).toBe(field); // Same mounted element: React state and the draft were never torn down.
  expect(restored.value).toBe(SECRET);
});

it('masks nested boundaries when an ancestor is hidden', () => {
  render(<PrivacyBoundary hidden><PrivacyBoundary hidden={false}><p>{SECRET}</p></PrivacyBoundary></PrivacyBoundary>);
  expect(absent()).toBe(true);
});
