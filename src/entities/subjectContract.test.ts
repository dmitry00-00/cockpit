import { describe, expect, it } from 'vitest';
import {
  SUBJECT_PROFILE_SLOT_IDS,
  SUBJECT_SLOT_IDS,
  SUBJECT_SLOT_SPECS,
  validateSubjectEnvelope,
  type SubjectAudience,
  type SubjectProfileId,
} from './subjectContract';

const profiles: readonly SubjectProfileId[] = ['character', 'deity', 'party', 'organization', 'city', 'kingdom'];
const subjectIds: Readonly<Record<SubjectProfileId, string>> = {
  character: 'actor:bo', deity: 'deity:selune', party: 'party', organization: 'organization:harpers',
  city: 'place:waterdeep', kingdom: 'kingdom:cormyr',
};

function envelope(profileId: SubjectProfileId, audience: SubjectAudience): Record<string, unknown> {
  const allowed = new Set(SUBJECT_PROFILE_SLOT_IDS[profileId]);
  const visibleIds = audience === 'dm' ? SUBJECT_SLOT_IDS : SUBJECT_SLOT_IDS.filter(id => id !== 'secrets');
  const slots = Object.fromEntries(visibleIds.map(id => [id, {
    status: allowed.has(id) ? id === 'core' ? 'present' : 'empty' : 'not-applicable',
    ...(allowed.has(id) && id === 'core' ? { values: {} } : {}),
  }]));
  return { contractVersion: 1, profileId, subjectId: subjectIds[profileId], audience, slots };
}

describe('static subject contract', () => {
  it('declares one fixed ordered set of twelve slot specifications', () => {
    expect(SUBJECT_SLOT_SPECS.map(slot => slot.id)).toEqual(SUBJECT_SLOT_IDS);
    expect(SUBJECT_SLOT_SPECS.map(slot => slot.order)).toEqual(SUBJECT_SLOT_IDS.map((_, index) => index + 1));
  });

  it('accepts DM and player envelopes for all six typed profiles', () => {
    for (const profileId of profiles) {
      expect(validateSubjectEnvelope(envelope(profileId, 'dm'))).toEqual([]);
      expect(validateSubjectEnvelope(envelope(profileId, 'players'))).toEqual([]);
    }
  });

  it('rejects secrets in the player projection and enforces profile slot applicability', () => {
    const playerView = envelope('character', 'players');
    (playerView.slots as Record<string, unknown>).secrets = { status: 'empty' };
    expect(validateSubjectEnvelope(playerView).some(issue => issue.path === 'slots.secrets')).toBe(true);

    const deityView = envelope('deity', 'dm');
    (deityView.slots as Record<string, { status: string }>).resources = { status: 'empty' };
    expect(validateSubjectEnvelope(deityView).some(issue => issue.path === 'slots.resources.status')).toBe(true);

    const nestedSecret = envelope('character', 'players');
    (nestedSecret.slots as Record<string, { status: string; values?: unknown }>).knowledge = {
      status: 'present', values: [{ factId: 'hidden', label: 'Hidden', audience: 'dm' }],
    };
    expect(validateSubjectEnvelope(nestedSecret).some(issue => issue.path === 'slots.knowledge.values[0]')).toBe(true);
  });

  it('rejects malformed slot states and profile/id mismatches', () => {
    const malformed = envelope('party', 'dm');
    (malformed.slots as Record<string, unknown>).relations = { status: 'present' };
    malformed.subjectId = 'place:waterdeep';
    const issues = validateSubjectEnvelope(malformed);
    expect(issues.some(issue => issue.path === 'slots.relations.values')).toBe(true);
    expect(issues.some(issue => issue.path === 'subjectId')).toBe(true);

    const emptyReferenceId = envelope('deity', 'dm');
    emptyReferenceId.subjectId = 'deity:';
    expect(validateSubjectEnvelope(emptyReferenceId).some(issue => issue.path === 'subjectId')).toBe(true);
  });

  it('keeps composition and directed relations in their distinct typed vocabularies', () => {
    const subject = envelope('organization', 'dm');
    const slots = subject.slots as Record<string, { status: string; values?: unknown }>;
    slots.composition = { status: 'present', values: [{ relation: 'organization-membership', target: { kind: 'reference', value: 'person:dale', label: 'Dale' } }] };
    slots.relations = { status: 'present', values: [{ kind: 'ally', direction: 'outgoing', target: { kind: 'reference', value: 'organization:harpers', label: 'Harpers' } }] };
    expect(validateSubjectEnvelope(subject)).toEqual([]);

    slots.relations = { status: 'present', values: [{ kind: 'ally', direction: 'outgoing', target: { kind: 'reference', value: 'deity:selune', label: 'Selûne' } }] };
    expect(validateSubjectEnvelope(subject).some(issue => issue.path === 'slots.relations.values[0].target.value')).toBe(true);

    slots.relations = { status: 'present', values: [
      { kind: 'ally', direction: 'outgoing', target: { kind: 'reference', value: 'organization:harpers', label: 'Harpers' } },
      { kind: 'ally', direction: 'outgoing', target: { kind: 'reference', value: 'organization:harpers', label: 'Harpers' } },
    ] };
    expect(validateSubjectEnvelope(subject).some(issue => issue.path === 'slots.relations.values[1]')).toBe(true);

    slots.relations = { status: 'present', values: [{ kind: 'ally', direction: 'outgoing', target: { kind: 'reference', value: 'unknown:harpers', label: 'Harpers' } }] };
    expect(validateSubjectEnvelope(subject).some(issue => issue.path === 'slots.relations.values[0].target.value')).toBe(true);

    slots.composition = { status: 'present', values: [{ relation: 'owns', target: { kind: 'reference' } }] };
    slots.relations = { status: 'present', values: [{ kind: 'member', direction: 'outgoing', target: { kind: 'reference' } }] };
    const issues = validateSubjectEnvelope(subject);
    expect(issues.some(issue => issue.path === 'slots.composition.values[0].relation')).toBe(true);
    expect(issues.some(issue => issue.path === 'slots.relations.values[0].kind')).toBe(true);
  });

  it('checks composition target kinds and rejects duplicate edges without collapsing distinct relations', () => {
    const subject = envelope('party', 'dm');
    const slots = subject.slots as Record<string, { status: string; values?: unknown }>;
    slots.composition = { status: 'present', values: [
      { relation: 'party-member', target: { kind: 'reference', value: 'actor:bo', label: 'Bo' } },
      { relation: 'pantheon-membership', target: { kind: 'reference', value: 'pantheon:faerun', label: 'Faerûn' } },
    ] };
    expect(validateSubjectEnvelope(subject)).toEqual([]);

    slots.composition = { status: 'present', values: [
      { relation: 'party-member', target: { kind: 'reference', value: 'location:neverwinter', label: 'Neverwinter' } },
      { relation: 'party-member', target: { kind: 'reference', value: 'actor:bo', label: 'Bo' } },
      { relation: 'party-member', target: { kind: 'reference', value: 'actor:bo', label: 'Bo' } },
    ] };
    const issues = validateSubjectEnvelope(subject);
    expect(issues.some(issue => issue.path === 'slots.composition.values[0].target.value')).toBe(true);
    expect(issues.some(issue => issue.path === 'slots.composition.values[2]')).toBe(true);
  });
});
