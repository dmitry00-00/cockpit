// Vite подставляет базовый путь сборки; ассеты должны работать и под вложенным URL.
interface ImportMetaEnv { readonly BASE_URL: string }
interface ImportMeta { readonly env: ImportMetaEnv }
