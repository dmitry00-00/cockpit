import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceDigest = `sha256:${createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex')}`;
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [], entries: [] },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { parseLabRunDefinition, runIsolatedLab, serializeLabRunDefinition } = await server.ssrLoadModule('/src/lab/contract.ts');
  const definition = {
    format: 'dm-cockpit.isolated-lab-run',
    schemaVersion: 1,
    scenario: {
      id: 'p21-contract-arithmetic-example',
      version: '1.0.0',
      kind: 'mechanic',
      title: 'Пример происхождения чисел',
      sourceRef: 'scripts/p21-lab-contract-demo.mjs#scenario',
    },
    engine: {
      id: 'p21-contract-demo-kernel',
      version: '1.0.0',
      sourceRef: 'scripts/p21-lab-contract-demo.mjs#kernel',
      contentDigest: sourceDigest,
    },
    rulesets: [{
      id: 'demo-homebrew-rules',
      system: 'DM Cockpit contract demo',
      edition: 'illustrative',
      version: '1.0.0',
      layer: 'HB',
      sourceRef: 'scripts/p21-lab-contract-demo.mjs#kernel',
      contentDigest: sourceDigest,
      license: 'internal demonstration',
    }],
    packages: [],
    inputs: [{
      id: 'saved-input-1',
      version: '1.0.0',
      kind: 'other',
      sourceRef: 'scripts/p21-lab-contract-demo.mjs#saved-input',
      payload: { left: 2, right: 3 },
      numericFacts: [
        { id: 'left-input', path: '/left', value: 2, origin: { kind: 'homebrew', rulesetId: 'demo-homebrew-rules', note: 'Условное число демонстрационного сценария.' } },
        { id: 'right-input', path: '/right', value: 3, origin: { kind: 'homebrew', rulesetId: 'demo-homebrew-rules', note: 'Условное число демонстрационного сценария.' } },
      ],
    }],
    parameters: {
      id: 'parameters-1',
      version: '1.0.0',
      sourceRef: 'scripts/p21-lab-contract-demo.mjs#parameters',
      payload: { operation: 'sum', sides: 20 },
      numericFacts: [{
        id: 'die-sides',
        path: '/sides',
        value: 20,
        origin: { kind: 'homebrew', rulesetId: 'demo-homebrew-rules', note: 'Условный параметр демонстрационного генератора.' },
      }],
    },
    assumptions: [{
      id: 'demo-is-not-a-game-rule',
      status: 'assumed',
      statement: 'Демонстрационная сумма иллюстрирует только формат, а не механику D&D.',
      sourceRef: 'scripts/p21-lab-contract-demo.mjs#kernel',
    }],
    randomness: { mode: 'seeded', seed: 'p21-demo-seed-1', algorithm: 'mulberry32-v1' },
  };
  const kernel = {
    id: definition.engine.id,
    version: definition.engine.version,
    sourceRef: definition.engine.sourceRef,
    contentDigest: definition.engine.contentDigest,
    run(context) {
      const input = context.inputs[0];
      const left = input.payload.left;
      const right = input.payload.right;
      const result = left + right;
      const randomSample = context.random.die(context.parameters.payload.sides);
      return {
        result: {
          id: 'result-1',
          version: '1.0.0',
          sourceRef: 'scripts/p21-lab-contract-demo.mjs#kernel-result',
          payload: { total: result, randomSample },
          numericFacts: [
            {
              id: 'sum-result',
              path: '/total',
              value: result,
              origin: {
                kind: 'derived',
                rulesetId: 'demo-homebrew-rules',
                formula: 'left + right',
                sourceFactIds: ['left-input', 'right-input'],
              },
            },
            {
              id: 'seeded-die-result',
              path: '/randomSample',
              value: randomSample,
              origin: {
                kind: 'derived',
                rulesetId: 'demo-homebrew-rules',
                formula: 'mulberry32-v1(seed).die(sides)',
                sourceFactIds: ['die-sides'],
              },
            },
          ],
        },
        findings: [],
        changes: [{
          id: 'calculated-total',
          targetRef: 'demo:total',
          description: 'Рассчитан результат демонстрационного примера.',
          beforeFactIds: ['left-input', 'right-input'],
          afterFactIds: ['sum-result'],
        }],
        uncertainty: [{
          id: 'not-a-game-rule',
          level: 'high',
          description: 'Этот kernel проверяет форму отчёта и не исполняет игровую механику.',
          affectedFactIds: ['sum-result', 'seeded-die-result'],
          assumptionIds: ['demo-is-not-a-game-rule'],
        }],
        proposalCandidates: [{
          targetRef: 'demo:total',
          title: 'Демонстрационный черновик мастеру',
          summary: 'Показывает форму отдельного предложения на проверку.',
          changeIds: ['calculated-total'],
        }],
      };
    },
  };

  const first = await runIsolatedLab(definition, kernel);
  const second = await runIsolatedLab(definition, kernel);
  const savedDefinition = serializeLabRunDefinition(definition);
  const restored = await runIsolatedLab(parseLabRunDefinition(savedDefinition), kernel);
  const changedDefinition = structuredClone(definition);
  changedDefinition.inputs[0].payload.left = 4;
  changedDefinition.inputs[0].numericFacts[0].value = 4;
  const changed = await runIsolatedLab(changedDefinition, kernel);
  const invalidDefinition = structuredClone(definition);
  invalidDefinition.inputs[0].numericFacts.shift();
  let missingNumericAttributionRejected = false;
  try {
    await runIsolatedLab(invalidDefinition, kernel);
  } catch (error) {
    missingNumericAttributionRejected = error?.name === 'LabContractError';
  }
  let frozenInputMutationRejected = false;
  try {
    await runIsolatedLab(definition, {
      ...kernel,
      run(context) {
        context.inputs[0].payload.left = 99;
        return kernel.run(context);
      },
    });
  } catch (error) {
    frozenInputMutationRejected = error instanceof TypeError;
  }
  const reproducibility = {
    repeatedRunFingerprintEqual: first.runFingerprint === second.runFingerprint,
    repeatedOutputFingerprintEqual: first.outputFingerprint === second.outputFingerprint,
    savedDefinitionRoundTripPreservesRun: first.runFingerprint === restored.runFingerprint && first.outputFingerprint === restored.outputFingerprint,
    changedInputChangesRunFingerprint: first.runFingerprint !== changed.runFingerprint,
    missingNumericAttributionRejected,
    frozenInputMutationRejected,
    proposalRemainsDraft: first.proposalDrafts.every(item => item.status === 'draft' && item.reviewAudience === 'gm'),
    campaignEventWrites: first.executionBoundary.campaignEventWrites,
    activeCampaignWrites: first.executionBoundary.activeCampaignWrites,
  };
  if (!reproducibility.repeatedRunFingerprintEqual || !reproducibility.repeatedOutputFingerprintEqual ||
      !reproducibility.savedDefinitionRoundTripPreservesRun ||
      !reproducibility.changedInputChangesRunFingerprint || !reproducibility.missingNumericAttributionRejected ||
      !reproducibility.frozenInputMutationRejected || !reproducibility.proposalRemainsDraft ||
      reproducibility.campaignEventWrites !== 0 || reproducibility.activeCampaignWrites !== 0) {
    throw new Error('Демонстрационная проверка контракта лаборатории не пройдена.');
  }
  process.stdout.write(`${JSON.stringify({ reproducibility, report: first }, null, 2)}\n`);
} finally {
  await server.close();
}
