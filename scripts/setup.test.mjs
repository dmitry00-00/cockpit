// Установочные скрипты: версия для Mac (setup.command, start.command) и для Windows (setup.ps1, setup.cmd, start.cmd)
// закрепляют один и тот же Node.js с суммами архивов из SHASUMS256.txt — тест держит их равными и проверяет то,
// что ломается молча: права на .command, BOM в .ps1 (иначе PowerShell 5.1 читает кириллицу как ANSI), CRLF
// в .cmd, адрес репозитория, порт стола из vite.config.ts и что .tools/ не попадает в git.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const mac = read('setup.command');
const macStart = read('start.command');
const ps = read('setup.ps1');
const cmdSetup = read('setup.cmd');
const cmdStart = read('start.cmd');

const REPO = 'https://github.com/dmitry00-00/cockpit';
const SHA = /^[0-9a-f]{64}$/;

describe('setup: Mac и Windows', () => {
  it('оба режут тайлы карты необязательным шагом, если пирамиды ещё нет', () => {
    for (const [name, text] of [['setup.command', mac], ['setup.ps1', ps]]) {
      expect(text, name).toMatch(/tile-map\.py.*toril\.json.*--optional/);
      expect(text, name).toMatch(/done\.json/);
      expect(text, name).toMatch(/terrain-from-map\.py.*toril\.json.*--optional/);
      // Дороги и схема (M16) — пересчёт и тогда, когда скрипт новее готового файла, а не только когда файла нет.
      expect(text, name).toMatch(/roads-from-map\.py.*toril\.json.*--optional/);
      expect(text, name).toMatch(/schema-from-grids\.py.*toril\.json.*--optional/);
      expect(text, name).toMatch(/graph-from-grids\.py.*toril\.json.*--optional/);
    }
    expect(mac).toMatch(/roads-from-map\.py -nt \$roads_png/);
    expect(mac).toMatch(/schema-from-grids\.py -nt \$schema_json/);
    expect(ps).toMatch(/Test-Stale \$roadsPng/);
    expect(ps).toMatch(/Test-Stale \$schemaJson/);
    expect(mac).toMatch(/borders-from-map\.py -nt \$borders_png/);
    expect(mac).toMatch(/\$borders_png -nt \$schema_json/);
    expect(ps).toMatch(/Test-Stale \$bordersPng/);
    expect(ps).toMatch(/Test-Stale \$schemaJson[^\n]*\$bordersPng/);
    expect(mac).toMatch(/graph-from-grids\.py -nt \$graph_json/);
    expect(ps).toMatch(/Test-Stale \$graphJson/);
  });

  it('закрепляют одну версию Node.js', () => {
    const m = mac.match(/^NODE_VERSION=(\d+\.\d+\.\d+)$/m);
    const w = ps.match(/^\$NodeVersion = '(\d+\.\d+\.\d+)'$/m);
    expect(m?.[1]).toBeDefined();
    expect(w?.[1]).toBe(m?.[1]);
    const min = mac.match(/^NODE_MIN_MAJOR=(\d+)$/m)?.[1];
    expect(ps.match(/^\$NodeMinMajor = (\d+)$/m)?.[1]).toBe(min);
    expect(Number(min)).toBeGreaterThanOrEqual(20);
  });

  it('суммы архивов — по одной на архитектуру, шестнадцатеричные, из одного выпуска', () => {
    const macSums = Object.fromEntries([...mac.matchAll(/^\s+(darwin-(?:arm64|x64))\s+([0-9a-f]+)$/gm)].map(m => [m[1], m[2]]));
    const winSums = Object.fromEntries([...ps.matchAll(/^\s+'(win-(?:x64|arm64))'\s+= '([0-9a-f]+)'$/gm)].map(m => [m[1], m[2]]));
    expect(Object.keys(macSums).sort()).toEqual(['darwin-arm64', 'darwin-x64']);
    expect(Object.keys(winSums).sort()).toEqual(['win-arm64', 'win-x64']);
    for (const s of [...Object.values(macSums), ...Object.values(winSums)]) expect(s).toMatch(SHA);
    expect(new Set([...Object.values(macSums), ...Object.values(winSums)]).size).toBe(4);
  });

  it('репозиторий и порт — те же, что в README и vite.config.ts', () => {
    expect(mac).toContain(`REPO=${REPO}`);
    expect(ps).toContain(`$Repo = '${REPO}'`);
    const port = read('vite.config.ts').match(/port:\s*(\d+)/)?.[1];
    expect(mac).toContain(`PORT=${port}`);
    expect(ps).toContain(`$Port = ${port}`);
    expect(read('README.md')).toContain(REPO);
    expect(read('README.md')).toContain('setup.command');
    expect(read('README.md')).toContain('setup.cmd');
  });

  it('.command исполняемые, начинаются с #!/bin/zsh, разбираются zsh -n; start зовёт setup --start', () => {
    for (const f of ['setup.command', 'start.command', 'setup-python.command']) {
      expect(statSync(path.join(ROOT, f)).mode & 0o111, `${f} без прав на исполнение`).not.toBe(0);
      expect(read(f).startsWith('#!/bin/zsh\n'), `${f} без #!/bin/zsh`).toBe(true);
      execFileSync('zsh', ['-n', path.join(ROOT, f)]);
    }
    expect(macStart).toContain('setup.command" --start "$@"');
  });

  it('.ps1 — UTF-8 с BOM; .cmd — CRLF, зовут setup.ps1 через powershell.exe с -ExecutionPolicy Bypass', () => {
    expect(ps.charCodeAt(0)).toBe(0xfeff);
    expect(ps).not.toMatch(/\r/);
    for (const [name, text] of [['setup.cmd', cmdSetup], ['start.cmd', cmdStart]]) {
      expect(text.charCodeAt(0), `${name} с BOM — cmd.exe его не понимает`).not.toBe(0xfeff);
      expect(text.split('\n').filter(Boolean).every(l => l.endsWith('\r')), `${name}: не все строки CRLF`).toBe(true);
      expect(text).toContain('-ExecutionPolicy Bypass -File "%~dp0setup.ps1"');
      expect(text).toContain('chcp 65001');
    }
    expect(cmdStart).toContain('setup.ps1" -Start %*');
  });

  it('флаги одни и те же по смыслу: start, lan, dev, test, update', () => {
    for (const f of ['start', 'lan', 'dev', 'test', 'update']) expect(mac).toContain(`--${f})`);
    for (const f of ['Start', 'Lan', 'Dev', 'Test', 'Update']) expect(ps).toContain(`[switch]$${f}`);
  });

  it('.tools/ (свой Node.js и отпечаток package-lock) не попадает в git', () => {
    expect(read('.gitignore').split('\n')).toContain('.tools/');
  });
});
