// Аддон MapTool (Q17) — сверка исходников с тем, как MapTool 1.18.7 их читает (AddOnLibrary.java): макрос события —
// по имени без .mts из library/mtscript/, макрос по ссылке `name@lib:ns` — только из mtscript/public/, файл по
// `lib://ns/…` — из library/public/ при allowsUriAccess. И с тем, куда аддон стучится: адрес и путь ретранслятора стола.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, 'bridge');
const json = name => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('аддон MapTool «DM Cockpit Bridge»', () => {
  const lib = json('library.json');
  const ns = lib.namespace;

  it('паспорт: пространство имён, доступ по lib://; события и свойства макросов ссылаются на существующие файлы', () => {
    expect(ns).toBe('net.dmcockpit.bridge');
    expect(lib.allowsUriAccess).toBe(true);
    for (const e of json('events.json').events) expect(existsSync(resolve(root, 'library/mtscript', `${e.mts}.mts`)), e.name).toBe(true);
    for (const p of json('mts_properties.json').properties) expect(existsSync(resolve(root, 'library/mtscript', p.filename)), p.filename).toBe(true);
  });

  it('окно открывается по lib:// и зовёт публичный макрос этого же пространства имён', () => {
    const frame = read('library/mtscript/onInit.mts').match(/lib:\/\/([\w.]+)\/([\w.-]+)/);
    expect(frame?.[1]).toBe(ns);
    expect(existsSync(resolve(root, 'library/public', frame[2]))).toBe(true);
    const call = read('library/public/bridge.html').match(/macro:(\w+)@lib:([\w.]+)/);
    expect(call?.[2]).toBe(ns);
    expect(existsSync(resolve(root, 'library/mtscript/public', `${call[1]}.mts`))).toBe(true);
  });

  it('макрос стучится в ретранслятор стола: порт сервера разработки и путь из vite.config.ts', () => {
    const vite = readFileSync(resolve(import.meta.dirname, '../../vite.config.ts'), 'utf8');
    const port = vite.match(/server: \{ port: (\d+)/)?.[1];
    const url = read('library/mtscript/public/sync.mts').match(/"(http:\/\/localhost:(\d+)(\/vtt\/maptool\/sync))"/);
    expect(url?.[2]).toBe(port);
    expect(vite).toContain(`'${url[3]}'`);
  });

  it('видимый вывод макроса — только итоговый JSON: каждая строка с кодом скрыта, кроме последней', () => {
    const lines = read('library/mtscript/public/sync.mts').split('\n').map(l => l.trim()).filter(Boolean);
    const top = lines.filter(l => l.startsWith('[') && !l.startsWith('[h'));
    expect(top).toEqual(['[r: out]']);
    expect(lines.filter(l => !/^[[\]};]/.test(l))).toEqual([]);
  });
});
