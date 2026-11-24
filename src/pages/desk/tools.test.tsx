import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoSecrets, mount } from './testkit';

describe('входящие и меню кампании', () => {
  it('сначала показывает предложения для окрестностей, затем дальний мир; входящее явно просит решения', () => {
    mount();
    const inbox = screen.getByRole('list', { name: 'Входящие' });
    const places = within(inbox).queryByRole('region', { name: 'Изменения мест и регионов' });
    const world = within(inbox).queryByRole('region', { name: 'Сводка мира' });
    expect(places || world).toBeTruthy();
    if (places && world) expect(places.compareDocumentPosition(world) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(inbox).getAllByText(/Решение требуется/).length).toBeGreaterThan(0);
    expect(within(inbox).getAllByText('Результат при принятии:').length).toBeGreaterThan(0);
    expect(inbox.querySelector('[data-part="change"]')).toBeInTheDocument();
    expect(inbox).toHaveTextContent('Это порядок по масштабу и метке, не оценка срочности');
  });

  it('предложение без патча помечено сообщением, которое само не меняет данные мира', async () => {
    const { store } = mount();
    store.getState().propose({
      id: 'd-note-only', scale: 'region', subject: 'Наблюдение о дороге', was: 'неизвестно', now: 'виден свежий след',
      cause: 'Сообщение разведчика', causeId: 'note-only', status: 'pending',
    });
    const beforeWorld = structuredClone(store.getState().state.world);
    const card = await screen.findByRole('article', { name: 'Предложение: Наблюдение о дороге' });
    const item = card.closest<HTMLElement>('[role="listitem"]');
    expect(item).not.toBeNull();
    expect(item).toHaveTextContent('Сообщение: принятие не меняет данные мира автоматически');
    expect(item).not.toHaveTextContent('Результат при принятии');
    fireEvent.click(within(item!).getByRole('button', { name: 'Принять' }));
    expect(store.getState().state.world).toEqual(beforeWorld);
    expect(store.getState().events.at(-1)?.type).toBe('WORLD_DELTA_ACCEPTED');
  });

  it('меню кампании группирует файлы и сброс, сохраняя подтверждение новой сессии', async () => {
    const { store } = mount();
    const summary = screen.getByText('Кампания', { selector: 'summary span' });
    const menu = summary.closest('details')!;
    expect(menu).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(within(menu).getByLabelText('Файл сессии')).toBeInTheDocument();
    expect(within(menu).getByLabelText('Импорт контента')).toBeInTheDocument();
    const before = store.getState().events;
    fireEvent.click(within(menu).getByRole('button', { name: 'Новая сессия' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Новая сессия' });
    expect(confirm).toHaveTextContent('Отменить это будет нельзя');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Оставить' }));
    expect(store.getState().events).toBe(before);
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Новая сессия' })).toBeNull());
  });

  it('у игроков входящие и меню кампании отсутствуют', () => {
    mount(undefined, false);
    expect(screen.queryByRole('list', { name: 'Входящие' })).toBeNull();
    expect(screen.queryByText('Кампания')).toBeNull();
    expectNoSecrets();
  });
});
