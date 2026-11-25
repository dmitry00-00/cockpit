import type { CharacterClass, Source } from '../rules/compendium';
import { ITEMS } from '../rules/srd/equipment';
import type { ChoiceOption, FeatureChoice } from './build';
import srdClassOptionData from '../../content/srd/class-options.json';

/** Provenance of the imported owner tables package. Individual book records do not identify a book edition. */
export const OWNER_TABLES_PROVENANCE = {
  id: 'owner-tables', version: '2026.10.31', layer: 'content-compendium-classes-json',
} as const;

export interface ImportedChoiceAdapter {
  classId: string;
  /** Class-level choices omit subclassId; branch choices bind to their exact subclass. */
  scope?: 'class' | 'subclass';
  subclassId?: string;
  featureId: string;
  optionBlockId: string;
  choiceId: string;
  /** Exact new-pick increments from the associated imported rule text. */
  gains: readonly { level: number; count: number }[];
  optionIds: readonly string[];
  source: Source;
  ruleset?: { id: string; version: string; layer: string };
  /** A verified option block may contain records from more than one source layer. */
  mixedOptionSources?: boolean;
  evidence: {
    requirement: 'classes[].levels[].features[].text' | 'subclasses[].features[].text';
    options: 'options[].items[]' | 'content/srd/equipment.json:items' | 'content/srd/class-options.json:classOptions[].choices.subfeature_options';
    bookEdition: 'not-marked-in-content' | 'not-applicable-srd';
  };
  /** Only Arcane Archer has an explicit block-to-subclass link in the import. */
  requireBlockSubclassLink: boolean;
  /** This feature explicitly permits replacing one previously learned option at each gain. */
  replaceOneKnown?: boolean;
  /** Candidate definitions may come from a curated external table instead of a class option block. */
  candidateSet?: 'srd-kensei-weapons' | 'srd-hunters-prey';
  notes?: readonly string[];
}

const book = 'book' as const;
const provenance = OWNER_TABLES_PROVENANCE;

type SrdClassOption = {
  id: string;
  classId: string;
  subclassId?: string;
  level: number;
  choices?: {
    subfeature_options?: {
      choose?: number;
      from?: { options?: readonly { item?: { index?: string; name?: string } }[] };
    };
  };
};

const srdClassOptions = (srdClassOptionData as unknown as { classOptions: readonly SrdClassOption[] }).classOptions;
const HUNTERS_PREY_LABELS: Readonly<Record<string, string>> = {
  'hunters-prey-colossus-slayer': 'Убийца колоссов',
  'hunters-prey-giant-killer': 'Убийца великанов',
  'hunters-prey-horde-breaker': 'Сокрушитель орд',
};

/** SRD API records are checked by stable IDs and source metadata; display labels use the local Russian table. */
function huntersPreyOptions(expectedIds: readonly string[]): ChoiceOption[] {
  const feature = srdClassOptions.find(item => item.id === 'hunters-prey');
  if (feature?.classId !== 'ranger' || feature.subclassId !== 'hunter' || feature.level !== 3) return [];
  const choice = feature.choices?.subfeature_options;
  if (choice?.choose !== 1) return [];
  const rawOptions = choice.from?.options ?? [];
  const rawIds = rawOptions.map(({ item }) => item?.index);
  const expected = new Set(expectedIds);
  const actual = new Set(rawIds.filter((id): id is string => typeof id === 'string'));
  if (rawOptions.length !== expectedIds.length || expected.size !== expectedIds.length
    || rawIds.some(id => typeof id !== 'string' || !expected.has(id))
    || actual.size !== expected.size || expectedIds.some(id => !actual.has(id) || !HUNTERS_PREY_LABELS[id])) return [];
  return rawOptions.flatMap(({ item }) => {
    const id = item?.index;
    const name = id ? HUNTERS_PREY_LABELS[id] : undefined;
    return id && name ? [{ id, name, source: 'srd' as const }] : [];
  });
}

