# У2 — контракт меташаблона субъектов, версия 1

Дата: 05.11.2026. Контракт следует за матрицей У1: [субъекты × экраны](subject-screens-matrix-2026-11-05.md). Это статическая схема чтения и представления; она не добавляет правила, игровые сущности или события.

**Кодовая основа v1 реализуется:** [subjectContract.ts](../src/entities/subjectContract.ts) содержит типы шести профилей, фиксированный порядок слотов, аудитории DM/players, типизированные связи состава/положения и runtime-проверку конверта. [Адаптеры](../src/entities/subjectAdapters.ts) читают явные справочные записи и State: партия не выбирает ложное общее место; игроковая проекция персонажа не показывает посторонних актёров; закрытые городские места и неизвестные справочные субъекты возвращаются как `null`; кампанийные метрики фракций остаются у DM; положения и состав не превращаются в неподтверждённые территории. Статический `place:` покрыт адаптером с обязательными `mapId`/`scale`, явным дополнительным контекстом для веры, организаций и жителей (вызывающий код передаёт его уже отфильтрованным для места/года), provenance и player-projection только по журналу знаний. Тест на реальном Abreon проверяет цитату, координаты, веру, организацию и жителя; игроковый тест исключает канонические данные. После повторной сверки 06.11 адаптеры дополнены производными ресурсами персонажа из `resourcePoolsOf`, мастерскими фактами в отдельном `secrets` и DM-only каноническими связями божества; в игроковой проекции остаются только знания кампании. 18 контрактных/адаптерных тестов и `npx tsc --noEmit -p tsconfig.app.json` прошли; полный аудит профильных полей и интеграционная приёмка ещё открыты.

## Зачем нужен отдельный контракт

Текущий [EntityView](../src/entities/view.ts) подходит для справочной карточки: имя, строковые факты, текстовые секции, ссылки и источник карточки. Он не задаёт фиксированные слоты между профилями, типизированные значения, происхождение каждого значения или аудиторию конкретных значений. Состояние кампании при этом уже имеет собственный событийный контракт в [State](../src/engine/state.ts) и [events](../src/engine/events.ts). Новый меташаблон связывает эти слои read-only адаптерами и не заменяет ни один из них.

## Версия и неизменные слоты

`contractVersion` — целое число. Версия 1 фиксирует идентификаторы, порядок и назначение следующих слотов. У профиля всегда объявлены все слоты; если слот неприменим, его статус — `not-applicable`, а renderer ничего не рисует. Если применим, но данных нет, статус — `empty`; пустой слот тоже не занимает место. Ни отсутствие данных, ни неприменимость не кодируются нулём или выдуманным значением.

| Порядок | ID | Назначение |
|---:|---|---|
| 1 | `core` | Устойчивое имя, тип субъекта, ссылка/идентификатор и краткая принадлежность профилю. |
| 2 | `indicators` | Текущее состояние, способное измениться: HP, известность, число участников и т. п. Только там, где такой показатель действительно есть. |
| 3 | `characteristics` | Характеристики профиля, измерения и канонические факты; никакого общего обязательного набора характеристик. |
| 4 | `resources` | Расходуемые или ограниченные ресурсы с явной единицей и источником максимума. |
| 5 | `conditions` | Срочные состояния/эффекты и их срок; не используется для произвольных отметок. |
| 6 | `capabilities` | Явно описанные возможности, навыки, действия или услуги. |
| 7 | `composition` | Членство или состав, с типизированной ролью связи. |
| 8 | `relations` | Направленные или симметричные связи с типом и источником. |
| 9 | `position` | Положение в пространстве своего уровня: клетка, место, геометрия или каноническая локализация. |
| 10 | `history` | Датированные канонические события и принятые кампанийные события, разведённые по слоям. |
| 11 | `knowledge` | Известные аудитории факты/сведения. Содержимое мастерской неизвестности не включается в этот слот. |
| 12 | `secrets` | Только мастерские заметки и скрытые сведения. Слот исключается из игрокового объекта, а не маскируется при рендере. |

## Типы метаданных

