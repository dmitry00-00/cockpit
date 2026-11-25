// Карта персонажа (Д9, образец владельца 30.10.2026): пропорции 63 × 88, корешок, полоса боя, ряд хитов, строка статуса,
// вкладки и подвал; броски, хиты и состояния — колбэками страницы.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedEngine, seedState } from '../campaign';
import { CharacterCard } from './CharacterCard';
import { SKILL_IDS } from '../rules/srd/abilities';
import { SKILL_LABEL } from './labels';
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

  it('ярусы: корешок — уровень и имя, полоса боя — КД, инициатива, внимательность, кости хитов, владение; хиты, пипки, подвал — состояния', async () => {
    // Стол сида после лога: у Bo концентрация на Hunter's Mark — чип на нижней кромке.
    const s = seedEngine().getState().state;
    const card = characterCardProps(s.actors.bo, header, s.time.sec)!;
    expect(card.portrait).toBe('bo-portrait');
    render(<CharacterCard card={card} />);
    const art = screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' });
    expect(art.style.aspectRatio).toBe(String(CARD_RATIO));
    expect(art.querySelector('.character-card__paper')).toBeNull();
    expect(art.querySelector('.character-card__leather')).toBeNull();
    const top = art.querySelector<HTMLElement>('[data-part="edge-top"]')!;
    expect(top).toHaveTextContent('5');
    expect(top).toHaveTextContent('Bo Tambernack');
    await waitFor(() => expect(within(top).getByRole('img', { name: 'Портрет: Bo Tambernack' }).tagName).toBe('IMG'));
    const portrait = within(top).getByRole('img', { name: 'Портрет: Bo Tambernack' });
    expect(portrait).toHaveAttribute('loading', 'lazy');
    expect(portrait).toHaveAttribute('width', '32');
    expect(portrait).toHaveAttribute('sizes', '32px');
    expect(portrait.getAttribute('srcset')).toContain('256w');
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
    fireEvent.click(screen.getByRole('button', { name: /Все навыки/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Скрытность / }));
    expect(onRollSkill).toHaveBeenCalledWith(expect.objectContaining({ id: 'stealth' }));
    fireEvent.click(screen.getByRole('button', { name: /^Хиты \d+ из \d+$/ }));
    expect(onHp).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Лист' }));
    expect(onSheet).toHaveBeenCalled();
  });

  it('compact карточка занимает ширину ячейки и сохраняет исходные пропорции', async () => {
    const s = seedState();
    const card = characterCardProps(s.actors.bo, header, 0)!;
    render(<CharacterCard card={card} compact />);
    const article = screen.getByRole('article', { name: `Карта персонажа: ${card.name}` });
    expect(article).toHaveClass('character-card--compact');
    expect(article).toHaveStyle({ width: '100%', aspectRatio: String(CARD_RATIO) });
    expect(article.style.maxWidth).toBe('');
    expect(article.querySelector('[data-part="edge-top"]')).toHaveClass('character-card-spine--compact');
    await waitFor(() => expect(article.querySelector('.character-card__paper')).not.toBeNull());
  });

  it('compact карточки с пустыми и заполненными данными сохраняют один шаблон и границы зон', () => {
    const state = seedState();
    const base = characterCardProps(state.actors.bo, header, 0)!;
    const populated: typeof base = {
      ...base,
      hitDice: base.hitDice ?? { die: 8, available: 3, total: 5 },
      attacks: [{ id: 'strike', name: 'Удар', toHit: 5, damage: '1d8' }],
      spellActions: [{ id: 'spark', name: 'Искра', icon: 'school-evocation', meta: 'заговор · эвокация' }],
      pools: [{ id: 'focus', label: 'Фокус', max: 3, spent: 1, kind: 'uses', restoresOn: 'long' }],
    };
    const sparse = { ...populated, attacks: [], spellActions: [], pools: [], skills: [], chips: [] };
    delete sparse.hitDice;
    const { rerender } = render(<CharacterCard card={populated} compact conditions={<p>Состояния</p>} gear={<p>Снаряжение</p>} spells={<p>Заклинания</p>} onDamage={() => {}} onHeal={() => {}} onInitiative={() => {}} />);
    const fullArticle = screen.getByRole('article', { name: `Карта персонажа: ${populated.name}` });
    const partOrder = (article: HTMLElement) => Array.from(article.children)
      .filter(child => child.hasAttribute('data-part'))
      .map(child => child.getAttribute('data-part'));
    const fullParts = partOrder(fullArticle);
    expect(fullParts).toEqual(['edge-top', 'combat', 'hp-row', 'resources', 'card-sides', 'face']);
    expect(fullArticle.style.aspectRatio).toBe(String(CARD_RATIO));
    expect(fullArticle.querySelectorAll('[data-part="combat"] > *')).toHaveLength(5);
    const hpSlots = (article: HTMLElement) => Array.from(article.querySelector('[data-part="hp-row"]')!.children)
      .map(child => child.getAttribute('data-part'));
    expect(hpSlots(fullArticle)).toEqual(['card-hp', 'hp-amount', 'hp-damage', 'hp-heal', 'conditions-toggle']);
    expect(fullArticle.querySelector('[data-part="attacks"]')).toBeInTheDocument();
    expect(fullArticle.querySelector('[data-part="skill-groups"][aria-label="Навыки по характеристикам"]')).toBeInTheDocument();

    rerender(<CharacterCard card={sparse} compact />);
    const sparseArticle = screen.getByRole('article', { name: `Карта персонажа: ${sparse.name}` });
    expect(partOrder(sparseArticle)).toEqual(fullParts);
    expect(sparseArticle.style.aspectRatio).toBe(fullArticle.style.aspectRatio);
    expect(sparseArticle.style.width).toBe(fullArticle.style.width);
    expect(sparseArticle.style.maxWidth).toBe('');
    expect(sparseArticle.querySelectorAll('[data-part="combat"] > *')).toHaveLength(5);
    expect(sparseArticle.querySelector('[data-part="resources"]')).toHaveAttribute('data-empty', 'true');
    expect(hpSlots(sparseArticle)).toEqual(hpSlots(fullArticle));
    expect(sparseArticle.querySelector('[data-part="hp-amount"]')).toHaveAttribute('aria-hidden', 'true');
    expect(sparseArticle.querySelector('[data-part="hp-damage"]')).toHaveAttribute('aria-hidden', 'true');
    expect(sparseArticle.querySelector('[data-part="hp-heal"]')).toHaveAttribute('aria-hidden', 'true');
    expect(sparseArticle.querySelector('[data-part="conditions-toggle"]')).toHaveAttribute('aria-hidden', 'true');
    expect(sparseArticle.querySelector('[data-part="actions-empty-slot"]')).toBeInTheDocument();
    expect(sparseArticle.querySelectorAll('[data-part="skill-groups"][aria-label="Навыки по характеристикам"] > [data-ability]')).toHaveLength(5);
    fireEvent.click(within(sparseArticle).getByRole('tab', { name: 'Оборот: снаряжение и заклинания' }));
    expect(sparseArticle.querySelector('[data-part="back-tabs"]')).toBeInTheDocument();
    expect(sparseArticle.querySelector('[data-part="back-content"]')).toHaveTextContent('Заклинания не заданы.');
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

  it('все навыки доступны в раскрываемой прокрутке с именем, модификатором и владением; быстрый бросок и фокус сохранены', () => {
    const s = seedState();
    const card = characterCardProps(s.actors.bo, header, 0)!;
    const onRollSkill = vi.fn();
    const { container } = render(<CharacterCard card={card} onRollSkill={onRollSkill} />);
    const overview = container.querySelector('[data-part="face"]')!;
    expect(overview).toHaveClass('overflow-y-auto');
    expect(overview.querySelector('[data-part="attacks"]')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Все навыки · 18 Показать/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Все навыки' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const skills = within(screen.getByRole('region', { name: 'Все навыки' }));
    expect(screen.getByRole('region', { name: 'Все навыки' })).toHaveClass('max-h-44', 'overflow-y-auto');
    for (const id of SKILL_IDS) {
      const button = skills.getByRole('button', { name: new RegExp(`^${SKILL_LABEL[id]} `) });
      expect(button, id).toBeInTheDocument();
      expect(button).toHaveTextContent(SKILL_LABEL[id]);
      expect(button.querySelector('.type-body-sm')).toHaveTextContent(SKILL_LABEL[id]);
      expect(button.className).toContain('focus-visible:shadow-[var(--glow-gold)]');
      if (card.skills.find(s => s.id === id)?.proficiency !== 'none') {
        expect(button.querySelector('[data-part="proficiency"]'), id).toHaveTextContent(/В|К/);
      }
    }
    const proficient = card.skills.find(s => s.proficiency !== 'none')!;
    const proficientButton = skills.getByRole('button', { name: new RegExp(`^${SKILL_LABEL[proficient.id]} `) });
    proficientButton.focus();
    expect(document.activeElement).toBe(proficientButton);
    fireEvent.click(proficientButton);
    expect(onRollSkill).toHaveBeenCalledWith(proficient);
    fireEvent.click(screen.getByRole('button', { name: /Все навыки · 18 Скрыть/ }));
    expect(screen.queryByRole('region', { name: 'Все навыки' })).toBeNull();
  });
});
