/** Normalized progress projection shared by process clocks, thread clocks, and front dangers. */
export interface ProgressValue {
  segments: number;
  filled: number;
}

/** Runtime guard for the shared contract: positive whole segments and a bounded filled count. */
export function isProgressValue(value: unknown): value is ProgressValue {
  if (typeof value !== 'object' || value === null) return false;
  const progress = value as { segments?: unknown; filled?: unknown };
  return Number.isSafeInteger(progress.segments) && Number.isSafeInteger(progress.filled)
    && (progress.segments as number) >= 1 && (progress.filled as number) >= 0
    && (progress.filled as number) <= (progress.segments as number);
}