```ts
type SubjectProfileId = 'character' | 'deity' | 'party' | 'organization' | 'city' | 'kingdom';
type SubjectSlotId =
  | 'core' | 'indicators' | 'characteristics' | 'resources' | 'conditions' | 'capabilities'
  | 'composition' | 'relations' | 'position' | 'history' | 'knowledge' | 'secrets';
type DataLayer = 'reference' | 'event-state' | 'derived';
type Visibility = 'public' | 'players' | 'dm' | 'per-value';
type SlotStatus = 'present' | 'empty' | 'not-applicable';
type RendererId =
  | 'identity' | 'metric-strip' | 'typed-facts' | 'resource-list' | 'condition-list'
  | 'capability-list' | 'membership-list' | 'relation-list' | 'position-view'
  | 'event-timeline' | 'knowledge-list' | 'dm-secret-list' | 'hidden';

interface Provenance {
  layer: DataLayer;
  /** Ссылка на исходную запись, поле/событие или формулу производной проекции. */
  sourceId: string;
  citation?: { title: string; edition?: string; page?: string; url?: string; license?: string };
}

interface TypedValue<TKind extends string, TValue> {
  kind: TKind;
  value: TValue;
  unit?: string;
  provenance: Provenance;
  visibility: Exclude<Visibility, 'per-value'>;
}

interface SlotSpec<TId extends SubjectSlotId, TValueKind extends string> {
  id: TId;
  order: number;
  label: string;
  purpose: string;
  status: SlotStatus;
  valueKind: TValueKind;
  unit?: string;
  layers: readonly DataLayer[];
  visibility: Visibility;
  renderer: RendererId;
}
```

`sourceId` — технический указатель адаптера, а не цитата. Для канонического факта обязательна машиночитаемая ссылка на книгу/страницу, статью и лицензию, когда они есть. Для event-state сохраняется ссылка на событие/patch; для derived — стабильное имя формулы и ссылки на входные поля. `TypedValue.unit` задаётся только там, где единица определена источником/моделью. Подпись UI живёт в локализованной схеме, не в справочном тексте.

Профильная полезная нагрузка — дискриминированное объединение по `profileId`, не `Record<string, unknown>`:

```ts
type SubjectIdByProfile = {
  character: `actor:${string}`; deity: `deity:${string}`; party: 'party';
  organization: `organization:${string}` | `faction:${string}`; city: `place:${string}` | `location:${string}`;
  kingdom: `kingdom:${string}` | `faction:${string}`;
};
```

Общие значения остаются малыми и типизированными:

```ts
type EntityRef = `${string}:${string}`; // compile-time потребитель сужает до существующих EntityKind
type CitedTextValue = TypedValue<'text', string>;
type CountValue = TypedValue<'count', number> & { unit: string };
type MeasureValue = TypedValue<'measure', number> & { unit: string };
type HpValue = { kind: 'hit-points'; current: number; max: number; temporary: number; provenance: Provenance; visibility: 'players' | 'dm' };
type ReferenceValue = TypedValue<'reference', EntityRef> & { label: string };
type TimelineEntry = { at: TypedValue<'world-time', number>; text: CitedTextValue; ref?: ReferenceValue };
type ResourceValue = { id: string; label: string; current: number; maximum?: number; unit: string; provenance: Provenance; visibility: 'players' | 'dm' };
type ConditionValue = { id: string; label: string; level?: number; expiresAtWorldSec?: number; provenance: Provenance; visibility: 'players' | 'dm' };
type SubjectRelation = { kind: string; direction: 'outgoing' | 'incoming' | 'symmetric'; target: ReferenceValue; value?: CitedTextValue; provenance: Provenance; visibility: 'public' | 'players' | 'dm' };
type PositionValue =
  | { kind: 'cell'; spaceId: string; x: number; y: number; provenance: Provenance; visibility: 'players' | 'dm' }
  | { kind: 'place'; place: ReferenceValue; scale: string; provenance: Provenance; visibility: 'players' | 'dm' }
  | { kind: 'geometry-ref'; mapId: string; geometryId: string; provenance: Provenance; visibility: 'players' | 'dm' };
type KnowledgeEntry = { factId: string; label: string; value: CitedTextValue; audience: 'players' | 'dm' };
type SecretEntry = { id: string; label: string; value: CitedTextValue; audience: 'dm' };
```