/** Curated, source-aware adapters. This is intentionally not a parser for arbitrary imported text. */
export const IMPORTED_CHOICE_ADAPTERS: readonly ImportedChoiceAdapter[] = [
  {
    classId: 'voin', subclassId: 'voin-misticeskiy-lucnik', featureId: 'magiceskiy-vystrel',
    optionBlockId: 'varianty-magiceskogo-vystrela', choiceId: 'book-choice:voin:voin-misticeskiy-lucnik:magiceskiy-vystrel',
    gains: [{ level: 3, count: 2 }, { level: 7, count: 1 }, { level: 10, count: 1 }, { level: 15, count: 1 }, { level: 18, count: 1 }],
    optionIds: ['isusaa-strela', 'tenevaa-strela', 'izgonausaa-strela', 'pronzausaa-strela', 'vzryvnaa-strela', 'sjimausaa-strela', 'oslablausaa-strela', 'obmannaa-strela'],
    source: book, ruleset: provenance, requireBlockSubclassLink: true,
    evidence: { requirement: 'subclasses[].features[].text', options: 'options[].items[]', bookEdition: 'not-marked-in-content' },
    notes: ['На 18-м уровне варианты усиливаются; этот эффект здесь не рассчитывается.'],
  },
  {
    classId: 'koldun', scope: 'class', featureId: 'predmet-dogovora',
    optionBlockId: 'predmet-dogovora', choiceId: 'class-choice:koldun:predmet-dogovora',
    gains: [{ level: 3, count: 1 }],
    optionIds: ['dogovor-grimuara', 'dogovor-cepi', 'dogovor-talismana', 'dogovor-klinka'],
    source: 'srd', mixedOptionSources: true, requireBlockSubclassLink: false,
    evidence: { requirement: 'classes[].levels[].features[].text', options: 'options[].items[]', bookEdition: 'not-marked-in-content' },
    notes: ['Источник сохраняется отдельно для каждого варианта. Автоматические последствия договора пока не рассчитываются.'],
  },
  {
    classId: 'voin', subclassId: 'voin-master-boevyh-isskustv', featureId: 'boevoe-prevoshodstvo',
    optionBlockId: 'priemy', choiceId: 'book-choice:voin:voin-master-boevyh-isskustv:boevoe-prevoshodstvo',
    gains: [{ level: 3, count: 3 }, { level: 7, count: 2 }, { level: 10, count: 2 }, { level: 15, count: 2 }],
    optionIds: ['takticeskaa-ocenka', 'otvlekausiy-udar', 'otvetnyy-udar', 'ataka-s-ugrozoy', 'zamanit-i-pomenat-sa', 'parirovanie', 'sirokaa-ataka', 'oprokidyvausaa-ataka', 'bystryy-brosok', 'gotovnost', 'ataka-s-manevrom', 'prisutstvie-komandira', 'provociruusaa-ataka', 'tocnaa-ataka', 'tolkausaa-ataka', 'splocenie', 'zasada', 'udar-komanduusego', 'ataka-s-vypadom', 'aktivnoe-uklonenie', 'obezorujivausaa-ataka', 'ataka-s-zahvatom'],
    source: book, ruleset: provenance, requireBlockSubclassLink: false,
    replaceOneKnown: true,
    evidence: { requirement: 'subclasses[].features[].text', options: 'options[].items[]', bookEdition: 'not-marked-in-content' },
    notes: ['Источник разрешает заменить один ранее известный приём при каждом новом изучении. Механический эффект приёмов здесь не рассчитывается.'],
  },
  {
    classId: 'monah', subclassId: 'monah-kensea', featureId: 'put-kensea',
    optionBlockId: 'srd-kensei-weapons', choiceId: 'book-choice:monah:monah-kensea:put-kensea:weapons',
    gains: [{ level: 3, count: 2 }, { level: 6, count: 1 }, { level: 11, count: 1 }, { level: 17, count: 1 }],
    optionIds: [], candidateSet: 'srd-kensei-weapons',
    source: book, ruleset: provenance, requireBlockSubclassLink: false,
    evidence: { requirement: 'subclasses[].features[].text', options: 'content/srd/equipment.json:items', bookEdition: 'not-marked-in-content' },
    notes: ['На 3-м уровне требуется один рукопашный и один дальнобойный тип; на 6/11/17-м — один тип любой категории. Длинный лук разрешён отдельным исключением.', 'Выбор сохраняется с источником, но владение оружием не добавляется автоматически; эффекты подкласса остаются информационными.'],
  },
  {
    classId: 'sledopyt', subclassId: 'sledopyt-ohotnik', featureId: 'dobyca-ohotnika',
    optionBlockId: 'hunters-prey', choiceId: 'srd-choice:sledopyt:sledopyt-ohotnik:dobyca-ohotnika',
    gains: [{ level: 3, count: 1 }],
    optionIds: ['hunters-prey-colossus-slayer', 'hunters-prey-giant-killer', 'hunters-prey-horde-breaker'],
    source: 'srd', ruleset: { id: 'dnd5e', version: 'SRD 5.1', layer: 'srd' }, candidateSet: 'srd-hunters-prey',
    requireBlockSubclassLink: false,
    evidence: { requirement: 'subclasses[].features[].text', options: 'content/srd/class-options.json:classOptions[].choices.subfeature_options', bookEdition: 'not-applicable-srd' },
    notes: ['ID и источник выбора сохраняются при повышении до 3-го уровня. Боевой эффект выбранной способности автоматически не рассчитывается.'],
  },
];

