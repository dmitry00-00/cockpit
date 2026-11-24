/** Review candidates may inform one GM-confirmed battle input; they are not accepted world facts. */
export interface WarStrengthEvidence {
  kind: 'l8-candidate';
  factAccepted: false;
  usage: 'gm-selected-for-war';
  candidateId: string;
  kingdomId: string;
  kingdomName: string;
  year: number;
  amount: number;
  amountRaw: string;
  unitRaw: string;
  value: number;
  sourceTitle: string;
  sourceUrl: string;
  revisionId: string;
  sourceTimestamp: string;
  sourceLicense: string;
  sourceLicenseId: string;
  sourceWikitextSha256: string;
  sourceCitations: readonly string[];
  ruleSource: 'research/world-models.md §4.2.2';
}

export interface WarStrengthCandidate {
  reviewId: string;
  year: number;
  amount: number;
  amountRaw: string;
  unitRaw: string;
  value: number;
  excerpt: string;
  reviewNotes: readonly string[];
  sourceTitle: string;
  sourceUrl: string;
  sourceCitations: readonly string[];
  revisionId: string;
  sourceTimestamp: string;
  sourceLicense: string;
  sourceLicenseId: string;
  sourceWikitextSha256: string;
  evidence: WarStrengthEvidence;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const stringField = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const stringList = (value: unknown): readonly string[] => Array.isArray(value) ? value.filter(stringField) : [];
const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * L8 has a deliberately strict gate: an exact, source-explicit army count, same article title,
 * same kingdom name and exact campaign year. All other rows remain visible only in the research file.
 */
export function l8WarStrengthCandidates(
  rawCandidates: readonly unknown[],
  kingdom: { id: string; name: string },
  year: number,
): readonly WarStrengthCandidate[] {
  const candidates: WarStrengthCandidate[] = [];
  for (const raw of rawCandidates) {
    if (!isRecord(raw) || raw.accepted_fact !== false || raw.status !== 'source_quote_verified_candidate'
      || raw.source_excerpt_verified !== true || raw.subject_status !== 'source_explicit'
      || raw.subject !== kingdom.name || raw.force_type !== 'army' || raw.year_precision !== 'exact' || raw.year !== year
      || !stringField(raw.review_id) || !stringField(raw.amount_raw) || !/^\s*\d[\d,]*\s*$/.test(raw.amount_raw)
      || !stringField(raw.unit_raw) || !stringField(raw.excerpt) || !isRecord(raw.source)) continue;

    const exactAmount = raw.amount_raw.trim();
    const quantityMatch = isRecord(raw.quantity_match) ? raw.quantity_match : undefined;
    const start = typeof quantityMatch?.start === 'number' ? quantityMatch.start : NaN;
    const end = typeof quantityMatch?.end === 'number' ? quantityMatch.end : NaN;
    if (!new RegExp(`(?<![\\d,])${exactAmount}(?![\\d,])`).test(raw.excerpt)
      || !new RegExp(`\\b${year}\\s+DR\\b`, 'i').test(raw.excerpt)
      || !raw.excerpt.toLocaleLowerCase().includes(raw.unit_raw.toLocaleLowerCase())
      || quantityMatch?.text !== exactAmount || !Number.isInteger(start) || !Number.isInteger(end)
      || raw.excerpt.slice(start, end) !== exactAmount) continue;

    const source = raw.source;
    if (source.title !== kingdom.name || !stringField(source.url) || !stringField(source.revision_id)
      || !stringField(source.timestamp) || !stringField(source.license) || !stringField(source.license_id)
      || !stringField(source.raw_page_wikitext_sha256)) continue;
    const amount = Number(raw.amount_raw.replaceAll(',', '').trim());
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    const value = round1(Math.max(0, Math.min(10, Math.log2(amount / 100))));
    const sourceCitations = stringList(raw.source_citations);
    const evidence: WarStrengthEvidence = {
      kind: 'l8-candidate', factAccepted: false, usage: 'gm-selected-for-war', candidateId: raw.review_id,
      kingdomId: kingdom.id, kingdomName: kingdom.name, year, amount, amountRaw: raw.amount_raw.trim(), unitRaw: raw.unit_raw,
      value, sourceTitle: source.title, sourceUrl: source.url, revisionId: source.revision_id,
      sourceTimestamp: source.timestamp, sourceLicense: source.license, sourceLicenseId: source.license_id,
      sourceWikitextSha256: source.raw_page_wikitext_sha256, sourceCitations,
      ruleSource: 'research/world-models.md §4.2.2',
    };
    candidates.push({
      reviewId: raw.review_id, year, amount, amountRaw: evidence.amountRaw, unitRaw: raw.unit_raw,
      value, excerpt: raw.excerpt, reviewNotes: stringList(raw.review_notes),
      sourceTitle: source.title, sourceUrl: source.url, sourceCitations, revisionId: source.revision_id,
      sourceTimestamp: source.timestamp, sourceLicense: source.license, sourceLicenseId: source.license_id,
      sourceWikitextSha256: source.raw_page_wikitext_sha256, evidence,
    });
  }
  return candidates.sort((a, b) => a.reviewId.localeCompare(b.reviewId));
}
