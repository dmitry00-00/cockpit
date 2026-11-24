import { expect, it } from 'vitest';
import pilot from '../../research/simulation/l8-pilot-review.json';
import { l8WarStrengthCandidates } from './l8Military';

const candidates: readonly unknown[] = pilot.manual_review_candidates;

it('offers only an explicit exact-year L8 army count without accepting it as a world fact', () => {
  const luskan = l8WarStrengthCandidates(candidates, { id: 'luskan', name: 'Luskan' }, 1370);
  expect(luskan).toHaveLength(1);
  expect(luskan[0]).toMatchObject({
    reviewId: 'LUSKAN_ARMY_1370', amount: 300, amountRaw: '300', unitRaw: 'spearmen', year: 1370, value: 1.6,
    sourceTitle: 'Luskan', revisionId: '1102198', sourceWikitextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(luskan[0]?.evidence).toMatchObject({
    kind: 'l8-candidate', candidateId: 'LUSKAN_ARMY_1370', kingdomId: 'luskan', value: 1.6,
    ruleSource: 'research/world-models.md §4.2.2',
  });
  expect(l8WarStrengthCandidates(candidates, { id: 'luskan', name: 'Luskan' }, 1492)).toEqual([]);
});

it('rejects inferred subjects, approximate amounts, non-army units and already accepted records from the candidate picker', () => {
  const base = candidates.find((candidate): candidate is Record<string, unknown> =>
    typeof candidate === 'object' && candidate !== null && 'review_id' in candidate && candidate.review_id === 'LUSKAN_ARMY_1370')!;
  const altered = [
    base,
    { ...base, review_id: 'wrong-subject', subject: 'Luskan dragonships' },
    { ...base, review_id: 'approximate', amount_raw: 'over 300' },
    { ...base, review_id: 'navy', force_type: 'navy' },
    { ...base, review_id: 'accepted', accepted_fact: true },
  ];
  expect(l8WarStrengthCandidates(altered, { id: 'luskan', name: 'Luskan' }, 1370).map(item => item.reviewId)).toEqual(['LUSKAN_ARMY_1370']);
});
