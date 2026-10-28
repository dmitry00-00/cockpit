import {
  COLORS, TYPE_GROUPS, SHADOWS, SPACING, SIZES, RADII, OPACITIES, THEME_NAME, FONT_FAMILIES,
  type ColorToken,
} from '../styles/tokens.generated';
import IconSheet from '../icons/IconSheet';

/** Группы палитры по префиксу имени токена; порядок — лестница снизу вверх, потом семейства. */
const COLOR_GROUPS: readonly { title: string; test: (n: string) => boolean }[] = [
  { title: 'Поверхности', test: n => ['wl', 'bg', 'pn', 'cd', 'pl'].includes(n) },
  { title: 'Грани фаски', test: n => ['hi', 'lo', 'bd'].includes(n) },
  { title: 'Бронза и золото', test: n => ['br', 'bl', 'gd', 'gd-hi'].includes(n) },
  { title: 'Текст', test: n => ['tx', 't2', 't3', 't4'].includes(n) },
  { title: 'Характеристики', test: n => n.startsWith('ab-') },
  { title: 'Типы сущностей', test: n => n.startsWith('ent-') },
  { title: 'Эффекты', test: n => n.startsWith('fx-') },
  { title: 'Полоса хитов', test: n => n.startsWith('hp-') },
  { title: 'Происхождение факта', test: n => n.startsWith('src-') || n.startsWith('st-') },
  { title: 'Местность глобуса', test: n => n.startsWith('terrain-') },
  { title: 'Небо циферблата', test: n => n.startsWith('sky-') },
];

const TEXT_TOKENS = new Set(['tx', 't2', 't3', 'gd', 'gd-hi', 'bl', 'src-canon', 'src-sim', 'src-players']);

function Swatch({ token }: { token: ColorToken }) {
  const isText = TEXT_TOKENS.has(token.name) || token.name.endsWith('-hi');
  return (
    <div className="bg-cd shadow-bevel p-2 flex flex-col gap-1 min-w-0" title={token.usage}>
      <div className="h-8 shadow-bevel-in flex items-center justify-center" style={{ background: isText ? 'var(--pn)' : token.resolved }}>
        {isText && <span className="type-num-15" style={{ color: token.resolved }}>Aa 41/49</span>}
      </div>
      <div className="flex justify-between gap-2">
        <span className="type-key text-tx truncate">{token.name}</span>
        <span className="type-key text-t3">{token.resolved}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-h-20 text-tx">{title}</h2>
      {children}
    </section>
  );
}

export function TokensPage() {
  return (
    <main className="min-h-full p-6 flex flex-col gap-8 max-w-[1440px]">
      <header className="flex items-baseline gap-4">
        <h1 className="type-h-28 text-gd">{THEME_NAME}</h1>
        <span className="type-body-sm text-t2">токены · шаг 1 плана: лестница типографики и палитра</span>
      </header>

      <Section title="Типографика">
        <div className="bg-pn shadow-bevel p-4 flex flex-col gap-4">
          {TYPE_GROUPS.map(g => (
            <div key={g.name} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-3">
                <h3 className="type-h-15 text-t2">{g.name}</h3>
                <span className="type-key text-t3">{FONT_FAMILIES[g.family as keyof typeof FONT_FAMILIES]}</span>
              </div>
              {g.styles.map(st => (
                <div key={st.name} className="grid grid-cols-[96px_1fr_200px] items-center gap-4 py-1" style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }} title={st.usage}>
                  <span className="type-key text-t3">{st.name}</span>
                  <span className={`type-${st.name} text-tx truncate`}>{st.sample}</span>
                  <span className="type-key text-t3 text-right">{st.fontSize} / {st.lineHeight} · {st.fontWeight}{st.letterSpacing ? ` · ${st.letterSpacing}` : ''}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Палитра">
        <div className="flex flex-col gap-4">
          {COLOR_GROUPS.map(group => {
            const items = COLORS.filter(c => group.test(c.name));
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="flex flex-col gap-2">
                <h3 className="type-h-15 text-t2">{group.title}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                  {items.map(c => <Swatch key={c.name} token={c} />)}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Лестница поверхностей и рецепты фаски">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-wl p-4 shadow-bevel-in">
            <div className="bg-bg p-4">
              <div className="bg-pn p-4 shadow-bevel">
                <div className="bg-cd p-3 shadow-bevel">
                  <div className="bg-pl p-2 shadow-plate flex items-center justify-between">
                    <span className="type-h-15 text-tx">ПЛИТА</span>
                    <span className="type-num-15 text-gd">41/49</span>
                  </div>
                  <p className="type-body-xs text-t2 pt-2">wl → bg → pn → cd → pl: ступень не перепрыгивается.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 content-start">
            {SHADOWS.map(s => (
              <div key={s.name} className="bg-cd p-3 flex flex-col gap-1" style={{ boxShadow: `var(--${s.name})` }} title={s.usage}>
                <span className="type-key text-tx">{s.name}</span>
                <span className="type-body-xs text-t3 truncate">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Иконки">
        <IconSheet />
      </Section>

      <Section title="Сетка, размеры, радиус, прозрачность">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
          {[...SPACING, ...SIZES, ...RADII, ...OPACITIES].map(t => (
            <div key={t.name} className="bg-pn shadow-bevel px-3 py-2 flex justify-between gap-2" title={t.usage}>
              <span className="type-key text-tx">{t.name}</span>
              <span className="type-key text-t3">{t.value}</span>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
