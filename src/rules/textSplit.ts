// Тексты справочников отдельным куском (ROADMAP 0.5): плагин сборки (vite.config.ts) делит JSON на «ядро» — та же
// структура, у текстовых полей пустая строка, — и «тексты» — значения этих полей массивом в порядке обхода. В браузере
// loadTexts() (rules/texts.ts) проходит ядро тем же обходом и возвращает тексты на места: объекты те же, читатели
// `.text` о делении не знают. Обход один на сборку и на браузер — поэтому здесь, без импортов.

/** Поля, которые уходят в тексты: проза умений, черт, заклинаний и действий. */
export const TEXT_FIELDS: readonly string[] = ['text', 'higherLevel'];

/** Обход в порядке ключей JSON: у каждого объекта — его текстовые поля-строки, затем вложенное. */
export function walkTexts(node: unknown, visit: (owner: Record<string, unknown>, key: string) => void): void {
  if (Array.isArray(node)) {
    for (const x of node) walkTexts(x, visit);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string') {
      if (TEXT_FIELDS.includes(key)) visit(obj, key);
    } else walkTexts(v, visit);
  }
}

/** Деление разобранного JSON: ядро (тексты — пустые строки) и тексты по порядку обхода. Вход не меняется. */
export function splitTexts(data: unknown): { core: unknown; texts: string[] } {
  const core = structuredClone(data);
  const texts: string[] = [];
  walkTexts(core, (owner, key) => { texts.push(owner[key] as string); owner[key] = ''; });
  return { core, texts };
}

/** Тексты обратно в ядро; число мест не сошлось — ошибка, а не тексты не там. */
export function hydrateTexts(core: unknown, texts: readonly string[]): void {
  let i = 0;
  walkTexts(core, (owner, key) => { owner[key] = texts[i++]; });
  if (i !== texts.length) throw new Error(`тексты справочника: мест ${i}, текстов ${texts.length} — ядро и тексты из разных сборок`);
}
