// Четыре персонажа §13 — описаны тем, что не выводится: характеристики, раса, класс, доспех, навыки.
// Хиты, AC, пассивное внимание и бонус мастерства считает derive.ts; seed.test.ts сверяет их с §13.
//
// Базовые характеристики — стандартный набор 15/14/13/12/10/8 у всех четверых; расовые бонусы — из компендиума,
// увеличение 4-го уровня — по SRD (+2 к одной или +1 к двум). Раскладка подобрана так, чтобы §13 сошёлся:
//   Bo      HP 49 = 10 + 4·6 + 5·3 (CON 16) · AC 16 = чешуйчатый 14 + DEX до +2 · PP 12 = 10 + WIS +2, без Внимательности
//   Korrin  HP 49 = 10 + 4·6 + 5·2 (CON 15) + 5·1 (Dwarven Toughness) · AC 18 = кольчуга 16 + щит 2 · PP 14 = 10 + WIS +1 + 3
//   Lyra    HP 32 = 6 + 4·4 + 5·2 (CON 14) · AC 15 = Mage Armor 13 + DEX +2 · PP 14 = 10 + WIS +1 + 3 (Keen Senses эльфа)
//   Aldric  HP 38 = 8 + 4·5 + 5·2 (CON 14) · AC 18 = чешуйчатый 14 + DEX до +2 + щит 2 · PP 13 = 10 + WIS +3, без Внимательности
// Что это значит для игры: у Bo Внимательности нет (с ней PP был бы 15), у Aldric её нет в списке жреца (иначе 16);
// у Aldric увеличение 4-го уровня ушло не в WIS +2 (иначе PP 14), а в WIS +1 и STR +1. Раса, подраса и доспех
// Korrin, Lyra и Aldric в §13 не названы — это предложение, при котором числа сходятся.
import type { PcSpec } from './derive';

export const PARTY_LEVEL = 5;

export const BO: PcSpec = {
  id: 'bo',
  name: 'Bo Tambernack',
  raceId: 'poluroslik',
  subraceId: 'poluroslik-legkonogiy',
  classId: 'sledopyt',
  level: PARTY_LEVEL,
  base: { str: 12, dex: 13, con: 15, int: 10, wis: 14, cha: 8 },
  improvements: [{ level: 4, asi: { con: 1, dex: 1 } }],
  armor: 'scale-mail',
  shield: false,
  skills: ['stealth', 'survival', 'nature'],
  // С референс-карточки владельца (лист Bo): Neutral, 3'2", 38 lbs, 26 лет.
  alignment: 'Нейтральный',
  bio: { height: '97 см', weight: '17 кг', age: 26 },
};

export const KORRIN: PcSpec = {
  id: 'korrin',
  name: 'Korrin Battlehammer',
  raceId: 'dvarf',
  subraceId: 'dvarf-holmovoy',
  classId: 'voin',
  level: PARTY_LEVEL,
  base: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 },
  improvements: [{ level: 4, asi: { str: 2 } }],
  armor: 'chain-mail',
  shield: true,
  skills: ['athletics', 'perception'],
};

export const LYRA: PcSpec = {
  id: 'lyra',
  name: 'Lyra Moonwhisper',
  raceId: 'el-f',
  subraceId: 'el-f-vyssiy',
  classId: 'volsebnik',
  level: PARTY_LEVEL,
  base: { str: 8, dex: 13, con: 14, int: 15, wis: 12, cha: 10 },
  improvements: [{ level: 4, asi: { int: 2 } }],
  armor: null,
  shield: false,
  mageArmor: true,
  skills: ['arcana', 'history'],
};

export const ALDRIC: PcSpec = {
  id: 'aldric',
  name: 'Brother Aldric',
  raceId: 'celovek',
  classId: 'jrec',
  level: PARTY_LEVEL,
  base: { str: 12, dex: 14, con: 13, int: 8, wis: 15, cha: 10 },
  improvements: [{ level: 4, asi: { wis: 1, str: 1 } }],
  armor: 'scale-mail',
  shield: true,
  skills: ['medicine', 'religion'],
};

/** Порядок — как в таблице §13. */
export const PARTY: readonly PcSpec[] = [BO, KORRIN, LYRA, ALDRIC];
