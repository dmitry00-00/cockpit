import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const htmlPath = fileURLToPath(new URL('./index.html', import.meta.url));
const html = await readFile(htmlPath, 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: new URL('./index.html', import.meta.url).href });
await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
const { document, MouseEvent } = dom.window;

test('player mode removes undisclosed clues from the DOM; explicit reveal inserts only the selected note', () => {
  const stage = document.querySelector('#stage');
  assert.equal(stage.querySelectorAll('.hotspot').length, 3);

  document.querySelector('#player-mode').click();
  assert.equal(stage.querySelectorAll('.hotspot').length, 1);
  assert.doesNotMatch(document.body.innerHTML, /Колокольчик под стойкой|Фигура у окна|свежая царапина|Путник у окна/);

  document.querySelector('#dm-mode').click();
  const bell = [...stage.querySelectorAll('.hotspot')].find(button => button.getAttribute('aria-label') === 'Колокольчик под стойкой');
  bell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert.match(document.querySelector('#detail').textContent, /свежая царапина/);
  document.querySelector('#reveal').click();
  assert.equal(document.querySelector('#player-mode').getAttribute('aria-pressed'), 'true');
  assert.match(document.querySelector('#detail').textContent, /тихий сигнал/);
  assert.doesNotMatch(document.body.innerHTML, /свежая царапина|следит за колокольчиком/);
  assert.equal(stage.querySelectorAll('.hotspot').length, 2);
  dom.window.close();
});