Профильные payloads имеют закрытые ключи и не сводятся к свободному словарю:

```ts
interface CharacterSlots {
  core: { name: string; actorKind: 'pc' | 'npc' | 'monster'; ref: ReferenceValue };
  indicators?: { hp?: HpValue; ac?: MeasureValue; passivePerception?: MeasureValue };
  characteristics?: { abilities?: Partial<Record<'str'|'dex'|'con'|'int'|'wis'|'cha', number>>; skills?: readonly ReferenceValue[]; class?: ReferenceValue; level?: CountValue };
  resources?: readonly ResourceValue[]; conditions?: readonly ConditionValue[]; capabilities?: readonly ReferenceValue[];
  relations?: readonly SubjectRelation[]; position?: readonly PositionValue[]; history?: readonly TimelineEntry[]; knowledge?: readonly KnowledgeEntry[];
}
interface DeitySlots {
  core: { name: string; ref: ReferenceValue }; indicators?: { powerRank?: CitedTextValue; aliveStatus?: CitedTextValue };
  characteristics?: { alignment?: CitedTextValue; portfolio?: CitedTextValue; domains?: readonly CitedTextValue[]; symbol?: CitedTextValue };
  capabilities?: { worshippers?: CitedTextValue; holyDays?: CitedTextValue };
  composition?: readonly ReferenceValue[]; relations?: readonly SubjectRelation[]; position?: readonly PositionValue[];
  history?: readonly TimelineEntry[]; knowledge?: readonly KnowledgeEntry[];
}
interface PartySlots {
  core: { memberCount: CountValue };
  indicators?: { supply?: MeasureValue; sharedLocation?: ReferenceValue | { kind: 'mixed' } };
  resources?: readonly ResourceValue[]; composition: readonly ReferenceValue[]; relations?: readonly SubjectRelation[];
  position?: readonly PositionValue[]; history?: readonly TimelineEntry[]; knowledge?: readonly KnowledgeEntry[];
}
interface OrganizationSlots {
  core: { name: string; referenceRef?: ReferenceValue; campaignRef?: ReferenceValue };
  indicators?: { renown?: CountValue; standing?: CountValue; influence?: MeasureValue; trend?: MeasureValue };
  characteristics?: { type?: CitedTextValue; base?: CitedTextValue; leaders?: readonly ReferenceValue[]; founded?: CountValue; dissolved?: CountValue };
  composition?: readonly ReferenceValue[]; relations?: readonly SubjectRelation[]; position?: readonly PositionValue[];
  history?: readonly TimelineEntry[]; knowledge?: readonly KnowledgeEntry[];
}
interface CitySlots {
  core: { name: string; scale: string; referenceRef?: ReferenceValue; campaignRef?: ReferenceValue };
  indicators?: { revealed?: TypedValue<'boolean', boolean>; danger?: CitedTextValue; haven?: TypedValue<'boolean', boolean>; marketIndex?: MeasureValue };
  characteristics?: { population?: CitedTextValue; government?: CitedTextValue; faith?: CitedTextValue; type?: CitedTextValue };
  composition?: readonly ReferenceValue[]; relations?: readonly SubjectRelation[]; position?: readonly PositionValue[];
  history?: readonly TimelineEntry[]; knowledge?: readonly KnowledgeEntry[];
}
interface KingdomSlots {
  core: { name: string; referenceRef?: ReferenceValue; campaignRef?: ReferenceValue };
  indicators?: { renown?: CountValue; standing?: CountValue; influence?: MeasureValue; trend?: MeasureValue };
  characteristics?: { type?: CitedTextValue; government?: CitedTextValue; capital?: ReferenceValue; populationText?: CitedTextValue; languages?: readonly CitedTextValue[]; rulers?: readonly ReferenceValue[] };
  composition?: readonly ReferenceValue[]; relations?: readonly SubjectRelation[]; position?: readonly PositionValue[];
  history?: readonly TimelineEntry[]; knowledge?: readonly KnowledgeEntry[];
}

type DmSecrets = { secrets?: readonly SecretEntry[] };
type AudienceSlots<S, A extends 'dm' | 'players'> = A extends 'players' ? Omit<S, 'secrets'> : S & DmSecrets;
type SubjectSlotsByProfile = {
  character: CharacterSlots; deity: DeitySlots; party: PartySlots;
  organization: OrganizationSlots; city: CitySlots; kingdom: KingdomSlots;
};
type SubjectEnvelope = {
  [P in SubjectProfileId]: {
    [A in 'dm' | 'players']:
      { contractVersion: 1; profileId: P; subjectId: SubjectIdByProfile[P]; audience: A; slots: AudienceSlots<SubjectSlotsByProfile[P], A> }
  }['dm' | 'players']
}[SubjectProfileId];
```

