export const DEFAULT_STUDY_DRAWER_WIDTH = 520;
export const DEFAULT_DAY_LIST_DRAWER_WIDTH = 420;
export const MIN_STUDY_DRAWER_WIDTH = 360;
export const MAX_STUDY_DRAWER_WIDTH = 980;
export const MIN_DAY_LIST_DRAWER_WIDTH = 280;
export const MAX_DAY_LIST_DRAWER_WIDTH = 860;

export function normalizeStudyDrawerWidth(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_STUDY_DRAWER_WIDTH;
  return Math.max(MIN_STUDY_DRAWER_WIDTH, Math.min(MAX_STUDY_DRAWER_WIDTH, Math.round(parsed)));
}

export function normalizeDayListDrawerWidth(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAY_LIST_DRAWER_WIDTH;
  return Math.max(MIN_DAY_LIST_DRAWER_WIDTH, Math.min(MAX_DAY_LIST_DRAWER_WIDTH, Math.round(parsed)));
}
