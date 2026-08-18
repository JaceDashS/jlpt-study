// 복습 단계. 1 = 미학습, 2~5 = 각 간격을 통과한 상태, 6 = 졸업(더 이상 복습하지 않음).
export const REVIEW_STAGE_MAX = 6;
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

export function getStageLabel(stage) {
  const value = Number(stage);
  return STAGE_LABELS[Number.isFinite(value) ? Math.max(1, Math.min(REVIEW_STAGE_MAX, Math.round(value))) : 1];
}

export function isGraduatedStage(stage) {
  return Number(stage) >= GRADUATED_STAGE;
}

export function getOffsetToNextStage(nextStage) {
  return NEXT_STAGE_OFFSETS[nextStage] ?? 0;
}
