import type { HomebrewMechanicRuntime, HomebrewRuntimeEffect, ImportedContent, State, WorldDelta } from '../engine/state';
import { generatedHomebrewMechanicData, validateGeneratedHomebrewMechanic } from './generatedHomebrewMechanic';

export const HOMEBREW_RUNTIME_EFFECT_LABELS: Readonly<Record<HomebrewRuntimeEffect, string>> = {
  damage: 'урон',
  healing: 'лечение',
  'temporary-hp': 'временные хиты',
};

export interface ResolvedHomebrewMechanicRuntime {
  binding: HomebrewMechanicRuntime;
  content: ImportedContent;
  claim: NonNullable<ReturnType<typeof generatedHomebrewMechanicData>>['numericPolicy']['numericAttributions'][number];
  amount: number;
}

/** First runtime slice: a manually attributed positive safe integer for an instant HP effect. */
export function homebrewRuntimeAmount(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{1,16}$/.test(value.trim())) return undefined;
  const amount = Number(value.trim());
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

export function homebrewMechanicRuntimeBindingError(state: State, binding: HomebrewMechanicRuntime): string | null {
  if (!binding || typeof binding !== 'object' || typeof binding.contentId !== 'string' || !binding.contentId.trim() ||
      typeof binding.numericClaimId !== 'string' || !binding.numericClaimId.trim() ||
      typeof binding.effect !== 'string' || !['damage', 'healing', 'temporary-hp'].includes(binding.effect)) return 'Runtime-связка HB указана не полностью.';
  const content = state.world.importedContent?.[binding.contentId];
  if (!content || content.kind !== 'mechanic') return 'Сначала примите HB-механику в каталог.';
  let formatError: string | null;
  try { formatError = validateGeneratedHomebrewMechanic(content); }
  catch { return 'HB-механика содержит некорректные данные.'; }
  if (formatError) return `HB-механика не прошла проверку: ${formatError}`;
  const data = generatedHomebrewMechanicData(content)!;
  const claim = data.numericPolicy.numericAttributions.find(item => item.id === binding.numericClaimId);
  if (!claim || claim.field !== 'effect') return 'Для runtime выберите отдельное атрибутированное число из поля «Эффект». Прикреплённые кости, DC, дальность и длительность пока не исполняются.';
  if (homebrewRuntimeAmount(claim.value) === undefined) return 'Сейчас runtime принимает только явно введённое положительное целое число для мгновенного эффекта хитов.';
  return null;
}

export function resolveHomebrewMechanicRuntime(state: State, binding: HomebrewMechanicRuntime): ResolvedHomebrewMechanicRuntime | undefined {
  if (homebrewMechanicRuntimeBindingError(state, binding)) return undefined;
  const content = state.world.importedContent![binding.contentId];
  const data = generatedHomebrewMechanicData(content)!;
  const claim = data.numericPolicy.numericAttributions.find(item => item.id === binding.numericClaimId)!;
  return { binding, content, claim, amount: homebrewRuntimeAmount(claim.value)! };
}

/** Event validation ties a runtime HP change to an active adapter and its exact attributed integer. */
export function homebrewMechanicRuntimeUseError(
  state: State,
  contentId: string,
  effect: HomebrewRuntimeEffect,
  amount: number,
): string | null {
  const binding = state.world.activeHomebrewMechanics?.[contentId];
  if (!binding) return 'Эта HB-механика не подключена к runtime.';
  if (binding.effect !== effect) return 'Тип HP-эффекта не совпадает с принятой runtime-связкой HB.';
  const resolved = resolveHomebrewMechanicRuntime(state, binding);
  if (!resolved) return homebrewMechanicRuntimeBindingError(state, binding) ?? 'Runtime-связка HB больше не действительна.';
  if (!Number.isSafeInteger(amount) || amount !== resolved.amount) return `Эффект должен точно использовать атрибутированное значение ${resolved.amount}.`;
  return null;
}