export interface ImportedChoiceRecord {
  id: string;
  label: string;
  values: readonly { id: string }[];
}

export interface AdaptedChoice extends FeatureChoice {
  /** Omitted when individual options carry different source layers. */
  source?: Source;
  ruleset?: { id: string; version: string; layer: string };
  adapter: ImportedChoiceAdapter;
  /** All verified options, including values already recorded; `options` contains only available new picks. */
  allOptions: readonly ChoiceOption[];
  sourceCells: readonly { id: string; cell?: string }[];
  /** Total number known after this gain, summed only from the explicit schedule. */
  cumulativeCount: number;
  notes?: readonly string[];
  unavailableReason?: string;
  replacement?: { known: readonly ChoiceOption[]; options: readonly ChoiceOption[] };
  selectionGroups?: readonly { id: string; label: string; required: number; options: readonly ChoiceOption[] }[];
}

function kenseiWeaponGroups(existing: readonly string[], level: number) {
  const all = Object.values(ITEMS).filter(item => item.kind === 'weapon' && item.weapon
    && (item.weapon.properties.every(property => property !== 'heavy' && property !== 'special') || item.id === 'longbow'));
  const optionsFor = (range: 'melee' | 'ranged' | 'any'): ChoiceOption[] => all
    .filter(item => !existing.includes(item.id) && (range === 'any' || item.weapon!.range === range))
    .map(item => ({ id: item.id, name: item.name, text: `${item.weapon!.category === 'simple' ? 'Простое' : 'Воинское'} · ${item.weapon!.range === 'melee' ? 'рукопашное' : 'дальнобойное'}`, source: 'srd' }));
  return level === 3
    ? [
      { id: 'melee', label: 'Рукопашное оружие Кэнсэя', required: 1, options: optionsFor('melee') },
      { id: 'ranged', label: 'Дальнобойное оружие Кэнсэя', required: 1, options: optionsFor('ranged') },
    ]
    : [{ id: 'any', label: 'Новое оружие Кэнсэя', required: 1, options: optionsFor('any') }];
}

