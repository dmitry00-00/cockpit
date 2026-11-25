#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { REPOSITORY_ROOT, SRD_IMPORT_REGISTRY, SRD_IMPORT_TYPES } from './srd-import-registry.mjs';

const usage = `Использование:
  node scripts/import-srd.mjs --list
  node scripts/import-srd.mjs <тип>
  node scripts/import-srd.mjs --all

Типы: ${SRD_IMPORT_TYPES.join(', ')}`;

function runImporter(type) {
  const definition = SRD_IMPORT_REGISTRY[type];
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [resolve(REPOSITORY_ROOT, definition.importer)], {
      cwd: REPOSITORY_ROOT,
      stdio: 'inherit',
    });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${type}: импорт завершился с кодом ${code ?? `по сигналу ${signal}`}`));
    });
  });
}

async function main() {
  const [selection, ...rest] = process.argv.slice(2);
  if (rest.length) throw new Error(usage);
  if (selection === '--list') {
    for (const type of SRD_IMPORT_TYPES) {
      const entry = SRD_IMPORT_REGISTRY[type];
      process.stdout.write(`${type}\t${entry.label}\t${entry.output}\t${entry.sourceUrl}\n`);
    }
    return;
  }
  if (!selection) throw new Error(usage);
  const types = selection === '--all' ? SRD_IMPORT_TYPES : [selection];
  for (const type of types) {
    if (!Object.hasOwn(SRD_IMPORT_REGISTRY, type)) throw new Error(`Неизвестный тип SRD «${type}».\n${usage}`);
    await runImporter(type);
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
