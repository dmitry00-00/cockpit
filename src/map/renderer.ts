// Чем рисуется подложка карты (TASKS M18): WebGL2, если он есть, иначе Canvas2D/DOM. `?renderer=canvas` в адресе —
// принудительно запасной путь у всех слоёв подложки (схема, тайлы растра): сравнение картинки и замер кадра.
export const forceCanvas = (): boolean =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('renderer') === 'canvas';
