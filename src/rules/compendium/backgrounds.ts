// Предыстории: в таблицах владельца листа предысторий нет, поэтому они живут здесь, пока не появится таблица.
// Каждая несёт источник (CLAUDE.md: запись без источника не существует): в SRD 5.1 только Acolyte, остальные
// двенадцать — книга игрока (только для своего стола). Механика — два навыка; инструменты, языки и снаряжение
// лист персонажа пока не ведёт. Русские имена — как в переводе книги.
import type { SkillId } from '../srd/abilities';
import type { Source } from './schema';

export interface Background {
  id: string;
  name: string;
  nameRu: string;
  source: Source;
  skills: readonly [SkillId, SkillId];
}

export const BACKGROUNDS: readonly Background[] = [
  { id: 'acolyte', name: 'Acolyte', nameRu: 'Прислужник', source: 'srd', skills: ['insight', 'religion'] },
  { id: 'charlatan', name: 'Charlatan', nameRu: 'Шарлатан', source: 'book', skills: ['deception', 'sleight-of-hand'] },
  { id: 'criminal', name: 'Criminal', nameRu: 'Преступник', source: 'book', skills: ['deception', 'stealth'] },
  { id: 'entertainer', name: 'Entertainer', nameRu: 'Артист', source: 'book', skills: ['acrobatics', 'performance'] },
  { id: 'folk-hero', name: 'Folk Hero', nameRu: 'Народный герой', source: 'book', skills: ['animal-handling', 'survival'] },
  { id: 'guild-artisan', name: 'Guild Artisan', nameRu: 'Гильдейский ремесленник', source: 'book', skills: ['insight', 'persuasion'] },
  { id: 'hermit', name: 'Hermit', nameRu: 'Отшельник', source: 'book', skills: ['medicine', 'religion'] },
  { id: 'noble', name: 'Noble', nameRu: 'Благородный', source: 'book', skills: ['history', 'persuasion'] },
  { id: 'outlander', name: 'Outlander', nameRu: 'Чужеземец', source: 'book', skills: ['athletics', 'survival'] },
  { id: 'sage', name: 'Sage', nameRu: 'Мудрец', source: 'book', skills: ['arcana', 'history'] },
  { id: 'sailor', name: 'Sailor', nameRu: 'Моряк', source: 'book', skills: ['athletics', 'perception'] },
  { id: 'soldier', name: 'Soldier', nameRu: 'Солдат', source: 'book', skills: ['athletics', 'intimidation'] },
  { id: 'urchin', name: 'Urchin', nameRu: 'Беспризорник', source: 'book', skills: ['sleight-of-hand', 'stealth'] },
];

export const backgroundById = (id: string) => BACKGROUNDS.find(b => b.id === id);
