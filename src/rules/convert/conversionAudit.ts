import { SRD_CATALOG, type SrdCatalogType } from '../srd/catalog';

export interface ConversionLoss {
  sourceField: string;
  sourceValue: string | number;
  reason: string;
}

export interface ConversionJudgment {
  sourceField: string;
  proposedHandling: string;
  reason: string;
  approval: 'pending';
}

export interface ConversionLedgerEntry {
  sourceField: string;
  targetField: string;
  treatment: 'copied' | 'mapped' | 'rebuilt';
  sourceValue?: string | number;
  targetValue?: string | number;
  ruleSource: string;
  note?: string;
}

export type ConvertibleMaterialType = Extract<SrdCatalogType, 'monster' | 'spell' | 'magic-item'>;

/** Provenance/classification for the source edition, which is outside the local 5.1 catalog. */
export interface ConversionSourceClassification {
  type: ConvertibleMaterialType;
  bookSection: string;
  source: string;
  edition: string;
  license: string;
  sourceRef: string;
}

/** P1 vocabulary for either a catalog-backed target or a derived candidate. */
export interface ConversionTargetClassification {
  type: ConvertibleMaterialType;
  bookSection: string;
  source: string;
  edition: string;
  license: string;
  layer: 'rules';
  sourceRef: string;
  basis: 'P1 SRD catalog record' | 'P1 taxonomy for derived candidate';
  catalogRecordId?: string;
  catalogRecordName?: string;
}

export function classifyConversionSource(
  type: ConvertibleMaterialType,
  bookSection: string,
  edition: string,
  source: { title: string; url: string; license: string },
): ConversionSourceClassification {
  return {
    type,
    bookSection,
    source: source.title,
    edition,
    license: source.license,
    sourceRef: source.url,
  };
}

/** Resolve the target through P1's single source/version/type/section catalog. */
export function requireSrdTargetClassification(
  type: ConvertibleMaterialType,
  sourceId: string,
): ConversionTargetClassification {
  const record = SRD_CATALOG.find(entry => entry.id === `${type}:${sourceId}`);
  if (!record) throw new Error(`No P1 SRD catalog record for ${type}:${sourceId}`);
  return {
    type: record.type as ConvertibleMaterialType,
    bookSection: record.bookSection,
    source: record.source,
    edition: record.edition,
    license: record.license,
    layer: record.layer,
    sourceRef: record.sourceRef,
    basis: 'P1 SRD catalog record',
    catalogRecordId: record.id,
    catalogRecordName: record.name,
  };
}

export function classifyDerivedTarget(input: Omit<ConversionTargetClassification, 'basis' | 'catalogRecordId' | 'catalogRecordName'>): ConversionTargetClassification {
  return { ...input, basis: 'P1 taxonomy for derived candidate' };
}
