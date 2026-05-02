import {
  getAllDayPaths,
  getNextDayPath,
  getPathDay,
} from "./learningPath.ts";
import {
  getDayLastAttemptDate,
  getDayStage,
  getDayStageCompleteDate,
  getDayNextReviewDate,
  isFutureReviewDate,
  isQuizTarget,
  isValidAttemptDate,
} from "./studyHelpers.ts";
import type { DayPath } from "./learningPath.ts";
import type { StudyDay, StudyUnit } from "./studyTypes.ts";

type LatestLearningPath = {
  path: DayPath;
  date: string;
  sequenceIndex: number;
};

export function isLearningCompletedDay(day: StudyDay, today: string) {
  return isFutureReviewDate(getDayNextReviewDate(day), today);
}

export function findFirstUnattemptedPath(curriculum: StudyUnit[]) {
  const list = getAllDayPaths(curriculum);

  for (const path of list) {
    const day = getPathDay(curriculum, path);
    if (!day) continue;

    const hasItems = day.items.filter(isQuizTarget).length > 0;
    if (!hasItems) continue;

    if (!isValidAttemptDate(getDayLastAttemptDate(day))) {
      return path;
    }
  }

  return null;
}

export function getContinueLearningPath(curriculum: StudyUnit[], today: string) {
  const list = getAllDayPaths(curriculum);
  const first = list[0] ?? null;
  if (!first) return null;

  let latest: LatestLearningPath | null = null;

  list.forEach((path, sequenceIndex) => {
    const day = getPathDay(curriculum, path);
    if (!day) return;

    const dayLatestDate = getDayLastAttemptDate(day);
    if (!isValidAttemptDate(dayLatestDate)) return;

    if (!latest || dayLatestDate > latest.date || (dayLatestDate === latest.date && sequenceIndex > latest.sequenceIndex)) {
      latest = { path, date: dayLatestDate, sequenceIndex };
    }
  });

  if (!latest) {
    return findFirstUnattemptedPath(curriculum) ?? first;
  }

  const latestDay = getPathDay(curriculum, latest.path);
  if (!latestDay) {
    return findFirstUnattemptedPath(curriculum) ?? first;
  }

  const hasFail = latestDay.items.filter(isQuizTarget).some((item) => item.lastResult === "FAIL");
  if (hasFail || !isLearningCompletedDay(latestDay, today)) {
    return latest.path;
  }

  return getNextDayPath(curriculum, latest.path) ?? latest.path;
}

export function normalizeDailyNewLearningCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

export function getTodayStartedLearningPath(curriculum: StudyUnit[], today: string) {
  const list = getAllDayPaths(curriculum);
  let latestTodayPath: DayPath | null = null;
  let latestTodayIncompletePath: DayPath | null = null;

  list.forEach((path) => {
    const day = getPathDay(curriculum, path);
    if (!day) return;
    if (getDayLastAttemptDate(day) !== today) return;

    latestTodayPath = path;
    if (!isLearningCompletedDay(day, today)) {
      latestTodayIncompletePath = path;
    }
  });

  return latestTodayIncompletePath ?? latestTodayPath;
}

export function buildDailyLearningPlanPaths(curriculum: StudyUnit[], count: unknown, today = "") {
  const normalizedCount = normalizeDailyNewLearningCount(count);
  const completedTodayCount = getAllDayPaths(curriculum).filter((path) => {
    const day = getPathDay(curriculum, path);
    if (!day) return false;
    const hasItems = day.items.filter(isQuizTarget).length > 0;
    if (!hasItems) return false;
    return getDayStage(day) === 2 && getDayStageCompleteDate(day) === today;
  }).length;
  const remainingQuota = Math.max(0, normalizedCount - completedTodayCount);
  if (remainingQuota <= 0) {
    return [];
  }

  const allPaths = getAllDayPaths(curriculum);
  const stageOnePaths = allPaths.filter((path) => {
    const day = getPathDay(curriculum, path);
    if (!day) return false;
    const hasItems = day.items.filter(isQuizTarget).length > 0;
    return hasItems && getDayStage(day) === 1 && getDayStageCompleteDate(day) !== today;
  });

  return stageOnePaths.slice(0, remainingQuota).map((path) => ({
    unitId: path.unitId,
    dayId: path.dayId,
  }));
}
