import type { LearningPath, StudyDay, StudyUnit } from "./studyTypes.ts";

export type DayPath = LearningPath & {
  unitTitle: string;
  dayTitle: string;
};

export type DaySequenceIndex = {
  index: number;
  total: number;
};

export function getPathDay(curriculum: StudyUnit[], path: LearningPath): StudyDay | null {
  const unit = curriculum.find((item) => item.id === path.unitId);
  if (!unit) return null;
  return unit.days.find((item) => item.id === path.dayId) ?? null;
}

export function getAllDayPaths(curriculum: StudyUnit[]) {
  const list: DayPath[] = [];

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

export function getFirstDayPath(curriculum: StudyUnit[]) {
  return getAllDayPaths(curriculum)[0] ?? null;
}

export function getNextDayPath(curriculum: StudyUnit[], currentPath: LearningPath) {
  const list = getAllDayPaths(curriculum);
  const index = list.findIndex((item) => item.unitId === currentPath.unitId && item.dayId === currentPath.dayId);

  if (index < 0) return null;
  return list[index + 1] ?? null;
}

export function getDaySequenceIndex(curriculum: StudyUnit[], path: LearningPath): DaySequenceIndex {
  const list = getAllDayPaths(curriculum);
  const index = list.findIndex((item) => item.unitId === path.unitId && item.dayId === path.dayId);

  return {
    index: index >= 0 ? index + 1 : 0,
    total: list.length,
  };
}

export function isValidLearningPath(path: unknown): path is LearningPath {
  const value = path as Partial<LearningPath> | null | undefined;
  return (
    !!value &&
    typeof value === "object" &&
    typeof value.unitId === "string" &&
    value.unitId.length > 0 &&
    typeof value.dayId === "string" &&
    value.dayId.length > 0
  );
}

export function toLearningPathKey(path: LearningPath) {
  return `${path.unitId}:${path.dayId}`;
}

export function isSameLearningPath(a: LearningPath | null | undefined, b: LearningPath | null | undefined) {
  if (!a || !b) return false;
  return a.unitId === b.unitId && a.dayId === b.dayId;
}

export function areLearningPathListsEqual(a: unknown, b: unknown) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!isValidLearningPath(a[i]) || !isValidLearningPath(b[i])) return false;
    if (toLearningPathKey(a[i]) !== toLearningPathKey(b[i])) {
      return false;
    }
  }
  return true;
}
