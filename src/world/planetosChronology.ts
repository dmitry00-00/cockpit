import { loadKind, refsOf, resolve, type EntityRef, type EntityView } from '../entities';

export const PLANETOS_BOOKS = {
  agot: 'Игра престолов',
  acok: 'Битва королей',
  asos: 'Буря мечей',
  affc: 'Пир стервятников',
  adwd: 'Танец с драконами',
} as const;

export type PlanetosBookId = keyof typeof PLANETOS_BOOKS;

export interface PlanetosChapter {
  bookId: string;
  chapterNo: number;
  events: readonly EntityView[];
}

export interface PlanetosChronology {
  chapters: readonly PlanetosChapter[];
  unlocated: readonly EntityView[];
  locatedCount: number;
  totalCount: number;
}

const BOOK_ORDER = Object.keys(PLANETOS_BOOKS);
const context = { settingPackageId: 'planetos' } as const;

/**
 * Build a reading-order index from event-card source locators. Chapter numbers are source locations,
 * not inferred in-world dates. Records without a verified locator remain visible in `unlocated`.
 */
export async function loadPlanetosChronology(): Promise<PlanetosChronology> {
  await loadKind('event', context);
  const events = refsOf('event', context)
    .map(ref => resolve(ref, context))
    .filter((event): event is EntityView => !!event && event.kind === 'event');
  const chapters = new Map<string, { bookId: string; chapterNo: number; events: Map<EntityRef, EntityView> }>();
  const unlocated: EntityView[] = [];
  const located = new Set<EntityRef>();

  for (const event of events) {
    const sources = [event.source, ...(event.sources ?? [])];
    const locators = new Set<string>();
    for (const source of sources) {
      if (!source.bookId || !Number.isInteger(source.chapterNo) || source.chapterNo! < 0) continue;
      const key = `${source.bookId}:${source.chapterNo}`;
      if (locators.has(key)) continue;
      locators.add(key);
      const chapter = chapters.get(key) ?? { bookId: source.bookId, chapterNo: source.chapterNo!, events: new Map<EntityRef, EntityView>() };
      chapter.events.set(event.ref, event);
      chapters.set(key, chapter);
    }
    if (locators.size) located.add(event.ref);
    else unlocated.push(event);
  }

  return {
    chapters: [...chapters.values()]
      .map(chapter => ({ ...chapter, events: [...chapter.events.values()] }))
      .sort((a, b) => (BOOK_ORDER.indexOf(a.bookId) < 0 ? Number.MAX_SAFE_INTEGER : BOOK_ORDER.indexOf(a.bookId))
        - (BOOK_ORDER.indexOf(b.bookId) < 0 ? Number.MAX_SAFE_INTEGER : BOOK_ORDER.indexOf(b.bookId))
        || a.bookId.localeCompare(b.bookId) || a.chapterNo - b.chapterNo),
    unlocated: unlocated.sort((a, b) => a.name.localeCompare(b.name)),
    locatedCount: located.size,
    totalCount: events.length,
  };
}

export function planetosBookLabel(bookId: string): string {
  return PLANETOS_BOOKS[bookId as PlanetosBookId] ?? bookId;
}
