import { getStageProgressRatio } from "./srs";

export function isQuizTarget(item) {
  return Boolean(item);
}

export function replaceDay(curriculum, targetPath, nextDay) {
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

export function getPathDay(curriculum, path) {
  const unit = curriculum.find((item) => item.id === path.unitId);
  if (!unit) return null;
  return unit.days.find((item) => item.id === path.dayId) ?? null;
}

function getAverage(numbers) {
  if (numbers.length === 0) return 0;
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return total / numbers.length;
}

export function getDayProgress(day) {
  return getStageProgressRatio(day);
}

export function getDayPassRatio(day) {
  const targetItems = day.items.filter(isQuizTarget);
  if (targetItems.length === 0) return 0;
  const passCount = targetItems.filter((item) => item.lastResult === "PASS").length;
  return passCount / targetItems.length;
}

export function getDayMissingDecompositionCount(day) {
  const targetItems = day?.items?.filter(isQuizTarget) ?? [];
  return targetItems.filter((item) => String(item?.memoDecomposition ?? "").trim().length === 0).length;
}

export function getUnitProgress(unit) {
  return getAverage(unit.days.map((day) => getDayProgress(day)));
}

export function getAllDayPaths(curriculum) {
  const list = [];

  curriculum.forEach((unit) => {
    unit.days.forEach((day) => {
      list.push({
        unitId: unit.id,
        dayId: day.id,
        unitTitle: unit.title,
        dayTitle: day.title,
      });
    });
  });

  return list;
}

export function getFirstDayPath(curriculum) {
  return getAllDayPaths(curriculum)[0] ?? null;
}

export function getNextDayPath(curriculum, currentPath) {
  const list = getAllDayPaths(curriculum);
  const index = list.findIndex(
    (item) =>
      item.unitId === currentPath.unitId &&
      item.dayId === currentPath.dayId,
  );

  if (index < 0) return null;
  return list[index + 1] ?? null;
}

export function getDaySequenceIndex(curriculum, path) {
  const list = getAllDayPaths(curriculum);
  const index = list.findIndex(
    (item) =>
      item.unitId === path.unitId &&
      item.dayId === path.dayId,
  );

  return {
    index: index >= 0 ? index + 1 : 0,
    total: list.length,
  };
}

export function getDisplayDayIndex(day, sequenceIndexFallback) {
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

export function isValidAttemptDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isFutureReviewDate(value, today) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value > today;
}

export function getDayStage(day) {
  const direct = Number(day?.stage);
  if (Number.isFinite(direct)) return direct;

  // JSON day-level schedule is authoritative in this app.
  if (typeof day?.nextReviewDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.nextReviewDate)) {
    return 2;
  }

  const fallback = Number(day?.items?.[0]?.stage);
  return Number.isFinite(fallback) ? fallback : 1;
}

export function getDayNextReviewDate(day) {
  if (day && Object.prototype.hasOwnProperty.call(day, "nextReviewDate")) {
    return day.nextReviewDate;
  }
  return day?.items?.[0]?.nextReviewDate ?? null;
}

