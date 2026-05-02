import type { StudyDay, StudyState, StudyUnit } from "../domain/studyTypes.ts";
import { extractAssetPath, extractBookId, getCombinedModules } from "./assetModules.ts";
import {
  asRecord,
  createExpressionItem,
  extractDayBlocks,
  toExpression,
  toItemId,
  toKanjiToKana,
  toMeaning,
  toReading,
  type RawDayBlock,
} from "./initialStateParsing.ts";

type SourceUnitBlock = {
  dayBlocks: RawDayBlock[];
  level: string;
  sourcePath: string;
  unitId: string;
  unitPath: string;
  unitTitle: string;
};

function sortByName(list: string[]) {
  return [...list].sort((a, b) => a.localeCompare(b, "ko-KR", { numeric: true, sensitivity: "base" }));
}

export function getAvailableBooks(files?: Record<string, unknown>): Array<{ id: string; title: string }> {
  const books: Array<{ id: string; title: string }> = [];
  Object.entries(getCombinedModules(files)).forEach(([modulePath, rawData]) => {
    const sourceRoot = rawData && typeof rawData === "object" ? (rawData as Record<string, unknown>) : null;
    if (!sourceRoot || sourceRoot.format !== "combined") return;
    const id = extractBookId(modulePath);
    const fileMeta = sourceRoot.meta && typeof sourceRoot.meta === "object"
      ? (sourceRoot.meta as Record<string, unknown>)
      : {};
    const title = String(fileMeta.title ?? id);
    books.push({ id, title });
  });
  return books.sort((a, b) => a.id.localeCompare(b.id));
}

function buildCurriculumFromAssets(bookId?: string, files?: Record<string, unknown>): { curriculum: StudyUnit[]; totalDay: number } {
  const unitMap = new Map<string, SourceUnitBlock>();

  Object.entries(getCombinedModules(files)).forEach(([modulePath, rawData]) => {
    const sourceRoot = asRecord(rawData);
    if (!sourceRoot || sourceRoot.format !== "combined") return;
    if (bookId && extractBookId(modulePath) !== bookId) return;

    const fileMeta = sourceRoot.meta && typeof sourceRoot.meta === "object"
      ? (sourceRoot.meta as Record<string, unknown>)
      : {};
    const level = String(fileMeta.level ?? "jlpt-n1");
    const sourcePath = extractAssetPath(modulePath);
    const unitGroups = Array.isArray(sourceRoot.days) ? sourceRoot.days.map(asRecord).filter(Boolean) : [];

    unitGroups.forEach((unitGroup, unitIndex) => {
      const unitId = `unit-${unitIndex + 1}`;
      const dayBlocks = extractDayBlocks(unitGroup);
      if (dayBlocks.length === 0) return;

      unitMap.set(`${level}/${unitId}`, {
        level,
        unitId,
        unitTitle: unitId,
        sourcePath,
        unitPath: String(unitIndex),
        dayBlocks,
      });
    });
  });

  const unitKeys = sortByName([...unitMap.keys()]);
  let runningDayIndex = 0;
  const curriculum = unitKeys.map((unitKey, unitIndex) => {
    const unit = unitMap.get(unitKey);
    if (!unit) throw new Error(`Missing unit block: ${unitKey}`);
    const days: StudyDay[] = unit.dayBlocks.map((dayBlock, dayIndex) => {
      const displayDayNumber = runningDayIndex + 1;
      runningDayIndex += 1;
      return {
        id: `d${unitIndex + 1}-${displayDayNumber}`,
        title: `Day ${displayDayNumber}`,
        dayIndex: displayDayNumber,
        stage: dayBlock.stage ?? 1,
        stageCompleteDate: Object.prototype.hasOwnProperty.call(dayBlock, "stageCompleteDate")
          ? dayBlock.stageCompleteDate
          : null,
        nextReviewDate: Object.prototype.hasOwnProperty.call(dayBlock, "nextReviewDate")
          ? dayBlock.nextReviewDate
          : null,
        lastAttemptDate: dayBlock.lastAttemptDate ?? "",
        lastCompletedDate: dayBlock.lastCompletedDate ?? "",
        items: dayBlock.items.map((item, itemIndex) =>
          createExpressionItem(
            toItemId(item, `u${dayIndex + 1}-i${itemIndex + 1}`),
            toExpression(item, `createInitialState.rawItem:${unit.sourcePath}:day${dayIndex + 1}:item${itemIndex + 1}`),
            toReading(item),
            toMeaning(item),
            toKanjiToKana(item),
            item?.problem ?? null,
            {
              sourcePath: unit.sourcePath,
              unitPath: unit.unitPath ?? null,
              dayIndex,
              displayDayIndex: displayDayNumber,
              itemIndex,
            },
            item,
          ),
        ),
      };
    });

    return {
      id: `u${unitIndex + 1}`,
      title: unit.unitTitle,
      days,
    };
  });
  return { curriculum, totalDay: 0 };
}

export function createInitialState(bookId?: string, files?: Record<string, unknown>) {
  const { curriculum, totalDay } = buildCurriculumFromAssets(bookId, files);
  return {
    schemaVersion: 19,
    curriculum,
    totalDay,
  } satisfies StudyState;
}
