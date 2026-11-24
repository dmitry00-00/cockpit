/** A5E SRD §12 Mental Stress Effects (CC BY 4.0): https://a5esrd.com/s/a5e_srd_12.pdf */
export const A5E_SHORT_STRESS_EFFECTS = [
  'bewildered', 'cowed', 'distraught', 'enraged', 'flippant',
  'musical', 'obsessed', 'on-edge', 'sleepless', 'terrorized',
] as const;

export const A5E_LONG_STRESS_EFFECTS = [
  'covetous', 'distorted-perceptions', 'hopeless', 'inimical', 'memory-wipe',
  'murderous', 'peacekeeping', 'phobia', 'superstitious', 'suspicious',
] as const;

export type A5eStressEffectId = typeof A5E_SHORT_STRESS_EFFECTS[number] | typeof A5E_LONG_STRESS_EFFECTS[number];
export type A5eStressEffect = { kind: 'short'; id: typeof A5E_SHORT_STRESS_EFFECTS[number]; untilSec: number }
  | { kind: 'long'; id: typeof A5E_LONG_STRESS_EFFECTS[number] };

const NAMES: Readonly<Record<A5eStressEffectId, string>> = {
  bewildered: 'Растерянность', cowed: 'Подавленность', distraught: 'Потрясённость', enraged: 'Ярость', flippant: 'Легкомыслие',
  musical: 'Музыкальность', obsessed: 'Одержимость', 'on-edge': 'Настороженность', sleepless: 'Бессонница', terrorized: 'Ужас',
  covetous: 'Алчность', 'distorted-perceptions': 'Искажённое восприятие', hopeless: 'Безнадёжность', inimical: 'Враждебность',
  'memory-wipe': 'Потеря памяти', murderous: 'Кровожадность', peacekeeping: 'Миротворчество', phobia: 'Фобия', superstitious: 'Суеверие', suspicious: 'Подозрительность',
};

/** Paraphrased from A5E SRD §12 (CC BY 4.0); reminders cover clauses the tracker cannot infer from a roll alone. */
export const A5E_STRESS_EFFECT_REMINDERS: Readonly<Record<A5eStressEffectId, string>> = {
  bewildered: 'При успехе любой проверки характеристики бросьте ещё d20: 1–15 сохраняет успех, 16–20 отменяет его. На социальных проверках уже применяется помеха.',
  cowed: 'После любого полученного урона в бою на следующем ходу персонаж тратит всё движение на Dash к безопасности; если безопасно уйти нельзя — Dodge.',
  distraught: 'Раз за долгий отдых можно получить преимущество, прося нейтрального или дружелюбного персонажа о помощи. Помеха на Deception, Performance и инициативу применяется автоматически.',
  enraged: 'Преимущество на проверки Силы и помеха на остальные проверки применяются автоматически. После проваленной проверки персонаж бросает или ломает задействованные предметы/инструменты.',
  flippant: 'Преимущество на проверки Ловкости, помеха на проверки Мудрости и все спасброски применяются автоматически.',
  musical: 'Преимущество на Performance и помеха на Deception, Intimidation и Stealth применяются автоматически.',
  obsessed: 'Помеха на Stealth применяется автоматически. При начале боя уже проводится спасбросок Мудрости Сл 15; провал пропускает первый раунд действий.',
  'on-edge': 'Преимущество на Perception и инициативу, помеха на остальные проверки применяются автоматически.',
  sleepless: 'При долгом отдыхе проводится спасбросок Мудрости Сл 15. При провале остаются только преимущества короткого отдыха; проверки Perception для поиска опасности во время такого отдыха получают преимущество.',
  terrorized: 'Перед приближением ближе 30 футов к незнакомцу или участием в ближнем бою нужен спасбросок Мудрости Сл 15; при провале персонаж отступает/Dash. Для сна нужны разумные меры безопасности. Контекстные броски доступны на карточке.',
  covetous: 'Преимущество на Sleight of Hand, помеха на спасброски Мудрости и на Deception о присвоенной вещи применяются автоматически при указанном контексте.',
  'distorted-perceptions': 'Если итог Perception не выше пассивного Perception, мастер описывает краткое искажение детали/галлюцинацию. Карточка покажет подсказку после такого броска.',
  hopeless: 'Помеха на инициативу применяется автоматически. Для Persuasion, отговаривающего от действия, выберите соответствующий контекст проверки.',
  inimical: 'Став кровавым (половина хитов или меньше), на следующем ходу персонаж атакует ближайшее существо с помехой. Помеха действует на проверки и спасброски против захвата или опутывания.',
  'memory-wipe': 'Помеха действует на проверки Arcana, History, Nature, Religion и другие проверки воспоминаний/знаний; для последних выберите контекст «вспомнить знания».',
  murderous: 'При первом признаке конфликта персонаж атакует первым; помеха на инициативу применяется автоматически. Первая атака каждого хода получает преимущество (до 5 раундов); Calm Emotions или Persuasion Сл 18 могут завершить эффект раньше.',
  peacekeeping: 'Каждый ход персонаж тратит действия на ненасильственную попытку прекратить бой, пока он или союзник не стал кровавым. Помеха на инициативу автоматическая; для первой проверки завершить бой выберите контекст.',
  phobia: 'При встрече с предметом фобии спасбросок Мудрости Сл 18: провал — испуган на 1 минуту (по решению мастера возможна недееспособность); в конце каждого хода спасбросок повторяется.',
  superstitious: 'Мастер отмечает талисман. Дальше 30 футов от него атаки и спасброски с помехой; Investigation/Perception для поиска талисмана с преимуществом. Контекст броска выбирается на карточке.',
  suspicious: 'Преимущество на Sleight of Hand и Perception для поиска скрытых врагов, помеха на Insight применяются автоматически при явном контексте.',
};

/** Action-economy restrictions are surfaced on the actor card; the combat tracker does not spend actions or cast spells. */
export const A5E_STRIFE_LEVEL_REMINDERS: Readonly<Record<3 | 6 | 7, string>> = {
  3: 'За ход можно совершить действие или бонусное действие, но не оба.',
  6: 'Нельзя накладывать заклинания; заговоры разрешены.',
  7: 'Помимо долгосрочного эффекта таблицы, A5E требует особое постоянное последствие по решению Рассказчика.',
};

export function isA5eStressEffectId(value: string): value is A5eStressEffectId {
  return value in NAMES;
}

export function isA5eStressEffect(value: unknown): value is A5eStressEffect {
  if (!value || typeof value !== 'object') return false;
  const effect = value as Partial<A5eStressEffect>;
  if (effect.kind === 'short') return typeof effect.id === 'string' && A5E_SHORT_STRESS_EFFECTS.includes(effect.id as typeof A5E_SHORT_STRESS_EFFECTS[number])
    && Number.isFinite(effect.untilSec) && (effect.untilSec ?? 0) > 0;
  if (effect.kind === 'long') return typeof effect.id === 'string' && A5E_LONG_STRESS_EFFECTS.includes(effect.id as typeof A5E_LONG_STRESS_EFFECTS[number]);
  return false;
}

export function a5eStressEffectName(id: A5eStressEffectId): string {
  return NAMES[id];
}

export function activeA5eStressEffect(effect: A5eStressEffect | undefined, nowSec: number): A5eStressEffect | undefined {
  return effect && (effect.kind === 'long' || effect.untilSec > nowSec) ? effect : undefined;
}
