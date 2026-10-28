// Портреты партии (узкий экран): окно на персонажа — аватар расы, значок класса, уровень, имя, хиты числом и
// полосой, значки состояний; щелчок по окну открывает карточку, кнопка «Партия» раскрывает полную панель.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SEED_SEC, seedEngine } from '../campaign';
import { PartyPortraits } from './PartyPortraits';

const party = () => {
  const s = seedEngine().getState().state;
  return s.party.map(id => s.actors[id]);
};

describe('<PartyPortraits>', () => {
  it('окно на каждого персонажа в порядке партии: аватар расы, класс, уровень, имя, хиты; выбранный — aria-current', () => {
    render(<PartyPortraits actors={party()} worldSec={SEED_SEC} selectedId="bo" onOpen={() => {}} panelOpen={false} onPanel={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Партия' });
    expect(nav).toHaveClass('w-rail-portraits');
    const windows = within(nav).getAllByRole('button', { name: /^Открыть карточку: / });
    expect(windows.map(b => b.dataset.actor)).toEqual(['bo', 'korrin', 'lyra', 'aldric']);
    const bo = windows[0];
    expect(bo).toHaveAttribute('aria-current', 'true');
    expect(windows[1]).not.toHaveAttribute('aria-current');
    expect(within(bo).getByRole('img', { name: 'Полурослик · Следопыт' })).toBeInTheDocument();
    expect(within(bo).getByRole('img', { name: 'Класс' })).toBeInTheDocument();
    expect(within(bo).getByTitle('Уровень')).toHaveTextContent('5');
    expect(within(bo).getByText('Bo')).toBeInTheDocument();
    expect(bo.querySelector('[data-part="hp"]')).toHaveTextContent('41/49');
    expect(bo).toHaveAccessibleDescription(/^Полурослик · Следопыт, 5 уровень; хиты 41 из 49/);
    expect(bo.querySelector('[data-part="chips"]')).not.toBeNull();
  });

  it('щелчок по окну открывает карточку этого персонажа; «Партия» — колбэк панели и aria-pressed', () => {
    const onOpen = vi.fn();
    const onPanel = vi.fn();
    const { rerender } = render(<PartyPortraits actors={party()} worldSec={SEED_SEC} onOpen={onOpen} panelOpen={false} onPanel={onPanel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть карточку: Lyra Moonwhisper' }));
    expect(onOpen).toHaveBeenCalledWith('lyra');
    const head = screen.getByRole('button', { name: 'Партия' });
    expect(head).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(head);
    expect(onPanel).toHaveBeenCalledOnce();
    rerender(<PartyPortraits actors={party()} worldSec={SEED_SEC} onOpen={onOpen} panelOpen onPanel={onPanel} />);
    expect(screen.getByRole('button', { name: 'Партия' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('0 HP — приглушён только аватар, имя вторичным цветом', () => {
    const actors = party().map(a => (a.id === 'korrin' ? { ...a, hp: { ...a.hp, current: 0 } } : a));
    render(<PartyPortraits actors={actors} worldSec={SEED_SEC} onOpen={() => {}} panelOpen={false} onPanel={() => {}} />);
    const k = screen.getByRole('button', { name: 'Открыть карточку: Korrin Battlehammer' });
    expect(k).toHaveAttribute('data-down', 'true');
    expect(k.querySelector('[data-part="portrait"]')).toHaveClass('opacity-55');
    expect(within(k).getByText('Korrin')).toHaveClass('text-t2');
  });
});
