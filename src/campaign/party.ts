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
//
// Снаряжение — стартовые наборы SRD (решение владельца 29.10: дать, чтобы атаки и шансы на листе были сразу). §13 его
// не называет; варианты (a)/(b) выбраны под доспех §13 и расу: Korrin — warhammer (Dwarven Combat Training) и ручные
// топоры, Lyra — кинжал (фехтовальный, DEX лучше STR). Длинный лук Bo — обязательная часть набора следопыта; полурослик
// Маленький, поэтому лук с помехой (build.ts, HEAVY_RULE).
//
// Заклинания — из списков классов SRD (решение владельца 29.10: «добавь заклинания»); число — по SRD на 5-м уровне,
// derive.ts проверяет. Выбор — предложение под роль: Bo — разведчик (Hunter's Mark из лога сида), Lyra — боевой
// волшебник (Mage Armor из лога сида; заговор высшего эльфа — Light), Aldric — целитель Lathander: домен Life
// (у Lathander в 5e Life и Light, в SRD есть только Life) даёт шесть всегда подготовленных сверх восьми.
import type { SrdClassId } from '../rules/srd';
import { CLASS_START } from '../rules/srd/equipment';
import { inventoryOf } from './build';
import type { PcSpec } from './derive';

/** Стартовый набор класса SRD: номер варианта на каждый вопрос набора и что взято из категорий. */
function kit(cls: SrdClassId, options: readonly number[], picks: Readonly<Record<number, readonly string[]>> = {}) {
  return inventoryOf(CLASS_START[cls].equipment, Object.fromEntries(options.map((option, i) => [i, { option, picks: picks[i] ?? [] }]))).items;
}

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
  // Чешуйчатый, два коротких меча, набор путешественника; длинный лук и 20 стрел — в наборе всегда.
  equipment: kit('ranger', [0, 0, 1]),
  spells: ['hunters-mark', 'cure-wounds', 'goodberry', 'pass-without-trace'],
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
  // Кольчуга, боевой молот и щит, два ручных топора, набор исследователя подземелий.
  equipment: kit('fighter', [0, 0, 1, 0], { 1: ['warhammer'] }),
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
  // Кинжал, мешочек с компонентами, набор учёного; книга заклинаний — в наборе всегда.
  equipment: kit('wizard', [1, 0, 0]),
  choices: { 'race-cantrip': ['light'] },
  spells: [
    'fire-bolt', 'acid-splash', 'mage-hand', 'prestidigitation',
    'mage-armor', 'magic-missile', 'shield', 'detect-magic', 'sleep', 'burning-hands', 'identify',
    'misty-step', 'invisibility', 'web', 'hold-person',
    'fireball', 'counterspell', 'fly',
  ],
  skills: ['arcana', 'history'],
};

export const ALDRIC: PcSpec = {
  id: 'aldric',
  name: 'Brother Aldric',
  raceId: 'celovek',
  classId: 'jrec',
  subclassId: 'jrec-jizni',
  level: PARTY_LEVEL,
  base: { str: 12, dex: 14, con: 13, int: 8, wis: 15, cha: 10 },
  improvements: [{ level: 4, asi: { wis: 1, str: 1 } }],
  armor: 'scale-mail',
  shield: true,
  // Булава, чешуйчатый, лёгкий арбалет и 20 болтов, набор священника, амулет-символ; щит — в наборе всегда.
  equipment: kit('cleric', [0, 0, 0, 0, 0], { 4: ['amulet'] }),
  spells: [
    'sacred-flame', 'light', 'thaumaturgy', 'guidance',
    'healing-word', 'shield-of-faith', 'guiding-bolt', 'command', 'aid', 'hold-person', 'spirit-guardians', 'dispel-magic',
  ],
  skills: ['medicine', 'religion'],
  // Бога §13 не называет — Lathander (домены 5e Life, Light; Faerûnian pantheon): решение владельца 28.10.2026 (E8).
  deity: { id: 'lathander', name: 'Lathander' },
};

/** Порядок — как в таблице §13. */
export const PARTY: readonly PcSpec[] = [BO, KORRIN, LYRA, ALDRIC];
