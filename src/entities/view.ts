// Представление сущности для карточки, поиска и связей — одно на все виды. Тексты источников — дословно (SRD,
// цитаты вики); русские подписи — свои. У каждой записи источник: запись без источника не существует (CLAUDE.md).
import { KIND_LABEL, parseRef, type EntityKind, type EntityRef } from './ref';

export type SourceKind = 'srd' | 'book' | 'hb' | 'bf' | 'a5e' | 'wiki' | 'gis' | 'package' | 'campaign';

export interface EntitySource {
  kind: SourceKind;
  /** Что и откуда: «SRD 5.1 (CC-BY-4.0) via …», книга и страница, статья вики. */
  cite: string;
  url?: string;
  license?: string;
  /** Для привязки раскрытия к книжной непрерывности; chapterNo=0 — пролог. */
  bookId?: string;
  chapterNo?: number;
}

/** Строка паспорта: «Время накладывания — 1 action». */
export interface EntityFact { label: string; value: string }

/** Абзац или именованный блок текста: особенность монстра, умение, описание. */
export interface EntitySection { title?: string; text: string }

export interface EntityLink { label: string; ref: EntityRef }

/** Группа узлов схемы: подпись и связи; пунктир — связь слабее прямой (аспект). */
export interface EntityGroup { title: string; links: EntityLink[]; dashed?: boolean }

/** Окрестность сущности схемой (E2): группы над ней и под ней, рёбра — от неё к узлам ближайших групп. */
export interface EntityDiagram { above: EntityGroup[]; below: EntityGroup[] }

export interface EntityView {
  ref: EntityRef;
  kind: EntityKind;
  /** Имя как в источнике: латиница мира и SRD, русское — у компендиума. */
  name: string;
  /** Русское имя, если источник его даёт и оно отличается от name. */
  nameRu?: string;
  /** Строка под именем: «1-й круг · Очарование», «Medium humanoid, any alignment · CR 1/8». */
  subtitle?: string;
  source: EntitySource;
  /** Дополнительные точные источники, когда карточка объединяет факты из нескольких глав/книг. */
  sources?: EntitySource[];
  facts: EntityFact[];
  sections: EntitySection[];
  links: EntityLink[];
  /** Схема окрестности: служение бога. Связи схемы в links не повторяются. */
  diagram?: EntityDiagram;
  /** Длинные списки связей — свёрнутыми группами с числом: жители места (сотни NPC). */
  groups?: EntityGroup[];
  /** Ссылка есть, записи нет: карточка показывает заглушку, а не пустоту. */
  missing?: true;
}

/** Заглушка для битой ссылки: пропажа видна, а не молча спрятана. */
export function missingView(ref: EntityRef): EntityView {
  const p = parseRef(ref);
  const kind = p?.kind ?? 'place';
  return {
    ref,
    kind,
    name: p?.id ?? ref,
    subtitle: `${KIND_LABEL[kind]}: записи нет`,
    source: { kind: 'campaign', cite: 'нет записи в справочнике и в состоянии' },
    facts: [],
    sections: [],
    links: [],
    missing: true,
  };
}

/** Абзацы через пустую строку → секции без заголовка. */
export const paragraphs = (text: string | readonly string[]): EntitySection[] =>
  (typeof text === 'string' ? text.split(/\n\s*\n/) : text).map(t => t.trim()).filter(Boolean).map(t => ({ text: t }));

/** Факты без пустых значений. */
export const facts = (rows: readonly (readonly [string, string | number | undefined | null | false])[]): EntityFact[] =>
  rows.filter(([, v]) => v !== undefined && v !== null && v !== false && v !== '').map(([label, v]) => ({ label, value: String(v) }));
