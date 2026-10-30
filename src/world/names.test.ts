import { describe, expect, it } from 'vitest';
import placesFile from '../../content/maps/toril-places.json';
import passport from '../../content/maps/toril.json';
import { loadPeople, type Person } from './people';
import { makeName, namePool, nameParts, raceKey, type NamePoint } from './names';

const places = (placesFile as unknown as { places: { id: string; name: string; x: number | string; y: number | string }[] }).places;
const placeXY = new Map<string, NamePoint>(places.map(p => [p.id, { x: Number(p.x), y: Number(p.y) }]));
const at = (name: string): NamePoint => placeXY.get(places.find(p => p.name === name)!.id)!;
const MPP = (passport as { milesPerPixel: number }).milesPerPixel;

/** Детерминированная «случайность»: тест не должен мигать. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe('имена NPC из округи', () => {
  it('части имени: прозвище, пометки, титулы и номера прочь; частицы — в фамилии', () => {
    expect(nameParts('Khelben "Blackstaff" Arunsun')).toEqual({ given: 'Khelben', family: 'Arunsun' });
    expect(nameParts('Achem el Zalath')).toEqual({ given: 'Achem', family: 'el Zalath' });
    expect(nameParts('Mhorauk (given name unknown)')).toEqual({ given: 'Mhorauk' });
    expect(nameParts('Aetheric III')).toEqual({ given: 'Aetheric' });
    expect(nameParts('Elminster of Shadowdale')).toEqual({ given: 'Elminster' });
    expect(nameParts('"The Green Lady"')).toBeNull();
    expect(nameParts('Raoryndar or Rindlar (or Something)')).toBeNull();
  });

  it('раса блока SRD: any race и не гуманоид — без отбора', () => {
    expect(raceKey('humanoid (any race)')).toBeUndefined();
    expect(raceKey('humanoid (elf)')).toBe('elf');
    expect(raceKey('humanoid (goblinoid)')).toBe('goblin');
    expect(raceKey('beast')).toBeUndefined();
  });

  const people = { list: [] as Person[] };
  it('пул по округе: у Calimport — калишитские фамилии, у Silverymoon — северные; радиус растёт, пока имён мало', async () => {
    people.list = [...(await loadPeople()).values()];
    const south = namePool(people.list, placeXY, at('Calimport'), { milesPerPixel: MPP });
    const north = namePool(people.list, placeXY, at('Silverymoon'), { milesPerPixel: MPP });
    expect(south.given.length).toBeGreaterThanOrEqual(30);
    expect(north.given.length).toBeGreaterThanOrEqual(30);
    const calishite = (fs: string[]) => fs.filter(f => /^(el|al|bin|bint|yn|ibn)\b/.test(f)).length / Math.max(1, fs.length);
    expect(calishite(south.family)).toBeGreaterThan(0.1);
    expect(calishite(north.family)).toBeLessThan(0.02);
    expect(south.miles).toBeGreaterThanOrEqual(150);
  });

  it('отбор по расе: эльфы рядом — эльфийские имена; мало — отбор снят и это видно', () => {
    const elves = namePool(people.list, placeXY, at('Silverymoon'), { milesPerPixel: MPP, race: 'elf' });
    expect(elves.people).toBeGreaterThan(0);
    const kobolds = namePool(people.list, placeXY, at('Silverymoon'), { milesPerPixel: MPP, race: 'kobold', minGiven: 500 });
    expect(kobolds.anyRace).toBe(true);
  });

  it('новое имя — не из канона: ни одно из 200 не совпало с жителем вики', () => {
    const canon = new Set(people.list.map(p => p.name.toLowerCase()));
    const pool = namePool(people.list, placeXY, at('Waterdeep'), { milesPerPixel: MPP });
    const rand = seeded(7);
    for (let i = 0; i < 200; i++) {
      const name = makeName(pool, canon, rand);
      expect(name).not.toBeNull();
      expect(canon.has(name!.toLowerCase())).toBe(false);
    }
  });
});
