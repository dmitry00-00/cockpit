import { lazy, Suspense } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import type { ArtId } from './registry.generated';

const ArtImage = lazy(() => import('./ArtImage').then(module => ({ default: module.ArtImage })));
export const CLASS_ART: Partial<Record<IconName, ArtId>> = {
  'cls-voin': 'kimi-class-fighter-v1',
  'cls-paladin': 'kimi-class-paladin-v1',
  'cls-varvar': 'kimi-class-barbarian-v1',
  'cls-monah': 'kimi-class-monk-v1',
  'cls-plut': 'kimi-class-rogue-v1',
  'cls-sledopyt': 'kimi-class-ranger-v1',
  'cls-izobretatel': 'kimi-class-artificer-v1',
  'cls-bard': 'kimi-class-bard-v1',
  'cls-koldun': 'kimi-class-warlock-v1',
  'cls-carodey': 'kimi-class-sorcerer-v1',
  'cls-volsebnik': 'kimi-class-wizard-v1',
  'cls-druid': 'kimi-class-druid-v1',
  'cls-jrec': 'kimi-class-cleric-v1',
};

export function ClassEmblem({ icon, title, size = 24 }: { icon: IconName; title: string; size?: 18 | 24 | 32 }) {
  const asset = CLASS_ART[icon];
  const fallback = <Icon name={icon} size={size === 32 ? 24 : 16} title={title} />;
  if (!asset) return fallback;
  return <Suspense fallback={fallback}><ArtImage asset={asset} alt={title} width={size} sizes={`${size}px`} className="class-emblem__image" fallback={fallback} /></Suspense>;
}
