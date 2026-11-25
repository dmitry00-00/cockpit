/** User portraits are compact WebP data stored inside the campaign snapshot, never in the source tree. */
export const USER_PORTRAIT_MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const USER_PORTRAIT_MAX_STORED_BYTES = 128 * 1024;
const PORTRAIT_EDGE = 384;

declare const userPortraitDataUrlBrand: unique symbol;
export type UserPortraitDataUrl = string & { readonly [userPortraitDataUrlBrand]: true };

export function isUserPortraitDataUrl(value: unknown): value is UserPortraitDataUrl {
  if (typeof value !== 'string') return false;
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[1].length % 4 !== 0 || Math.floor((match[1].length * 3) / 4) > USER_PORTRAIT_MAX_STORED_BYTES) return false;
  try {
    const header = globalThis.atob(match[1].slice(0, 24));
    return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
  } catch {
    return false;
  }
}

function loadImage(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).then(bitmap => ({ image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение.'));
    };
    image.src = url;
  });
}

/** Downsample a local image; only this bounded derivative is retained in the campaign log/export. */
export async function prepareUserPortrait(file: File): Promise<UserPortraitDataUrl> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Выберите изображение PNG, JPEG или WebP.');
  if (file.size <= 0 || file.size > USER_PORTRAIT_MAX_INPUT_BYTES) throw new Error('Исходный файл должен быть не больше 8 МиБ.');
  const decoded = await loadImage(file);
  try {
    if (!decoded.width || !decoded.height) throw new Error('У изображения неверные размеры.');
    const scale = Math.min(1, PORTRAIT_EDGE / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не смог подготовить портрет.');
    context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.68, 0.52, 0.38]) {
      const data = canvas.toDataURL('image/webp', quality);
      if (!data.startsWith('data:image/webp;base64,')) throw new Error('Браузер не поддерживает сохранение портрета в WebP.');
      if (isUserPortraitDataUrl(data)) return data;
    }
    throw new Error('Портрет после сжатия превышает 128 КиБ; выберите изображение попроще.');
  } finally {
    decoded.close?.();
  }
}
