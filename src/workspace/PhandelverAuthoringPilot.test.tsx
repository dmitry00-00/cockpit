import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import pilotData from '../../research/content-phandelver/first-vertical.json';
import { parseAdventureBundle } from '../packages/adventure';
import { newPackageDraft } from './packageDraft';
import { PhandelverAuthoringPilot } from './PhandelverAuthoringPilot';

const bundle = parseAdventureBundle(pilotData);

it('blocks unresolved names, then adds only an authored draft record with source-node references', () => {
  const onDraftChange = vi.fn();
  render(<PhandelverAuthoringPilot bundle={bundle} draft={newPackageDraft()} installedPackages={[]} onDraftChange={onDraftChange}/>);
  const recap = screen.getByRole('textbox', { name: 'Короткий авторский пересказ' });
  fireEvent.change(recap, { target: { value: 'Заготовка встречи [[Неизвестное лицо]]' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Нераспознанные имена');
  const add = screen.getByRole('button', { name: 'Внести ссылки и пересказ в черновик' });
  expect(add).toBeDisabled();

  fireEvent.change(recap, { target: { value: 'У «Засада на дороге» и «Сдача припасов» пока нет исхода.' } });
  expect(screen.getByText('Сверка карты и пересказа · до внесения в черновик')).toBeInTheDocument();
  expect(within(screen.getByLabelText('Согласованные ссылки')).getByText(`${bundle.id}@${bundle.version}/ambush`)).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Только в разметке карты' })).toBeInTheDocument();
  expect(add).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /сохранить все эти точные ссылки карты/ }));
  expect(add).toBeEnabled();
  fireEvent.click(add);
  expect(onDraftChange).toHaveBeenCalledTimes(1);
  const next = onDraftChange.mock.calls[0][0];
  const record = next.records.find((item: { id: string }) => item.id === 'phandelver-opening-summary');
  expect(record.kind).toBe('scene');
  expect(record.references.map((reference: { nodeId: string }) => reference.nodeId)).toEqual(expect.arrayContaining(['ambush', 'arrival', 'town-plan', 'hideout-plan']));
  expect(record.references.every((reference: { packageId: string; version: string }) => reference.packageId === bundle.id && reference.version === bundle.version)).toBe(true);
  expect(JSON.stringify(record)).not.toMatch(/FACT_REVEALED|WORLD_DELTA|eventLog/);
});

it('shows text-only references separately and requires review of both mismatched sets', () => {
  const onDraftChange = vi.fn();
  render(<PhandelverAuthoringPilot bundle={bundle} draft={newPackageDraft()} installedPackages={[]} onDraftChange={onDraftChange}/>);
  const pilot = screen.getByRole('region', { name: 'Авторская вертикаль Фанделвера' });
  fireEvent.change(within(pilot).getByRole('textbox', { name: 'Короткий авторский пересказ' }), { target: { value: 'Подготовка: «Агата».' } });
  const add = within(pilot).getByRole('button', { name: 'Внести ссылки и пересказ в черновик' });
  const mapOnly = within(pilot).getByRole('group', { name: 'Только в разметке карты' });
  const textOnly = within(pilot).getByRole('group', { name: 'Только в пересказе' });
  expect(within(textOnly).getByText(`${bundle.id}@${bundle.version}/agatha`)).toBeInTheDocument();
  expect(add).toBeDisabled();

  fireEvent.click(within(mapOnly).getByRole('checkbox'));
  expect(add).toBeDisabled();
  fireEvent.click(within(textOnly).getByRole('checkbox'));
  expect(add).toBeEnabled();
  fireEvent.click(add);

  const record = onDraftChange.mock.calls[0][0].records.find((item: { id: string }) => item.id === 'phandelver-opening-summary');
  expect(record.references).toContainEqual({ packageId: bundle.id, version: bundle.version, nodeId: 'agatha' });
});

it('requires explicit decisions for unresolved names and preserves reviewed map references', () => {
  const onDraftChange = vi.fn();
  render(<PhandelverAuthoringPilot bundle={bundle} draft={newPackageDraft()} installedPackages={[]} onDraftChange={onDraftChange}/>);
  const pilot = screen.getByRole('region', { name: 'Авторская вертикаль Фанделвера' });
  fireEvent.change(within(pilot).getByRole('textbox', { name: 'Короткий авторский пересказ' }), { target: { value: 'Подготовка [[Неизвестный дозорный]]' } });
  const add = within(pilot).getByRole('button', { name: 'Внести ссылки и пересказ в черновик' });
  expect(screen.getByRole('alert')).toHaveTextContent('Нераспознанные имена');
  expect(add).toBeDisabled();

  fireEvent.click(within(pilot).getByRole('checkbox', { name: /оставляю обычным текстом/ }));
  expect(add).toBeDisabled();
  fireEvent.click(within(pilot).getByRole('checkbox', { name: /сохранить все эти точные ссылки карты/ }));
  expect(add).toBeEnabled();
  fireEvent.click(add);

  const record = onDraftChange.mock.calls[0][0].records.find((item: { id: string }) => item.id === 'phandelver-opening-summary');
  expect(record.text).toContain('Неизвестный дозорный');
  expect(record.references.every((reference: { packageId: string; version: string }) => reference.packageId === bundle.id && reference.version === bundle.version)).toBe(true);
  expect(record.references.some((reference: { nodeId: string }) => reference.nodeId === 'Неизвестный дозорный')).toBe(false);
});
