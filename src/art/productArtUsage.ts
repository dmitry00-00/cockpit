import { CONDITIONS } from '../rules/srd/conditions';
import { SPELL_LIST } from '../rules/srd/spells';
import { CLASSES, RACES } from '../rules/compendium';
import { classIcon } from '../components/sheetIcons';
import { ART, type ArtId } from './registry.generated';
import { CLASS_ART } from './ClassEmblem';
import { ABILITY_ART, SKILL_ART } from './RuleMark';
import { PRODUCT_MATERIAL_ART } from './MaterialArtwork';
import { BUILT_IN_PORTRAITS, BUILT_IN_PORTRAIT_LABELS } from './portraitIds';
import { CONCENTRATION_ART, CONDITION_ART, DAY_PHASE_ART, EQUIPMENT_SLOT_ART, FEATURE_KIND_ART, MOON_ART, ORGANIZATION_ART, PLACE_KIND_ART, RACE_ART, SPELL_ART, SPELL_SCHOOL_ART, SUBRACE_ART, WEATHER_ART } from './semanticBindings';
import { FIRST_PACK_GENERIC_SHOPKEEPER_ART, FIRST_PACK_ITEM_ART, FIRST_PACK_NODE_ART, TRAVEL_ITEM_ART } from './firstPackArtwork';

const uses: Partial<Record<ArtId, string[]>> = {};
function bind(asset: ArtId, role: string) {
  if (!ART[asset]) return;
  (uses[asset] ??= []).push(role);
}

for (const [icon, asset] of Object.entries(CLASS_ART)) {
  if (!asset) continue;
  const cls = CLASSES.find(candidate => classIcon(candidate.id) === icon);
  bind(asset, `Эмблема класса: ${cls?.nameRu ?? icon}`);
}
for (const asset of Object.values(ABILITY_ART)) bind(asset, `Знак характеристики: ${ART[asset].label}`);
for (const [skill, asset] of Object.entries(SKILL_ART)) bind(asset, `Знак навыка: ${ART[asset].label}${skill === 'stealth' ? ' · карта персонажа' : ''}`);
for (const [condition, asset] of Object.entries(CONDITION_ART)) {
  bind(asset, `Состояние SRD: ${CONDITIONS[condition as keyof typeof CONDITIONS].label}`);
}
bind(CONCENTRATION_ART, 'Концентрация · чип состояния персонажа');
for (const race of RACES) {
  const asset = RACE_ART[race.id];
  if (asset) bind(asset, `Происхождение: ${race.nameRu} · выбор в редакторе и партия без портрета`);
  for (const subrace of race.subraces) {
    const subraceAsset = SUBRACE_ART[subrace.id];
    if (subraceAsset) bind(subraceAsset, `Подраса: ${subrace.nameRu} · выбор в редакторе и партия без портрета`);
  }
}
for (const spell of SPELL_LIST) {
  const asset = SPELL_ART[spell.id];
  if (asset) bind(asset, `Заклинание SRD: ${spell.name} · лист персонажа`);
}
for (const asset of Object.values(SPELL_SCHOOL_ART)) bind(asset, `Школа заклинания · лист персонажа · ${ART[asset].label}`);
for (const asset of Object.values(FEATURE_KIND_ART)) {
  if (asset) bind(asset, `Категория классовой/расовой особенности · лист персонажа · ${ART[asset].label}`);
}
for (const asset of Object.values(DAY_PHASE_ART)) bind(asset, `Фаза суток · полоса времени и календарь · ${ART[asset].label}`);
for (const asset of Object.values(WEATHER_ART)) bind(asset, `Погода · полоса времени · ${ART[asset].label}`);
for (const asset of Object.values(MOON_ART)) bind(asset, `Фаза Selûne · календарь и панель времени · ${ART[asset].label}`);
for (const asset of Object.values(EQUIPMENT_SLOT_ART)) {
  if (asset) bind(asset, `Слот экипировки · бумажная кукла персонажа · ${ART[asset].label}`);
}
for (const [kind, asset] of Object.entries(PLACE_KIND_ART)) {
  if (asset) bind(asset, `Тип места справочника карты «${kind}» · карточка места и пин мастера`);
}
for (const [subject, asset] of Object.entries(ORGANIZATION_ART)) {
  bind(asset, `Профиль ${subject} · ${ART[asset].label}`);
}
for (const portrait of BUILT_IN_PORTRAITS) {
  bind(portrait, `Портрет персонажа: ${BUILT_IN_PORTRAIT_LABELS[portrait]} · редактор, карточка, полный лист и проекция игроков`);
}

const materialRoles: Readonly<Record<string, string>> = {
  'kimi-material-material-dark-wood-v1': 'Поверхность шапки партии',
  'kimi-material-material-plum-leather-v1': 'Фактура карточки персонажа',
  'kimi-material-material-warm-paper-v1': 'Фон журнала',
  'kimi-material-trim-bronze-strip-v1': 'Кромка заголовка полного листа',
  'kimi-material-trim-bronze-corner-v1': 'Уголки предпросмотра портрета в редакторе',
  'kimi-material-ornament-wax-seal-v1': 'Оттиск записи тетради',
};
for (const asset of PRODUCT_MATERIAL_ART) bind(asset, materialRoles[asset] ?? 'Материал продукта');

for (const [nodeId, asset] of Object.entries(FIRST_PACK_NODE_ART)) {
  bind(asset, `Пакет «Шахты Фанделвера»: узел ${nodeId} · AdventurePreview`);
}
bind(FIRST_PACK_GENERIC_SHOPKEEPER_ART, 'Пакет «Шахты Фанделвера»: общий образ лавочника у Barthen’s Provisions; не портрет Эльмара/Эльмины');
for (const [itemId, asset] of Object.entries(FIRST_PACK_ITEM_ART)) {
  bind(asset, `Предмет SRD ${itemId} · инвентарь`);
}
for (const [itemId, asset] of Object.entries(TRAVEL_ITEM_ART)) bind(asset, `Предмет SRD ${itemId} · инвентарь`);

export const PRODUCT_ART_USAGE: Readonly<Partial<Record<ArtId, readonly string[]>>> = uses;
export const productArtUsage = (asset: ArtId): readonly string[] => PRODUCT_ART_USAGE[asset] ?? [];
export const productArtBindingCount = Object.keys(PRODUCT_ART_USAGE).length;
