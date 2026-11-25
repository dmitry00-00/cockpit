import { beforeEach, expect, it } from 'vitest';
import { readUiTheme, UI_THEME_KEY, writeUiTheme } from './uiTheme';

beforeEach(() => { localStorage.clear(); });

it('restores the app-wide theme and defaults to material', () => {
  expect(readUiTheme()).toBe('material');
  localStorage.setItem(UI_THEME_KEY, 'unexpected');
  expect(readUiTheme()).toBe('material');
  writeUiTheme('flat');
  expect(localStorage.getItem(UI_THEME_KEY)).toBe('flat');
  expect(readUiTheme()).toBe('flat');
});

it('migrates an earlier party-only theme choice to the global appearance', () => {
  localStorage.setItem('dm-cockpit:party-card-theme:v1', 'flat');
  expect(readUiTheme()).toBe('flat');
});
