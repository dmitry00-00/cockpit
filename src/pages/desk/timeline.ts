import type { CalendarAdapter } from '../../campaign/calendar';
import { FESTIVALS, MONTHS, secOf, SHIELDMEET } from '../../campaign/calendar';
import type { JournalEntry } from '../../engine';
import type { TimelinePlanRecord } from '../../engine/state';
import type { ArticleEvent, ChronoEvent } from '../../world/chronology';

export interface RibbonItem {
  undated?: boolean; id: string; lane: 'canon' | 'campaign' | 'proposal' | 'plan';
  text: string; date: string; year: number | null; endYear?: number; sec?: number; endSec?: number;
  details?: string; planId?: string;
  source: string; links?: readonly { t: string; ref?: string }[];
}
/** Never infer a date from prose such as “Late Eleint”. */
export function canonItems(base: readonly ChronoEvent[], articles: readonly ArticleEvent[], calendar: CalendarAdapter): RibbonItem[] {
  const canonical = new Map(base.map(e => [e.id, e]));
  const extras = articles.filter(e => !e.same || !canonical.has(e.same));
  return [...base, ...extras].filter(e => e.kind !== 'publications').map(e => {
    const related = articles.filter(a => a.same === e.id);
    let sec: number | undefined;
    if (calendar.id === 'harptos') {
      try {
        if (e.month && e.day && MONTHS[e.month - 1]) sec = secOf({ year: e.year, month: MONTHS[e.month - 1], day: e.day });
        else if (e.festival && [...FESTIVALS, SHIELDMEET].includes(e.festival as typeof SHIELDMEET)) sec = secOf({ year: e.year, festival: e.festival as typeof SHIELDMEET });
      } catch { /* Invalid source date remains year-only. */ }
    }
    const endYear = 'to' in e ? e.to : undefined;
    return {
      id: `canon:${e.id}`, lane: 'canon', text: e.text, year: e.year, endYear, sec,
      date: sec !== undefined ? calendar.formatDateOnly(sec) : `${e.when ? `${e.when} · ` : ''}${e.year}${endYear !== undefined ? `–${endYear}` : ''} DR · ${endYear !== undefined ? 'диапазон лет' : 'день не установлен'}`,
      source: [...new Set([...(e.cites ?? []), ...related.flatMap(a => a.cites ?? []), ...('src' in e ? [`${e.src.title}${e.src.section ? ` · ${e.src.section}` : ''}`] : []), ...related.map(a => a.src.title)])].join('; ') || 'Forgotten Realms Wiki · CC BY-SA 3.0',
      links: [...new Map([...(e.links ?? []), ...related.flatMap(a => a.links ?? [])].map(l => [l.ref ?? l.t, l])).values()],
    };
  });
}
export function campaignItems(entries: readonly JournalEntry[], calendar: CalendarAdapter): RibbonItem[] {
  return entries.filter(e => !e.hidden && !e.secret && !e.undone && !e.compensation && !e.deltaId
    && e.type !== 'TIMELINE_PLAN_CREATED' && e.type !== 'TIMELINE_PLAN_CANCELLED').map(e => ({
    id: `campaign:${e.id}`, lane: 'campaign', text: e.text, sec: e.worldSec, year: calendar.yearAt(e.worldSec),
    date: calendar.formatDate(e.worldSec), source: `Журнал кампании · ${e.eventId}`,
  }));
}

export function timelinePlanItems(plans: Readonly<Record<string, TimelinePlanRecord>> | undefined, calendar: CalendarAdapter): RibbonItem[] {
  return Object.values(plans ?? {}).filter(plan => plan.status === 'active').map(plan => ({
    id: `plan:${plan.id}`, planId: plan.id, lane: 'plan', text: plan.title,
    sec: plan.startSec, endSec: plan.endSec, year: calendar.yearAt(plan.startSec), endYear: calendar.yearAt(plan.endSec) ?? undefined,
    date: `${calendar.formatDateOnly(plan.startSec)} — ${calendar.formatDateOnly(plan.endSec)}`,
    details: plan.details, source: `План мастера · ${plan.source}`,
  }));
}
