// Карта персонажа (Д9, образец владельца 30.10.2026): пропорции 63 × 88, корешок, полоса боя, ряд хитов, строка статуса,
// вкладки и подвал; броски, хиты и состояния — колбэками страницы.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedEngine, seedState } from '../campaign';
import { CharacterCard } from './CharacterCard';
import { skillIcon } from './sheetIcons';
import { ICONS } from '../icons/icons.generated';
import { SKILL_IDS, SKILLS } from '../rules/srd/abilities';
import { CARD_RATIO, characterCardProps } from '../campaign/characterCard';
import type { PcHeaderData } from './PcSheet';

const header: PcHeaderData = { level: 5, title: 'Полурослик · Легконогий · Следопыт', alignment: 'Нейтральный', speed: 25, height: '97 см' };

describe('CharacterCard', () => {
  it('проекция: лист → карта; без листа (монстр) — нет карты', () => {
    const s = seedState();
    expect(characterCardProps(s.actors.captain, header, 0)).toBeUndefined();
    const bo = characterCardProps(s.actors.bo, header, 0)!;
    expect(bo.skills).toHaveLength(18);
    expect(bo.abilities).toHaveLength(6);
    expect(bo.pools.length).toBeGreaterThan(0);
  });

  it('ярусы: корешок — уровень и имя, полоса боя — КД, инициатива, внимательность, кости хитов, владение; хиты, пипки, подвал — состояния', () => {
    // Стол сида после лога: у Bo концентрация на Hunter's Mark — чип на нижней кромке.
    const s = seedEngine().getState().state;
    const card = characterCardProps(s.actors.bo, header, s.time.sec)!;
    render(<CharacterCard card={card} />);
    const art = screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' });
    expect(art.style.aspectRatio).toBe(String(CARD_RATIO));
    const top = art.querySelector<HTMLElement>('[data-part="edge-top"]')!;
    expect(top).toHaveTextContent('5');
    expect(top).toHaveTextContent('Bo Tambernack');
    const combat = within(art).getByRole('group', { name: 'Полоса боя' });
    expect(combat).toHaveTextContent(`КД${card.ac}`);
    expect(combat).toHaveTextContent(`К${card.hitDice!.die}${card.hitDice!.available}/${card.hitDice!.total}`);
    expect(within(art).getByRole('button', { name: `Хиты ${card.hp.current} из ${card.hp.max}` })).toBeDisabled();
    // Без колбэков урона, лечения и состояний — ни поля, ни кнопок, ни «…»; без вкладок страницы — одной стороной.
    expect(within(art).queryByRole('spinbutton')).toBeNull();
    expect(within(art).queryByRole('button', { name: 'Состояния' })).toBeNull();
    expect(within(art).queryByRole('tablist')).toBeNull();
    expect(within(art).getAllByRole('img', { name: /: \d+ из \d+$/ }).length).toBe(card.pools.length);
    const bottom = art.querySelector<HTMLElement>('[data-part="edge-bottom"]')!;
    expect(bottom.querySelectorAll('[data-part="edge-chip"]').length).toBe(card.chips.length);
    expect(card.chips.length).toBeGreaterThan(0);
  });

  it('броски характеристик и навыков, хиты и «Лист» — колбэками страницы', () => {
    const s = seedState();
    const card = characterCardProps(s.actors.bo, header, 0)!;
    const onRollAbility = vi.fn(), onRollSkill = vi.fn(), onHp = vi.fn(), onSheet = vi.fn();
    render(<CharacterCard card={card} onRollAbility={onRollAbility} onRollSkill={onRollSkill} onHp={onHp} onSheet={onSheet} />);
    fireEvent.click(screen.getByRole('button', { name: /^DEX \d+$/ }));
    expect(onRollAbility).toHaveBeenCalledWith(expect.objectContaining({ id: 'dex' }));
    fireEvent.click(screen.getByRole('button', { name: /^Скрытность / }));
    expect(onRollSkill).toHaveBeenCalledWith(expect.objectContaining({ id: 'stealth' }));
    fireEvent.click(screen.getByRole('button', { name: /^Хиты \d+ из \d+$/ }));
    expect(onHp).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Лист' }));
    expect(onSheet).toHaveBeenCalled();
  });

  it('урон и лечение числом из ряда хитов, инициатива броском; «…» открывает сетку состояний; вкладки — из того, что дала страница', () => {
    const s = seedState();
    const card = characterCardProps(s.actors.bo, header, 0)!;
    const onDamage = vi.fn(), onHeal = vi.fn(), onInitiative = vi.fn();
    render(<CharacterCard card={card} onDamage={onDamage} onHeal={onHeal} onInitiative={onInitiative} conditions={<p>сетка</p>} gear={<p>кукла</p>} />);
    const field = screen.getByRole('spinbutton', { name: 'Сколько хитов' });
    expect(screen.getByRole('button', { name: 'Урон' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Урон' }));
    expect(onDamage).toHaveBeenCalledWith(7);
    expect(field).toHaveValue(null);
    fireEvent.change(field, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Леч' }));
    expect(onHeal).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getByRole('button', { name: /^Инициатива/ }));
    expect(onInitiative).toHaveBeenCalled();
    expect(screen.queryByText('сетка')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Состояния' }));
    expect(screen.getByText('сетка')).toBeInTheDocument();
    // «Заклинания» и «История» страница не дала — их нет; «Снаряжение» показывает её содержимое.
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: /Заклинания|История/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Снаряжение/ }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('кукла');
  });

  it('характеристика — модификатор крупно, значение плашкой; умения и черты — иконками, текст в подсказке; пусто — ряда нет', () => {
    const s = seedState();
    const card = characterCardProps(s.actors.bo, header, 0)!;
    const dex = card.abilities.find(a => a.id === 'dex')!;
    const { container, rerender } = render(<CharacterCard card={card} features={[{ key: 'lucky', icon: 'kind-other', name: 'Lucky', meta: 'раса', text: 'When you roll a 1…' }]} />);
    // Порядок на плитке: модификатор, затем значение.
    expect(screen.getByRole('button', { name: `DEX ${dex.score}` }).textContent).toContain(`+${dex.mod}${dex.score}`);
    const item = within(screen.getByRole('list', { name: 'Умения и черты' })).getByRole('listitem', { name: 'Lucky' });
    expect(item).toHaveAttribute('title', 'Lucky · раса\nWhen you roll a 1…');
    rerender(<CharacterCard card={card} />);
    expect(container.querySelector('[data-part="features"]')).toBeNull();
  });

  it('навыки — иконками рядом своей характеристики; у каждого навыка иконка есть', () => {
    for (const id of SKILL_IDS) expect(ICONS, id).toHaveProperty(skillIcon(id));
    const s = seedState();
    const card = characterCardProps(s.actors.bo, header, 0)!;
    const { container } = render(<CharacterCard card={card} />);
    for (const id of SKILL_IDS) {
      const column = container.querySelector(`[data-ability="${SKILLS[id].ability}"]`)!;
      expect(column.querySelector(`[data-skill="${id}"]`), id).not.toBeNull();
    }
    expect(container.querySelector('[data-ability="con"] [data-skill]')).toBeNull();
  });
});
