import { repairMojibakeText } from "./textRepair.ts";
import type { SourceRef, StudyItem, StudyState, StudyUnit } from "./studyTypes.ts";

export function hasValidSourceRef(item: StudyItem | null | undefined): item is StudyItem & { sourceRef: SourceRef } {
  const ref = item?.sourceRef;
  return (
    !!ref &&
    typeof ref.sourcePath === "string" &&
    ref.sourcePath.length > 0 &&
    Number.isInteger(ref.dayIndex) &&
    Number.isInteger(ref.itemIndex)
  );
}

export function sanitizeCurriculum(curriculum: unknown): StudyUnit[] {
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

export function isStateCompatible(saved: unknown, initial: unknown) {
  const savedState = saved as StudyState | null | undefined;
  const initialState = initial as StudyState | null | undefined;
  if (!savedState || !initialState) return false;
  if (savedState.schemaVersion !== initialState.schemaVersion) return false;
  if (!Array.isArray(savedState.curriculum) || !Array.isArray(initialState.curriculum)) return false;
  if (savedState.curriculum.length !== initialState.curriculum.length) return false;

  for (const initialUnit of initialState.curriculum) {
    const savedUnit = savedState.curriculum.find((unit) => unit?.id === initialUnit?.id);
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

  for (const unit of savedState.curriculum) {
    for (const day of unit?.days ?? []) {
      for (const item of day?.items ?? []) {
        if (!item) continue;
        if (!hasValidSourceRef(item)) {
          return false;
        }
      }
    }
  }

  return true;
}

function normalizeTitle(text: unknown) {
  if (typeof text !== "string") return "";
  return repairMojibakeText(text);
}
