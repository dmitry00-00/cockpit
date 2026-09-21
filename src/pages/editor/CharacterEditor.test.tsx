// Редактор персонажа (шаг B): пустой лист не сходится и объясняет чем; выбор расы/класса/предыстории/навыков/
// увеличений/доспеха отражается в превью справа теми же числами, что даёт derive; «В партию» отдаёт PcSpec,
// из которого получается тот же актёр; id уникален среди занятых; ни одной пиктограммы.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCharacter, pcActor, type PcSpec } from '../../campaign';
import { CharacterEditor } from './CharacterEditor';

const EMOJI = /\p{Extended_Pictographic}/u;

afterEach(cleanup);

function mount(taken: string[] = []) {
  const onCreate = vi.fn<(spec: PcSpec) => void>();
  const onClose = vi.fn();
  render(<CharacterEditor takenIds={new Set(taken)} onCreate={onCreate} onClose={onClose} />);
  return { onCreate, onClose };
}

const editor = () => document.querySelector<HTMLElement>('[data-part="character-editor"]')!;
const sheet = () => within(editor()).getByRole('complementary', { name: 'Лист' });
const group = (name: string) => within(editor()).getByRole('group', { name });
const option = (g: string, name: string | RegExp) => within(group(g)).getByRole('button', { name });
const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed') === 'true';
const spawn = () => within(editor()).getByRole('button', { name: 'В партию' });

/** Воин 5-го уровня, человек, солдат: тот же путь, что и на снимке владельца. */
function fillFighter() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Имя' }), { target: { value: 'Sildar Hallwinter' } });
  fireEvent.click(option('Предыстории', /^Солдат/));
  fireEvent.click(within(group('Навыки')).getByTitle(/^Внимательность/));
  fireEvent.click(within(group('Навыки')).getByTitle(/^История/));
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Уровень выше' }));
  fireEvent.click(screen.getByTitle('+1 Сила на 4-м уровне'));
  fireEvent.click(screen.getByTitle('+1 Сила на 4-м уровне'));
  fireEvent.click(option('Доспех', 'Chain mail'));
  fireEvent.click(option('Доспех', 'Щит'));
  fireEvent.click(option('Подкласс', /^Мастер боевых/));
}

