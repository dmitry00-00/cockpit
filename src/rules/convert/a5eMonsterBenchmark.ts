/**
 * A5E SRD 19.1, Monstrous Menagerie, “Statistics for Monsters by Challenge Rating”.
 * CC BY 4.0. Used here as an explicit draft construction baseline, not as a claim that
 * WotC publishes an official 3.5 → 5e conversion rule.
 */
export interface MonsterBenchmark {
  cr: string;
  ac: number;
  hp: number;
  proficiencyBonus: number;
  abilityBonus: number;
  attacks: number;
  damagePerRound: number;
  easyDc: number;
  hardDc: number;
  xp: number;
}

export const MONSTER_BENCHMARK_SOURCE = {
  name: 'A5E SRD 19.1 · Monstrous Menagerie · Statistics for Monsters by Challenge Rating',
  url: 'https://static1.squarespace.com/static/63d11ec201a57a0efa51a168/t/64cc36970e922121bb4b6b9e/1691104922962/a5e_srd_19.1_monsters_A-F.pdf',
  license: 'CC BY 4.0',
  table: 'pages 12–13',
} as const;

/** Table transcribed from the cited SRD; no values are interpolated. */
export const MONSTER_BENCHMARKS: readonly MonsterBenchmark[] = [
  { cr: '0', ac: 12, hp: 3, proficiencyBonus: 2, abilityBonus: 0, attacks: 1, damagePerRound: 1, easyDc: 10, hardDc: 10, xp: 10 },
  { cr: '1/8', ac: 12, hp: 9, proficiencyBonus: 2, abilityBonus: 1, attacks: 1, damagePerRound: 3, easyDc: 11, hardDc: 11, xp: 25 },
  { cr: '1/4', ac: 12, hp: 15, proficiencyBonus: 2, abilityBonus: 1, attacks: 1, damagePerRound: 5, easyDc: 11, hardDc: 11, xp: 50 },
  { cr: '1/2', ac: 13, hp: 24, proficiencyBonus: 2, abilityBonus: 2, attacks: 1, damagePerRound: 8, easyDc: 12, hardDc: 12, xp: 100 },
  { cr: '1', ac: 13, hp: 30, proficiencyBonus: 2, abilityBonus: 2, attacks: 1, damagePerRound: 10, easyDc: 12, hardDc: 12, xp: 200 },
  { cr: '2', ac: 13, hp: 45, proficiencyBonus: 2, abilityBonus: 3, attacks: 2, damagePerRound: 15, easyDc: 13, hardDc: 13, xp: 450 },
  { cr: '3', ac: 14, hp: 60, proficiencyBonus: 2, abilityBonus: 3, attacks: 2, damagePerRound: 20, easyDc: 13, hardDc: 13, xp: 700 },
  { cr: '4', ac: 14, hp: 75, proficiencyBonus: 2, abilityBonus: 4, attacks: 2, damagePerRound: 25, easyDc: 13, hardDc: 14, xp: 1100 },
  { cr: '5', ac: 14, hp: 90, proficiencyBonus: 3, abilityBonus: 4, attacks: 2, damagePerRound: 30, easyDc: 14, hardDc: 15, xp: 1800 },
  { cr: '6', ac: 15, hp: 105, proficiencyBonus: 3, abilityBonus: 4, attacks: 2, damagePerRound: 35, easyDc: 14, hardDc: 15, xp: 2300 },
  { cr: '7', ac: 15, hp: 125, proficiencyBonus: 3, abilityBonus: 4, attacks: 2, damagePerRound: 40, easyDc: 14, hardDc: 15, xp: 2900 },
  { cr: '8', ac: 15, hp: 135, proficiencyBonus: 3, abilityBonus: 4, attacks: 2, damagePerRound: 45, easyDc: 14, hardDc: 15, xp: 3900 },
  { cr: '9', ac: 16, hp: 150, proficiencyBonus: 4, abilityBonus: 4, attacks: 2, damagePerRound: 50, easyDc: 15, hardDc: 16, xp: 5000 },
  { cr: '10', ac: 16, hp: 165, proficiencyBonus: 4, abilityBonus: 5, attacks: 2, damagePerRound: 55, easyDc: 15, hardDc: 17, xp: 5900 },
  { cr: '11', ac: 16, hp: 180, proficiencyBonus: 4, abilityBonus: 5, attacks: 3, damagePerRound: 60, easyDc: 15, hardDc: 17, xp: 7200 },
  { cr: '12', ac: 17, hp: 195, proficiencyBonus: 4, abilityBonus: 5, attacks: 3, damagePerRound: 65, easyDc: 15, hardDc: 17, xp: 8400 },
  { cr: '13', ac: 17, hp: 210, proficiencyBonus: 5, abilityBonus: 5, attacks: 3, damagePerRound: 70, easyDc: 15, hardDc: 18, xp: 10000 },
  { cr: '14', ac: 17, hp: 225, proficiencyBonus: 5, abilityBonus: 6, attacks: 3, damagePerRound: 75, easyDc: 15, hardDc: 19, xp: 11500 },
  { cr: '15', ac: 18, hp: 240, proficiencyBonus: 5, abilityBonus: 6, attacks: 3, damagePerRound: 80, easyDc: 15, hardDc: 19, xp: 13000 },
  { cr: '16', ac: 18, hp: 255, proficiencyBonus: 5, abilityBonus: 6, attacks: 3, damagePerRound: 85, easyDc: 15, hardDc: 19, xp: 15000 },
  { cr: '17', ac: 18, hp: 270, proficiencyBonus: 6, abilityBonus: 6, attacks: 4, damagePerRound: 90, easyDc: 16, hardDc: 20, xp: 18000 },
  { cr: '18', ac: 19, hp: 285, proficiencyBonus: 6, abilityBonus: 7, attacks: 4, damagePerRound: 95, easyDc: 16, hardDc: 21, xp: 20000 },
  { cr: '19', ac: 19, hp: 300, proficiencyBonus: 6, abilityBonus: 7, attacks: 4, damagePerRound: 100, easyDc: 16, hardDc: 21, xp: 22000 },
  { cr: '20', ac: 19, hp: 315, proficiencyBonus: 6, abilityBonus: 7, attacks: 4, damagePerRound: 105, easyDc: 16, hardDc: 21, xp: 25000 },
  { cr: '21', ac: 20, hp: 330, proficiencyBonus: 7, abilityBonus: 7, attacks: 4, damagePerRound: 110, easyDc: 17, hardDc: 22, xp: 33000 },
  { cr: '22', ac: 20, hp: 350, proficiencyBonus: 7, abilityBonus: 8, attacks: 4, damagePerRound: 116, easyDc: 17, hardDc: 23, xp: 41000 },
  { cr: '23', ac: 20, hp: 375, proficiencyBonus: 7, abilityBonus: 8, attacks: 4, damagePerRound: 125, easyDc: 17, hardDc: 23, xp: 50000 },
  { cr: '24', ac: 21, hp: 400, proficiencyBonus: 7, abilityBonus: 8, attacks: 4, damagePerRound: 133, easyDc: 17, hardDc: 23, xp: 62000 },
  { cr: '25', ac: 21, hp: 425, proficiencyBonus: 8, abilityBonus: 8, attacks: 4, damagePerRound: 141, easyDc: 18, hardDc: 24, xp: 75000 },
  { cr: '26', ac: 21, hp: 450, proficiencyBonus: 8, abilityBonus: 9, attacks: 4, damagePerRound: 150, easyDc: 18, hardDc: 25, xp: 90000 },
  { cr: '27', ac: 22, hp: 475, proficiencyBonus: 8, abilityBonus: 9, attacks: 4, damagePerRound: 158, easyDc: 18, hardDc: 25, xp: 105000 },
  { cr: '28', ac: 22, hp: 500, proficiencyBonus: 8, abilityBonus: 9, attacks: 4, damagePerRound: 166, easyDc: 18, hardDc: 25, xp: 120000 },
  { cr: '29', ac: 22, hp: 550, proficiencyBonus: 9, abilityBonus: 9, attacks: 4, damagePerRound: 183, easyDc: 19, hardDc: 26, xp: 135000 },
  { cr: '30', ac: 23, hp: 600, proficiencyBonus: 9, abilityBonus: 10, attacks: 4, damagePerRound: 200, easyDc: 19, hardDc: 27, xp: 155000 },
];
