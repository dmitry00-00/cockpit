import { expect, it, vi } from 'vitest';
import { loadCachedPromise } from '../packages/registry';

it('evicts a rejected load so the next explicit request can recover', async () => {
  const cache = new Map<string, Promise<number>>();
  const load = vi.fn().mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(7);

  const failed = loadCachedPromise(cache, 'resource', load);
  expect(loadCachedPromise(cache, 'resource', load)).toBe(failed);
  await expect(failed).rejects.toThrow('temporary failure');
  expect(cache.has('resource')).toBe(false);

  const recovered = loadCachedPromise(cache, 'resource', load);
  await expect(recovered).resolves.toBe(7);
  expect(loadCachedPromise(cache, 'resource', load)).toBe(recovered);
  expect(load).toHaveBeenCalledTimes(2);
});

it('keeps a newer cached attempt when an older attempt rejects late', async () => {
  const cache = new Map<string, Promise<number>>();
  let rejectOld!: (reason: Error) => void;
  const old = loadCachedPromise(cache, 'resource', () => new Promise<number>((_, reject) => { rejectOld = reject; }));
  await Promise.resolve(); // loadCachedPromise starts loaders in a microtask.
  const newer = Promise.resolve(11);
  cache.set('resource', newer);

  rejectOld(new Error('old failure'));
  await expect(old).rejects.toThrow('old failure');
  expect(cache.get('resource')).toBe(newer);
});
