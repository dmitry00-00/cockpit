/**
 * Книжные действия логова, которые не входят в SRD-библиотеки. Показываются только мастеру.
 * Формулировки — краткие русские конспекты; источник и редакция указаны отдельно.
 */
export interface LairActionOption {
  id: string;
  name: string;
  summary: string;
}

export interface LairActions {
  initiative: 20;
  source: string;
  sourceUrl: string;
  intro: string;
  options: readonly LairActionOption[];
}

const RED_DRAGON_LAIR: LairActions = {
  initiative: 20,
  source: 'D&D Basic Rules (2014), Adult Red Dragon · Lair Actions',
  sourceUrl: 'https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monster-stat-blocks-a',
  intro: 'Мастер выбирает один эффект; один и тот же нельзя выбирать два раунда подряд. Действие логова происходит после существ с инициативой 20.',
  options: [
    {
      id: 'magma-geyser',
      name: 'Магмовый гейзер',
      summary: 'Видимая дракону точка на земле в пределах 120 фт.; гейзер высотой 20 фт. и радиусом 5 фт. Существа в области: спасбросок Ловкости Сл 15; провал — 6к6 урона огнём, успех — половина.',
    },
    {
      id: 'tremor',
      name: 'Подземный толчок',
      summary: 'Дрожь в логове в радиусе 60 фт. от дракона. Стоящие на земле существа, кроме дракона: спасбросок Ловкости Сл 15 или падают ничком.',
    },
    {
      id: 'volcanic-gas',
      name: 'Вулканический газ',
      summary: 'Легко заслоняющее обзор облако радиусом 20 фт. вокруг видимой дракону точки в пределах 120 фт.; рассеивается на инициативе 20 следующего раунда. Начавшие ход в облаке: спасбросок Телосложения Сл 13 или отравлены до конца своего хода; пока отравлены этим эффектом, они недееспособны.',
    },
  ],
};

const BY_MONSTER_ID: Readonly<Record<string, LairActions>> = {
  // Это отдельный книжный набор к базовой записи SRD 5.1; варианты применяются лишь по решению мастера.
  'adult-red-dragon': RED_DRAGON_LAIR,
};

export function lairActionsOf(monsterId: string | undefined): LairActions | null {
  return monsterId ? BY_MONSTER_ID[monsterId] ?? null : null;
}
