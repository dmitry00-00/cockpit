import { afterEach, expect, it, vi } from 'vitest';
import { loadGraph } from './graph';

afterEach(() => vi.unstubAllGlobals());
it('retries an unavailable graph, then shares the successful graph between callers', async () => {
  const raw = { map: 'test', nodes: [['a', 0, 0, 0]], edges: [] };
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => raw });
  vi.stubGlobal('fetch', fetch);
  await expect(loadGraph('/test/temporary-graph.json')).resolves.toBeNull();
  const a = loadGraph('/test/temporary-graph.json');
  const b = loadGraph('/test/temporary-graph.json');
  expect(a).toBe(b);
  expect((await a)?.nodes.has('a')).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await loadGraph('/test/temporary-graph.json')).toBe(await a);
  expect(fetch).toHaveBeenCalledTimes(2);
});
