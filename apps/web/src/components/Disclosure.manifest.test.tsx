// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ManifestState } from '../lib/manifest';
import { ServicesContext } from '../lib/services';
import { backedManifest } from '../test/manifestChain';
import { makeServices } from '../test/render';
import { useManifest } from './Disclosure';

function ManifestStatus({ chainId }: { readonly chainId: number | undefined }): ReactNode {
  const manifest = useManifest(chainId);
  return <output>{manifest?.status ?? 'loading'}</output>;
}

function pendingManifest(): { readonly promise: Promise<ManifestState>; readonly resolve: (state: ManifestState) => void } {
  let resolve!: (state: ManifestState) => void;
  const promise = new Promise<ManifestState>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('deployment manifest load ownership', () => {
  it('does not expose a previous same-chain manifest while a replacement invoice starts its fresh load', async () => {
    const next = pendingManifest();
    const loaded: ManifestState = { status: 'loaded', manifest: backedManifest(84532) };
    const loadManifest = vi.fn().mockResolvedValueOnce(loaded).mockReturnValueOnce(next.promise);
    const services = makeServices({ loadManifest });
    const view = (chainId: number | undefined): ReactNode => <ServicesContext.Provider value={services}><ManifestStatus chainId={chainId} /></ServicesContext.Provider>;
    const rendered = render(view(84532));
    await screen.findByText('loaded');

    // Pay briefly has no parsed chain when it replaces a signed invoice, even on the same chain.
    rendered.rerender(view(undefined));
    expect(screen.getByRole('status').textContent).toBe('loading');
    rendered.rerender(view(84532));
    expect(screen.getByRole('status').textContent).toBe('loading');

    await act(async () => { next.resolve({ status: 'invalid', reason: 'replacement refused' }); await next.promise; });
    expect(screen.getByRole('status').textContent).toBe('invalid');
    expect(loadManifest).toHaveBeenCalledTimes(2);
  });

  it('hides a previous manifest immediately when the service for the same chain changes', async () => {
    const next = pendingManifest();
    const first = makeServices({ loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }) });
    const second = makeServices({ loadManifest: () => next.promise });
    const view = (services: typeof first): ReactNode => <ServicesContext.Provider value={services}><ManifestStatus chainId={84532} /></ServicesContext.Provider>;
    const rendered = render(view(first));
    await screen.findByText('loaded');

    rendered.rerender(view(second));
    expect(screen.getByRole('status').textContent).toBe('loading');
    await act(async () => { next.resolve({ status: 'absent' }); await next.promise; });
    expect(screen.getByRole('status').textContent).toBe('absent');
  });

  it('discards a late result from a cancelled same-chain load', async () => {
    const old = pendingManifest();
    const next = pendingManifest();
    const services = makeServices({ loadManifest: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise) });
    const view = (chainId: number | undefined): ReactNode => <ServicesContext.Provider value={services}><ManifestStatus chainId={chainId} /></ServicesContext.Provider>;
    const rendered = render(view(84532));
    await act(async () => { await Promise.resolve(); });
    rendered.rerender(view(undefined));
    rendered.rerender(view(84532));

    await act(async () => { old.resolve({ status: 'loaded', manifest: backedManifest(84532) }); await old.promise; });
    expect(screen.getByRole('status').textContent).toBe('loading');
    await act(async () => { next.resolve({ status: 'invalid', reason: 'current load refused' }); await next.promise; });
    expect(screen.getByRole('status').textContent).toBe('invalid');
  });
});
