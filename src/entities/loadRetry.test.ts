import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoadPack } = vi.hoisted(() => ({ mockLoadPack: vi.fn() }));

vi.mock('./packs/places', () => ({ loadPack: mockLoadPack }));

import { isReady, loadKind } from './index';
import type { Pack } from './pack';

const pack: Pack = { kinds: ['place'], resolve: () => undefined, ids: () => [] };

describe('lazy entity-pack loading', () => {
  beforeEach(() => mockLoadPack.mockReset());

  it('retries the same reference pack after its first load rejects', async () => {
    mockLoadPack.mockRejectedValueOnce(new Error('temporary catalog failure')).mockResolvedValueOnce(pack);

    await expect(loadKind('place')).rejects.toThrow('temporary catalog failure');
    expect(isReady('place')).toBe(false);

    await expect(loadKind('place')).resolves.toBeUndefined();
    expect(mockLoadPack).toHaveBeenCalledTimes(2);
    expect(isReady('place')).toBe(true);
  });
});
