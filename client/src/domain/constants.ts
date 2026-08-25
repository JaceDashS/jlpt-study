// 복습 단계. 1 = 미학습, 2~5 = 각 간격을 통과한 상태, 6 = 졸업(더 이상 복습하지 않음).
export const REVIEW_STAGE_MAX = 6;
export const MIN_REVIEW_STAGE = 2;
export const GRADUATED_STAGE = REVIEW_STAGE_MAX;

// 해당 stage 로 올라갈 때 다음 복습까지의 간격(일). 졸업 단계는 예약하지 않는다.
const NEXT_STAGE_OFFSETS = {
  2: 1,
  3: 3,
  4: 7,
  5: 30,
};

export const STAGE_LABELS = {
  1: "신규",
  2: "1일",
  3: "3일",
  4: "7일",
  5: "30일",
  6: "졸업",
};

export function normalizeReviewStageLimit(value, fallback = REVIEW_STAGE_MAX) {
  const fallbackValue = Number(fallback);
  const safeFallback = Number.isFinite(fallbackValue)
    ? Math.max(MIN_REVIEW_STAGE, Math.min(REVIEW_STAGE_MAX, Math.round(fallbackValue)))
    : REVIEW_STAGE_MAX;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(MIN_REVIEW_STAGE, Math.min(REVIEW_STAGE_MAX, Math.round(parsed)))
    : safeFallback;
}

export function getStageLabel(stage, maxStage = REVIEW_STAGE_MAX) {
  const normalizedMaxStage = normalizeReviewStageLimit(maxStage);
  const value = Number(stage);
  const normalizedStage = Number.isFinite(value) ? Math.max(1, Math.min(normalizedMaxStage, Math.round(value))) : 1;
  return normalizedStage >= normalizedMaxStage ? STAGE_LABELS[REVIEW_STAGE_MAX] : STAGE_LABELS[normalizedStage];
}

export function isGraduatedStage(stage, maxStage = GRADUATED_STAGE) {
  return Number(stage) >= normalizeReviewStageLimit(maxStage);
}

export function getOffsetToNextStage(nextStage) {
  return NEXT_STAGE_OFFSETS[nextStage] ?? 0;
}
