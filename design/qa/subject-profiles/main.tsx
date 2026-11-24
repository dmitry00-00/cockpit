// Isolated memory-only QA route: deterministic seed data, no user campaign, localStorage, or fetch calls.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/forum';
import '@fontsource/pt-sans';
import '@fontsource/ibm-plex-mono';
import '../../../src/styles/index.css';
import { SubjectProfileShell } from '../../../src/components/SubjectProfileShell';
import {
  characterSubjectEnvelope, citySubjectEnvelope, deitySubjectEnvelope,
  kingdomSubjectEnvelope, organizationSubjectEnvelope, partySubjectEnvelope,
} from '../../../src/entities/subjectAdapters';
import {
  validateSubjectEnvelope,
  type AnySubjectEnvelope, type SubjectAudience, type SubjectCompositionMember,
  type SubjectProfileId, type SubjectProvenance,
} from '../../../src/entities/subjectContract';
import type { EntityRef } from '../../../src/entities/ref';
import type { Deity } from '../../../src/cosmos/deities';
import type { Organization } from '../../../src/world/organizations';
import type { Kingdom } from '../../../src/world/kingdoms';
import deitiesJson from '../../../content/cosmos/deities.json';
import organizationsJson from '../../../content/world/organizations.json';
import kingdomsJson from '../../../content/world/kingdoms.json';
import { seedLog, seedState } from '../../../src/campaign/seed';
import { EventLog } from '../../../src/engine/log';
import { parseLog, serializeLog } from '../../../src/engine/persist';

const PROFILE_OPTIONS: ReadonlyArray<{ id: SubjectProfileId; label: string }> = [
  { id: 'character', label: 'Персонаж' },
  { id: 'party', label: 'Группа' },
  { id: 'deity', label: 'Божество' },
  { id: 'organization', label: 'Организация' },
  { id: 'city', label: 'Город' },
  { id: 'kingdom', label: 'Держава' },
];

const deities = (deitiesJson as unknown as { deities: Deity[] }).deities;
const organizations = (organizationsJson as unknown as { organizations: Organization[] }).organizations;
const kingdoms = (kingdomsJson as unknown as { kingdoms: Kingdom[] }).kingdoms;

function makeFixture() {
  // Reuse the project’s saved-session integration shape, entirely in memory.
  const events = parseLog(serializeLog(seedLog()));
  const state = structuredClone(new EventLog(seedState(), events).state);
  const deity = deities.find(row => row.id === 'selune');
  const organization = organizations.find(row => row.id === 'harpers');
  const kingdom = kingdoms.find(row => row.id === 'cormyr');
  const city = Object.values(state.world.locations).find(place => place.name === 'Neverwinter');
  if (!deity || !organization || !kingdom || !city) throw new Error('Не удалось собрать локальные данные QA-сцены.');

  city.revealed = true;
  const known = (ref: EntityRef, name: string) => ({
    ref,
    name,
    facts: [{ label: 'Известное сведение', value: `Запись QA: ${name}`, sec: state.time.sec }],
  });
  state.knowledge = {
    ...state.knowledge,
    'deity:selune': known('deity:selune', deity.name),
    'organization:harpers': known('organization:harpers', organization.name),
    [`location:${city.id}`]: known(`location:${city.id}`, city.name),
    'kingdom:cormyr': known('kingdom:cormyr', kingdom.name),
  };

  // Synthetic DM-only notes let the audience switch show the privacy boundary.
  const secretSubjects = ['actor:bo', 'deity:selune', 'organization:harpers', `location:${city.id}`, 'kingdom:cormyr'];
  secretSubjects.forEach((subjectId, index) => {
    const id = `qa-private-${index + 1}`;
    state.facts[id] = { id, subjectId, text: `Проверочная заметка мастера ${index + 1}`, visibility: 'dm' };
  });
  return { state, deity, organization, kingdom, city };
}

const fixture = makeFixture();

