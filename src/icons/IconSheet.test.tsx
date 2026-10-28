// Лист иконок: все 183 имени, каждое в одной группе, подпись не меньше 12px.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import IconSheet, { groupIcons } from './IconSheet';
import { ICON_NAMES } from './icons.generated';

afterEach(cleanup);

describe('IconSheet', () => {
  it('groupIcons раскладывает все 183 имени по группам без потерь и повторов, «Прочее» пусто', () => {
    const groups = groupIcons();
    const all = groups.flatMap((g) => g.names);
    expect(all.length).toBe(183);
    expect(new Set(all).size).toBe(183);
    expect(groups.map((g) => g.title)).toEqual([
      'Масштабы',
      'Сущности',
      'Происхождение',
      'Время и погода',
      'Действия',
      'Состояния',
      'Навыки',
      'Слоты экипировки',
      'Пины карты',
      'Характеристики',
      'Классы',
      'Школы магии',
      'Виды умений',
      'Расы',
    ]);
    expect(groups.find((g) => g.title === 'Происхождение')?.names).toContain('hidden');
    expect(groups.find((g) => g.title === 'Время и погода')?.names).toContain('moon-full');
  });

  it('рендерит 183 подписи и по две иконки на имя, кегль подписи 12px', () => {
    const { container } = render(<IconSheet />);
    const captions = [...container.querySelectorAll('figcaption')];
    expect(new Set(captions.map((c) => c.textContent))).toEqual(new Set(ICON_NAMES));
    expect(captions.length).toBe(183);
    expect(container.querySelectorAll('svg[role="img"]').length).toBe(366);
    for (const c of captions) {
      expect(parseFloat(c.style.fontSize)).toBeGreaterThanOrEqual(12);
      expect(c.getAttribute('title')).toBe(c.textContent);
    }
  });
});
