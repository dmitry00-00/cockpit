import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyState, type Process, type State } from '../../engine/state';
import { ref } from '../../entities/ref';
import { WarPlanner } from './WarPlanner';

afterEach(cleanup);

const parties = [
  { id: 'cormyr', name: 'Cormyr' },
  { id: 'luskan', name: 'Luskan' },
  { id: 'neverwinter', name: 'Neverwinter' },
];

function plannerSimulation() {
  return {
    warParties: () => parties,
    warPlaces: (id: string) => [{ id: `${id}-place`, name: `${id} place`, x: 0, y: 0 }],
    previewWarFront: (a: string, b: string, _year: number, from = `${a}-place`, to = `${b}-place`) => ({
      ok: true as const,
      front: {
        version: 1 as const, map: 'toril', fromPlace: from, toPlace: to,
        nodes: [{ id: from, name: from, x: 0, y: 0 }, { id: to, name: to, x: 1, y: 0 }],
        miles: 10, days: 1, tier: 2 as const, sideAPlaceIds: [from], sideBPlaceIds: [to],
      },
    }),
  };
}

function warWorld(): State['world'] {
  const world = emptyState().world;
  const process: Process = {
    id: 'war-1', kind: 'war', name: 'Luskan — Neverwinter', scale: 'continent', stage: 'campaign', parties: [],
    startedSec: 0, nextSec: 100, vars: {},
    data: { kind: 'war', version: 1, ruleVersion: 'dm-cockpit-war/1', ruleSource: 'test', strengthSource: 'gm-provided', sideA: { id: 'luskan', name: 'Luskan' }, sideB: { id: 'neverwinter', name: 'Neverwinter' } },
  };
  world.processes = { [process.id]: process };
  world.locations['city-neverwinter'] = { id: 'city-neverwinter', name: 'Neverwinter', scale: 'settlement', ref: ref('place', 'neverwinter') };
  return world;
}

