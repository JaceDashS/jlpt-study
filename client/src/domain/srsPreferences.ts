import { REVIEW_STAGE_MAX, normalizeReviewStageLimit } from "./constants";

export const DEFAULT_MAX_REVIEW_STAGE = REVIEW_STAGE_MAX;
export const DEFAULT_FAILURE_RETRY_DAYS = 1;
export const MAX_FAILURE_RETRY_DAYS = 30;

export type SrsSettings = {
  maxReviewStage: number;
  failureRetryDays: number;
};

export const DEFAULT_SRS_SETTINGS: SrsSettings = {
  maxReviewStage: DEFAULT_MAX_REVIEW_STAGE,
  failureRetryDays: DEFAULT_FAILURE_RETRY_DAYS,
};

export function normalizeSrsSettings(value: unknown): SrsSettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const retryDays = Number(source.failureRetryDays);

  return {
    maxReviewStage: normalizeReviewStageLimit(source.maxReviewStage ?? DEFAULT_MAX_REVIEW_STAGE),
    failureRetryDays: Number.isFinite(retryDays)
      ? Math.max(DEFAULT_FAILURE_RETRY_DAYS, Math.min(MAX_FAILURE_RETRY_DAYS, Math.round(retryDays)))
      : DEFAULT_FAILURE_RETRY_DAYS,
  };
}
