import type { RestContext } from '../../engine/events';

/** Source-backed constraints for an A5E long-rest period. */
export const A5E_LONG_REST_MIN_HOURS = 8;
export const A5E_LONG_REST_MIN_SLEEP_HOURS = 6;
export const A5E_LONG_REST_MAX_STRENUOUS_MINUTES = 60;

/** Reasons a valid recorded period does not count as a completed A5E long rest. */
export function a5eRestFailureReasons(context: Pick<RestContext, 'a5eTiming' | 'a5eSleepHours' | 'a5eStrenuousMinutes'>): string[] {
  if (!context.a5eTiming) return [];
  const reasons: string[] = [];
  const strenuousMinutes = context.a5eStrenuousMinutes ?? 0;
  if (context.a5eTiming === 'period-v2' && (context.a5eSleepHours ?? 0) < A5E_LONG_REST_MIN_SLEEP_HOURS) {
    reasons.push(`сна ${context.a5eSleepHours ?? 0} ч (нужно не меньше ${A5E_LONG_REST_MIN_SLEEP_HOURS} ч)`);
  }
  if (strenuousMinutes > A5E_LONG_REST_MAX_STRENUOUS_MINUTES) {
    reasons.push(`напряжённая активность ${strenuousMinutes} мин (предел ${A5E_LONG_REST_MAX_STRENUOUS_MINUTES} мин)`);
  }
  return reasons;
}

/** Legacy period-v1 keeps its original replay rule; period-v2 also requires six hours of sleep. */
export function a5eRestCompletes(context: RestContext): boolean {
  if (!context.a5eTiming) return true;
  return (context.a5eDurationHours ?? 0) >= A5E_LONG_REST_MIN_HOURS && a5eRestFailureReasons(context).length === 0;
}
