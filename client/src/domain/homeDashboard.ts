import { useMemo } from "react";
import { isDueOnOrBefore } from "./date.ts";
import {
  buildDailyLearningPlanPaths,
  diffDays,
  getAllDayPaths,
  getContinueLearningPath,
  getDayLastAttemptDate,
  getDayLastCompletedDate,
  getDayMissingDecompositionCount,
  getDayNextReviewDate,
  getDayPassRatio,
  getDayProgress,
  getDayStage,
  getDayStageCompleteDate,
  getDaySequenceIndex,
  getDisplayDayIndex,
  getTodayStartedLearningPath,
  isQuizTarget,
  isValidLearningPath,
  parseYmd,
  toLearningPathKey,
} from "./studyHelpers.ts";

export function buildReviewDue(curriculum, today) {
  const list = [];

  curriculum.forEach((unit) => {
    unit.days.forEach((day) => {
      const allDayQuizItems = day.items.filter(isQuizTarget);
      const allDayItemIds = allDayQuizItems.map((item) => item.id);
      const dayLevelDue =
        allDayItemIds.length > 0 &&
        getDayStage(day) < 5 &&
        isDueOnOrBefore(getDayNextReviewDate(day), today);

      if (!dayLevelDue) return;

      list.push({
        path: { unitId: unit.id, dayId: day.id },
        unitId: unit.id,
        dayId: day.id,
        unitTitle: unit.title,
        dayTitle: day.title,
        dueCount: allDayItemIds.length,
        dueItemIds: allDayItemIds,
        progress: getDayProgress(day),
        missingDecompositionCount: getDayMissingDecompositionCount(day),
      });
    });
  });

  return list;
}

export function buildHomeDueDebug(curriculum, today) {
  const rows = [];
  curriculum.forEach((unit) => {
    unit.days.forEach((day) => {
      const allDayItems = day.items.filter(isQuizTarget);
      const dayLevelDue =
        allDayItems.length > 0 &&
        getDayStage(day) < 5 &&
        isDueOnOrBefore(getDayNextReviewDate(day), today);

      rows.push({
        unitTitle: unit.title,
        dayTitle: day.title,
        stage: getDayStage(day),
        nextReviewDate: getDayNextReviewDate(day),
        itemDueCount: dayLevelDue ? allDayItems.length : 0,
        dayLevelDue,
        totalItems: allDayItems.length,
      });
    });
  });
  return rows;
}

export function buildOverallMeta(curriculum, totalDay) {
  let totalDays = 0;
  const stageRatios = [];
  let maxDayIndex = 0;
  const stageByDayIndex = new Map();

  curriculum.forEach((unit) => {
    unit.days.forEach((day) => {
      totalDays += 1;
      const stage = getDayStage(day);
      const dayIndexValue = Number(day?.dayIndex);
      if (Number.isFinite(dayIndexValue) && dayIndexValue > maxDayIndex) {
        maxDayIndex = dayIndexValue;
      }
      if (Number.isFinite(dayIndexValue)) {
        const prevStage = stageByDayIndex.get(dayIndexValue) ?? 1;
        if (stage > prevStage) {
          stageByDayIndex.set(dayIndexValue, stage);
        } else if (!stageByDayIndex.has(dayIndexValue)) {
          stageByDayIndex.set(dayIndexValue, prevStage);
        }
      }
      stageRatios.push(getDayProgress(day));
    });
  });

  const completedUniqueDays = [...stageByDayIndex.values()].filter((stage) => stage >= 2).length;
  const configuredTotalDay = Number(totalDay);
  const uniqueDayTotal =
    Number.isInteger(configuredTotalDay) && configuredTotalDay > 0
      ? configuredTotalDay
      : maxDayIndex > 0
        ? maxDayIndex
        : stageByDayIndex.size;
  const completedRatio = uniqueDayTotal > 0 ? completedUniqueDays / uniqueDayTotal : 0;
  const avgStageRatio = stageRatios.length > 0 ? stageRatios.reduce((sum, value) => sum + value, 0) / stageRatios.length : 0;
  const uniqueDayCompletedRatio = uniqueDayTotal > 0 ? completedUniqueDays / uniqueDayTotal : 0;

  return {
    totalDays,
    completedDays: completedUniqueDays,
    completedRatio,
    avgStageRatio,
    maxDayIndex,
    uniqueDayTotal,
    uniqueDayCompletedRatio,
  };
}

export function buildDateRangeMeta(planRange, today) {
  const startDate = parseYmd(planRange.start);
  const endDate = parseYmd(planRange.end);
  const todayDate = parseYmd(today);

  if (!startDate || !endDate || !todayDate || endDate < startDate) {
    return {
      valid: false,
      ratio: 0,
      elapsedDays: 0,
      totalDays: 0,
      remainingDays: 0,
    };
  }

  const totalDays = diffDays(startDate, endDate) + 1;
  const elapsedRaw = diffDays(startDate, todayDate) + 1;
  const elapsedDays = Math.max(0, Math.min(totalDays, elapsedRaw));
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const ratio = totalDays > 0 ? elapsedDays / totalDays : 0;

  return {
    valid: true,
    ratio,
    elapsedDays,
    totalDays,
    remainingDays,
  };
}

