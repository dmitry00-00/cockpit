import { POST_SPELLPLAGUE_FR4E } from './postSpellplagueFr4e.data';
import type { PostSpellplagueLink, PostSpellplagueNode } from './postSpellplagueFr4e.types';
import type { ReactNode } from 'react';

export interface PostSpellplagueFr4eProps {
  className?: string;
  tools?: ReactNode;
}

const NODE_FILL: Record<PostSpellplagueNode['kind'], string> = {
  world: 'var(--pn)',
  reflection: 'var(--wl)',
  transitive: 'var(--pn)',
  divine: 'var(--wl)',
  elemental: 'var(--pn)',
  abyss: 'var(--wl)',
};

const NODE_STROKE: Record<PostSpellplagueNode['kind'], string> = {
  world: 'var(--gd)',
  reflection: 'var(--t3)',
  transitive: 'var(--t2)',
  divine: 'var(--gd)',
  elemental: 'var(--t2)',
  abyss: 'var(--t3)',
};

function edgeStyle(link: PostSpellplagueLink) {
  if (link.style === 'reflection') return { strokeDasharray: '7 6', stroke: 'var(--t3)' };
  if (link.style === 'containment') return { strokeDasharray: '2 5', stroke: 'var(--gd)' };
  return { stroke: 'var(--t2)' };
}

function edgeEnds(from: PostSpellplagueNode, to: PostSpellplagueNode) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const fromScale = Math.min(
    dx === 0 ? Infinity : (from.width / 2) / Math.abs(dx),
    dy === 0 ? Infinity : (from.height / 2) / Math.abs(dy),
  );
  const toScale = Math.min(
    dx === 0 ? Infinity : (to.width / 2) / Math.abs(dx),
    dy === 0 ? Infinity : (to.height / 2) / Math.abs(dy),
  );
  return {
    x1: from.x + dx * fromScale,
    y1: from.y + dy * fromScale,
    x2: to.x - dx * toScale,
    y2: to.y - dy * toScale,
  };
}

