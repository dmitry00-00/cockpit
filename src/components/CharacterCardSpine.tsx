import { Icon } from '../icons/Icon';
import type { CharacterCardData } from '../campaign/characterCard';
import { PortraitImage, resolvePortrait } from '../art/portrait';
import { lazy, Suspense } from 'react';
import type { IconName } from '../icons/Icon';

const ClassEmblem = lazy(() => import('../art/ClassEmblem').then(module => ({ default: module.ClassEmblem })));
const CLASS_ICONS = new Set<IconName>(['cls-voin', 'cls-paladin', 'cls-varvar', 'cls-monah', 'cls-plut', 'cls-sledopyt', 'cls-izobretatel', 'cls-bard', 'cls-koldun', 'cls-carodey', 'cls-volsebnik', 'cls-druid', 'cls-jrec']);
import './CharacterCard.css';

const BTN = 'type-num-12 uppercase whitespace-nowrap px-1.5 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const TIER = 'shadow-[inset_0_-2px_0_var(--br)]';
const STATUS_TONE = { debuff: 'text-fx-debuff-hi', buff: 'text-fx-buff-hi', conc: 'text-src-sim' } as const;

export interface CharacterCardSpineProps {
  card: CharacterCardData;
  onSheet?: () => void;
  onCollapse?: () => void;
  /** Render the card's header content without interactive controls or header semantics. */
  compact?: boolean;
  /** Use compact party-grid proportions when this is a real card header. */
  fit?: boolean;
  /** Use the portrait-led identity block on a full card; party spines stay compact. */
  hero?: boolean;
}

/** Shared visual spine used both on the open card and in the party's collapsed row. */
export function CharacterCardSpine({ card, onSheet, onCollapse, compact = false, fit = false, hero = false }: CharacterCardSpineProps) {
  const { header } = card;
  const portrait = resolvePortrait(card.portrait);
  const fallbackPortrait = <Icon name="ent-pc" size={hero ? 48 : 16} color="var(--gd)" title={card.name} />;
  const content = <>
    <span data-part="party-spine-portrait" className="relative flex-none size-8 grid place-items-center overflow-hidden bg-linear-to-br from-pl to-wl shadow-[inset_0_0_0_2px_var(--bl)]" title={portrait ? `Портрет: ${card.name}` : 'Портрет: заглушка персонажа'}>
      {portrait ? <PortraitImage portrait={portrait} alt={`Портрет: ${card.name}`} width={hero ? 112 : 32} sizes={hero ? '112px' : '32px'} className="size-8 object-cover" fallback={fallbackPortrait} /> : fallbackPortrait}
      <span data-part="party-spine-level" className="absolute -right-1 -bottom-1 type-key text-bg bg-gd px-0.5 shadow-[0_0_0_1px_var(--bg)]" title="Уровень">{header.level}</span>
    </span>
    <span data-part="party-spine-identity" className="flex-1 min-w-0 flex flex-col text-left">
      <span className="truncate type-h-17 text-tx" title={card.name}>{card.name}</span>
      {hero && header.title ? <span data-part="spine-title" className="truncate type-body-sm text-t2" title={header.title}>{header.title}</span> : null}
      {card.chips.length || card.strife ? (
        <span data-part="spine-statuses" role="group" aria-label="Активные состояния и эффекты" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {card.chips.map(status => {
            const description = [status.label, status.level !== undefined ? `уровень ${status.level}` : '', status.timer].filter(Boolean).join(' · ');
            return (
              <span key={status.key} data-part="spine-status" data-kind={status.kind ?? 'debuff'} role="img" aria-label={description} title={description} className={`relative size-5 flex-none grid place-items-center bg-wl shadow-bevel-in ${STATUS_TONE[status.kind ?? 'debuff']}`}>
                <Icon name={status.icon} size={16} color="currentColor" title={description} />
                {status.level !== undefined ? <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 type-key text-bg bg-pl px-0.5 leading-none">{status.level}</span> : null}
              </span>
            );
          })}
          {card.strife ? (
            <span data-part="spine-status" data-kind="debuff" role="img" aria-label={`A5E Strife ${card.strife.level}`} title={`A5E Strife ${card.strife.level}`} className="relative size-5 flex-none grid place-items-center bg-wl shadow-bevel-in text-fx-debuff-hi">
              <Icon name="pulse" size={16} color="currentColor" title={`A5E Strife ${card.strife.level}`} />
              <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 type-key text-bg bg-pl px-0.5 leading-none">{card.strife.level}</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
    {header.emblems?.map(e => <span data-part="party-spine-emblem" key={e.title} className="flex-none size-6 grid place-items-center bg-wl shadow-bevel-in">{CLASS_ICONS.has(e.icon) ? <Suspense fallback={<Icon name={e.icon} size={16} title={e.title} />}><ClassEmblem icon={e.icon} title={e.title} size={compact || fit ? 18 : 24} /></Suspense> : <Icon name={e.icon} size={16} title={e.title} />}</span>)}
  </>;
  const cls = `character-card-spine flex-none h-10 flex items-center gap-2 pl-1.5 pr-1.5 bg-linear-to-br from-pl to-cd ${TIER} ${fit || compact ? 'character-card-spine--compact' : ''} ${hero && !compact && !fit ? 'character-card-spine--hero' : ''}`;
  if (compact) return <span data-part="edge-top" className={cls}>{content}</span>;
  return <header data-part="edge-top" aria-label={`Персонаж ${card.name}, уровень ${header.level}`} className={cls}>
    {content}
    {onCollapse ? <button type="button" title="Свернуть в корешок" aria-label={`Свернуть карточку: ${card.name}`} onClick={onCollapse} className={BTN}>−</button> : null}
    {onSheet ? <button type="button" title={`Полный лист персонажа ${card.name}: профиль, история, умения, снаряжение и путь`} aria-label="Лист" onClick={onSheet} className={BTN}>Лист</button> : null}
  </header>;
}
