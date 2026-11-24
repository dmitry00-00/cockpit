// Экран создания персонажа: шаги по порядку и обратимо, живая карточка справа (те же числа, что даст derive), «осталось
// выбрать» у шагов и в карточке; выборы умений, заклинания и снаряжение из таблиц и SRD; «В партию» отдаёт PcSpec,
// из которого получается тот же актёр; id уникален среди занятых; ни одной пиктограммы.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCharacter, pcActor, type PcSpec } from '../../campaign';
import { EventLog } from '../../engine';
import { seedState } from '../../campaign';
import { CharacterEditor } from './CharacterEditor';

const EMOJI = /\p{Extended_Pictographic}/u;

afterEach(cleanup);

function mount(taken: string[] = [], face: 'card' | 'sheet' = 'sheet') {
  const onCreate = vi.fn<(spec: PcSpec) => void>();
  const onClose = vi.fn();
  render(<CharacterEditor takenIds={new Set(taken)} onCreate={onCreate} onClose={onClose} initialFace={face} />);
  return { onCreate, onClose };
}

const editor = () => document.querySelector<HTMLElement>('[data-part="character-editor"]')!;
const sheet = () => within(editor()).getByRole('complementary', { name: 'Лист' });
const steps = () => within(editor()).getByRole('navigation', { name: 'Шаги' });
const stepNames = () => within(steps()).getAllByRole('button').map(b => b.getAttribute('aria-label'));
const stepButton = (label: string) => within(steps()).getByRole('button', { name: label });
const goto = (label: string) => fireEvent.click(stepButton(label));
const group = (name: string) => within(editor()).getByRole('group', { name });
const option = (g: string, name: string | RegExp) => within(group(g)).getByRole('button', { name });
const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed') === 'true';
const spawn = () => within(editor()).getByRole('button', { name: 'В партию' });
const select = (label: string, value: string) => fireEvent.change(within(editor()).getByRole('combobox', { name: label }), { target: { value } });

/** Человек-воин: стиль «Оборона», навык и черта расы, кольчуга, меч со щитом — то, что сделает игрок за столом. */
function fillFighter(level = 1) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Имя' }), { target: { value: 'Sildar Hallwinter' } });
  goto('Раса');
  fireEvent.click(option('Навыки расы', 'Скрытность'));
  select('Черта расы', 'bditel-nyy');
  goto('Класс');
  for (let i = 1; i < level; i++) fireEvent.click(screen.getByRole('button', { name: 'Уровень выше' }));
  if (level >= 3) fireEvent.click(option('Подкласс', /^Чемпион/));
  if (level >= 4) {
    goto('Характеристики');
    fireEvent.click(screen.getByTitle('+1 Сила на 4-м уровне'));
    fireEvent.click(screen.getByTitle('+1 Сила на 4-м уровне'));
  }
  goto('Навыки');
  fireEvent.click(option('Предыстории', /^Солдат/));
  fireEvent.click(within(group('Навыки')).getByTitle(/^Внимательность/));
  fireEvent.click(within(group('Навыки')).getByTitle(/^История/));
  goto('Умения класса');
  fireEvent.click(option('Боевой стиль', /^Оборона/));
  goto('Снаряжение');
  fireEvent.click(option('Снаряжение: выбор 1', /Chain Mail/));
  fireEvent.click(option('Снаряжение: выбор 2', /Shield/));
  select('любое воинское оружие, 1', 'longsword');
  fireEvent.click(option('Снаряжение: выбор 3', /Handaxe/));
  fireEvent.click(option('Снаряжение: выбор 4', /Explorer/));
}

