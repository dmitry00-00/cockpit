// Организации мира (ROADMAP 3.1): поля карточек {{Organization}} Forgotten Realms Wiki (CC BY-SA 3.0), импорт —
// scripts/import-organizations.py. Около 0,7 МБ — отдельным куском, только когда нужна карточка организации или NPC.
// Члены — по категориям «Members of …» вики (content/world/org-members.json, пишет import-people.py): категория не
// различает нынешних и бывших. Год кампании — фильтр «есть»: основана не позже и не распущена к этому году; годы
// неизвестны — есть.
import { WIKI, type Resident } from './people';
import { loadSettingJson } from '../packages/registry';

export interface OrgLeader {
  /** Как в вики: «Open Lord Laeral Silverhand». */
  t: string;
  /** Когда: «1488 DR-present». */
  when?: string;
  /** NPC справочника. */
  person?: string;
}

export interface OrganizationMemberCitation { title: string; url: string; license: string }

export interface Organization {
  id: string;
  /** Латиницей, как в книгах. */
  name: string;
  /** Заголовок статьи вики. */
  title: string;
  aliases?: readonly string[];
  /** Тип словами вики: «Religious organization», «Noble family». */
  type?: string;
  /** Церковь: бог есть, и по типу или имени организация религиозная. */
  church?: boolean;
  /** База словами вики. */
  base?: string;
  /** Места справочника карты по базе. */
  places?: readonly string[];
  leaders?: readonly OrgLeader[];
  /** Боги — id справочника богов. */
  deities?: readonly string[];
  /** Союзники и враги — id организаций. */
  allies?: readonly string[];
  enemies?: readonly string[];
  alignment?: string;
  races?: string;
  symbol?: string;
  /** Численность словами вики. */
  members?: string;
  /** Годы DR. */
  formed?: number;
  disbanded?: number;
  refs?: readonly string[];
}

export const orgUrl = (o: Organization) => WIKI + encodeURIComponent(o.title.replace(/ /g, '_')).replace(/%2F/g, '/');

/** Есть в год кампании: основана не позже, не распущена к нему; годы неизвестны — есть. */
export const orgExistsIn = (o: Pick<Organization, 'formed' | 'disbanded'>, year: number): boolean =>
  (o.formed === undefined || o.formed <= year) && (o.disbanded === undefined || o.disbanded > year);

let all: Promise<ReadonlyMap<string, Organization>> | null = null;
/** Все организации; повторный вызов — тот же промис. */
export function loadOrganizations(): Promise<ReadonlyMap<string, Organization>> {
  all ??= loadSettingJson('content/world/organizations.json')
    .then(raw => new Map((raw as { organizations: Organization[] }).organizations.map(o => [o.id, o])));
  return all;
}

let members: Promise<Readonly<Record<string, readonly Resident[]>>> | null = null;
/** Организация → NPC-члены по категориям вики. */
export function loadOrgMembers(): Promise<Readonly<Record<string, readonly Resident[]>>> {
  members ??= loadSettingJson('content/world/org-members.json').then(raw => (raw as { orgs: Record<string, Resident[]> }).orgs);
  return members;
}

let memberSources: Promise<Readonly<Record<string, OrganizationMemberCitation>>> | null = null;
/** Организация → citation на исходную категорию Members of …, если текущий импорт её записал. */
export function loadOrgMemberSources(): Promise<Readonly<Record<string, OrganizationMemberCitation>>> {
  memberSources ??= loadSettingJson('content/world/org-members.json').then(raw =>
    (raw as { sources?: Record<string, OrganizationMemberCitation> }).sources ?? {},
  );
  return memberSources;
}

/** Боги места по полю religion статьи вики (ROADMAP 3.4): id божеств и текст поля как есть; года нет. */
export interface PlaceFaith { deities?: readonly string[]; text: string }

let faiths: Promise<Readonly<Record<string, PlaceFaith>>> | null = null;
/** Место справочника карты → боги места. */
export function loadPlaceFaiths(): Promise<Readonly<Record<string, PlaceFaith>>> {
  faiths ??= loadSettingJson('content/world/place-faiths.json').then(raw => (raw as { places: Record<string, PlaceFaith> }).places);
  return faiths;
}