describe('редактор персонажа', () => {
  it('пустой лист: человек-воин 1-го уровня, стандартный набор, 0 очков; «В партию» выключена, справа — что мешает; пиктограмм нет', () => {
    mount();
    expect(editor()).not.toHaveTextContent(EMOJI);
    expect(pressed(within(group('Расы')).getByRole('button', { name: /^Человек/ }))).toBe(true);
    expect(pressed(option('Классы', 'Воин'))).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Уровень' })).toHaveValue('1');
    expect(screen.getByTitle('Очки: 27 на всё, 8–15 до бонусов расы')).toHaveTextContent('осталось 0 из 27');
    expect(spawn()).toBeDisabled();
    const issues = within(sheet()).getByRole('list', { name: 'Что мешает' });
    expect(issues).toHaveTextContent('нет имени');
    expect(issues).toHaveTextContent('выбрать ещё 2 навыка класса');
    expect(within(sheet()).queryByText('HP')).toBeNull();
  });

  it('point buy: минус отдаёт очки, плюс тратит; выше 15 нельзя; итог = база + бонус расы; «Набор» возвращает 15 14 13 12 10 8', () => {
    mount();
    const stats = group('Очки характеристик');
    const final = () => [...stats.querySelectorAll('[data-part="final"]')].map(e => e.textContent);
    expect(final()).toEqual(['16', '15', '14', '13', '11', '9']); // человек: +1 ко всему
    expect(within(stats).getByRole('button', { name: 'Харизма выше' })).toBeDisabled(); // очков нет
    fireEvent.click(within(stats).getByRole('button', { name: 'Сила ниже' })); // 15 → 14: +2 очка
    expect(screen.getByTitle('Очки: 27 на всё, 8–15 до бонусов расы')).toHaveTextContent('осталось 2 из 27');
    fireEvent.click(within(stats).getByRole('button', { name: 'Харизма выше' })); // 8 → 9: −1
    expect(screen.getByTitle('Очки: 27 на всё, 8–15 до бонусов расы')).toHaveTextContent('осталось 1 из 27');
    expect(final()).toEqual(['15', '15', '14', '13', '11', '10']);
    expect(within(stats).getByRole('button', { name: 'Ловкость выше' })).toBeDisabled(); // 14 → 15 стоит 2
    fireEvent.click(screen.getByRole('button', { name: 'Набор' }));
    expect(final()).toEqual(['16', '15', '14', '13', '11', '9']);
  });

  it('раса: эльф требует подрасу и даёт её бонусы; поиск сужает список; смена класса сбрасывает подкласс и навыки', () => {
    mount();
    fireEvent.click(within(group('Расы')).getByRole('button', { name: /^Эльф/ }));
    const sub = group('Подраса');
    expect(within(sub).queryByRole('button', { name: 'без подрасы' })).toBeNull();
    expect(within(sub).getAllByRole('button').some(pressed)).toBe(true);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск расы' }), { target: { value: 'двар' } });
    expect(within(group('Расы')).getAllByRole('button').map(b => b.textContent)).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск расы' }), { target: { value: '' } });
    // Класс: воин 3-го уровня с подклассом; смена на волшебника — подкласса нет, навыки класса пустые.
    fireEvent.click(screen.getByRole('button', { name: 'Уровень выше' }));
    fireEvent.click(screen.getByRole('button', { name: 'Уровень выше' }));
    fireEvent.click(option('Подкласс', /^Чемпион/));
    fireEvent.click(within(group('Навыки')).getByTitle(/^Атлетика/));
    expect(pressed(option('Подкласс', /^Чемпион/))).toBe(true);
    fireEvent.click(option('Классы', 'Волшебник'));
    expect(pressed(option('Классы', 'Волшебник'))).toBe(true);
    expect(within(group('Подкласс')).getAllByRole('button').filter(pressed).map(b => b.textContent)).toEqual(['без подкласса']);
    expect(within(group('Навыки')).getAllByRole('button').filter(pressed)).toHaveLength(0);
    // Волшебник не предлагает атлетику — плитка выключена и говорит почему.
    expect(within(group('Навыки')).getByTitle(/^Атлетика/)).toBeDisabled();
    expect(within(group('Навыки')).getByTitle(/^Атлетика/).title).toContain('класс не предлагает');
  });

  it('предыстория даёт навыки сверх класса и снимает совпавший выбор; лимит навыков класса держится', () => {
    mount();
    const skills = group('Навыки');
    fireEvent.click(within(skills).getByTitle(/^Атлетика/));
    fireEvent.click(within(skills).getByTitle(/^Внимательность/));
    expect(within(skills).getByTitle(/^История/)).toBeDisabled(); // 2 из 2
    fireEvent.click(option('Предыстории', /^Солдат/)); // атлетика + запугивание
    expect(within(skills).getByTitle(/^Атлетика/).title).toContain('предыстория');
    expect(within(skills).getByTitle(/^Атлетика/)).toBeDisabled();
    expect(screen.getByTitle('Навыки класса; предыстория и раса — сверх них')).toHaveTextContent('выбрать ещё 1');
    fireEvent.click(within(skills).getByTitle(/^История/));
    expect(screen.getByTitle('Навыки класса; предыстория и раса — сверх них')).toHaveTextContent('класс: 2 из 2');
  });

  it('воин 5-го уровня: превью считает HP 44, AC 18, PP 13, БМ +3, ресурсы и умения подкласса; «В партию» отдаёт спецификацию того же актёра', () => {
    const { onCreate } = mount(['bo']);
    fillFighter();
    const s = sheet();
    expect(within(s).getByTitle('Хиты')).toHaveTextContent('44');
    expect(within(s).getByTitle('Класс доспеха')).toHaveTextContent('18');
    expect(within(s).getByTitle('Пассивная внимательность')).toHaveTextContent('13');
    expect(within(s).getByTitle('Бонус мастерства')).toHaveTextContent('+3');
    expect(s).toHaveTextContent('Воин · Мастер боевых исскуств · 5 ур.');
    expect(within(s).getByRole('region', { name: 'Ресурсы' })).toHaveTextContent('Второе дыхание');
    expect(within(s).getByRole('list', { name: 'Умения листа' })).toHaveTextContent('Боевое превосходство');
    expect(screen.getByTitle('id актёра в состоянии')).toHaveTextContent('sildar-hallwinter');
    expect(spawn()).toBeEnabled();
    fireEvent.click(spawn());
    expect(onCreate).toHaveBeenCalledTimes(1);
    const spec = onCreate.mock.calls[0][0];
    expect(spec).toMatchObject({ id: 'sildar-hallwinter', name: 'Sildar Hallwinter', classId: 'voin', level: 5, backgroundId: 'soldier', armor: 'chain-mail', shield: true });
    expect(spec.skills).toEqual(expect.arrayContaining(['perception', 'history']));
    const actor = pcActor(spec);
    expect(actor).toMatchObject({ id: 'sildar-hallwinter', kind: 'pc', hp: { current: 44, max: 44 }, ac: 18, passivePerception: 13 });
    expect(deriveCharacter(spec).abilities.str).toBe(18); // 15 + 1 раса + 2 на 4-м
  });

  it('занятый id получает суффикс; «Закрыть» зовёт onClose', () => {
    const { onClose } = mount(['bo', 'bo-2']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Имя' }), { target: { value: 'Bo' } });
    expect(screen.getByTitle('id актёра в состоянии')).toHaveTextContent('bo-3');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