export function buildLearningPlanRows(curriculum, learningPlan, dailyNewLearningCount, today) {
  const planPaths = learningPlan?.date === today
    ? Array.isArray(learningPlan?.paths)
      ? learningPlan.paths
      : []
    : buildDailyLearningPlanPaths(curriculum, dailyNewLearningCount, today);

  return planPaths
    .filter(isValidLearningPath)
    .map((path) => {
      const unit = curriculum.find((item) => item.id === path.unitId);
      const day = unit?.days.find((item) => item.id === path.dayId);
      if (!unit || !day) return null;

      const daySeq = getDaySequenceIndex(curriculum, path);
      return {
        path,
        unitTitle: unit.title,
        dayTitle: day.title,
        dayIndex: getDisplayDayIndex(day, daySeq.index),
        sequenceIndex: daySeq.index,
        totalDayCount: daySeq.total,
        itemCount: day.items.filter(isQuizTarget).length,
        missingDecompositionCount: getDayMissingDecompositionCount(day),
        stageCompleteDate: getDayStageCompleteDate(day),
        nextReviewDate: getDayNextReviewDate(day),
        lastAttemptDate: getDayLastAttemptDate(day),
        lastCompletedDate: getDayLastCompletedDate(day),
      };
    })
    .filter(Boolean);
}

export function buildDebugLogs({
  curriculum,
  learningPlan,
  today,
  dailyNewLearningCount,
  learningPlanRows,
  pendingLearningRows,
  reviewDueCount,
}) {
  const lines = [];
  const continuePath = getContinueLearningPath(curriculum, today);
  const todayStartedPath = getTodayStartedLearningPath(curriculum, today);
  const rawPlanPaths = learningPlan?.date === today && Array.isArray(learningPlan?.paths)
    ? learningPlan.paths.filter(isValidLearningPath)
    : [];

  lines.push(`today=${today}`);
  lines.push(`dailyNewLearningCount=${dailyNewLearningCount}`);
  lines.push(`learningPlan.date=${String(learningPlan?.date ?? "")}`);
  lines.push(`learningPlan.count=${String(learningPlan?.count ?? "")}`);
  lines.push(`todayStartedPath=${todayStartedPath ? toLearningPathKey(todayStartedPath) : "-"}`);
  lines.push(`continuePath=${continuePath ? toLearningPathKey(continuePath) : "-"}`);
  lines.push(`savedPlanPaths=${rawPlanPaths.length > 0 ? rawPlanPaths.map(toLearningPathKey).join(", ") : "-"}`);
  lines.push(`renderedPlanRows=${learningPlanRows.map((row) => toLearningPathKey(row.path)).join(", ") || "-"}`);
  lines.push(`pendingRows=${pendingLearningRows.map((row) => toLearningPathKey(row.path)).join(", ") || "-"}`);
  lines.push(`reviewDueCount=${reviewDueCount}`);

  learningPlanRows.forEach((row) => {
    lines.push(
      `[row] ${toLearningPathKey(row.path)} day=${row.dayTitle} next=${String(row.nextReviewDate)} lastAttempt=${String(row.lastAttemptDate)}`,
    );
  });

  return lines;
}

export function buildAllDayRows(curriculum) {
  return getAllDayPaths(curriculum).map((path) => {
    const unit = curriculum.find((item) => item.id === path.unitId);
    const day = unit?.days.find((item) => item.id === path.dayId);
    return {
      path,
      dayTitle: path.dayTitle,
      passRatio: day ? getDayPassRatio(day) : 0,
      failCount: day ? day.items.filter((item) => isQuizTarget(item) && item.lastResult === "FAIL").length : 0,
    };
  });
}

export function useHomeDashboardData({ dailyNewLearningCount, planRange, state, today }) {
  const reviewDue = useMemo(() => buildReviewDue(state.curriculum, today), [state.curriculum, today]);
  const homeDueDebug = useMemo(() => buildHomeDueDebug(state.curriculum, today), [state.curriculum, today]);
  const overallMeta = useMemo(() => buildOverallMeta(state.curriculum, state.totalDay), [state.curriculum, state.totalDay]);
  const dateRangeMeta = useMemo(() => buildDateRangeMeta(planRange, today), [planRange, today]);
  const learningPlanRows = useMemo(
    () => buildLearningPlanRows(state.curriculum, state.learningPlan, dailyNewLearningCount, today),
    [state.curriculum, state.learningPlan, dailyNewLearningCount, today],
  );
  const pendingLearningRows = useMemo(
    () => learningPlanRows.filter((row) => row.stageCompleteDate !== today),
    [learningPlanRows, today],
  );
  const debugLogs = useMemo(
    () =>
      buildDebugLogs({
        curriculum: state.curriculum,
        learningPlan: state.learningPlan,
        today,
        dailyNewLearningCount,
        learningPlanRows,
        pendingLearningRows,
        reviewDueCount: reviewDue.length,
      }),
    [dailyNewLearningCount, learningPlanRows, pendingLearningRows, reviewDue.length, state.curriculum, state.learningPlan, today],
  );
  const allDayRows = useMemo(() => buildAllDayRows(state.curriculum), [state.curriculum]);

  return {
    allDayRows,
    dateRangeMeta,
    debugLogs,
    homeDueDebug,
    learningPlanRows,
    overallMeta,
    pendingLearningRows,
    reviewDue,
  };
}
