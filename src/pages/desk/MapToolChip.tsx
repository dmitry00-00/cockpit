// Связь с MapTool (Q17) в шапке поля боя: на связи или замолчал, сколько токенов на карте, у каких нет актёра.
// Аддон не появлялся с запуска сервера — чипа нет: стол без MapTool о мосте молчит.
import { Icon } from '../../icons/Icon';
import type { MapToolLink } from './useMapToolBridge';

export function MapToolChip({ link }: { link: MapToolLink }) {
  const live = link.status === 'live';
  const lines = [
    live ? 'MapTool на связи: ходы токенов пишутся в журнал, хиты и состояния уходят на токены' : 'MapTool замолчал: аддон не присылал токены дольше 5 секунд',
    link.map ? `Карта: ${link.map}` : '',
    `Токенов на карте: ${link.tokens}`,
    link.unmatched.length ? `Без актёра (имя токена — id, имя или одно слово имени): ${link.unmatched.join(', ')}` : '',
  ].filter(Boolean);
  return (
    <span className="type-key normal-case inline-flex items-center gap-1" style={{ color: live ? 'var(--tx)' : 'var(--t3)' }} title={lines.join('\n')}>
      <Icon name="move" size={16} color={live ? 'var(--tx)' : 'var(--t3)'} title="" />
      MapTool{live ? '' : ' · нет связи'}{link.unmatched.length ? ` · без актёра ${link.unmatched.length}` : ''}
    </span>
  );
}
