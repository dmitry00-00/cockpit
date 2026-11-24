import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PlayerConnection } from './PlayerConnection';
import type { PlayerProjection } from './types';

const SESSION_KEY = 'dm-cockpit:player-session:v1';
const LOG_KEY = 'dm-cockpit:log';

function projection(): PlayerProjection {
  return {
    schemaVersion: 1, revision: 8, updatedAt: '2026-11-03T10:15:00.000Z',
    hero: {
      name: 'Bo Tambernack', ancestry: 'Полурослик', className: 'Следопыт', level: 5,
      hp: { current: 41, maximum: 49, temporary: 0 }, armorClass: 16,
      abilities: [{ label: 'Сила', score: 10, modifier: 0, savingThrow: 0, savingThrowProficient: false }],
      skills: [{ label: 'Выживание', modifier: 6, proficiency: 'proficient' }],
      attacks: [{ name: 'Длинный лук', toHit: 7, damage: '1d8+3', damageType: 'колющий', range: '150/600 футов' }],
      resources: [{ label: 'Ячейки 1-го круга', available: 2, maximum: 2, restoresOn: 'long' }],
      conditions: [], equipment: [{ name: 'Длинный лук', quantity: 1 }],
      features: [{ kind: 'class', name: 'Боевой стиль: стрельба', level: 2 }],
      spells: [{ name: 'Метка охотника', kind: 'known', level: 1 }],
    },
    party: [{ name: 'Bo Tambernack', hp: { current: 41, maximum: 49, temporary: 0 }, conditions: [], currentTurn: true }],
    worldTime: { date: '15 Mirtul 1492 DR', time: '08:00', tempo: 'Час' },
    encounter: { active: true, round: 2, currentTurn: 'party' },
    updates: [],
  };
}

function response(body: object, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function cachedSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'player-token', snapshot: projection(), receivedAt: Date.UTC(2026, 10, 3, 10, 15) }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-03T10:16:00.000Z'));
  localStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  history.replaceState(null, '', '/');
});

describe('PlayerConnection', () => {
  it('strips an invite fragment and joins to the assigned hero before polling its snapshot', async () => {
    history.replaceState(null, '', '/player#invite=invite-secret');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ token: 'player-token', snapshot: projection(), revision: 8 }))
      .mockResolvedValueOnce(response({ snapshot: projection(), revision: 9 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<PlayerConnection />);
    await flush();
    expect(location.hash).toBe('');
    expect(screen.getByLabelText('Код приглашения')).toHaveValue('invite-secret');
    fireEvent.click(screen.getByRole('button', { name: 'Подключиться' }));
    await flush();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/player/join', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ code: 'invite-secret' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/player/snapshot', expect.objectContaining({
      method: 'GET', headers: { Authorization: 'Bearer player-token' },
    }));
    expect(screen.getByRole('main', { name: 'Лист игрока' })).toHaveTextContent('Bo Tambernack');
    expect(screen.getByRole('status')).toHaveTextContent('Подключено');
    expect(localStorage.getItem(SESSION_KEY)).toContain('player-token');
  });

  it('keeps the last saved sheet visible with an offline stale status', async () => {
    cachedSession();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    render(<PlayerConnection />);
    await flush();
    expect(screen.getByRole('main', { name: 'Лист игрока' })).toHaveTextContent('Bo Tambernack');
    expect(screen.getByRole('status')).toHaveTextContent('Нет связи');
    expect(screen.getByText(/сохранённый снимок/)).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toContain('Bo Tambernack');
  });

  it('purges the credential and snapshot on 401 and hides the hero', async () => {
    cachedSession();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 401)));
    render(<PlayerConnection />);
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Доступ истёк или отозван');
    expect(screen.queryByText('Bo Tambernack')).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('disconnects and wipes its credential and snapshot without touching master state', async () => {
    cachedSession();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ snapshot: projection(), revision: 9 }))
      .mockResolvedValueOnce(response({}));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(LOG_KEY, 'existing-master-log');
    render(<PlayerConnection />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Отключиться' }));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByText('Bo Tambernack')).toBeNull();
    expect(localStorage.getItem(LOG_KEY)).toBe('existing-master-log');
    await flush();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/player/disconnect', expect.objectContaining({
      method: 'POST', headers: { Authorization: 'Bearer player-token', 'Content-Type': 'application/json' }, body: '{}',
    }));
  });

  it('has no imports from master state, persistence, or seed modules', () => {
    const source = readFileSync('src/player/PlayerConnection.tsx', 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:engine|store|persistence|seed)[^'"]*['"]/i);
  });
});
