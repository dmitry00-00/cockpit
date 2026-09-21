// Лист иконок для страницы токенов: все 105 сеткой, по группам, с именами.
// Фрагмент без роутинга. Tailwind — только раскладка; цвета — через переменные токенов.

import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import { ICON_NAMES, type IconName } from './icons.generated';

interface Group {
  title: string;
  test: (name: IconName) => boolean;
}

const WEATHER = new Set<string>(['dawn', 'day', 'dusk', 'night', 'cloudy', 'rain', 'storm', 'wind']);

/** Порядок групп — как разделы генератора. Имя, не попавшее ни в одну, уходит в «Прочее». */
const GROUPS: readonly Group[] = [
  { title: 'Масштабы', test: (n) => n.startsWith('scale-') },
  { title: 'Сущности', test: (n) => n.startsWith('ent-') },
  { title: 'Происхождение', test: (n) => n.startsWith('src-') || n === 'hidden' },
  { title: 'Время и погода', test: (n) => WEATHER.has(n) || n.startsWith('moon-') },
  { title: 'Действия', test: (n) => !n.includes('-') && !WEATHER.has(n) && n !== 'hidden' },
  { title: 'Состояния', test: (n) => n.startsWith('cond-') },
  { title: 'Навыки', test: (n) => n.startsWith('skill-') },
  { title: 'Слоты экипировки', test: (n) => n.startsWith('slot-') },
  { title: 'Пины карты', test: (n) => n.startsWith('pin-') },
];

export interface IconGroup {
  title: string;
  names: IconName[];
}

/** Раскладывает имена по группам, сохраняя порядок генератора внутри группы; пустые группы не показываются. */
export function groupIcons(names: readonly IconName[] = ICON_NAMES): IconGroup[] {
  const buckets: IconGroup[] = GROUPS.map((g) => ({ title: g.title, names: [] }));
  const rest: IconGroup = { title: 'Прочее', names: [] };
  for (const name of names) {
    const i = GROUPS.findIndex((g) => g.test(name));
    const bucket = i >= 0 ? buckets[i] : rest;
    bucket.names.push(name);
  }
  return [...buckets, rest].filter((b) => b.names.length > 0);
}

const heading: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 17,
  lineHeight: '21px',
  fontWeight: 400,
  color: 'var(--tx)',
  margin: 0,
};

const count: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: '16px',
  color: 'var(--t2)',
};

const cell: CSSProperties = {
  background: 'var(--pn)',
  boxShadow: 'var(--bevel)',
  padding: 'var(--space-3)',
  margin: 0,
  minWidth: 0,
};

/** Стиль key из tokens.css: моно 12/16. Длинное имя обрезается, полное — в тултипе. */
const label: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: '16px',
  color: 'var(--t2)',
  maxWidth: '100%',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export default function IconSheet() {
  const groups = groupIcons();
  return (
    <div className="flex flex-col gap-6" data-testid="icon-sheet">
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h3 style={heading}>{g.title}</h3>
            <span style={count}>{g.names.length}</span>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}>
            {g.names.map((name) => (
              <figure key={name} className="flex flex-col items-center gap-2" style={cell}>
                <Icon name={name} size={48} title={name} />
                <Icon name={name} size={16} title={name} />
                <figcaption style={label} title={name}>
                  {name}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