it('prepares a manual war plan and submits only the selected sides and rule-table values', async () => {
  let finish!: (message: string) => void;
  const prepare = vi.fn().mockResolvedValue(plannerSimulation());
  const propose = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  render(<WarPlanner year={1492} world={emptyState().world} prepare={prepare} propose={propose} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeSettlement={vi.fn()} />);

  expect(prepare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  await screen.findByRole('combobox', { name: 'Сторона A' });
  expect(screen.getByText(/не становится принятым фактом мира/)).toBeInTheDocument();
  expect(propose).not.toHaveBeenCalled();

  fireEvent.change(screen.getByRole('combobox', { name: 'Сторона A' }), { target: { value: 'luskan' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Сторона B' }), { target: { value: 'neverwinter' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Сила A, шкала 0–10' }), { target: { value: '7.5' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Сила B, шкала 0–10' }), { target: { value: '6' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Решимость A, шкала 0–10' }), { target: { value: '8' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Решимость B, шкала 0–10' }), { target: { value: '4' } });

  const submit = screen.getByRole('button', { name: 'Предложить войну' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(propose).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    sideA: parties[1], sideB: parties[2], strengthA: 7.5, strengthB: 6, determinationA: 8, determinationB: 4,
    front: expect.objectContaining({ fromPlace: 'luskan-place', toPlace: 'neverwinter-place', tier: 2 }),
  }));
  expect(screen.getByRole('button', { name: 'Готовится предложение…' })).toBeDisabled();
  finish('Предложено во входящие.');
  await waitFor(() => expect(screen.getByText('Предложено во входящие.')).toBeInTheDocument());
});

it('prefills a source-backed exact-year strength suggestion and keeps it editable', async () => {
  const suggested = [
    { id: 'cormyr', name: 'Cormyr', strengthSuggestion: { value: 7.1, source: '1% населения на 1372 DR · §4.2.2', sourceUrl: 'https://forgottenrealms.fandom.com/wiki/Cormyr' } },
    { id: 'luskan', name: 'Luskan', strengthSuggestion: { value: 0.5, source: '1% населения на 1372 DR · §4.2.2' } },
  ];
  render(<WarPlanner year={1372} world={emptyState().world} prepare={async () => ({ ...plannerSimulation(), warParties: () => suggested })}
    propose={vi.fn()} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeSettlement={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  const strengthA = await screen.findByRole('spinbutton', { name: 'Сила A, шкала 0–10' });
  expect(strengthA).toHaveValue(7.1);
  expect(screen.getByRole('spinbutton', { name: 'Сила B, шкала 0–10' })).toHaveValue(0.5);
  expect(screen.getByRole('link', { name: /1% населения на 1372 DR/ })).toHaveAttribute('href', 'https://forgottenrealms.fandom.com/wiki/Cormyr');
  fireEvent.change(strengthA, { target: { value: '6.8' } });
  expect(strengthA).toHaveValue(6.8);
});

it('uses an exact-year L8 candidate only after the master selects it and preserves its provenance', async () => {
  const evidence = {
    kind: 'l8-candidate' as const, factAccepted: false as const, usage: 'gm-selected-for-war' as const,
    candidateId: 'LUSKAN_ARMY_1370', kingdomId: 'luskan', kingdomName: 'Luskan',
    year: 1370, amount: 300, amountRaw: '300', unitRaw: 'spearmen', value: 1.6,
    sourceTitle: 'Luskan', sourceUrl: 'https://forgottenrealms.fandom.com/wiki/Luskan', revisionId: '1102198',
    sourceTimestamp: '2026-08-08T18:59:31Z', sourceLicense: 'Forgotten Realms Wiki, CC BY-SA 3.0',
    sourceLicenseId: 'CC BY-SA 3.0', sourceWikitextSha256: 'a'.repeat(64), sourceCitations: ['VoloN-p112-113'],
    ruleSource: 'research/world-models.md §4.2.2' as const,
  };
  const candidate = {
    reviewId: evidence.candidateId, year: 1370, amount: 300, amountRaw: '300', unitRaw: 'spearmen', value: 1.6,
    excerpt: 'As of 1370 DR, Luskan had an army of 300 spearmen.',
    reviewNotes: ['Сноска связана с соседним предложением; проверьте область действия.'],
    sourceTitle: 'Luskan', sourceUrl: evidence.sourceUrl, sourceCitations: evidence.sourceCitations,
    revisionId: evidence.revisionId, sourceTimestamp: evidence.sourceTimestamp, sourceLicense: evidence.sourceLicense,
    sourceLicenseId: evidence.sourceLicenseId, sourceWikitextSha256: evidence.sourceWikitextSha256, evidence,
  };
  const suggested = [
    { id: 'cormyr', name: 'Cormyr' },
    { id: 'luskan', name: 'Luskan', l8StrengthCandidates: [candidate] },
  ];
  const propose = vi.fn().mockResolvedValue('Предложено во входящие.');
  render(<WarPlanner year={1370} world={emptyState().world} prepare={async () => ({ ...plannerSimulation(), warParties: () => suggested })}
    propose={propose} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeSettlement={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  await screen.findByRole('spinbutton', { name: 'Сила A, шкала 0–10' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Сторона A' }), { target: { value: 'luskan' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Сторона B' }), { target: { value: 'cormyr' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Сила B, шкала 0–10' }), { target: { value: '6' } });
  expect(screen.getByRole('button', { name: 'Подставить силу 1.6 для стороны A' })).toBeInTheDocument();
  expect(screen.getByText(/не принят как факт/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Подставить силу 1.6 для стороны A' }));
  expect(screen.getByRole('spinbutton', { name: 'Сила A, шкала 0–10' })).toHaveValue(1.6);
  expect(screen.getByRole('button', { name: 'Выбран для стороны A' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Предложить войну' }));
  await waitFor(() => expect(propose).toHaveBeenCalledWith(expect.objectContaining({ strengthA: 1.6, strengthEvidenceA: evidence })));
  expect(propose.mock.calls[0]?.[0]).toMatchObject({ sideA: expect.objectContaining({ id: 'luskan' }) });
});

it('prefills the recorded polity order as war determination', async () => {
  const world = emptyState().world;
  world.kingdomOrder = {
    cormyr: { value: 7, source: 'мастер установил при войне с Sembia' },
    luskan: { value: 4, source: 'мастер установил при войне с Neverwinter' },
  };
  render(<WarPlanner year={1492} world={world} prepare={async () => plannerSimulation()}
    propose={vi.fn()} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeSettlement={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  await screen.findByRole('spinbutton', { name: 'Решимость A, шкала 0–10' });
  expect(screen.getByRole('spinbutton', { name: 'Решимость A, шкала 0–10' })).toHaveValue(7);
  expect(screen.getByRole('spinbutton', { name: 'Решимость B, шкала 0–10' })).toHaveValue(4);
  expect(screen.getByText(/Порядок A: 7 · мастер установил при войне с Sembia/)).toBeInTheDocument();
});

it('prefills source-backed base order and the explicit magocracy bonus', async () => {
  const suggested = [
    { id: 'cormyr', name: 'Cormyr', government: 'Oligarchic magocracy', referenceUrl: 'https://forgottenrealms.fandom.com/wiki/Cormyr' },
    { id: 'luskan', name: 'Luskan', government: 'Monarchy', referenceUrl: 'https://forgottenrealms.fandom.com/wiki/Luskan' },
  ];
  render(<WarPlanner year={1492} world={emptyState().world} prepare={async () => ({ ...plannerSimulation(), warParties: () => suggested })}
    propose={vi.fn()} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeSettlement={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  await screen.findByRole('spinbutton', { name: 'Решимость A, шкала 0–10' });
  expect(screen.getByRole('spinbutton', { name: 'Решимость A, шкала 0–10' })).toHaveValue(8);
  expect(screen.getByRole('spinbutton', { name: 'Решимость B, шкала 0–10' })).toHaveValue(6);
  expect(screen.getByText(/предложено 8 · порядок 6 как обычный; \+2 за магократию\/теократию/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'статья Cormyr' })).toHaveAttribute('href', 'https://forgottenrealms.fandom.com/wiki/Cormyr');
});

it('rejects a one-party list and allows the master to retry after preparation fails', async () => {
  const prepare = vi.fn()
    .mockRejectedValueOnce(new Error('Список держав недоступен'))
    .mockResolvedValueOnce({ ...plannerSimulation(), warParties: () => parties.slice(0, 1) });
  const propose = vi.fn();
  render(<WarPlanner year={1492} world={emptyState().world} prepare={prepare} propose={propose} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeSettlement={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Список держав недоступен');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку держав' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('меньше двух держав');
  expect(propose).not.toHaveBeenCalled();
});

it('does not allow the same state to oppose itself', async () => {
  render(<WarPlanner year={1492} world={emptyState().world} prepare={async () => plannerSimulation()} propose={vi.fn()} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeSettlement={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  await screen.findByRole('combobox', { name: 'Сторона A' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Сторона B' }), { target: { value: 'cormyr' } });
  expect(screen.getByRole('button', { name: 'Предложить войну' })).toBeDisabled();
});

it('offers a manual blockade tied to an accepted active war', async () => {
  const proposeBlockade = vi.fn().mockResolvedValue('Блокада предложена.');
  render(<WarPlanner year={1492} world={warWorld()} prepare={async () => plannerSimulation()}
    propose={vi.fn()} proposeBlockade={proposeBlockade} proposeSiege={vi.fn()} proposeSettlement={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  await screen.findByRole('combobox', { name: 'Сторона A' });
  fireEvent.click(screen.getByRole('button', { name: 'Предложить блокаду' }));
  await waitFor(() => expect(proposeBlockade).toHaveBeenCalledExactlyOnceWith('war-1', 'city-neverwinter'));
  expect(await screen.findByText('Блокада предложена.')).toBeInTheDocument();
});

it('offers a GM-authored war settlement with an explicit outcome', async () => {
  const proposeSettlement = vi.fn().mockResolvedValue('Урегулирование предложено.');
  render(<WarPlanner year={1492} world={warWorld()} prepare={async () => plannerSimulation()}
    propose={vi.fn()} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeSettlement={proposeSettlement} />);

  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  await screen.findByRole('combobox', { name: 'Сторона A' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Исход по решению мастера' }), { target: { value: 'side-b' } });
  fireEvent.click(screen.getByRole('button', { name: 'Предложить урегулирование' }));

  await waitFor(() => expect(proposeSettlement).toHaveBeenCalledExactlyOnceWith('war-1', 'side-b', {}));
  expect(await screen.findByText('Урегулирование предложено.')).toBeInTheDocument();
  expect(screen.getByText(/Контроль поселений можно задать вручную; из исхода войны он не выводится/)).toBeInTheDocument();
});

it('proposes a campaign-only control record for a settlement on the active front', async () => {
  const world = warWorld();
  const war = world.processes?.['war-1'];
  if (!war) throw new Error('war fixture missing');
  world.processes = { ...world.processes, [war.id]: {
    ...war,
    data: { ...war.data, front: { nodes: [{ id: 'neverwinter', name: 'Neverwinter' }], locationIds: ['city-neverwinter'] } },
  } };
  const proposeTerritoryControl = vi.fn().mockResolvedValue('Запись предложена.');
  render(<WarPlanner year={1492} world={world} prepare={async () => plannerSimulation()}
    propose={vi.fn()} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeTerritoryControl={proposeTerritoryControl} />);

  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  await screen.findByRole('combobox', { name: 'Сторона A' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Записать контроль' }), { target: { value: 'side-b' } });
  fireEvent.click(screen.getByRole('button', { name: 'Предложить запись контроля' }));

  await waitFor(() => expect(proposeTerritoryControl).toHaveBeenCalledExactlyOnceWith('war-1', 'neverwinter', 'neverwinter'));
  expect(await screen.findByText('Запись предложена.')).toBeInTheDocument();
  expect(screen.getByText(/Победа в бою сама по себе контроль не меняет/)).toBeInTheDocument();
});

it('includes explicitly selected front territory in the same settlement proposal', async () => {
  const world = warWorld();
  const war = world.processes?.['war-1'];
  if (!war) throw new Error('war fixture missing');
  world.processes = { ...world.processes, [war.id]: {
    ...war,
    data: { ...war.data, front: { nodes: [{ id: 'neverwinter', name: 'Neverwinter' }], locationIds: ['city-neverwinter'] } },
  } };
  const proposeSettlement = vi.fn().mockResolvedValue('Условия предложены.');
  render(<WarPlanner year={1492} world={world} prepare={async () => plannerSimulation()}
    propose={vi.fn()} proposeBlockade={vi.fn()} proposeSiege={vi.fn()} proposeSettlement={proposeSettlement} />);

  fireEvent.click(screen.getByRole('button', { name: 'Спланировать войну' }));
  await screen.findByRole('combobox', { name: 'Сторона A' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Neverwinter' }), { target: { value: 'side-a' } });
  fireEvent.click(screen.getByRole('button', { name: 'Предложить урегулирование' }));

  await waitFor(() => expect(proposeSettlement).toHaveBeenCalledExactlyOnceWith('war-1', 'status-quo', { neverwinter: 'luskan' }));
  expect(await screen.findByText('Условия предложены.')).toBeInTheDocument();
});
