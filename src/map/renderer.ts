// Чем рисуется подложка карты (TASKS M18): WebGL2, если он есть, иначе Canvas2D/DOM. `?renderer=canvas` в адресе —
// принудительно запасной путь у всех слоёв подложки (схема, тайлы растра): сравнение картинки и замер кадра.
export const forceCanvas = (): boolean =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('renderer') === 'canvas';

/** Opt-in benchmark density changes actual backing buffers, not reported device characteristics. */
export function mapPixelRatio(): number {
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const benchmark = params?.get('mapStats') === '1' ? Number(params.get('mapDpr')) : 0;
  return benchmark >= 1 && benchmark <= 3 ? benchmark : typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
}
