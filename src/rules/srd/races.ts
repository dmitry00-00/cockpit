// Расы 5e SRD 5.1: скорость и размер (CC-BY-4.0, см. LICENSE.md). Таблицы компендиума держат черты прозой
// («Speed: Your base walking speed is 30 feet»), числом — нет, а лист персонажа показывает скорость числом.
// Ключ — английское имя расы в компендиуме (`Race.name`) в нижнем регистре. Подрасы SRD скорость не меняют,
// кроме лесного эльфа (35) — он в SRD не входит, поэтому здесь его нет.
// Сверено с https://www.dnd5eapi.co/api/2014/races/<id>, снято 2026-09-21.

export const SRD_RACE_IDS = [
  'dragonborn', 'dwarf', 'elf', 'gnome', 'half-elf', 'half-orc', 'halfling', 'human', 'tiefling',
] as const;
export type SrdRaceId = (typeof SRD_RACE_IDS)[number];

export interface SrdRace {
  id: SrdRaceId;
  name: string;
  /** Базовая скорость ходьбы, футов. */
  speed: number;
  size: 'Small' | 'Medium';
}

export const SRD_RACES: Readonly<Record<SrdRaceId, SrdRace>> = {
  dragonborn: { id: 'dragonborn', name: 'Dragonborn', speed: 30, size: 'Medium' },
  dwarf: { id: 'dwarf', name: 'Dwarf', speed: 25, size: 'Medium' },
  elf: { id: 'elf', name: 'Elf', speed: 30, size: 'Medium' },
  gnome: { id: 'gnome', name: 'Gnome', speed: 25, size: 'Small' },
  'half-elf': { id: 'half-elf', name: 'Half-Elf', speed: 30, size: 'Medium' },
  'half-orc': { id: 'half-orc', name: 'Half-Orc', speed: 30, size: 'Medium' },
  halfling: { id: 'halfling', name: 'Halfling', speed: 25, size: 'Small' },
  human: { id: 'human', name: 'Human', speed: 30, size: 'Medium' },
  tiefling: { id: 'tiefling', name: 'Tiefling', speed: 30, size: 'Medium' },
};

export function isSrdRaceId(value: string): value is SrdRaceId {
  return (SRD_RACE_IDS as readonly string[]).includes(value);
}

/** Размер расы по английскому имени из компендиума; расы вне SRD — undefined. */
export function srdRaceSize(raceName: string): SrdRace['size'] | undefined {
  const id = raceName.toLowerCase();
  return isSrdRaceId(id) ? SRD_RACES[id].size : undefined;
}

/** Скорость расы по английскому имени из компендиума; расы вне SRD — undefined. */
export function srdRaceSpeed(raceName: string): number | undefined {
  const id = raceName.toLowerCase();
  return isSrdRaceId(id) ? SRD_RACES[id].speed : undefined;
}