/** Standalone, non-interactive SVG view of the 4e source snapshot. */
export function PostSpellplagueFr4e({ className = '', tools }: PostSpellplagueFr4eProps) {
  const { nodes, links } = POST_SPELLPLAGUE_FR4E;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const nodeById = (id: string) => byId.get(id)!;

  return (
    <section className={`flex min-h-0 min-w-0 flex-col gap-3 overflow-auto bg-wl p-3 ${className}`} data-part="post-spellplague-fr4e">
      {tools ? <div className="flex flex-none flex-wrap items-center justify-end gap-1" role="toolbar" aria-label="Модель космологии">{tools}</div> : null}
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="m-0 font-display text-tx">{POST_SPELLPLAGUE_FR4E.title}</h2>
          <p className="m-0 type-body-sm text-t2">{POST_SPELLPLAGUE_FR4E.edition} · {POST_SPELLPLAGUE_FR4E.sourceSlice}</p>
        </div>
        <p className="m-0 max-w-prose type-body-sm text-t3">{POST_SPELLPLAGUE_FR4E.contextNote} Это выбранная схема отображения, а не дата перехода мира на неё.</p>
      </header>
      <svg
        viewBox="0 0 1000 740"
        role="img"
        aria-label={`${POST_SPELLPLAGUE_FR4E.title}. Схема планов и отражений.`}
        className="min-h-[360px] w-full flex-1"
        preserveAspectRatio="xMidYMid meet"
        style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}
      >
        <title>{POST_SPELLPLAGUE_FR4E.title}</title>
        <desc>{`${POST_SPELLPLAGUE_FR4E.sourceSlice}. ${POST_SPELLPLAGUE_FR4E.contextNote} Источник схемы: ${POST_SPELLPLAGUE_FR4E.source}.`}</desc>
        {(() => {
          const astral = nodeById('astral-sea');
          return <g data-region="astral-sea" role="group" aria-label={`${astral.name}. ${astral.summary} Источник: ${astral.source}.`}>
            <ellipse cx={astral.x} cy={astral.y} rx={astral.width / 2} ry={astral.height / 2} fill={NODE_FILL.transitive} stroke={NODE_STROKE.transitive} strokeWidth="2" />
            <text x={astral.x} y={astral.y - astral.height / 2 + 28} textAnchor="middle" fill="var(--tx)">{astral.name}</text>
            <title>{`${astral.name}. ${astral.summary} Источник: ${astral.source}.`}</title>
          </g>;
        })()}
          {links.map(link => {
          const from = nodeById(link.from), to = nodeById(link.to);
          if (link.style === 'containment') {
              return <g key={link.id} data-link={link.id} data-style={link.style} role="group" aria-label={`${link.summary} Источник: ${link.source}.`}>
              <title>{`${link.summary} Источник: ${link.source}.`}</title>
            </g>;
          }
          const { x1, y1, x2, y2 } = edgeEnds(from, to);
          const style = edgeStyle(link);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          return <g key={link.id} data-link={link.id} data-style={link.style} role="group" aria-label={`${link.summary} Источник: ${link.source}.`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} {...style} strokeWidth="2" />
            <text x={mx} y={my - 7} textAnchor="middle" fill="var(--t3)" fontSize="15">{link.label}</text>
            <title>{`${link.summary} Источник: ${link.source}.`}</title>
          </g>;
        })}
        {nodes.filter(node => node.id !== 'astral-sea').map(node => (
          <g key={node.id} data-node={node.id} role="group" aria-label={`${node.name.replace('\n', ', ')}. ${node.summary} Источник: ${node.source}.`}>
            <rect
              x={node.x - node.width / 2} y={node.y - node.height / 2}
              width={node.width} height={node.height} rx={node.kind === 'world' ? 5 : 26}
              fill={NODE_FILL[node.kind]} stroke={NODE_STROKE[node.kind]} strokeWidth={node.kind === 'world' ? 3 : 2}
            />
            <text x={node.x} y={node.y + (node.name.includes('\n') ? -4 : 6)} textAnchor="middle" fill="var(--tx)">
              {node.name.split('\n').map((line, index) => <tspan key={`${node.id}-${index}`} x={node.x} dy={index === 0 ? 0 : '1.1em'}>{line}</tspan>)}
            </text>
            <title>{`${node.name}. ${node.summary} Источник: ${node.source}.`}</title>
          </g>
        ))}
      </svg>
      <details className="flex-none bg-cd p-3 shadow-bevel-in">
        <summary className="cursor-pointer type-body-sm text-tx">Текстовая расшифровка узлов и связей</summary>
        <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-2">
          <section aria-label="Узлы схемы">
            <h3 className="type-h-17 text-tx">Узлы</h3>
            <ul className="flex flex-col gap-2">
              {nodes.map(node => (
                <li key={node.id} className="bg-wl p-2">
                  <strong className="type-body-sm text-tx">{node.name.replace('\n', ' · ')}</strong>
                  <p className="m-0 type-body-sm text-t2">{node.summary}</p>
                  <a href={node.sourceUrl} target="_blank" rel="noreferrer" className="type-body-xs text-t3 underline hover:text-tx">{node.source}</a>
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Связи схемы">
            <h3 className="type-h-17 text-tx">Связи</h3>
            <ul className="flex flex-col gap-2">
              {links.map(link => (
                <li key={link.id} className="bg-wl p-2">
                  <strong className="type-body-sm text-tx">{link.label}</strong>
                  <p className="m-0 type-body-sm text-t2">{link.summary}</p>
                  <a href={link.sourceUrl} target="_blank" rel="noreferrer" className="type-body-xs text-t3 underline hover:text-tx">{link.source}</a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </details>
      <footer className="type-body-sm text-t3" data-source={POST_SPELLPLAGUE_FR4E.source}>
        Схематичное расположение — авторская визуализация отношений, не масштаб. Источник: <a href={POST_SPELLPLAGUE_FR4E.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-tx">{POST_SPELLPLAGUE_FR4E.source}</a>.
      </footer>
    </section>
  );
}
