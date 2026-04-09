import { REVIEW_STAGE_MAX, getOffsetToNextStage } from "./constants";
import { addDays } from "./date";

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

export function getNextStageState(day, today) {
  const stage = Number(day?.stage);
  const currentStage = Number.isFinite(stage) ? Math.max(1, Math.min(REVIEW_STAGE_MAX, stage)) : 1;
  const nextStage = Math.min(currentStage + 1, REVIEW_STAGE_MAX);

  if (nextStage === currentStage) {
    return {
      stage: currentStage,
      stageCompleteDate: day?.stageCompleteDate ?? null,
      nextReviewDate: day?.nextReviewDate ?? null,
    };
  }

  return {
    stage: nextStage,
    stageCompleteDate: today,
    nextReviewDate: addDays(today, getOffsetToNextStage(nextStage)),
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
    const gradedResult = itemHasGraded ? gradedResultByItemId[item.id] : "NEUTRAL";
    const base = {
      ...item,
      lastResult: gradedResult,
    };

    if (!allPass) {
      return base;
    }

    return {
      ...base,
      lastResult: "NEUTRAL",
    };
  });

  const baseDay = {
    ...day,
    lastAttemptDate: shouldUpdateAttemptDate ? today : (day?.lastAttemptDate ?? ""),
    items: nextItems,
  };

  return {
    allPass: hasReviewedGradable && allPass,
    day: hasReviewedGradable && allPass
      ? {
          ...baseDay,
          ...getNextStageState(baseDay, today),
        }
      : baseDay,
  };
}

export function applyReviewResultForDay(day, today, gradedResultByItemId) {
  let hasReviewed = false;
  let hasFail = false;
  const targetItems = day.items.filter(isQuizTarget);
  const gradableIdSet = new Set(targetItems.filter(isGradableItem).map((item) => item.id));

  const nextItems = day.items.map((item) => {
    if (!isQuizTarget(item)) {
      return item;
    }

    const gradedResult = gradedResultByItemId[item.id];
    if (!gradedResult) {
      return item;
    }

    if (!gradableIdSet.has(item.id)) {
      return item;
    }

    hasReviewed = true;
    if (gradedResult === "FAIL") {
      hasFail = true;
    }

    return {
      ...item,
      lastResult: gradedResult,
    };
  });

  if (!hasReviewed) {
    return { day };
  }

  if (hasFail) {
    return {
      day: {
        ...day,
        nextReviewDate: today,
        lastAttemptDate: today,
        items: nextItems,
      },
    };
  }

  const baseDay = {
    ...day,
    ...getNextStageState(day, today),
    lastAttemptDate: today,
    items: nextItems.map((item) => ({ ...item, lastResult: "NEUTRAL" })),
  };

  return {
    day: baseDay,
  };
}
