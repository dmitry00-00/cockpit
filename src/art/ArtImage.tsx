// БА11: только подготовленные производные. Рамка, счётчики и состояния принадлежат родителю.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ArtId } from './registry.generated';
export type { ArtId };

type ArtRecord = (typeof import('./registry.generated').ART)[ArtId];

export interface ArtImageProps {
  asset: ArtId;
  alt: string;
  /** Фактическая ширина в раскладке, не размер исходника. */
  width: number;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  /** Existing semantic placeholder to restore if the delivered file fails. */
  fallback?: ReactNode;
}
const url = (path: string) => `${import.meta.env.BASE_URL}${path}`;

function ImageContent({ asset, alt, width, sizes, className, style, fallback }: ArtImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<{ asset: ArtId; record: ArtRecord } | null>(null);
  useEffect(() => {
    let current = true;
    void import('./registry.generated').then(({ ART }) => {
      if (current) setLoaded({ asset, record: ART[asset] });
    }).catch(() => {
      if (current) setFailed(true);
    });
    return () => { current = false; };
  }, [asset]);
  const record = loaded?.asset === asset ? loaded.record : undefined;
  if (!record) {
    return <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={!alt || undefined}
      className={className} style={{ width, maxWidth: '100%', height: width, aspectRatio: '1 / 1', display: 'grid', placeItems: 'center', ...style }}>
      {fallback ? <span aria-hidden="true">{fallback}</span> : null}
    </span>;
  }
  const variants = record.variants;
  const fallbackVariant = variants.find(v => v.width >= width) ?? variants[variants.length - 1];
  const height = Math.round(width * fallbackVariant.height / fallbackVariant.width);
  const layout: CSSProperties = { width, maxWidth: '100%', height: 'auto', aspectRatio: `${fallbackVariant.width} / ${fallbackVariant.height}`, display: 'block', ...style };
  return failed && fallback ? (
    <span role="img" aria-label={alt || undefined} aria-hidden={!alt || undefined} className={className} style={{ ...layout, height, display: 'grid', placeItems: 'center' }}>
      <span aria-hidden="true">{fallback}</span>
    </span>
  ) : failed ? (
    <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={!alt || undefined}
      className={className} style={{ ...layout, height, background: 'var(--wl)', color: 'var(--t2)', fontSize: 13 }}>
      {alt ? 'Иллюстрация недоступна' : null}
    </span>
  ) : (
    <img src={url(fallbackVariant.path)} srcSet={variants.map(v => `${url(v.path)} ${v.width}w`).join(', ')}
      sizes={sizes ?? `${width}px`} width={width} height={height} alt={alt}
      loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} style={layout} />
  );
}
export function ArtImage(props: ArtImageProps) {
  // При смене id сбрасывается ошибка старого файла; нет скачивания оригинала «на всякий случай».
  return <ImageContent key={props.asset} {...props} />;
}
