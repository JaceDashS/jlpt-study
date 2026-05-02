import { getStageProgressRatio } from "./srs";
import type { LearningPath, StudyDay, StudyItem, StudyUnit } from "./studyTypes.ts";

export {
  areLearningPathListsEqual,
  getAllDayPaths,
  getDaySequenceIndex,
  getFirstDayPath,
  getNextDayPath,
  getPathDay,
  isSameLearningPath,
  isValidLearningPath,
  toLearningPathKey,
} from "./learningPath.ts";
export { diffDays, parseYmd } from "./dateMath.ts";
export {
  buildDailyLearningPlanPaths,
  findFirstUnattemptedPath,
  getContinueLearningPath,
  getTodayStartedLearningPath,
  isLearningCompletedDay,
  normalizeDailyNewLearningCount,
} from "./learningPlanHelpers.ts";
export {
  hasValidSourceRef,
  isStateCompatible,
  sanitizeCurriculum,
} from "./stateCompatibility.ts";

export function isQuizTarget(item: StudyItem | null | undefined): item is StudyItem {
  return Boolean(item);
}

export function replaceDay(curriculum: StudyUnit[], targetPath: LearningPath, nextDay: StudyDay): StudyUnit[] {
  return curriculum.map((unit) => {
    if (unit.id !== targetPath.unitId) {
      return unit;
    }
    return {
      ...unit,
      days: unit.days.map((day) => (day.id === targetPath.dayId ? nextDay : day)),
    };
  });
}

function getAverage(numbers: number[]) {
  if (numbers.length === 0) return 0;
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return total / numbers.length;
}

export function getDayProgress(day: StudyDay) {
  return getStageProgressRatio(day);
}

export function getDayPassRatio(day: StudyDay) {
  const targetItems = day.items.filter(isQuizTarget);
  if (targetItems.length === 0) return 0;
  const passCount = targetItems.filter((item) => item.lastResult === "PASS").length;
  return passCount / targetItems.length;
}

export function getDayMissingDecompositionCount(day: StudyDay | null | undefined) {
  const targetItems = day?.items?.filter(isQuizTarget) ?? [];
  return targetItems.filter((item) => String(item?.memoDecomposition ?? "").trim().length === 0).length;
}

export function getUnitProgress(unit: StudyUnit) {
  return getAverage(unit.days.map((day) => getDayProgress(day)));
}

export function getDisplayDayIndex(day: Pick<StudyDay, "dayIndex" | "title"> | null | undefined, sequenceIndexFallback: number) {
  if (typeof day?.dayIndex === "number" && Number.isFinite(day.dayIndex)) {
    return day.dayIndex;
  }

  const title = String(day?.title ?? "");
  const match = title.match(/(\d+)/);
  if (match) {
    return Number(match[1]);
  }

  return sequenceIndexFallback > 0 ? sequenceIndexFallback : 1;
}

export function isValidAttemptDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isFutureReviewDate(value: unknown, today: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value > today;
}

export function getDayStage(day: StudyDay | null | undefined) {
  const direct = Number(day?.stage);
  if (Number.isFinite(direct)) return direct;

  // JSON day-level schedule is authoritative in this app.
  if (typeof day?.nextReviewDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.nextReviewDate)) {
    return 2;
  }

  const fallback = Number(day?.items?.[0]?.stage);
  return Number.isFinite(fallback) ? fallback : 1;
}

export function getDayNextReviewDate(day: StudyDay | null | undefined): string | null {
  if (day && Object.prototype.hasOwnProperty.call(day, "nextReviewDate")) {
    return day.nextReviewDate;
  }
  return day?.items?.[0]?.nextReviewDate ?? null;
}

export function getDayStageCompleteDate(day: StudyDay | null | undefined) {
  const value = day?.stageCompleteDate;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function getDayLastAttemptDate(day: StudyDay | null | undefined) {
  if (isValidAttemptDate(day?.lastAttemptDate)) {
    return day.lastAttemptDate;
  }

  const dates = (day?.items ?? [])
    .map((item) => item?.lastAttemptDate)
    .filter((value) => isValidAttemptDate(value));

  if (dates.length === 0) return "";
  return dates.reduce((max, value) => (value > max ? value : max), dates[0]);
}

export function getDayLastCompletedDate(day: StudyDay | null | undefined) {
  return isValidAttemptDate(day?.lastCompletedDate) ? day.lastCompletedDate : "";
}

export function getDisplayItemId(item: StudyItem | null | undefined) {
  return String(item?.id ?? "");
}

export function shuffleArray<T>(list: T[]) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