describe('экран создания персонажа', () => {
  it('карта развития уважает фильтр источников и не создаёт персонажа при просмотре', () => {
    const { onCreate } = mount();
    goto('Имя');
    const sources = screen.getByRole('group', { name: 'Источники' });
    fireEvent.click(within(sources).getByRole('button', { name: 'книга' }));
    fireEvent.click(within(sources).getByRole('button', { name: 'HB' }));
    goto('Класс');
    fireEvent.click(screen.getByText('Карта развития класса', { selector: 'summary' }));
    const preview = screen.getByRole('region', { name: /^Развитие:/ });
    const select = within(preview).getByRole('combobox', { name: 'Подкласс для просмотра' });
    expect([...select.querySelectorAll('option')].filter(o=>o.value).every(o=>o.textContent?.includes('SRD'))).toBe(true);
    fireEvent.click(within(preview).getByRole('button', { name: 'Уровень 20: сводка' }));
    expect(onCreate).not.toHaveBeenCalled();
  });
  it('старт: шаги по порядку со «осталось», карточка уже живая (человек-воин 1-го: 12 хитов, AC 12), «В партию» выключена; пиктограмм нет', () => {
    mount();
    expect(editor()).not.toHaveTextContent(EMOJI);
    expect(stepNames()).toEqual(['Имя', 'Раса', 'Класс', 'Божество', 'Характеристики', 'Навыки', 'Умения класса', 'Снаряжение']);
    expect(stepButton('Имя')).toHaveAttribute('aria-current', 'step');
    const card = within(sheet());
    expect(card.getByTitle('Хиты')).toHaveTextContent('12');
    expect(card.getByTitle('Класс доспеха')).toHaveTextContent('12');
    const left = card.getByRole('region', { name: 'Осталось выбрать' });
    expect(left).toHaveTextContent('Имя · ещё 1');
    expect(left).toHaveTextContent('Умения класса · ещё 1');
    expect(spawn()).toBeDisabled();
    // Клик по строке «осталось» открывает шаг.
    fireEvent.click(within(left).getByRole('button', { name: /^Снаряжение/ }));
    expect(stepButton('Снаряжение')).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(stepButton('Умения класса')).toHaveAttribute('aria-current', 'step');
  });

  it('характеристики: стандартный набор обменом, point buy очками; итог = база + раса', () => {
    mount();
    goto('Характеристики');
    const stats = group('Очки характеристик');
    const final = () => [...stats.querySelectorAll('[data-part="final"]')].map(e => e.textContent);
    expect(final()).toEqual(['16', '15', '14', '13', '11', '9']); // человек: +1 ко всему
    select('Интеллект: значение набора', '15'); // обмен с Силой
    expect(final()).toEqual(['13', '15', '14', '16', '11', '9']);
    fireEvent.click(option('Способ', 'Point buy'));
    expect(screen.getByTitle('Очки: 27 на всё, 8–15 до бонусов расы')).toHaveTextContent('осталось 0 из 27');
    fireEvent.click(within(stats).getByRole('button', { name: 'Интеллект ниже' })); // 15 → 14: +2 очка
    expect(screen.getByTitle('Очки: 27 на всё, 8–15 до бонусов расы')).toHaveTextContent('осталось 2 из 27');
    fireEvent.click(within(stats).getByRole('button', { name: 'Харизма выше' }));
    expect(final()).toEqual(['13', '15', '14', '15', '11', '10']);
    expect(within(stats).getByRole('button', { name: 'Ловкость выше' })).toBeDisabled(); // 14 → 15 стоит 2, осталось 1
  });

  it('раса: эльф требует подрасу; полуэльф — +1 к двум на выбор и два навыка; смена класса на волшебника — шаг «Заклинания» вместо «Умения класса»', () => {
    mount();
    goto('Раса');
    fireEvent.click(within(group('Расы')).getByRole('button', { name: /^Эльф/ }));
    expect(within(group('Подраса')).queryByRole('button', { name: 'без подрасы' })).toBeNull();
    expect(within(group('Подраса')).getAllByRole('button').some(pressed)).toBe(true);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск расы' }), { target: { value: 'полуэ' } });
    fireEvent.click(within(group('Расы')).getByRole('button', { name: /^Полуэльф/ }));
    const flex = group('Бонус расы на выбор');
    expect(within(flex).getByRole('button', { name: 'CHA' })).toBeDisabled();
    fireEvent.click(within(flex).getByRole('button', { name: 'DEX' }));
    fireEvent.click(within(flex).getByRole('button', { name: 'CON' }));
    expect(within(flex).getByRole('button', { name: 'WIS' })).toBeDisabled();
    const card = sheet();
    expect(within(card).getByTitle(/^Ловкость/)).toHaveTextContent('15');
    goto('Класс');
    fireEvent.click(option('Классы', /^Волшебник/));
    expect(stepNames()).toEqual(['Имя', 'Раса', 'Класс', 'Божество', 'Характеристики', 'Навыки', 'Заклинания', 'Снаряжение']);
    expect(stepButton('Раса')).toHaveTextContent('2'); // два навыка расы не выбраны
  });

  it('показывает названия классов целиком и объясняет сброс класса как незавершённое изменение черновика', () => {
    mount();
    goto('Навыки');
    fireEvent.click(within(group('Навыки')).getByTitle(/^Внимательность/));
    goto('Класс');
    const wizard = option('Классы', /^Волшебник/);
    expect(wizard).toHaveTextContent('Волшебник');
    expect(wizard.querySelector('span')?.className).toContain('whitespace-normal');
    fireEvent.click(wizard);
    const notice = within(editor()).getByRole('status');
    expect(notice).toHaveTextContent('Сброшено: навыки класса');
    expect(notice.parentElement).toHaveAttribute('data-part', 'choices');
    expect(notice.closest('[role="region"]')).toBeNull();
    expect(spawn()).toBeDisabled(); // смена остаётся в черновике, до ACTOR_SPAWNED дело не дошло
  });

  it('навыки: предыстория сверх класса и снимает совпавший выбор; лимит класса держится; не предложенный классом — выключен с причиной', () => {
    mount();
    goto('Навыки');
    const skills = group('Навыки');
    fireEvent.click(within(skills).getByTitle(/^Атлетика/));
    fireEvent.click(within(skills).getByTitle(/^Внимательность/));
    expect(within(skills).getByTitle(/^История/)).toBeDisabled();
    fireEvent.click(option('Предыстории', /^Солдат/));
    expect(within(skills).getByTitle(/^Атлетика/).title).toContain('предыстория');
    expect(screen.getByTitle('Навыки класса; предыстория и раса — сверх них')).toHaveTextContent('выбрать ещё 1');
    expect(within(skills).getByTitle(/^Магия/).title).toContain('класс не предлагает');
  });

  it('воин 5-го уровня до конца: стиль «Оборона» в карточке и в AC (19), атаки, снаряжение; «В партию» отдаёт спецификацию того же актёра', () => {
    const { onCreate } = mount(['bo']);
    fillFighter(5);
    const s = sheet();
    expect(within(s).queryByRole('region', { name: 'Осталось выбрать' })).toBeNull();
    expect(within(s).getByTitle('Хиты')).toHaveTextContent('44');
    expect(within(s).getByTitle('Класс доспеха')).toHaveTextContent('19');
    expect(within(s).getByTitle('Пассивная внимательность')).toHaveTextContent('13');
    expect(within(s).getByRole('region', { name: 'Выборы умений' })).toHaveTextContent('Оборона');
    expect(within(s).getByRole('region', { name: 'Черты' })).toHaveTextContent('Бдительный');
    expect(within(s).getByRole('list', { name: 'Атаки листа' })).toHaveTextContent('Longsword');
    expect(within(s).getByRole('list', { name: 'Снаряжение листа' })).toHaveTextContent('Chain Mail');
    expect(within(s).getByRole('list', { name: 'Умения листа' })).toHaveTextContent('Улучшенные критические попадания');
    expect(screen.getByTitle('id актёра в состоянии')).toHaveTextContent('sildar-hallwinter');
    expect(spawn()).toBeEnabled();
    fireEvent.click(spawn());
    const spec = onCreate.mock.calls[0][0];
    expect(spec).toMatchObject({ id: 'sildar-hallwinter', classId: 'voin', subclassId: 'voin-cempion', level: 5, armor: 'chain-mail', shield: true, choices: { 'fighting-style': ['oborona'], 'race-skills': ['stealth'] } });
    const actor = pcActor(spec);
    expect(actor).toMatchObject({ hp: { current: 44, max: 44 }, ac: 19, passivePerception: 13 });
    expect(actor.sheet!.attacks!.map(a => a.name)).toEqual(['Longsword', 'Handaxe']);
    expect(deriveCharacter(spec).abilities.str).toBe(18);
  });

  it('встроенный портрет выбирается явно, очищается вариантом без портрета и сохраняется через ACTOR_SPAWNED/replay', async () => {
    const { onCreate } = mount([], 'card');
    fillFighter();
    const picker = group('Выбрать встроенный портрет');
    expect(within(picker).getByRole('button', { name: 'Без портрета' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(picker).getByRole('button', { name: 'Bo · живописный портрет' }));
    expect(await within(sheet()).findByRole('img', { name: 'Портрет: Sildar Hallwinter' })).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole('button', { name: 'Без портрета' }));
    expect(within(sheet()).queryByRole('img', { name: 'Портрет: Sildar Hallwinter' })).toBeNull();
    fireEvent.click(within(picker).getByRole('button', { name: 'Bo · живописный портрет' }));

    fireEvent.click(spawn());
    const spec = onCreate.mock.calls[0][0];
    expect(spec.portrait).toBe('bo-portrait');
    const actor = pcActor(spec);
    expect(actor.sheet?.portrait).toBe('bo-portrait');
    const log = new EventLog(seedState());
    log.dispatch({ type: 'ACTOR_SPAWNED', payload: { actor, party: true } });
    const replayed = new EventLog(seedState(), log.entries);
    expect(replayed.state.actors[actor.id].sheet?.portrait).toBe('bo-portrait');
  });

  it('волшебник: заговоры и книга заклинаний из списка SRD со счётчиками, описание дословно, карточка показывает Сл и списки', () => {
    mount();
    goto('Класс');
    fireEvent.click(option('Классы', /^Волшебник/));
    goto('Заклинания');
    fireEvent.mouseEnter(option('Заговоры', /^Fire Bolt/));
    expect(within(editor()).getByRole('region', { name: 'Описание заклинания' })).toHaveTextContent('You hurl a mote of fire');
    for (const n of ['Fire Bolt', 'Light', 'Mage Hand']) fireEvent.click(option('Заговоры', new RegExp(`^${n}`)));
    expect(option('Заговоры', /^Ray of Frost/)).toBeDisabled();
    fireEvent.click(option('Заклинания 1 круга', /^Magic Missile/));
    expect(stepButton('Заклинания')).toHaveTextContent('5');
    const spells = within(sheet()).getByRole('region', { name: 'Заклинания' });
    expect(spells).toHaveTextContent('INT · Сл 11 · атака +3');
    expect(within(spells).getByRole('list', { name: 'Заговоры' })).toHaveTextContent('Fire Bolt');
    expect(spells).toHaveTextContent('Magic Missile');
    expect(spells).toHaveTextContent('осталось: заклинаний 5');
  });

  it('класс из книги: честно «нет данных» — лист не собирается и говорит почему', () => {
    mount();
    goto('Класс');
    fireEvent.click(option('Классы', /^Изобретатель/));
    expect(within(sheet()).getByRole('list', { name: 'Что мешает' })).toHaveTextContent('не из SRD: нет кости хитов');
    expect(spawn()).toBeDisabled();
  });

  it('жрец (E8): шаг «Божество» обязателен, домен Жизни — только боги с Life; бог без домена подкласса — ошибка', async () => {
    mount();
    goto('Класс');
    fireEvent.click(option('Классы', /^Жрец/));
    fireEvent.click(option('Подкласс', /^Жизни/));
    expect(stepButton('Божество')).toHaveTextContent('1');
    goto('Божество');
    const gods = await within(editor()).findByRole('group', { name: 'Боги' }, { timeout: 10000 });
    const names = within(gods).getAllByRole('button').map(b => b.textContent ?? '');
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) expect(n, n).toMatch(/\bLife\b/i);
    expect(within(gods).queryByRole('button', { name: 'без бога' })).toBeNull();
    // Подсказка расы: человек — Faerûnian pantheon.
    fireEvent.click(within(editor()).getByRole('button', { name: 'Почитатели расы: Faerûnian pantheon' }));
    fireEvent.click(within(gods).getByRole('button', { name: /^Lathander/ }));
    expect(stepButton('Божество')).not.toHaveTextContent(/ещё/);
    expect(sheet()).toHaveTextContent('БожествоLathander');
    goto('Класс');
    fireEvent.click(option('Подкласс', /^Войны/));
    expect(within(sheet()).getByRole('list', { name: 'Что мешает' })).toHaveTextContent('божество Lathander не даёт домен Войны');
    fireEvent.click(option('Подкласс', /^Жизни/));
    expect(within(sheet()).queryByText(/не даёт домен/)).toBeNull();
  // Справочник богов — отдельный кусок: под полным прогоном импорт дольше пяти секунд по умолчанию.
  }, 20000);

  it('не жрецу бог по желанию: «без бога» выбран, шаг без «осталось»', async () => {
    mount();
    goto('Божество');
    const gods = await within(editor()).findByRole('group', { name: 'Боги' }, { timeout: 10000 });
    expect(within(gods).getByRole('button', { name: 'без бога' })).toHaveAttribute('aria-pressed', 'true');
    expect(stepButton('Божество')).not.toHaveTextContent(/ещё/);
  }, 20000);

  it('занятый id получает суффикс; «Закрыть» зовёт onClose', () => {
    const { onClose } = mount(['bo', 'bo-2']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Имя' }), { target: { value: 'Bo' } });
    expect(screen.getByTitle('id актёра в состоянии')).toHaveTextContent('bo-3');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('редактор-карточка (образец владельца dnd-character-editor.jsx, 30.10.2026)', () => {
  const ecard = () => within(editor()).getByRole('article', { name: 'Карта персонажа: редактор' });
  const numbers = () => within(ecard()).getByRole('group', { name: 'Числа листа' });

  it('в узкой раскладке карточку можно отдельно открыть и закрыть без потери черновика', () => {
    const { onCreate } = mount([], 'card');
    const main = within(editor()).getByRole('complementary', { name: 'Лист' }).parentElement!;
    const toggle = within(editor()).getByRole('button', { name: 'Предпросмотр' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(main).toHaveAttribute('data-mobile-preview', 'true');
    fireEvent.click(within(editor()).getByRole('button', { name: 'К управлению' }));
    expect(main).toHaveAttribute('data-mobile-preview', 'false');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('по умолчанию справа карта: числа мягкого вывода, имя на корешке — то же поле черновика, что в шаге «Имя»', () => {
    mount([], 'card');
    // Человек-воин 1-го: 12 хитов, КД 12, d10, +2 — те же числа, что даёт лист.
    expect(numbers()).toHaveTextContent('КД12');
    expect(numbers()).toHaveTextContent('Хиты12');
    expect(numbers()).toHaveTextContent('Костьd10');
    fireEvent.change(within(ecard()).getByRole('textbox', { name: 'Имя на карте' }), { target: { value: 'Sildar' } });
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Sildar');
    expect(within(ecard()).getByText('Sildar')).toBeInTheDocument();
    fireEvent.click(within(editor()).getByRole('tab', { name: 'Лист' }));
    expect(within(editor()).queryByRole('article', { name: 'Карта персонажа: редактор' })).toBeNull();
  });

  it('раса и класс — со списка на корешке; point buy «−» и «+» на карте тратит те же 27 очков; итог — база + раса', () => {
    mount([], 'card');
    fireEvent.click(within(ecard()).getByRole('button', { name: 'Раса' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Раса' })).getByRole('button', { name: /^Полурослик/ }));
    fireEvent.click(within(ecard()).getByRole('button', { name: 'Класс' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Класс' })).getByRole('button', { name: /^Следопыт/ }));
    expect(within(editor()).getAllByRole('banner')[0]).toHaveTextContent(/Полурослик · .* · Следопыт/);
    expect(within(ecard()).getByRole('button', { name: 'Раса' }).title).toContain('Полурослик');
    expect(numbers()).toHaveTextContent('Костьd10');
    goto('Характеристики');
    fireEvent.click(option('Способ', 'Point buy'));
    const pts = within(ecard()).getByRole('group', { name: 'Очки характеристик на карте' });
    const dex = pts.querySelector<HTMLElement>('[data-ability="dex"]')!;
    const before = Number(dex.querySelector('[data-part="base"]')!.textContent);
    // Point buy начинается с раскладки на все 27 очков: «+» выключен, «−» возвращает очко.
    expect(within(dex).getByRole('button', { name: 'Ловкость выше на карте' })).toBeDisabled();
    fireEvent.click(within(dex).getByRole('button', { name: 'Ловкость ниже на карте' }));
    expect(Number(dex.querySelector('[data-part="base"]')!.textContent)).toBe(before - 1);
    expect(within(ecard()).getByText(/^осталось [1-9]\d* из 27$/)).toBeInTheDocument();
    // Полурослик: +2 DEX — итог на карте и в шаге одинаковы.
    expect(Number(dex.querySelector('[data-part="final"]')!.textContent)).toBe(before + 1);
    expect(group('Очки характеристик').querySelector('[data-ability="dex"] [data-part="final"]')!.textContent).toBe(String(before + 1));
  });

  it('предыстория строкой со списком; навыки на карте — отметка «П» у предыстории, выбор класса до лимита, «выбрать ещё N»', () => {
    mount([], 'card');
    fireEvent.click(within(ecard()).getByRole('button', { name: 'Предыстория' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Предыстории' })).getByRole('button', { name: /^Солдат/ }));
    const skills = within(ecard()).getByRole('group', { name: 'Навыки на карте' });
    const athletics = skills.querySelector<HTMLElement>('[data-skill="athletics"]')!;
    expect(athletics.title).toContain('предыстория');
    expect(athletics).toHaveTextContent('П');
    expect(within(ecard()).getByText(/^выбрать ещё 2$/)).toBeInTheDocument();
    fireEvent.click(skills.querySelector<HTMLElement>('[data-skill="perception"]')!);
    fireEvent.click(skills.querySelector<HTMLElement>('[data-skill="survival"]')!);
    expect(within(ecard()).getByText('класс: 2 из 2')).toBeInTheDocument();
    expect(skills.querySelector<HTMLElement>('[data-skill="history"]')).toBeDisabled();
    // Тот же черновик: в шаге «Навыки» выбор виден.
    goto('Навыки');
    expect(pressed(within(group('Навыки')).getByTitle(/^Внимательность/))).toBe(true);
    expect(EMOJI.test(ecard().textContent ?? '')).toBe(false);
  });
});
