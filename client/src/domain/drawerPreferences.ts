export const DEFAULT_STUDY_DRAWER_WIDTH = 520;
export const DEFAULT_DAY_LIST_DRAWER_WIDTH = 420;

export function normalizeStudyDrawerWidth(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_STUDY_DRAWER_WIDTH;
  return Math.max(360, Math.min(980, Math.round(parsed)));
}

export function normalizeDayListDrawerWidth(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAY_LIST_DRAWER_WIDTH;
  return Math.max(280, Math.min(860, Math.round(parsed)));
}