function buildEnvelope(profile: SubjectProfileId, audience: SubjectAudience): AnySubjectEnvelope {
  const { state, deity, organization, kingdom, city } = fixture;
  const envelope = profile === 'character' ? characterSubjectEnvelope(state, 'bo', audience)
    : profile === 'party' ? partySubjectEnvelope(state, audience)
    : profile === 'deity' ? deitySubjectEnvelope(state, deity, '5e', audience)
    : profile === 'organization' ? organizationSubjectEnvelope(state, organization, audience)
    : profile === 'city' ? citySubjectEnvelope(state, city.id, audience)
    : kingdomSubjectEnvelope(state, kingdom, audience, 1492);
  if (!envelope) throw new Error(`Адаптер не вернул профиль «${profile}» для аудитории «${audience}».`);
  return envelope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface SourceRow { path: string; provenance: SubjectProvenance }
function collectSources(value: unknown, path = 'envelope', rows: SourceRow[] = []): SourceRow[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSources(item, `${path}[${index}]`, rows));
  } else if (isRecord(value)) {
    const provenance = value.provenance;
    if (isRecord(provenance) && typeof provenance.layer === 'string' && typeof provenance.sourceId === 'string') {
      rows.push({ path, provenance: provenance as unknown as SubjectProvenance });
    }
    Object.entries(value).forEach(([key, child]) => {
      if (key !== 'provenance') collectSources(child, `${path}.${key}`, rows);
    });
  }
  return rows;
}

function compositionMembers(envelope: AnySubjectEnvelope): readonly SubjectCompositionMember[] {
  const slot = envelope.slots.composition;
  return slot.status === 'present' ? slot.values as readonly SubjectCompositionMember[] : [];
}

function citationText(provenance: SubjectProvenance): string {
  const citations = [provenance.citation, ...(provenance.citations ?? [])].filter(Boolean);
  return citations.map(citation => [
    citation!.title,
    citation!.edition,
    citation!.page ? `с. ${citation!.page}` : undefined,
    citation!.license,
  ].filter(Boolean).join(' · ')).join('; ');
}

