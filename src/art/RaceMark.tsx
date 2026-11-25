import { lazy, Suspense, type ReactNode } from 'react';
import { RACE_ART, SUBRACE_ART } from './semanticBindings';

const ArtImage = lazy(() => import('./ArtImage').then(module => ({ default: module.ArtImage })));

/** Exact ancestry id to authored illustration; subraces stay on their parent record only by explicit caller choice. */
export function RaceMark({ raceId, subraceId, title, size = 24, fallback }: {
  raceId: string;
  subraceId?: string;
  title: string;
  size?: 16 | 24 | 32;
  fallback?: ReactNode;
}) {
  const asset = (subraceId ? SUBRACE_ART[subraceId] : undefined) ?? RACE_ART[raceId] ?? SUBRACE_ART[raceId];
  if (!asset) return fallback ?? null;
  return <Suspense fallback={fallback ?? null}>
    <ArtImage asset={asset} alt={title} width={size} sizes={`${size}px`} className="race-mark__image" fallback={fallback} />
  </Suspense>;
}

export default RaceMark;
