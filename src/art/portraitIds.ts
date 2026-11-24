/** Built-in portraits that may be stored in a campaign event or character draft. */
export const BUILT_IN_PORTRAITS = ['bo-portrait', 'codex-korrin-v1', 'codex-lyra-v1', 'codex-aldric-v1'] as const;
export type BuiltInPortraitId = typeof BUILT_IN_PORTRAITS[number];

export const BUILT_IN_PORTRAIT_LABELS: Readonly<Record<BuiltInPortraitId, string>> = {
  'bo-portrait': 'Bo · живописный портрет',
  'codex-korrin-v1': 'Коррин · портрет',
  'codex-lyra-v1': 'Лира · портрет',
  'codex-aldric-v1': 'Альдрик · портрет',
};

export function isBuiltInPortraitId(value: unknown): value is BuiltInPortraitId {
  return typeof value === 'string' && (BUILT_IN_PORTRAITS as readonly string[]).includes(value);
}