In an implementation, `ActorKind`, `EntityRef`, ability ids and scales are imported from their existing source types; they are not redefined as new product enums. The sketches above show the v1 closed keys and optionality. `secrets` is never a property on player envelopes. `slots` is a partial *projection* of a fixed profile schema; it is not a mutable/serializable universal entity.

## Шесть типизированных профилей

Обозначения источников: **R** — read-only справочник; **E** — event-sourced состояние/мир; **D** — чистая производная проекция. В квадратных скобках перечислены объявленные слоты в постоянном порядке; неприведённые слоты профиль объявляет `not-applicable` со renderer `hidden`.

### `character`

`subjectId: actor:<id>`. Профиль хранит ссылки на актёра, а не копирует текст классов/заклинаний/вещей.

- `core`: `ActorIdentity { name; actorKind: pc | npc | monster; entityRef? }` — E.
- `indicators`: `CharacterIndicators { hp: HpValue; ac?: MeasureValue; passivePerception?: MeasureValue }` — E/D.
- `characteristics`: `CharacterCharacteristics { abilities?: AbilityScores; skills?: readonly SkillRef[]; classRef?: EntityRef; level?: CountValue }` — R/E.
- `resources`: `readonly ResourceValue[]` с `current`, максимумом и SRD/A5E source — E/D.
- `conditions`: `readonly ConditionValue[]`, срок — world seconds или явная текстовая отметка — E.
- `capabilities`: `readonly EntityRef[]` (умения/черты по id) — R.
- `relations`: `readonly SubjectRelation[]` (отношение к партии, фракции, божеству) — E/R.
- `position`: `CharacterPosition { locationRef?; battleCell? }` — E/D. `location` и battle `cell` имеют разные `spaceId`.
- `history`, `knowledge`, `secrets`: события актёра / известные факты / DM-only — E/D.

Не добавлять к NPC без листа характеристики персонажа. Не выводить DC, скорость, максимум ресурса или механику, которых нет у листа и выбранного правила.

### `deity`

`subjectId: deity:<id>`; профиль — справочная сила, не политический актёр или боевой лист.

- `core`: `ReferenceIdentity { name; entityRef: deity:<id> }` — R.
- `indicators`: `DeityIndicators { powerRank?: CitedTextValue; aliveStatus?: CitedTextValue }` — R, если источник задаёт.
- `characteristics`: `DeityCharacteristics { alignment?; portfolio?; domains?: readonly CitedTextValue[]; symbol? }` — R с edition/source на каждое значение.
- `capabilities`: `DeityRelations { worshippers?; holyDays? }` — R/D; это описания и календарные привязки, не действия игрока.
- `composition`: `PantheonMembership[]` — R.
- `relations`: `DeityRelation[]` с видами `serves | served-by | aspect | worshipped-by` — R.
- `position`: `DeityLocation { homePlanes: readonly EntityRef[]; realms?: readonly CitedTextValue[] }` — R, с edition и явным id плана; не территория-полигон.
- `history`, `knowledge`, `secrets`: только при подтверждённой хронологии/кампанийных сведениях — R/E.

`resources`, `conditions` и боевые показатели не применимы. Жрец с `CharacterSheet.deity` — актёр со ссылкой на этот профиль. Аватар — отдельный явно созданный `Actor`, не подтип этой записи.

### `party`

`subjectId: 'party'`. Это проекция `State.party`, не новый `EntityRef` и не запись в campaign log.

