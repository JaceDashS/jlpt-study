import { GRADUATED_STAGE } from "./constants.ts";
import { isDueOnOrBefore } from "./date.ts";
import { diffDays, parseYmd } from "./dateMath.ts";
import { getAllDayPaths, getDaySequenceIndex, isValidLearningPath, toLearningPathKey } from "./learningPath.ts";
import {
  buildDailyLearningPlanPaths,
  getContinueLearningPath,
  getDayLastAttemptDate,
  getDayLastCompletedDate,
  getDayMissingDecompositionCount,
  getDayNextReviewDate,
  getDayPassRatio,
  getDayProgress,
  getDayStage,
  getDayStageCompleteDate,
  getDisplayDayIndex,
  getTodayStartedLearningPath,
  isQuizTarget,
} from "./studyHelpers.ts";
import type { HomeDueDebugRow } from "./clipboardActions.ts";
import type { LearningPath, StudyDay, StudyState, StudyUnit } from "./studyTypes.ts";

export type ReviewDueRow = {
  path: LearningPath;
  unitId: string;
  dayId: string;
  unitTitle: string;
  dayTitle: string;
  dayIndex: number;
  sequenceIndex: number;
  dueCount: number;
  dueItemIds: string[];
  failCount: number;
  progress: number;
  reviewRound: number;
  missingDecompositionCount: number;
};

export type LearningPlanRow = {
  path: LearningPath;
  unitTitle: string;
  dayTitle: string;
  dayIndex: number;
  sequenceIndex: number;
  totalDayCount: number;
  itemCount: number;
  failCount: number;
  missingDecompositionCount: number;
  stageCompleteDate: string | null;
  nextReviewDate: string | null;
  lastAttemptDate: string;
  lastCompletedDate: string;
};

export type PlanRange = {
  start: string;
  end: string;
};

type LearningPlan = StudyState["learningPlan"];

function countFailedQuizItems(day: StudyDay) {
  return day.items.filter((item) => isQuizTarget(item) && item.lastResult === "FAIL").length;
}

function getReviewRound(progress: number) {
  return Math.max(1, Math.round(progress * 4) + 1);
}

function compareReviewDueRows(a: ReviewDueRow, b: ReviewDueRow) {
  return a.reviewRound - b.reviewRound || a.dayIndex - b.dayIndex || a.sequenceIndex - b.sequenceIndex;
}

export function buildReviewDue(curriculum: StudyUnit[], today: string) {
  const list: ReviewDueRow[] = [];
  let sequenceIndex = 0;

  curriculum.forEach((unit) => {
    unit.days.forEach((day) => {
      sequenceIndex += 1;
      const allDayQuizItems = day.items.filter(isQuizTarget);
      const allDayItemIds = allDayQuizItems.map((item) => item.id);
      const dayLevelDue =
        allDayItemIds.length > 0 &&
        getDayStage(day) < GRADUATED_STAGE &&
        isDueOnOrBefore(getDayNextReviewDate(day), today);

      if (!dayLevelDue) return;

      const progress = getDayProgress(day);
      list.push({
        path: { unitId: unit.id, dayId: day.id },
        unitId: unit.id,
        dayId: day.id,
        unitTitle: unit.title,
        dayTitle: day.title,
        dayIndex: getDisplayDayIndex(day, sequenceIndex),
        sequenceIndex,
        dueCount: allDayItemIds.length,
        dueItemIds: allDayItemIds,
        failCount: countFailedQuizItems(day),
        progress,
        reviewRound: getReviewRound(progress),
        missingDecompositionCount: getDayMissingDecompositionCount(day),
      });
    });
  });

  return list.sort(compareReviewDueRows);
}

export function buildHomeDueDebug(curriculum: StudyUnit[], today: string) {
  const rows: HomeDueDebugRow[] = [];
  curriculum.forEach((unit) => {
    unit.days.forEach((day) => {
      const allDayItems = day.items.filter(isQuizTarget);
      const dayLevelDue =
        allDayItems.length > 0 &&
        getDayStage(day) < GRADUATED_STAGE &&
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

export function buildOverallMeta(curriculum: StudyUnit[], totalDay: unknown) {
  let totalDays = 0;
  const stageRatios: number[] = [];
  let maxDayIndex = 0;
  const stageByDayIndex = new Map<number, number>();

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

export function buildDateRangeMeta(planRange: PlanRange, today: string) {
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

export function buildLearningPlanRows(
  curriculum: StudyUnit[],
  learningPlan: LearningPlan,
  dailyNewLearningCount: number,
  today: string,
) {
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
        failCount: countFailedQuizItems(day),
        missingDecompositionCount: getDayMissingDecompositionCount(day),
        stageCompleteDate: getDayStageCompleteDate(day),
        nextReviewDate: getDayNextReviewDate(day),
        lastAttemptDate: getDayLastAttemptDate(day),
        lastCompletedDate: getDayLastCompletedDate(day),
      };
    })
    .filter((row): row is LearningPlanRow => Boolean(row));
}

export function buildDebugLogs({
  curriculum,
  learningPlan,
  today,
  dailyNewLearningCount,
  learningPlanRows,
  pendingLearningRows,
  reviewDueCount,
}: {
  curriculum: StudyUnit[];
  learningPlan: LearningPlan;
  today: string;
  dailyNewLearningCount: number;
  learningPlanRows: LearningPlanRow[];
  pendingLearningRows: LearningPlanRow[];
  reviewDueCount: number;
}) {
  const lines: string[] = [];
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

export function buildAllDayRows(curriculum: StudyUnit[]) {
  return getAllDayPaths(curriculum).map((path) => {
    const unit = curriculum.find((item) => item.id === path.unitId);
    const day = unit?.days.find((item) => item.id === path.dayId);
    return {
      path,
      dayTitle: path.dayTitle,
      passRatio: day ? getDayPassRatio(day) : 0,
      failCount: day ? countFailedQuizItems(day) : 0,
      itemCount: day?.items?.length ?? 0,
      stage: day ? getDayStage(day) : 1,
      lastAttemptDate: day ? getDayLastAttemptDate(day) : "",
      nextReviewDate: day ? getDayNextReviewDate(day) : null,
    };
  });
}
