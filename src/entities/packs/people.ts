// Пакет NPC мира (E9): карточка по полям {{Person}} вики — раса, род занятий, дом (ссылка на место карты), бог
// (ссылка на справочник богов), годы жизни; в год кампании — жив или нет. Имена — латиницей, поля — как в вики.
import { loadPeople, personUrl, type Person } from '../../world/people';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, type EntityLink, type EntityView } from '../view';

const SEX: Readonly<Record<string, string>> = { male: 'мужской', female: 'женский' };

function lifeYears(p: Person, year: number): string | undefined {
  if (p.born === undefined && p.died === undefined) return undefined;
  const span = `${p.born ?? '?'}–${p.died ?? ''}`.replace(/–$/, ' —');
  const status = p.born !== undefined && p.born > year ? 'ещё не родился' : p.died !== undefined && p.died <= year ? 'умер' : 'жив';
  return `${span} DR · в ${year} DR ${status}`;
}

function view(p: Person, year: number, deityName: (id: string) => string | undefined): EntityView {
  const links: EntityLink[] = [
    ...(p.place ? [{ label: p.home?.split(',')[0] ?? 'Дом', ref: ref('place', p.place) }] : []),
    ...(p.deity ? [{ label: deityName(p.deity) ?? p.deity, ref: ref('deity', p.deity) }] : []),
  ];
  return {
    ref: ref('person', p.id), kind: 'person', name: p.name,
    subtitle: [p.race, p.occ].filter(Boolean).join(' · ') || undefined,
    source: { kind: 'wiki', cite: p.refs?.length ? `Forgotten Realms Wiki · ${p.refs.join('; ')}` : 'Forgotten Realms Wiki', license: 'CC BY-SA 3.0', url: personUrl(p) },
    facts: facts([
      ['Титул', p.t],
      ['Пол', p.sex ? SEX[p.sex.toLowerCase()] ?? p.sex : undefined],
      ['Дом', p.home],
      ['Бог', p.deity ? deityName(p.deity) ?? p.deity : p.deityText],
      ['Годы', lifeYears(p, year)],
    ]),
    sections: [],
    links,
  };
}

export async function loadPack(): Promise<Pack> {
  // Имя бога — из справочника богов (кусок космоса): он нужен и связи, иначе связь была бы id.
  const [people, deities] = await Promise.all([loadPeople(), import('../../cosmos/deities')]);
  const deityName = (id: string) => deities.deityById(id)?.name;
  return tablePack({ person: Object.fromEntries([...people.values()].map(p => [p.id, (_era, year: number) => view(p, year, deityName)])) });
}

