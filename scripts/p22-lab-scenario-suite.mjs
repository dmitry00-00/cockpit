import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fileDigest = async path => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
const bundleDigest = async paths => {
  const entries = await Promise.all([...paths].sort().map(async path => [path, await fileDigest(path)]));
  return `sha256:${createHash('sha256').update(JSON.stringify(entries)).digest('hex')}`;
};

const dndPaths = [
  'src/campaign/derive.ts', 'src/engine/inventory.ts', 'src/rules/srd/travel.ts',
  'src/rules/srd/abilities.ts', 'src/rules/compendium/index.ts',
  'content/compendium/classes.json', 'content/compendium/races.json',
];
const scenePaths = [
  'src/campaign/scene.ts', 'src/campaign/calendar.ts', 'src/campaign/era.ts', 'src/campaign/holyDays.ts',
  'src/campaign/pulse.ts', 'src/campaign/tensions.ts', 'src/campaign/weather.ts', 'src/campaign/war.ts',
  'src/engine/state.ts', 'src/components/labels.ts', 'src/entities/ref.ts',
  'src/rules/a5e/journey.ts', 'src/rules/srd/monsters.ts', 'src/world/chronology.ts',
  'src/world/organizations.ts', 'src/world/people.ts', 'src/packages/index.generated.ts',
];
const scenarioDigest = await bundleDigest(['src/lab/scenarios.ts', 'src/lab/contract.ts']);
const digests = {
  kernel: scenarioDigest,
  homebrew: await bundleDigest(['src/lab/scenarios.ts', 'src/rules/generation/crMonster.ts']),
  dndSrd: await bundleDigest(dndPaths),
  a5eSrd: await bundleDigest(['src/rules/convert/a5eMonsterBenchmark.ts']),
  scene: await bundleDigest(scenePaths),
};

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [], entries: [] },
  server: { middlewareMode: true },
  appType: 'custom',
});

let report;
try {
  const { runP22ScenarioSuite } = await server.ssrLoadModule('/src/lab/scenarios.ts');
  report = await runP22ScenarioSuite(digests);
} finally {
  await server.close();
}

assert.equal(report.scenarios.length, 5, 'В первой версии должны быть пять сценариев по семействам сущностей.');
assert.deepEqual(new Set(report.scenarios.map(scenario => scenario.family)), new Set(['character', 'monster-npc', 'item', 'scene', 'place']));
assert.deepEqual(report.acceptance, {
  allFamiliesCovered: true,
  allVariantsRepeatable: true,
  allComparisonsUseSameInputs: true,
  campaignEventWrites: 0,
  activeCampaignWrites: 0,
});
for (const scenario of report.scenarios) {
  for (const variant of scenario.variants) {
    assert.equal(variant.replay.identical, true, `${scenario.id}/${variant.id} должен повториться с теми же отпечатками.`);
    assert.equal(variant.report.executionBoundary.campaignStateCapabilityProvided, false);
    assert.equal(variant.report.executionBoundary.campaignWriteCapabilityProvided, false);
    assert.equal(variant.report.proposalDrafts.length, 0, 'Сценарный прогон не должен предлагать активацию.');
  }
}

const scenario = id => report.scenarios.find(item => item.id === id);
const variant = (scenarioId, variantId) => scenario(scenarioId).variants.find(item => item.id === variantId).report;
assert.equal(variant('p22.character.ability-modifier', 'srd-floor').result.payload.modifier, 2);
assert.equal(variant('p22.character.ability-modifier', 'hb-nearest').result.payload.modifier, 3);
assert.equal(variant('p22.item.attunement-restrictions', 'moonlight-clause').result.payload.status, 'unsupported');
assert.equal(variant('p22.scene.player-and-gm-projections', 'gm-view').result.payload.dmSecretVisible, true);
assert.equal(variant('p22.scene.player-and-gm-projections', 'player-view').result.payload.dmSecretVisible, false);
assert.equal(variant('p22.place.travel-time', 'normal-pace').result.payload.days, 3.5);
assert.equal(variant('p22.place.travel-time', 'fast-pace').result.payload.days, 2.8);
assert.equal(variant('p22.place.travel-time', 'normal-plus-stop').result.payload.days, 4.5);

const outputDir = resolve(root, 'research/simulation');
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'p22-scenario-suite.json'), `${JSON.stringify(report, null, 2)}\n`);

