import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = { ready: false };
  return {
    state,
    isReady: vi.fn(() => state.ready),
    isStateKind: vi.fn(() => false),
    loadKind: vi.fn(),
    missingView: vi.fn(),
    parseRef: vi.fn((value: string) => {
      const [kind, ...id] = value.split(':');
      return kind && id.length ? { kind, id: id.join(':') } : null;
    }),
    resolve: vi.fn(),
  };
});

vi.mock('./index', () => ({
  isReady: mocks.isReady,
  isStateKind: mocks.isStateKind,
  loadKind: mocks.loadKind,
  missingView: mocks.missingView,
  parseRef: mocks.parseRef,
  resolve: mocks.resolve,
}));

import { useEntity } from './useEntity';

describe('useEntity lazy loading', () => {
  beforeEach(() => {
    mocks.state.ready = false;
    mocks.isReady.mockClear();
    mocks.loadKind.mockReset()
      .mockRejectedValueOnce(new Error('temporary catalog failure'))
      .mockImplementationOnce(async () => { mocks.state.ready = true; });
    mocks.resolve.mockImplementation(() => mocks.state.ready ? { ref: 'spell:bless', kind: 'spell', name: 'Bless' } : undefined);
  });

  it('retries once after a transient load rejection and then resolves the reference', async () => {
    const { result } = renderHook(() => useEntity('spell:bless'));

    expect(result.current).toBe('loading');
    await waitFor(() => expect(result.current).toMatchObject({ ref: 'spell:bless', name: 'Bless' }));
    expect(mocks.loadKind).toHaveBeenCalledTimes(2);
  });
});