function QaPage() {
  const [profile, setProfile] = useState<SubjectProfileId>('character');
  const [audience, setAudience] = useState<SubjectAudience>('dm');
  const envelope = buildEnvelope(profile, audience);
  const issues = validateSubjectEnvelope(envelope);
  const composition = compositionMembers(envelope);
  const sources = collectSources(envelope);
  const compositionStatus = envelope.slots.composition.status;

  return <main className="min-h-screen bg-wl text-tx">
    <header className="border-b border-br bg-pn px-5 py-4 md:px-8">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-key mb-1 uppercase text-t2">Изолированная проверка · только память</p>
          <h1 className="type-h-28 m-0">Профили субъектов</h1>
        </div>
        <p className="type-body-sm m-0 max-w-xl text-t2">Данные собраны из локального seed-журнала и справочников проекта. Сохранения, сетевые данные и кампания владельца не используются.</p>
      </div>
    </header>

    <div className="mx-auto grid max-w-screen-2xl gap-4 p-4 md:p-6 xl:grid-cols-[220px_minmax(420px,1fr)_minmax(300px,0.72fr)]">
      <aside className="flex flex-col gap-5">
        <section aria-labelledby="profile-picker-title">
          <h2 id="profile-picker-title" className="type-key mb-2 uppercase text-t2">Тип профиля</h2>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
            {PROFILE_OPTIONS.map(option => <button
              key={option.id}
              type="button"
              aria-pressed={profile === option.id}
              onClick={() => setProfile(option.id)}
              className={`type-body w-full border px-3 py-2 text-left focus-visible:shadow-[var(--glow-gold)] ${profile === option.id ? 'border-gd bg-cd text-gd' : 'border-br bg-pn text-tx hover:border-gd'}`}
            >{option.label}</button>)}
          </div>
        </section>

        <section aria-labelledby="audience-title">
          <h2 id="audience-title" className="type-key mb-2 uppercase text-t2">Аудитория</h2>
          <div className="grid grid-cols-2 gap-2">
            {([{ id: 'dm', label: 'Мастер' }, { id: 'players', label: 'Игроки' }] as const).map(option => <button
              key={option.id}
              type="button"
              aria-pressed={audience === option.id}
              onClick={() => setAudience(option.id)}
              className={`type-body border px-3 py-2 focus-visible:shadow-[var(--glow-gold)] ${audience === option.id ? 'border-gd bg-cd text-gd' : 'border-br bg-pn text-tx hover:border-gd'}`}
            >{option.label}</button>)}
          </div>
        </section>

        <p className="type-body-sm m-0 border-l-2 border-gd pl-3 text-t2">Режим игроков строит отдельный envelope адаптером. Поле секретов отсутствует в данных профиля.</p>
      </aside>

      <section className="min-h-[70vh] min-w-0" aria-label="Карточка субъекта">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="type-key m-0 uppercase text-t2">SubjectProfileShell</h2>
          <p role="status" className={`type-body-sm m-0 ${issues.length ? 'text-fx-debuff' : 'text-t2'}`}>
            {issues.length ? `Контракт: ${issues.length} замеч.` : `Контракт v${envelope.contractVersion}: корректен`}
          </p>
        </div>
        <SubjectProfileShell envelope={envelope} />
      </section>

      <aside className="min-w-0 border border-br bg-pn p-4" aria-label="Состав и источники envelope">
        <h2 className="type-h-20 mt-0">Состав и источники</h2>
        <section className="mb-5">
          <h3 className="type-key mb-2 uppercase text-gd">Состав · {composition.length}</h3>
          {composition.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {composition.map((member, index) => <li key={`${member.relation}:${member.target.value}:${index}`} className="border-b border-br/50 pb-2 last:border-0">
              <span className="type-body block">{member.target.label}</span>
              <span className="type-body-sm text-t2">{member.relation} · {member.target.value}{member.certainty ? ` · ${member.certainty}` : ''}</span>
              <span className="type-body-sm block break-all text-t2">{member.provenance.sourceId}</span>
            </li>)}
          </ul> : <p className="type-body-sm m-0 text-t2">{compositionStatus === 'not-applicable' ? 'Для этого профиля состав не применяется.' : 'Состав в источнике не указан.'}</p>}
        </section>

        <section>
          <h3 className="type-key mb-2 uppercase text-gd">Происхождение полей · {sources.length}</h3>
          {sources.length ? <details open>
            <summary className="type-body-sm cursor-pointer text-t2">Пути, слои и ссылки на источники</summary>
            <ul className="mt-3 flex max-h-96 list-none flex-col gap-3 overflow-auto p-0">
              {sources.map(({ path, provenance }, index) => <li key={`${path}:${index}`} className="border-b border-br/50 pb-2">
                <span className="type-body-sm block break-all text-t2">{path}</span>
                <span className="type-body-sm block break-all text-tx">{provenance.layer} · {provenance.sourceId}</span>
                {citationText(provenance) ? <span className="type-body-sm block text-gd">{citationText(provenance)}</span> : null}
              </li>)}
            </ul>
          </details> : <p className="type-body-sm m-0 text-t2">В envelope нет полей с provenance.</p>}
        </section>

        <details className="mt-5 border-t border-br pt-3">
          <summary className="type-body-sm cursor-pointer text-gd">Полный envelope · JSON</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words bg-cd p-3 font-mono text-xs text-tx">{JSON.stringify(envelope, null, 2)}</pre>
        </details>
        <p className="type-body-sm mt-4 border-t border-br pt-3 text-t2">Секреты: {'secrets' in envelope.slots ? 'поле присутствует в DM envelope' : 'поле отсутствует в envelope игроков'}.</p>
      </aside>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<QaPage />);
