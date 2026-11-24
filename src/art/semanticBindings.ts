import type { ConditionId } from '../rules/srd/conditions';
import type { ArtId } from './registry.generated';
import type { IconName } from '../icons/Icon';

/** Explicit rule-entity bindings. These links affect presentation only, never rule values. */
export const CONDITION_ART: Readonly<Record<ConditionId, ArtId>> = {
  blinded: 'kimi-core-condition-blinded-v1',
  charmed: 'kimi-core-condition-charmed-v1',
  deafened: 'kimi-core-condition-deafened-v1',
  exhaustion: 'kimi-core-condition-exhaustion-v1',
  frightened: 'kimi-core-condition-frightened-v1',
  grappled: 'kimi-core-condition-grappled-v1',
  incapacitated: 'kimi-core-condition-incapacitated-v1',
  invisible: 'kimi-core-condition-invisible-v1',
  paralyzed: 'kimi-core-condition-paralyzed-v1',
  petrified: 'kimi-core-condition-petrified-v1',
  poisoned: 'kimi-core-sign-poisoned',
  prone: 'kimi-core-condition-prone-v1',
  restrained: 'kimi-core-condition-restrained-v1',
  stunned: 'kimi-core-condition-stunned-v1',
  unconscious: 'kimi-core-condition-unconscious-v1',
};
export const CONCENTRATION_ART: ArtId = 'kimi-core-sign-concentration';

/** 38 parent ancestry records; subraces do not inherit an image automatically. */
export const RACE_ART: Readonly<Record<string, ArtId>> = {
  celovek: 'codex-ancestry-human-v1',
  dvarf: 'codex-ancestry-dwarf-v1',
  'el-f': 'codex-ancestry-elf-v1',
  poluroslik: 'codex-ancestry-halfling-v1',
  gnom: 'codex-ancestry-gnom-v1',
  ork: 'codex-ancestry-ork-v1',
  poluork: 'codex-ancestry-poluork-v1',
  'poluel-f': 'codex-ancestry-poluel-f-v1',
  tifling: 'codex-ancestry-tifling-v1',
  drakonorojdennyy: 'codex-ancestry-drakonorojdennyy-v1',
  goblinoidy: 'codex-ancestry-goblinoidy-v1',
  gity: 'codex-ancestry-gity-v1',
  djenazi: 'codex-ancestry-djenazi-v1',
  sifter: 'codex-ancestry-sifter-v1',
  aasimar: 'codex-ancestry-aasimar-v1',
  'uan-ti': 'codex-ancestry-uan-ti-v1',
  vedalkin: 'codex-ancestry-vedalkin-v1',
  verdan: 'codex-ancestry-verdan-v1',
  'gibridy-simikov': 'codex-ancestry-gibridy-simikov-v1',
  grung: 'codex-ancestry-grung-v1',
  tortl: 'codex-ancestry-tortl-v1',
  triton: 'codex-ancestry-triton-v1',
  firbolg: 'codex-ancestry-firbolg-v1',
  aarakokra: 'codex-ancestry-aarakokra-v1',
  satir: 'codex-ancestry-satir-v1',
  tabaksi: 'codex-ancestry-tabaksi-v1',
  goliaf: 'codex-ancestry-goliaf-v1',
  izmenausiysa: 'codex-ancestry-izmenausiysa-v1',
  kalastar: 'codex-ancestry-kalastar-v1',
  kenku: 'codex-ancestry-kenku-v1',
  kovanyy: 'codex-ancestry-kovanyy-v1',
  'kobol-d': 'codex-ancestry-kobol-d-v1',
  leonin: 'codex-ancestry-leonin-v1',
  loksodon: 'codex-ancestry-loksodon-v1',
  lokata: 'codex-ancestry-lokata-v1',
  ludoaser: 'codex-ancestry-ludoaser-v1',
  minotavr: 'codex-ancestry-minotavr-v1',
  kentavr: 'codex-ancestry-kentavr-v1',
};

/** Separate authored portraits for these exact goblinoid subrace records; no parent-wide inheritance. */
export const SUBRACE_ART: Readonly<Record<string, ArtId>> = {
  'goblinoidy-gobliny': 'codex-ancestry-goblin-v1',
  'goblinoidy-hobgobliny': 'codex-ancestry-hobgoblin-v1',
  'goblinoidy-bagbir': 'codex-ancestry-bugbear-v1',
};

/** Twelve exact SRD spell ids from the first party-art batch. */
export const SPELL_ART: Readonly<Record<string, ArtId>> = {
  'hunters-mark': 'codex-spell-hunters-mark-v1',
  'cure-wounds': 'codex-spell-cure-wounds-v1',
  goodberry: 'codex-spell-goodberry-v1',
  'pass-without-trace': 'codex-spell-pass-without-trace-v1',
  'fire-bolt': 'codex-spell-fire-bolt-v1',
  'acid-splash': 'codex-spell-acid-splash-v1',
  'mage-hand': 'codex-spell-mage-hand-v1',
  prestidigitation: 'codex-spell-prestidigitation-v1',
  'sacred-flame': 'codex-spell-sacred-flame-v1',
  light: 'codex-spell-light-v1',
  thaumaturgy: 'codex-spell-thaumaturgy-v1',
  guidance: 'codex-spell-guidance-v1',
};

