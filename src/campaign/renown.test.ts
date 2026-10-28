// Известность партии (E10): сдвиг — предложением с патчем renown; организация справочника — фракцией по «Принять».
import { describe, expect, it } from 'vitest';
import { factionOfOrganization, organizationFactionDelta, renownDelta } from './renown';
import { seedEngine } from './seed';
import { FACTION } from './world';

const fixed = () => {
  let t = 1000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
};

describe('известность партии', () => {
  it("Lords' Alliance +1: предложение 12 → 13 с причиной-фракцией; «Принять» — 13, Ctrl+Z — 12", () => {
    const store = seedEngine(fixed());
    const api = () => store.getState();
    const d = renownDelta(api().state, FACTION.lordsAlliance, 1);
    expect(d).toMatchObject({ subject: "Известность партии · Lords' Alliance", was: '12', now: '13', causeId: FACTION.lordsAlliance, patch: { kind: 'faction', id: FACTION.lordsAlliance, field: 'renown', value: 13 } });
    api().propose(d);
    expect(renownDelta(api().state, FACTION.lordsAlliance, -1).id).not.toBe(d.id);
    api().accept(d.id);
    expect(api().state.world.factions[FACTION.lordsAlliance].renown).toBe(13);
    api().undo();
    expect(api().state.world.factions[FACTION.lordsAlliance].renown).toBe(12);
  });

  it('Church of Tyr — фракцией кампании: известность 0 и ссылка на организацию; уже фракция находится по ссылке; Ctrl+Z убирает', () => {
    const store = seedEngine(fixed());
    const api = () => store.getState();
    expect(factionOfOrganization(api().state, 'lords-alliance')?.id).toBe(FACTION.lordsAlliance);
    expect(factionOfOrganization(api().state, 'church-of-tyr')).toBeUndefined();
    const d = organizationFactionDelta(api().state, { id: 'church-of-tyr', name: 'Church of Tyr' });
    expect(d).toMatchObject({ subject: 'Новая фракция · Church of Tyr', patch: { kind: 'newFaction', faction: { id: 'fac-church-of-tyr', name: 'Church of Tyr', renown: 0, ref: 'organization:church-of-tyr' } } });
    api().propose(d);
    api().accept(d.id);
    expect(factionOfOrganization(api().state, 'church-of-tyr')?.id).toBe('fac-church-of-tyr');
    api().undo();
    expect(api().state.world.factions['fac-church-of-tyr']).toBeUndefined();
  });
});