- `core`: `PartyIdentity { memberCount: CountValue }` — D.
- `indicators`: `PartyIndicators { supply?: MeasureValue; locationAgreement?: SharedLocationValue }` — D/E. Расхождение мест остаётся видимым как `mixed`, без выбора ложной общей точки.
- `resources`: только общий `Supply` и другие реально общие ресурсы — E/D. Нельзя суммировать HP, уровни угрозы или индивидуальные слоты.
- `composition`: `PartyMemberRef[]` со ссылками на актёров и порядком `State.party` — E/D.
- `relations`: отношения группы к фракциям/местам, только если вычислены существующим контрактом — E/D.
- `position`: `PartyPosition { sharedLocation?; route? }` — E/D; «последний поход» хранится в истории, а не выдаётся за активный маршрут.
- `history`, `knowledge`, `secrets`: лента событий, известные группе сведения, мастерская часть — E/D.

`characteristics`, `conditions` и `capabilities` неприменимы как агрегат группы. Индивидуальные значения остаются в профиле каждого персонажа.

### `organization`

`subjectId: organization:<id>` для справочника или `faction:<id>` для активного кампанийного субъекта. Если имеются оба — один профиль связывает их явной ссылкой, а не склеивает их данные.

- `core`: `OrganizationIdentity { name; referenceRef?: organization:<id>; campaignRef?: faction:<id> }` — R/E.
- `indicators`: `FactionIndicators { renown?; standing?; influence?; trend? }` — E, только при активной Faction; никаких значений по умолчанию для каталога.
- `characteristics`: `OrganizationFacts { type?; baseText?; leaders?: readonly PersonRef[]; founded?; dissolved?; alignment?; races?; symbol?; members?; church? }` — R; descriptive member totals remain text unless a source normalizes them.
- `composition`: `OrganizationMembership[]`, годы/категорийный характер membership помечены источником и неопределённостью — R.
- `relations`: `OrganizationRelation[]` (ally/enemy из reference отделён от `Faction.relations` в кампании) — R/E.
- `position`: `OrganizationPlaces { basePlace?; associatedPlaces: readonly PlaceRef[] }` — R. Наличие базы не означает владения территорией.
- `history`, `knowledge`, `secrets`: события, открытые аудитории факты, DM-only — R/E.

`resources`, `conditions` и боевые показатели неприменимы без отдельной модели/правила.

### `city`

`subjectId: place:<id>` для справочника или `location:<id>` для места кампании. Явный bridge ref может соединять их.

- `core`: `PlaceIdentity { name; scale: ScaleLevel; referenceRef?; campaignRef? }` — R/E.
- `indicators`: `PlaceIndicators { revealed?; danger?; haven?; marketIndex? }` — E/D, аудитория и ожидающий patch сохранены раздельно.
- `characteristics`: `CityFacts { population?: CitedTextValue; government?; faith?; type? }` — R. Канонический текст population не становится точным числом без нормализованного источника.
- `composition`: `PlaceComposition { residents?: PersonRef[]; organizations?: OrganizationRef[]; childPlaces?: PlaceRef[] }` — R/D.
- `relations`: `PlaceRelations { localFactions?; tensions? }` — E/D; ожидание симуляции показывается отдельно.
- `position`: `PlacePosition { parentRef?; mapGeometry?; authoredSettlementPlan? }` — R/E, с конкретным map/package id. Строительный план не переопределяет базовую карту.
- `history`, `knowledge`, `secrets`: хронология/журнал, открытые сведения, DM-only — R/E.

`resources`, `conditions` и боевой профиль города неприменимы. Population, рынок и опасность не превращаются в HP/запасы армии/очередь инициативы.

### `kingdom`

`subjectId: kingdom:<id>` для справочника или `faction:<id>` при явной активации в кампанию.

- `core`: `KingdomIdentity { name; referenceRef?: kingdom:<id>; campaignRef?: faction:<id> }` — R/E.
- `indicators`: только существующие campaign-faction показатели — E; нет показателей державы — `not-applicable`, не ноль.
- `characteristics`: `KingdomFacts { type?; government?; capital?: PlaceRef; populationText?; languages?; rulers?: DatedPersonRef[] }` — R, факты правителя привязаны к году/редакции/источнику.
- `composition`: `KingdomComposition { places?: PlaceRef[]; organizations?: OrganizationRef[]; within?: KingdomRef }` — R/D.
- `relations`: справочные allies/enemies отдельно от отношений фракций кампании — R/E.
- `position`: `KingdomPosition { capital?: PlaceRef; representedPlaces?: PlaceRef[]; territory?: ExplicitGeometryRef }` — R. Нет геометрии границ — нет полигона.
- `history`, `knowledge`, `secrets`: датированная каноническая хроника/кампанийный журнал, открытые сведения, DM-only — R/E.