/** Exact school labels are the fallback artwork for spells without an individual illustration. */
export const SPELL_SCHOOL_ART: Readonly<Record<string, ArtId>> = {
  abjuration: 'kimi-core-school-abjuration-v1',
  conjuration: 'kimi-core-school-conjuration-v1',
  divination: 'kimi-core-school-divination-v1',
  enchantment: 'kimi-core-school-enchantment-v1',
  evocation: 'kimi-core-school-evocation-v1',
  illusion: 'kimi-core-school-illusion-v1',
  necromancy: 'kimi-core-school-necromancy-v1',
  transmutation: 'kimi-core-school-transmutation-v1',
};

/** Feature-kind illustrations back the existing class-feature and ancestry-trait glyph categories. */
export const FEATURE_KIND_ART: Readonly<Partial<Record<IconName, ArtId>>> = {
  'kind-claw': 'codex-kind-claw-v1',
  'kind-resist': 'codex-kind-resist-v1',
  'kind-save': 'codex-kind-save-v1',
  'kind-proficiency': 'codex-kind-proficiency-v1',
  'kind-tool': 'codex-kind-tool-v1',
  'kind-vision': 'codex-kind-vision-v1',
  'kind-sense': 'codex-kind-sense-v1',
  'kind-size': 'codex-kind-size-v1',
  'kind-bonus': 'codex-kind-bonus-v1',
  'kind-rest': 'codex-kind-rest-v1',
  'kind-aura': 'codex-kind-aura-v1',
  'kind-shape': 'codex-kind-shape-v1',
  'kind-other': 'codex-kind-other-v1',
};

export const EQUIPMENT_SLOT_ART: Readonly<Partial<Record<IconName, ArtId>>> = {
  'slot-head': 'codex-slot-head-v1',
  // These three are exact role reuses from the audited item series. They remain marks for an empty slot;
  // the slot label and fill state stay visible next to the illustration.
  'slot-neck': 'kimi-item-item-holy-symbol-generic-v1',
  'slot-cloak': 'codex-slot-cloak-v1',
  'slot-armor': 'kimi-item-item-chainmail-v1',
  'slot-hands': 'codex-slot-hands-v1',
  'slot-ring': 'codex-slot-ring-v1',
  'slot-belt': 'codex-slot-belt-v1',
  'slot-feet': 'codex-slot-feet-v1',
  'slot-weapon': 'kimi-item-item-shortsword-v1',
};

/** Exact map-catalog classes with an authored place mark. Unmatched classes keep their ordinary location glyph. */
export const PLACE_KIND_ART: Readonly<Partial<Record<string, ArtId>>> = {
  City: 'codex-place-city-v1',
  Town: 'codex-place-city-v1',
  Village: 'codex-place-village-v1',
  Fortification: 'codex-place-fortress-v1',
  fortress: 'codex-place-fortress-v1',
  Temple: 'codex-place-temple-v1',
  temple: 'codex-place-temple-v1',
  Inn: 'codex-place-tavern-v1',
  Ruins: 'codex-place-ruins-v1',
  ruins: 'codex-place-ruins-v1',
  Cave: 'codex-place-cave-v1',
  Mine: 'codex-place-mine-v1',
  mine: 'codex-place-mine-v1',
};


/** Canonical organization refs only; redbrands is explicitly an authored campaign mark. */
export const ORGANIZATION_ART: Readonly<Record<string, ArtId>> = {
  'organization:harpers': 'codex-faction-harpers-v1',
  'organization:lords-alliance': 'codex-faction-lords-alliance-v1',
  'organization:zhentarim': 'codex-faction-zhentarim-v1',
  'organization:church-of-lathander': 'codex-faith-lathander-v1',
  'organization:church-of-helm': 'codex-faith-helm-v1',
  'organization:redbrands': 'codex-faction-redbrands-v1',
};

export const DAY_PHASE_ART: Readonly<Record<string, ArtId>> = {
  morning: 'codex-sky-dawn-v1', day: 'codex-sky-day-v1', evening: 'codex-sky-dusk-v1', night: 'codex-sky-night-v1',
};
export const WEATHER_ART: Readonly<Record<string, ArtId>> = {
  clear: 'codex-sky-clear-v1', cloudy: 'codex-sky-cloudy-v1', rain: 'codex-sky-rain-v1', storm: 'codex-sky-storm-v1',
};
export const MOON_ART: Readonly<Record<string, ArtId>> = {
  new: 'codex-moon-new-v1', waxing: 'codex-moon-waxing-v1', full: 'codex-moon-full-v1', waning: 'codex-moon-waning-v1',
};
