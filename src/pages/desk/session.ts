// Файл сессии: имя по дате стены, чтение файла и скачивание текста.


/** Имя файла сессии: dm-cockpit-<дата стены>.json. */
export function sessionFileName(now: Date = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `dm-cockpit-${d}.json`;
}

/** Текст файла через FileReader: он есть везде, где есть <input type="file">; Blob.text() — не везде (jsdom). */
export function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(r.error ?? new Error('файл не прочитался'));
    r.readAsText(file);
  });
}

/** Скачать текст файлом через временную ссылку; без URL.createObjectURL (старый браузер, jsdom) — тихо ничего. */
export function downloadText(name: string, text: string, doc: Document = document): void {
  const url = globalThis.URL?.createObjectURL?.(new Blob([text], { type: 'application/json' }));
  if (!url) return;
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  globalThis.URL.revokeObjectURL(url);
}