const scalar = value => typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
const markdown = [
  '# П22 — повторяемый набор сценариев игровой лаборатории',
  '',
  '**Срез:** 19 ноября 2026 года.',
  '**Статус:** первая исполняемая матрица покрытия готова; она не является исчерпывающей проверкой всей системы.',
  '',
  '## Результат приёмки',
  '',
  `- Семейств покрыто: ${new Set(report.scenarios.map(item => item.family)).size} из 5.`,
  `- Варианты повторяются с теми же SHA-256 отпечатками: ${report.acceptance.allVariantsRepeatable ? 'да' : 'нет'}.`,
  `- Варианты сравниваются на одинаковом снимке входа: ${report.acceptance.allComparisonsUseSameInputs ? 'да' : 'нет'}.`,
  '- Записей в журнал кампании и изменений активной кампании: 0.',
  '- Сценарии не активируют места, NPC, предметы, предложения или мир.',
  '',
  'Каждый запуск хранит снимок, версию сценария и ядра, набор правил и его digest, параметры, происхождение чисел, допущения, отпечатки запуска/результата и явную границу без доступа к кампании. Повторный запуск каждого варианта сверяется с исходными отпечатками.',
  '',
  '## Сценарии',
  '',
  '| Семейство | Фиксированный сценарий и варианты | Сравнение | Пробелы и неподдержанные взаимодействия |',
  '|---|---|---|---|',
  ...report.scenarios.map(item => {
    const variants = item.variants.map(candidate => `${candidate.title} (${candidate.evidenceClass})`).join('<br>');
    const comparisons = item.comparisons.map(comparison => {
      const diff = comparison.changedResultPaths.length ? comparison.changedResultPaths.join(', ') : 'без изменения';
      return `${comparison.baselineVariantId} → ${comparison.comparedVariantId}: ${diff}`;
    }).join('<br>');
    return `| ${item.family} | ${item.title}<br>${variants} | ${comparisons} | ${[...item.coverageGaps, ...item.unsupportedInteractions].join('<br>')} |`;
  }),
  '',
  '## Срез результатов',
  '',
  '| Сценарий | Вариант | Результат |',
  '|---|---|---|',
  ...report.scenarios.flatMap(item => item.variants.map(candidate => {
    const payload = candidate.report.result.payload;
    const brief = item.family === 'character' ? `модификатор ${payload.modifier}`
      : item.family === 'monster-npc' ? `AC ${payload.ac}, HP ${payload.hpAverage}, атака ${payload.attackBonus}, диагностический CR ${payload.diagnosticCr}`
      : item.family === 'item' ? `настройка: ${payload.status}`
      : item.family === 'scene' ? `слух виден: ${payload.publicRumorVisible}; секрет виден: ${payload.dmSecretVisible}`
      : `${payload.days} дня, темп ${payload.pace}`;
    return `| ${item.family} | ${candidate.title} | ${brief} |`;
  })),
  '',
  '## Что считается известным правилом',
  '',
  '- Модификатор характеристики: SRD 5.1, формула `floor((score − 10) / 2)`; вариант округления к ближайшему помечен как HB-гипотеза.',
  '- Путешествие: темп и трудный участок по SRD 5.1; дополнительный день задержки помечен как HB-гипотеза.',
  '- Генерация монстра: отдельные значения таблицы берутся из A5E SRD 19.1 (CC BY 4.0); профиль генерации и итоговая CR-оценка остаются кандидатом/HB, а не официальной процедурой D&D 5e.',
  '- Ограничения настройки предмета — вымышленная карточка для проверки evaluator; условие места/времени явно возвращает `unsupported`.',
  '- Проверка сцены относится к инварианту интерфейса: игрок видит открытый слух и не получает заметку мастера.',
  '',
  'Полные определения и отчёты по каждому варианту лежат в `p22-scenario-suite.json`. Повторить проверку: `node scripts/p22-lab-scenario-suite.mjs`.',
  '',
].join('\n');
await writeFile(resolve(outputDir, 'P22_SCENARIO_SUITE_2026-11-19.md'), markdown);

console.log(`П22: ${report.scenarios.length} сценариев, ${report.scenarios.reduce((count, item) => count + item.variants.length, 0)} вариантов; повторяемость и отсутствие записи в кампанию подтверждены.`);
