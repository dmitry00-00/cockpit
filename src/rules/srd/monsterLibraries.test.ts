import { beforeAll, describe, expect, it } from 'vitest';
import { MONSTERS, MONSTER_IDS, MONSTER_LIBRARIES, SRD_MONSTER_IDS, isMonsterId, loadMonsterLibraries, monsterOrigin } from './monsters';

// Библиотеки — отдельный кусок (ROADMAP 0.5): до загрузки в реестре только SRD.
beforeAll(async () => {
  expect(MONSTER_IDS).toHaveLength(334);
  expect(isMonsterId('bf-bandit')).toBe(false);
  await loadMonsterLibraries();
});

describe('библиотеки монстров: SRD, Black Flag, A5E', () => {
  it('334 SRD + 360 Black Flag + 586 A5E; id с приставкой библиотеки, у каждого источник CC-BY-4.0', () => {
    expect(SRD_MONSTER_IDS).toHaveLength(334);
    const count = (o: string) => MONSTER_IDS.filter(id => monsterOrigin(MONSTERS[id]) === o).length;
    expect([count('srd'), count('bf'), count('a5e')]).toEqual([334, 360, 586]);
    for (const id of MONSTER_IDS) {
      const m = MONSTERS[id];
      expect(m.id).toBe(id);
      expect(m.source, id).toContain('CC-BY-4.0');
      if (m.origin) expect(id.startsWith(`${m.origin}-`), id).toBe(true);
      expect(m.hp.average, id).toBeGreaterThan(0);
      expect(m.speedText, id).toContain(`${m.speed} ft.`);
      for (const a of [...m.actions, ...(m.bonusActions ?? []), ...m.reactions, ...(m.legendary ?? [])]) {
        if (a.attack) expect(a.text, `${id}: ${a.name}`).toContain(`${a.attack.toHit >= 0 ? '+' : ''}${a.attack.toHit} to hit`);
      }
    }
    expect(isMonsterId('bf-bandit') && isMonsterId('a5e-bandit') && isMonsterId('bandit')).toBe(true);
    for (const l of MONSTER_LIBRARIES) expect(l.attribution).toContain('Creative Commons Attribution 4.0');
  });

  it('бонусные и легендарные действия: Steal Item у бандита Black Flag, легендарные у драконов SRD и A5E', () => {
    expect(MONSTERS['bf-bandit'].bonusActions?.map(a => a.name)).toEqual(['Steal Item']);
    expect(MONSTERS['adult-red-dragon'].legendary?.map(a => a.name)).toContain('Wing Attack (Costs 2 Actions)');
    expect(MONSTERS['a5e-adult-red-dragon'].legendary?.length).toBeGreaterThan(0);
    // Запятые A5E, потерянные Open5e (двойной пробел), возвращены.
    const all = MONSTER_IDS.flatMap(id => [...MONSTERS[id].traits, ...MONSTERS[id].actions].map(a => a.text));
    expect(all.some(t => / {2}/.test(t))).toBe(false);
  });
});