export function getDayStageCompleteDate(day) {
  const value = day?.stageCompleteDate;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function getDayLastAttemptDate(day) {
  if (isValidAttemptDate(day?.lastAttemptDate)) {
    return day.lastAttemptDate;
  }

  const dates = (day?.items ?? [])
    .map((item) => item?.lastAttemptDate)
    .filter((value) => isValidAttemptDate(value));

  if (dates.length === 0) return "";
  return dates.reduce((max, value) => (value > max ? value : max), dates[0]);
}

export function getDayLastCompletedDate(day) {
  return isValidAttemptDate(day?.lastCompletedDate) ? day.lastCompletedDate : "";
}

export function isLearningCompletedDay(day, today) {
  return isFutureReviewDate(getDayNextReviewDate(day), today);
}

export function getDisplayItemId(item) {
  return String(item?.id ?? "");
}

export function findFirstUnattemptedPath(curriculum) {
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

export function getContinueLearningPath(curriculum, today) {
  const list = getAllDayPaths(curriculum);
  const first = list[0] ?? null;
  if (!first) return null;

  let latest = null;

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

export function normalizeDailyNewLearningCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

export function isValidLearningPath(path) {
  return (
    !!path &&
    typeof path.unitId === "string" &&
    path.unitId.length > 0 &&
    typeof path.dayId === "string" &&
    path.dayId.length > 0
  );
}

export function toLearningPathKey(path) {
  return `${path.unitId}:${path.dayId}`;
}

export function isSameLearningPath(a, b) {
  if (!a || !b) return false;
  return a.unitId === b.unitId && a.dayId === b.dayId;
}

export function areLearningPathListsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (toLearningPathKey(a[i]) !== toLearningPathKey(b[i])) {
      return false;
    }
  }
  return true;
}

export function getTodayStartedLearningPath(curriculum, today) {
  const list = getAllDayPaths(curriculum);
  let latestTodayPath = null;
  let latestTodayIncompletePath = null;

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

export function buildDailyLearningPlanPaths(curriculum, count, today = "") {
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

export function shuffleArray(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function parseYmd(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function diffDays(startDate, endDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
  return Math.floor((end - start) / msPerDay);
}

export function hasValidSourceRef(item) {
  const ref = item?.sourceRef;
  return (
    !!ref &&
    typeof ref.sourcePath === "string" &&
    ref.sourcePath.length > 0 &&
    Number.isInteger(ref.dayIndex) &&
    Number.isInteger(ref.itemIndex)
  );
}

function normalizeTitle(text) {
  if (typeof text !== "string") return "";
  if (!text) return text;
  const cp1252ExtraMap = {
    0x20ac: 0x80,
    0x201a: 0x82,
    0x0192: 0x83,
    0x201e: 0x84,
    0x2026: 0x85,
    0x2020: 0x86,
    0x2021: 0x87,
    0x02c6: 0x88,
    0x2030: 0x89,
    0x0160: 0x8a,
    0x2039: 0x8b,
    0x0152: 0x8c,
    0x017d: 0x8e,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2022: 0x95,
    0x2013: 0x96,
    0x2014: 0x97,
    0x02dc: 0x98,
    0x2122: 0x99,
    0x0161: 0x9a,
    0x203a: 0x9b,
    0x0153: 0x9c,
    0x017e: 0x9e,
    0x0178: 0x9f,
  };

  const bytes = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const mapped = cp1252ExtraMap[code];
    if (mapped == null) return text;
    bytes.push(mapped);
  }

  try {
    const repaired = new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
    return /[가-힣ぁ-ゖァ-ヺ一-龯]/.test(repaired) ? repaired : text;
  } catch {
    return text;
  }
}

export function sanitizeCurriculum(curriculum) {
  if (!Array.isArray(curriculum)) return [];

  return curriculum
    .map((unit) => ({
      ...unit,
      title: normalizeTitle(unit?.title ?? ""),
      days: (unit?.days ?? [])
        .filter((day) => Array.isArray(day?.items) && day.items.length > 0)
        .map((day) => ({
          ...day,
          title: normalizeTitle(day?.title ?? ""),
        })),
    }))
    .filter((unit) => unit.days.length > 0);
}

export function isStateCompatible(saved, initial) {
  if (!saved || !initial) return false;
  if (saved.schemaVersion !== initial.schemaVersion) return false;
  if (!Array.isArray(saved.curriculum) || !Array.isArray(initial.curriculum)) return false;
  if (saved.curriculum.length !== initial.curriculum.length) return false;

  for (const initialUnit of initial.curriculum) {
    const savedUnit = saved.curriculum.find((unit) => unit?.id === initialUnit?.id);
    if (!savedUnit) return false;
    if (!Array.isArray(savedUnit.days) || !Array.isArray(initialUnit.days)) return false;
    if (savedUnit.days.length !== initialUnit.days.length) return false;

    for (let index = 0; index < initialUnit.days.length; index += 1) {
      const expectedDay = initialUnit.days[index];
      const currentDay = savedUnit.days[index];
      if (!currentDay || currentDay.id !== expectedDay.id) return false;
      if (!Array.isArray(currentDay.items) || !Array.isArray(expectedDay.items)) return false;
      if (currentDay.items.length !== expectedDay.items.length) return false;
    }
  }

  for (const unit of saved.curriculum) {
    for (const day of unit?.days ?? []) {
      for (const item of day?.items ?? []) {
        if (!isQuizTarget(item)) continue;
        if (!hasValidSourceRef(item)) {
          return false;
        }
      }
    }
  }

  return true;
}
