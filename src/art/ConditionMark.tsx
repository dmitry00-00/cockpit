import { lazy, Suspense } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import type { ConditionId } from '../rules/srd/conditions';
import { CONDITION_ART } from './semanticBindings';

const ArtImage = lazy(() => import('./ArtImage').then(module => ({ default: module.ArtImage })));

/** A condition illustration paired with the existing glyph as an error/loading fallback. */
export function ConditionMark({ condition, title, size = 24, color = 'currentColor' }: {
  condition: ConditionId;
  title: string;
  size?: 16 | 24;
  color?: string;
}) {
  const fallback = <Icon name={`cond-${condition}` as IconName} size={size} color={color} title={title} />;
  return <Suspense fallback={fallback}>
    <ArtImage asset={CONDITION_ART[condition]} alt={title} width={size} sizes={`${size}px`} className="condition-mark__image" fallback={fallback} />
  </Suspense>;
}

export default ConditionMark;
