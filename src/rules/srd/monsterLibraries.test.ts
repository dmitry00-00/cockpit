import { beforeAll, describe, expect, it } from 'vitest';
import { MONSTERS, MONSTER_IDS, MONSTER_LIBRARIES, SRD_MONSTER_IDS, isMonsterId, loadMonsterLibraries, monsterOrigin } from './monsters';
import { legendaryOf } from './legendary';

// Библиотеки — отдельный кусок (ROADMAP 0.5): до загрузки в реестре только SRD.
beforeAll(async () => {
  expect(MONSTER_IDS).toHaveLength(334);
  expect(isMonsterId('bf-bandit')).toBe(false);
  await loadMonsterLibraries();
});

// SRD 5.1, «Experience Points by Challenge Rating»: XP блока SRD — строка таблицы его CR (у API было четыре расхождения, И4).
const XP_BY_CR: Readonly<Record<string, number>> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900,
  '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000,
  '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000,
  '28': 120000, '29': 135000, '30': 155000,
};

describe('библиотеки монстров: SRD, Black Flag, A5E', () => {
  it('XP блоков SRD — по таблице CR (CR 0 — 0 или 10: «0 (0–10 XP)»)', () => {
    for (const id of SRD_MONSTER_IDS) {
      const m = MONSTERS[id];
      expect(m.cr === '0' ? [0, 10] : [XP_BY_CR[m.cr]], id).toContain(m.xp);
    }
  });

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

  it('легендарные действия (Q13): у каждого блока вводный абзац, из него число и возврат в начале хода; логова нет ни у кого', () => {
    const withLegendary = MONSTER_IDS.filter(id => MONSTERS[id].legendary?.length);
    const byOrigin = (o: string) => withLegendary.filter(id => monsterOrigin(MONSTERS[id]) === o).length;
    expect([byOrigin('srd'), byOrigin('bf'), byOrigin('a5e')]).toEqual([32, 31, 68]);
    for (const id of withLegendary) {
      const l = legendaryOf(MONSTERS[id])!;
      expect(l.count, id).toBeGreaterThan(0);
      expect(l.regainsAtTurnStart, id).toBe(true);
      // Вводный абзац A5E больше не стоит первым «действием».
      expect(l.options.some(o => /legendary actions?\b/.test(o.name)), id).toBe(false);
    }
    // Дословно из блоков: SRD 5.1 и Black Flag — 3, A5E — от 1 до 3 (Medusa Queen — «one»).
    expect(legendaryOf(MONSTERS['adult-red-dragon'])!.intro).toBe("The dragon can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The dragon regains spent legendary actions at the start of its turn.");
    expect(legendaryOf(MONSTERS['adult-red-dragon'])!.options.map(o => [o.name, o.cost])).toEqual([['Detect', 1], ['Tail Attack', 1], ['Wing Attack (Costs 2 Actions)', 2]]);
    expect(legendaryOf(MONSTERS['a5e-aboleth'])!.count).toBe(2);
    expect(legendaryOf(MONSTERS['a5e-medusa-queen'])!.count).toBe(1);
    expect(legendaryOf(MONSTERS['bf-adult-red-dragon'])!.count).toBe(3);
    expect(legendaryOf(MONSTERS.bandit)).toBeNull();
    // Раздела lair actions нет ни в одной библиотеке: «lair actions» в текстах — только оговорки Change Shape.
    for (const id of MONSTER_IDS) {
      const m = MONSTERS[id];
      for (const a of [...m.traits, ...m.actions, ...m.reactions, ...(m.legendary ?? [])]) expect(/^lair actions?\b/i.test(a.name), `${id}: ${a.name}`).toBe(false);
    }
  });
});
