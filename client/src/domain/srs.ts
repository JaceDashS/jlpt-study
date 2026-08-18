import { GRADUATED_STAGE, REVIEW_STAGE_MAX, getOffsetToNextStage } from "./constants";
import { addDays } from "./date";

// 틀린 Day 를 다시 보는 간격. stage 는 그대로 두고 하루 뒤에 다시 띄운다.
const RETRY_OFFSET_DAYS = 1;

function isQuizTarget(item) {
  return Boolean(item);
}

function normalizeProblem(problem) {
  if (!problem) return null;
  if (typeof problem === "string") {
    return {
      sentence: problem.trim(),
      choices: [],
    };
  }
  if (typeof problem === "object") {
    return {
      sentence: String(problem.sentence ?? "").trim(),
      choices: Array.isArray(problem.choices)
        ? problem.choices.map((choice) => String(choice).trim()).filter((choice) => choice.length > 0)
        : [],
    };
  }
  return null;
}

function isGradableItem(item) {
  const problem = normalizeProblem(item?.problem);
  return Array.isArray(problem?.choices) && problem.choices.length > 0;
}

export function getStageProgressRatio(entity) {
  const stage = Number(entity?.stage);
  const safeStage = Number.isFinite(stage) ? Math.max(1, Math.min(REVIEW_STAGE_MAX, stage)) : 1;
  // Stage 1 should be 0% and stage 5 should be 100%.
  return (safeStage - 1) / (REVIEW_STAGE_MAX - 1);
}

function normalizeStage(value) {
  const stage = Number(value);
  return Number.isFinite(stage) ? Math.max(1, Math.min(REVIEW_STAGE_MAX, stage)) : 1;
}

// 성공: 다음 단계로. 마지막 간격(30일)까지 통과하면 졸업이라 더 이상 예약하지 않는다.
export function getNextStageState(day, today) {
  const currentStage = normalizeStage(day?.stage);
  const nextStage = Math.min(currentStage + 1, REVIEW_STAGE_MAX);

  if (nextStage >= GRADUATED_STAGE) {
    return {
      stage: GRADUATED_STAGE,
      stageCompleteDate: today,
      nextReviewDate: null,
    };
  }

  return {
    stage: nextStage,
    stageCompleteDate: today,
    nextReviewDate: addDays(today, getOffsetToNextStage(nextStage)),
  };
}

// 실패: 한 단계 내려가고 내일 다시 본다.
export function getFailStageState(day, today) {
  const currentStage = normalizeStage(day?.stage);
  return {
    stage: Math.max(1, currentStage - 1),
    stageCompleteDate: day?.stageCompleteDate ?? null,
    nextReviewDate: addDays(today, RETRY_OFFSET_DAYS),
  };
}

export function applyQuizResultForDay(day, today, gradedResultByItemId) {
  const targetItems = day.items.filter(isQuizTarget);
  const gradableItems = targetItems.filter(isGradableItem);
  const reviewedGradableItems = gradableItems.filter((item) =>
    Object.prototype.hasOwnProperty.call(gradedResultByItemId, item.id),
  );
  const hasReviewedGradable = reviewedGradableItems.length > 0;
  const allPass = gradableItems.every((item) => {
    const result = gradedResultByItemId[item.id];
    return result && result !== "FAIL";
  });
  const hasGraded = targetItems.some((item) => Object.prototype.hasOwnProperty.call(gradedResultByItemId, item.id));
  const shouldUpdateAttemptDate = hasGraded || gradableItems.length === 0;

  const nextItems = day.items.map((item) => {
    if (!isQuizTarget(item)) {
      return item;
    }

    const itemHasGraded = Object.prototype.hasOwnProperty.call(gradedResultByItemId, item.id);
    // 이번에 풀지 않은 항목은 지난 결과를 그대로 둔다. 전부 맞혀도 이력은 지우지 않는다.
    return {
      ...item,
      lastResult: itemHasGraded ? gradedResultByItemId[item.id] : (item.lastResult ?? "NEUTRAL"),
    };
  });

  const baseDay = {
    ...day,
    lastAttemptDate: shouldUpdateAttemptDate ? today : (day?.lastAttemptDate ?? ""),
    items: nextItems,
  };

  if (hasReviewedGradable && allPass) {
    return {
      allPass: true,
      day: {
        ...baseDay,
        ...getNextStageState(baseDay, today),
      },
    };
  }

  return {
    allPass: false,
    day: hasReviewedGradable ? { ...baseDay, ...getFailStageState(baseDay, today) } : baseDay,
  };
}

// 복습도 학습과 같은 규칙을 쓴다: 그 회차의 채점 대상 전부를 맞혀야 단계가 오른다.
// (자격증 앱과 동일한 기준. 예전에는 복습 대상으로 뽑힌 항목만 보고 판정했다.)
export function applyReviewResultForDay(day, today, gradedResultByItemId) {
  return applyQuizResultForDay(day, today, gradedResultByItemId);
}