function containsRuntimePatch(patch: WorldDelta['patch'], contentId: string, kind: 'homebrewMechanicRuntime' | 'removeHomebrewMechanicRuntime'): boolean {
  if (!patch) return false;
  if (patch.kind === 'batch') return patch.patches.some(child => containsRuntimePatch(child, contentId, kind));
  return kind === 'homebrewMechanicRuntime'
    ? patch.kind === kind && patch.binding.contentId === contentId
    : patch.kind === kind && patch.id === contentId;
}

function uniqueDeltaId(state: State, base: string): string {
  let id = base;
  for (let suffix = 2; state.deltas[id]; suffix++) id = `${base}-${suffix}`;
  return id;
}

export function homebrewMechanicRuntimeDelta(
  state: State,
  contentId: string,
  numericClaimId: string,
  effect: HomebrewRuntimeEffect,
  sourceEventId: string,
): WorldDelta {
  const binding: HomebrewMechanicRuntime = { contentId, numericClaimId, effect };
  const error = homebrewMechanicRuntimeBindingError(state, binding);
  if (error) throw new Error(error);
  const resolved = resolveHomebrewMechanicRuntime(state, binding)!;
  if (state.world.activeHomebrewMechanics?.[contentId]) throw new Error('Эта механика уже подключена к runtime.');
  if (!sourceEventId.trim()) throw new Error('Не найдено событие, принявшее механику в каталог.');
  if (Object.values(state.deltas).some(delta => delta.status === 'pending' && containsRuntimePatch(delta.patch, contentId, 'homebrewMechanicRuntime'))) {
    throw new Error('Предложение подключения этой механики уже ждёт решения.');
  }
  const id = uniqueDeltaId(state, `d-homebrew-runtime-${contentId}`);
  return {
    id,
    scale: 'battle',
    subject: `Подключение HB-механики · ${resolved.content.name}`,
    was: 'runtime-адаптер не задан',
    now: `${HOMEBREW_RUNTIME_EFFECT_LABELS[effect]} · ${resolved.claim.label}: ${resolved.claim.value} · требует ручного применения мастером`,
    cause: `Мастер явно связал ${resolved.claim.id} с ограниченным эффектом «${HOMEBREW_RUNTIME_EFFECT_LABELS[effect]}». Адаптер не исполняет условие, цену, дальность, длительность, атаку или спасбросок из текста.`,
    causeId: sourceEventId,
    status: 'pending',
    patch: { kind: 'homebrewMechanicRuntime', binding },
  };
}

export function homebrewMechanicRuntimeDeactivationDelta(
  state: State,
  contentId: string,
  sourceEventId: string,
): WorldDelta {
  const binding = state.world.activeHomebrewMechanics?.[contentId];
  if (!binding) throw new Error('Эта механика не подключена к runtime.');
  if (!sourceEventId.trim()) throw new Error('Не найдено событие, принявшее runtime-связку.');
  if (Object.values(state.deltas).some(delta => delta.status === 'pending' && containsRuntimePatch(delta.patch, contentId, 'removeHomebrewMechanicRuntime'))) {
    throw new Error('Предложение отключения этой механики уже ждёт решения.');
  }
  const resolved = resolveHomebrewMechanicRuntime(state, binding);
  if (!resolved) throw new Error(homebrewMechanicRuntimeBindingError(state, binding) ?? 'Runtime-связка HB больше не действительна.');
  const id = uniqueDeltaId(state, `d-homebrew-runtime-off-${contentId}`);
  return {
    id,
    scale: 'battle',
    subject: `Отключение HB-механики · ${resolved.content.name}`,
    was: `${HOMEBREW_RUNTIME_EFFECT_LABELS[binding.effect]} · ${resolved.claim.label}: ${resolved.claim.value}`,
    now: 'runtime-адаптер отключён; ранее записанные эффекты остаются в журнале',
    cause: 'Мастер отдельно отключает runtime-связку. События и хиты, записанные при её использовании, не удаляются.',
    causeId: sourceEventId,
    status: 'pending',
    patch: { kind: 'removeHomebrewMechanicRuntime', id: contentId },
  };
}
