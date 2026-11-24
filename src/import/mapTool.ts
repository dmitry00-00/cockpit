import { importHash, type ImportCandidate } from './content';

const u16 = (bytes: DataView, at: number) => bytes.getUint16(at, true);
const u32 = (bytes: DataView, at: number) => bytes.getUint32(at, true);

/** Извлекает из ZIP только content.xml; картинки, макросы и остальные файлы контейнера не читаются. */
async function readMapToolXml(input: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(input);
  if (bytes.byteLength > 20_000_000) throw new Error('Файл MapTool больше 20 МБ; импорт остановлен.');
  const view = new DataView(input);
  const min = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let p = bytes.length - 22; p >= min; p--) if (u32(view, p) === 0x06054b50) { eocd = p; break; }
  if (eocd < 0) throw new Error('В файле MapTool не найден ZIP-каталог.');
  const entries = u16(view, eocd + 10);
  let cursor = u32(view, eocd + 16);
  let xml: Uint8Array | undefined;
  const decoder = new TextDecoder();
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > bytes.length || u32(view, cursor) !== 0x02014b50) throw new Error('Повреждён ZIP-каталог MapTool.');
    const method = u16(view, cursor + 10);
    const compressedSize = u32(view, cursor + 20);
    const plainSize = u32(view, cursor + 24);
    const nameSize = u16(view, cursor + 28);
    const extraSize = u16(view, cursor + 30);
    const commentSize = u16(view, cursor + 32);
    const localOffset = u32(view, cursor + 42);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize));
    cursor += 46 + nameSize + extraSize + commentSize;
    if (name !== 'content.xml' && !name.endsWith('/content.xml')) continue;
    if (plainSize > 5_000_000 || localOffset + 30 > bytes.length || u32(view, localOffset) !== 0x04034b50) {
      throw new Error('content.xml отсутствует или слишком велик.');
    }
    const localNameSize = u16(view, localOffset + 26);
    const localExtraSize = u16(view, localOffset + 28);
    const start = localOffset + 30 + localNameSize + localExtraSize;
    if (start + compressedSize > bytes.length) throw new Error('content.xml обрезан.');
    const compressed = bytes.slice(start, start + compressedSize);
    if (method === 0) {
      if (compressedSize !== plainSize) throw new Error('Несовпадение размеров content.xml в ZIP MapTool.');
      xml = compressed;
    }
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Этот браузер не умеет распаковывать ZIP MapTool.');
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 5_000_000) { await reader.cancel(); throw new Error('Распакованный content.xml больше 5 МБ.'); }
        chunks.push(value);
      }
      xml = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { xml.set(chunk, offset); offset += chunk.byteLength; }
      if (xml.byteLength !== plainSize) throw new Error('Распакованный размер content.xml не совпадает с ZIP-каталогом.');
    } else throw new Error(`Метод сжатия ZIP ${method} не поддерживается.`);
    break;
  }
  if (!xml) throw new Error('В архиве MapTool нет content.xml.');
  return decoder.decode(xml);
}

function parseXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('content.xml содержит некорректный XML.');
  return document;
}