`resources`, `conditions` и профиль государственного боя неприменимы до появления принятой модели. Армейская численность из L8 остаётся кандидатом с цитатой, а не значением субъекта, пока мастер не принял её в мир.

## Общие типы значений и правил отображения

Общий набор — только типобезопасные атомы, нужные нескольким профилям: `TextValue`, `CountValue`, `MeasureValue`, `ReferenceValue`, `RelationValue`, `TimelineEntry`, `ResourceValue`, `ConditionValue`, `PositionValue`. Все значения содержат provenance и visibility. Профильные объекты (`CharacterSlots`, `DeitySlots`, …) задают конкретные поля; универсального мешка `facts: Record<string, unknown>` нет.

Каждый `SlotSpec` дополнительно задаёт:

- человекочитаемую подпись и `unit` (например, `hp`, `ft`, `world-sec`, `DR`) — единица опускается, если исходные данные её не задают;
- список разрешённых слоёв `reference | event-state | derived` и происхождение каждого значения;
- аудиторию `public | players | dm | per-value`; при `per-value` renderer получает только уже отфильтрованные элементы;
- один стабильный `RendererId`. Renderer отображает семантический тип, подпись и источник; он не меняет состояние и не придумывает placeholder-значения;
- `status: empty | not-applicable | present`. И `empty`, и `not-applicable` пропускают слот в раскладке, но остаются различимыми для аудита/контрактного теста.

## Совместимость и внедрение

1. **Существующие источники остаются владельцами данных.** `EntityView`/пакеты остаются read-only reference API; `State`/event log остаются изменяемой историей кампании; `sceneOf`, `partyContextOf`, `sheetView` и `pulseOf` остаются производными функциями. Subject adapters читают их, но не дублируют их в persistent State.
2. **Нет миграции и новых событий в версии контракта.** Сохранения и старые логи продолжают читать текущие `Actor`, `Location`, `Faction`, `State.party` и `EntityRef`. Subject envelope не сериализуется в campaign save.
3. **Первые адаптеры — read-only.** Начать с персонажа и партии, затем справочник божества, организация/город, держава. Каждый адаптер заявляет неполные/неприменимые слоты; он не фабрикует combat actor или faction. Активация записи по-прежнему требует текущего типизированного пути/принятого patch.
4. **Игроковая проекция строится отдельно до рендера.** Фильтры аудитории применяются к значениям и метаданным на границе адаптера. В `audience: 'players'` запрещены ключ `secrets`, DM provenance, скрытые refs/links и строки, которые раскрывают существование отфильтрованных записей. CSS `hidden` не является фильтром безопасности.
5. **Устойчивые ссылки и уровни не склеиваются.** `EntityRef` остаётся `kind:id`; party использует projection key `party`. Место, город, держава и план имеют явные scale/ref/geometry и не получают новый `parentId`, пока U6 не утвердит множественные типы связей и правила агрегации.
6. **Совместимость проверяется contract tests.** Для шести адаптеров: стабильный slot order/id/version; present соответствует схеме профиля; no invented value; ссылки резолвятся или отмечены missing; игроковый envelope не содержит секретных значений/метаданных; старые save/event snapshots не меняются; render перехода не вызывает dispatch.

## Связь с У1 и переход к У3

Шесть примеров выше — character, deity, party, organization, city, kingdom; карта, время, состояние, бой и взаимодействие разобраны в [матрице У1](subject-screens-matrix-2026-11-05.md). У2 фиксирует данные и постоянные слоты. У3 решает компоновку корешка/карточки/модального экрана; он не меняет payload версии 1. У4 задаёт карту/часы как контекстные рендереры слотов `position`/`indicators`; У5 — адаптеры взаимодействий; У6 — связи и правила rollup. Новые поля и механики требуют версии контракта и отдельного решения, а не частной мутации одного экрана.

