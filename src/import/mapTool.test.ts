// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseMapToolContainer } from './mapTool';

/** Single stored ZIP member, exercising the same container reader as uploaded files. */
function archive(xml: string): ArrayBuffer {
  const name = new TextEncoder().encode('content.xml');
  const data = new TextEncoder().encode(xml);
  const central = 30 + name.length + data.length;
  const end = central + 46 + name.length;
  const bytes = new Uint8Array(end + 22);
  const view = new DataView(bytes.buffer);
  const u16 = (at: number, n: number) => view.setUint16(at, n, true);
  const u32 = (at: number, n: number) => view.setUint32(at, n, true);
  u32(0, 0x04034b50); u32(18, data.length); u32(22, data.length); u16(26, name.length);
  bytes.set(name, 30); bytes.set(data, 30 + name.length);
  u32(central, 0x02014b50); u32(central + 20, data.length); u32(central + 24, data.length);
  u16(central + 28, name.length); bytes.set(name, central + 46);
  u32(end, 0x06054b50); u16(end + 8, 1); u16(end + 10, 1);
  u32(end + 12, end - central); u32(end + 16, central);
  return bytes.buffer;
}

describe('MapTool catalog container import', () => {
  it('rejects an unrelated XML document instead of manufacturing a map', async () => {
    await expect(parseMapToolContainer('wrong.cmpgn', archive('<document><name>Wrong</name></document>'))).rejects.toThrow('Zone');
  });
  it('rejects an oversized campaign instead of silently discarding maps', async () => {
    await expect(parseMapToolContainer('many.cmpgn', archive(`<campaign>${'<zone><name>Map</name></zone>'.repeat(101)}</campaign>`))).rejects.toThrow('100');
  });
  it('keeps map names and distinguishes changed contents with identical names and token counts', async () => {
    const make = (x: number) => archive(`<PersistedMap><zone><name>Crypt</name><Token><name>Guard</name><x>${x}</x></Token></zone></PersistedMap>`);
    const first = await parseMapToolContainer('crypt.rpmap', make(1));
    const same = await parseMapToolContainer('crypt.rpmap', make(1));
    const changed = await parseMapToolContainer('crypt.rpmap', make(2));
    expect(first[0]).toMatchObject({ name: 'Crypt', kind: 'scene', data: { tokenCount: 1, geometryImported: false } });
    expect(first[0].id).toBe(same[0].id);
    expect(first[0].id).not.toBe(changed[0].id);
  });
});
