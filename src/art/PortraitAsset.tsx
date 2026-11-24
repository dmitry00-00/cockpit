// Separate lazy entry so the generated registry and image URLs stay out of the static desk bundle.
import { ART, type ArtId } from './registry.generated';
import { ArtImage } from './ArtImage';
import type { BuiltInPortraitId } from './portrait';
import type { ReactNode } from 'react';

export function PortraitAsset({ portrait, alt, width, sizes, className, fallback }: {
  portrait: BuiltInPortraitId;
  alt: string;
  width: number;
  sizes?: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const record = (ART as Record<string, { family: string }>)[portrait];
  if (record?.family !== 'portrait') {
    return <span role="img" aria-label={alt} className={className} style={{ width, maxWidth: '100%', height: width, display: 'grid', placeItems: 'center' }}>{fallback}</span>;
  }
  return <ArtImage asset={portrait as ArtId} alt={alt} width={width} sizes={sizes} className={className} fallback={fallback} />;
}

export default PortraitAsset;