## Сверка по исходным моделям и правки 06.11.2026

Проверены формы и текущие проекции в `src/engine/state.ts`, `src/campaign/resources.ts`, `src/cosmos/deities.ts`, `src/world/organizations.ts`, `src/world/kingdoms.ts` и `src/map/gazetteer.ts`. Подтверждены используемые границы: личные ресурсы вычисляются только имеющимся правилом `resourcePoolsOf`; позиции кампанийной группы не выбираются из расходящихся мест; численность войск держав не включается до принятия результата L8; membership из категории организации сохраняет `category-ever-member`; плоскостная позиция божества берётся только из явного `cell.p`.

Аудит выявил и исправил несоответствия: игрокам показывались справочные пантеоны/служение/аспекты божества сверх записанных знаний; заполненный лист персонажа выдавал пустой слот ресурсов вместо текущих поддержанных SRD ресурсов; факты `visibility: dm` у персонажа и статического места попадали в `knowledge`, а не в `secrets`. Теперь канонические связи божества идут только в DM-конверт, его сила/почитатели/святые дни получают данные по редакции, ресурсы содержат производное текущее/максимум с исходной формулой и ссылкой на SRD, мастерские факты вынесены в `secrets`, а дополнительные поля организации и ссылки на её божества отражены типизированно. 06.11 профиль державы также подключён к `loadKingdomHistory`: в хронологический слот DM-профиля идут датированные записи обоих слоёв хроники до года линзы, с цитатой; тест подтверждает диапазон 1260–1261 DR и отсутствие записи в player envelope. Добавлены цитаты в профиле организации для руководителей, союзников, врагов, божеств и связанных мест; текстовый слот сохраняет формулировку и интервал `when` руководителей. Импортёр состава организаций теперь сохраняет URL исходной категории `Members of …`; карточка протягивает её citation в состав, если метаданные есть.

На момент подготовки спеки 05.11 JSON состава организаций ещё не содержал category-specific citation; это устранено изолированной координированной регенерацией 07.11 (см. ниже). Остались source cross-check полноты/точности истории держав по реальным записям и интеграционная/браузерная приёмка всех шести профилей. Эти значения не считаются закрытыми по отсутствию тестовых ошибок.

## Статус

Контракт не сериализуется и не меняет State/event log. 07.11 интеграция данных участников прошла: `src/entities/subjectAdapters.test.ts` — 15/15 через минимальную диагностику, `python3 scripts/test_import_people_sources.py` — 2/2, `npx tsc --noEmit -p tsconfig.app.json` и `git diff --check` проходят. Стандартный запуск Vitest с `vite.config.ts` ранее зависал на `RUN`. У2 остаётся открытой до завершения source cross-check истории держав и общей интеграционной приёмки шести профилей; UI-компоновка относится к У3.


## Регенерация citations состава организаций 07.11.2026

Исходник найден по локальному пути `/Volumes/внешний/datasets/fr-wiki-2026-10-21/forgottenrealms_pages_current.xml` (412 МБ). `scripts/import-people.py` запущен **в изолированном клоне** `/private/tmp/cockpit-u2-org-citations`, ветка `codex/u2-org-member-citations`; к HEAD `7bd54fd` синхронизированы только текущие незакоммиченные входы `scripts/import-people.py` и `content/maps/toril-cards.json`. Импорт завершился: 20 611 NPC; в результате 900 организаций с участниками и 900 citations на точные `Category:Members of …` URL. Проверка показала: member lists структурно равны прежним; источников без участников и участников без источника — 0; общие attribution/license/note не изменились; некорректных citation — 0. В рабочую копию перенесён только новый `content/world/org-members.json`; сгенерированные people chunks и people-index в рабочую копию не копировались.

Регрессионный adapter test теперь берёт citation `harpers` непосредственно из generated JSON, а не из ручной фикстуры. На дату 07.11.2026 source cross-check истории держав и браузерный проход всех шести профилей оставались открыты; оба закрыты 20.11.2026. Сверка и доказательства: `research/ux-review/U2-source-cross-check-2026-11-20.md`.
