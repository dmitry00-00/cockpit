// Рамка режима «глазами игроков» (F8): кольцо src-players по всему экрану и бирка «Глазами игроков · P» снизу.
// Рамка только обозначает режим — фильтрацию делает модель: всё, чего игрокам видеть нельзя, в DOM не попадает,
// а не приглушается (CLAUDE.md «Правила экрана»). Выключена — обёртки нет вовсе: дети возвращаются как есть.
import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';

export interface PlayerFrameProps {
  on: boolean;
  /** Бирка внизу; по умолчанию — «Глазами игроков · P». */
  label?: string;
  children: ReactNode;
  className?: string;
}

export const PLAYER_FRAME_LABEL = 'Глазами игроков · P';

export function PlayerFrame({ on, label = PLAYER_FRAME_LABEL, children, className = '' }: PlayerFrameProps) {
  if (!on) return <>{children}</>;
  return (
    <div data-player-view="" className={`relative flex-1 min-h-0 flex flex-col ${className}`}>
      {children}
      {/* Кольцо рисуется поверх содержимого: inset-тень на самом контейнере ушла бы под фоны панелей. */}
      <div aria-hidden="true" data-part="ring" className="pointer-events-none absolute inset-0 z-40 shadow-[inset_0_0_0_4px_var(--src-players)]" />
      <div
        data-part="badge"
        title="Режим «глазами игроков» · P возвращает стол мастера"
        className="absolute bottom-0 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 bg-pl px-2 py-0.5 type-h-15 uppercase text-src-players shadow-[inset_1px_1px_0_var(--src-players),inset_-1px_0_0_var(--src-players)]"
      >
        <Icon name="src-players" size={16} color="var(--src-players)" title="Известно игрокам" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export default PlayerFrame;
