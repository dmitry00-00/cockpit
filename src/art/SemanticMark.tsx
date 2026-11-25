import { lazy, Suspense } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import type { ArtId } from './registry.generated';

const ArtImage = lazy(() => import('./ArtImage').then(module => ({ default: module.ArtImage })));

/** A purpose-bound illustration with the existing glyph as fallback. */
export function SemanticMark({ asset, icon, title, size = 24, color = 'currentColor' }: {
  asset: ArtId;
  icon: IconName;
  title: string;
  size?: 16 | 24 | 32;
  color?: string;
}) {
  const fallback = <Icon name={icon} size={size} color={color} title={title} />;
  return <Suspense fallback={fallback}>
    <ArtImage asset={asset} alt={title} width={size} sizes={`${size}px`} className="semantic-mark__image" fallback={fallback} />
  </Suspense>;
}

export default SemanticMark;
