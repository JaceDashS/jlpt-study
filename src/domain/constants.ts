export const REVIEW_STAGE_MAX = 5;

const NEXT_STAGE_OFFSETS = {
  2: 1,
  3: 3,
  4: 7,
  5: 30,
};

export function getOffsetToNextStage(nextStage) {
  return NEXT_STAGE_OFFSETS[nextStage] ?? 0;
}