/** Импорт .rptok: сохраняем поддерживаемые поля токена; макросы и графические assets не читаются. */
export async function parseMapToolToken(fileName: string, input: ArrayBuffer): Promise<ImportCandidate> {
  const document = parseXml(await readMapToolXml(input));
  const elements = [...document.getElementsByTagName('*')];
  const token = elements.find(el => el.localName === 'Token') ?? document.documentElement;
  const directText = (parent: Element, name: string) => [...parent.children].find(el => el.localName === name)?.textContent?.trim() ?? '';
  const name = directText(token, 'name') || fileName.replace(/\.rptok$/i, '');
  const tokenType = directText(token, 'tokenType') || 'NPC';
  const kind = tokenType.toUpperCase() === 'PC' ? 'character' : tokenType.toUpperCase() === 'NPC' ? 'monster' : 'token';
  const propertyRoot = [...token.children].find(el => el.localName === 'propertyMapCI' || el.localName === 'propertyMap');
  const properties: Record<string, string> = {};
  if (propertyRoot) {
    for (const entry of [...propertyRoot.getElementsByTagName('*')].filter(el => el.localName === 'entry').slice(0, 100)) {
      const pair = [...entry.children];
      const key = pair[0]?.textContent?.trim();
      const value = pair[1]?.textContent?.trim();
      if (key && value && key.length <= 100) properties[key] = value.slice(0, 500);
    }
  }
  const candidateId = fileName.toLowerCase().replace(/\.rptok$/, '').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'token';
  const identity = JSON.stringify({ fileName, tokenType, name, properties });
  return {
    id: `import-${candidateId}-maptool-token-${importHash(identity)}`, kind, name, sourceFormat: 'maptool', sourceFile: fileName, rights: { status: 'unverified' },
    data: { tokenType, propertyType: directText(token, 'propertyType'), properties, macrosImported: false, imagesImported: false },
    summary: `MapTool token · ${name} · ${Object.keys(properties).length} свойств; макросы и картинки не импортируются`,
  };
}

/**
 * Import MapTool map/campaign containers as catalog drafts. This deliberately does not claim to build a playable
 * scene: MapTool's compressed image assets, topology, lighting and campaign macros need their own mapping.
 */
export async function parseMapToolContainer(fileName: string, input: ArrayBuffer): Promise<ImportCandidate[]> {
  const xml = await readMapToolXml(input);
  const document = parseXml(xml);
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension !== 'rpmap' && extension !== 'cmpgn') throw new Error('Ожидается карта .rpmap или кампания .cmpgn.');
  const all = [...document.getElementsByTagName('*')];
  const tokens = all.filter(el => el.localName.toLowerCase().endsWith('token'));
  const directText = (parent: Element, name: string) => [...parent.children].find(el => el.localName.toLowerCase() === name.toLowerCase())?.textContent?.trim() ?? '';
  const zones = all.filter(el => /(^|[._-])zone$/i.test(el.localName) || /\.zone$/i.test(el.localName));
  const roots = extension === 'rpmap'
    ? [zones[0] ?? all.find(el => /persistedmap|maptoolmap/i.test(el.localName)) ?? document.documentElement]
    : zones;
  if (!zones.length) throw new Error('MapTool: в content.xml не найдены поддерживаемые карты Zone. Импорт не выполнен.');
  const maps = roots;
  if (maps.length > 100) throw new Error('MapTool: в кампании больше 100 карт; экспортируйте меньшую часть отдельными .rpmap.');
  const seen = new Set<Element>();
  return maps.flatMap((map, index) => {
    if (seen.has(map)) return [];
    seen.add(map);
    const name = directText(map, 'name') || (extension === 'rpmap' ? fileName.replace(/\.rpmap$/i, '') : `Карта ${index + 1}`);
    const mapTokens = [...map.getElementsByTagName('*')].filter(el => el.localName.toLowerCase().endsWith('token'));
    const fields = [...map.children].map(el => el.localName).filter(Boolean).slice(0, 80);
    const identity = JSON.stringify({ fileName, index, xml: new XMLSerializer().serializeToString(map) });
    return [{
      id: `import-${fileName.toLowerCase().replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'maptool'}-maptool-map-${importHash(identity)}`,
      kind: 'scene' as const,
      name,
      sourceFormat: 'maptool' as const,
      sourceFile: fileName,
      rights: { status: 'unverified' as const },
      data: { container: extension, mapName: name, mapFields: fields, tokenCount: mapTokens.length, totalTokenCount: tokens.length, geometryImported: false, assetsImported: false, macrosImported: false },
      summary: `MapTool ${extension === 'rpmap' ? 'карта' : 'кампания'} · ${name} · токенов на карте: ${mapTokens.length}; изображение и геометрия пока не преобразованы`,
    }];
  });
}