/** Resolve a curated schedule only at a listed acquisition level and against the exact imported IDs. */
export function importedChoicesOf(
  cls: CharacterClass, level: number, subclassId: string | undefined,
  saved: readonly ImportedChoiceRecord[] = [],
): AdaptedChoice[] {
  return IMPORTED_CHOICE_ADAPTERS.flatMap(adapter => {
    const scope = adapter.scope ?? 'subclass';
    if (adapter.classId !== cls.id) return [];
    if (scope === 'subclass' && adapter.subclassId !== subclassId) return [];
    if (scope === 'class' && adapter.subclassId) return [];
    const gain = adapter.gains.find(item => item.level === level);
    if (!gain) return [];
    const subclass = cls.subclasses.find(item => item.id === adapter.subclassId);
    if (scope === 'subclass' && subclass?.source !== adapter.source) return [];
    if (scope === 'class' && cls.source !== adapter.source) return [];
    const feature = scope === 'class'
      ? cls.levels.find(row => row.level === adapter.gains[0].level)?.features.find(item => item.id === adapter.featureId)
      : subclass?.features.find(item => item.id === adapter.featureId && item.level === adapter.gains[0].level);
    if (!feature) return [];
    const existing = saved.find(choice => choice.id === adapter.choiceId)?.values.map(value => value.id) ?? [];
    const block = adapter.candidateSet ? undefined : cls.options?.find(item => item.id === adapter.optionBlockId);
    const linked = adapter.candidateSet ? true
      : scope === 'class' ? block?.subclassId === undefined
        : adapter.requireBlockSubclassLink ? block?.subclassId === adapter.subclassId : block?.subclassId === undefined;
    const sourceOptions = adapter.candidateSet === 'srd-kensei-weapons'
      ? Object.values(ITEMS).filter(item => item.kind === 'weapon' && item.weapon
        && (item.weapon.properties.every(property => property !== 'heavy' && property !== 'special') || item.id === 'longbow'))
        .map(item => ({ id: item.id, name: item.name, text: item.text, source: 'srd' as const }))
      : adapter.candidateSet === 'srd-hunters-prey' ? huntersPreyOptions(adapter.optionIds)
      : linked ? (block?.items ?? []).filter(option =>
        adapter.optionIds.includes(option.id) && (adapter.mixedOptionSources || option.source === adapter.source),
      ) : [];
    const allOptions: ChoiceOption[] = sourceOptions.map(option => ({ id: option.id, name: option.name, text: option.text, source: option.source }));
    const options = allOptions.filter(option => !existing.includes(option.id));
    const selectionGroups = adapter.candidateSet === 'srd-kensei-weapons' ? kenseiWeaponGroups(existing, level) : undefined;
    const groupedOptions = selectionGroups?.flatMap(group => group.options);
    const availableOptions = groupedOptions ?? options;
    const replacement = adapter.replaceOneKnown && existing.length > 0 ? {
      known: sourceOptions.filter(option => existing.includes(option.id))
        .map(option => ({ id: option.id, name: option.name, text: option.text, source: option.source })),
      options,
    } : undefined;
    const issues = !linked ? 'Импортированный список выбора не соответствует проверенной привязке.'
      : adapter.candidateSet === 'srd-kensei-weapons' ? selectionGroups?.some(group => group.options.length < group.required) ? 'Недостаточно вариантов оружия SRD для соблюдения требований выбора.' : undefined
        : new Set(sourceOptions.map(option => option.id)).size !== adapter.optionIds.length ? 'Проверенный список вариантов в импортированных данных неполон или изменился.'
          : options.length < gain.count ? 'Недостаточно доступных вариантов из проверенного списка.' : undefined;
    return [{
      id: adapter.choiceId, label: feature.name, count: gain.count, level: adapter.gains[0].level,
      cumulativeCount: adapter.gains.filter(item => item.level <= level).reduce((total, item) => total + item.count, 0),
      text: feature.text, options: availableOptions, allOptions,
      ...(!adapter.mixedOptionSources ? { source: adapter.source, ...(adapter.ruleset ? { ruleset: adapter.ruleset } : {}) } : {}),
      adapter,
      sourceCells: sourceOptions.map(option => ({
        id: option.id,
        ...('cell' in option && option.cell != null ? { cell: String(option.cell) } : {}),
      })),
      ...(adapter.notes ? { notes: adapter.notes } : {}),
      ...(replacement ? { replacement } : {}),
      ...(selectionGroups ? { selectionGroups } : {}),
      ...(issues ? { unavailableReason: issues } : {}),
    }];
  });
}
