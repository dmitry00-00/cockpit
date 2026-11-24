type JsonObject = Record<string, unknown>;

const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');

const SRD_SOURCE_IDS = new Set(['srd', 'srd51']);
const SRD_FULL_TITLES = new Set([
  'srd',
  'srd51',
  'systemreferencedocument',
  'systemreferencedocument51',
]);

/** Exact provenance gate shared by parsing and campaign promotion; substrings like `notSRD` never qualify. */
export function hasConfirmedSrdSourceMarker(source: unknown, metadata: unknown): metadata is JsonObject {
  if (typeof source !== 'string' || !SRD_SOURCE_IDS.has(normalize(source)) || !object(metadata)) return false;
  const identifiersMatch = ['json', 'abbreviation'].some(key => {
    const value = metadata[key];
    return typeof value === 'string' && SRD_SOURCE_IDS.has(normalize(value));
  });
  const fullTitleMatches = typeof metadata.full === 'string' && SRD_FULL_TITLES.has(normalize(metadata.full));
  return identifiersMatch || fullTitleMatches;
}

/** Find ordinary 5etools source metadata by exact normalized identifier/title for catalog provenance. */
export function findExactSourceMetadata(source: unknown, sources: readonly unknown[]): JsonObject | undefined {
  if (typeof source !== 'string' || !normalize(source)) return undefined;
  const sourceKey = normalize(source);
  return sources.find((value): value is JsonObject => object(value) && ['json', 'abbreviation', 'full'].some(key => {
    const entry = value[key];
    return typeof entry === 'string' && normalize(entry) === sourceKey;
  }));
}
