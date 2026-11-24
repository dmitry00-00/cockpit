// Текст файла как есть — импорт Vite `?raw` (отчёт импорта компендиума на экране «Правила кампании»).
declare module '*?raw' {
  const text: string;
  export default text;
}

// Справочник без текстов, тексты к нему и выборка блоков — плагин dm-text-split (vite.config.ts, ROADMAP 0.5). Форму
// держат читатели: приводят тип на месте.
declare module '*?split=core' {
  const data: unknown;
  export default data;
}
declare module '*?split=texts' {
  const data: unknown;
  export default data;
}
declare module '*=bandit,bandit-captain' {
  const data: unknown;
  export default data;
}

// Необязательные файлы данных — `import.meta.glob` Vite: нет файла — пустой объект, а не ошибка сборки (держав до
// импорта scripts/import-kingdoms.py нет — справочник пуст). Типы vite/client в проекте не подключены — только это.
interface ImportMeta {
  glob<T = unknown>(pattern: string | readonly string[], options: { eager: true; import?: string }): Record<string, T>;
  glob<T = unknown>(pattern: string | readonly string[], options?: { eager?: false; import?: string }): Record<string, () => Promise<T>>;
}
