import { assertNoDisallowedExpressionKeys } from "./expression.ts";

function resolveUnitRoot(sourceJson, unitPath) {
  if (!sourceJson) return null;
  if (sourceJson?.format !== "combined" || !unitPath) return sourceJson;

  // New simplified format: top-level "days" array, unitPath is a numeric index string
  if (Array.isArray(sourceJson?.days)) {
    const index = Number(unitPath);
    if (Number.isInteger(index) && index >= 0) {
      return (sourceJson.days as unknown[])[index] ?? null;
    }
    return null;
  }

  // Legacy format: top-level "units" array
  const units = Array.isArray(sourceJson?.units) ? sourceJson.units : [];
  const slash = unitPath.indexOf("/");
  if (slash >= 0) {
    const chapterId = unitPath.slice(0, slash);
    const unitId = unitPath.slice(slash + 1);
    return units.find((u) => u?.chapterId === chapterId && u?.unitId === unitId) ?? null;
  }
  return units.find((u) => u?.unitId === unitPath) ?? null;
}

function getSourceDay(sourceJson, dayIndex, unitPath?) {
  const root = resolveUnitRoot(sourceJson, unitPath);
  if (!root) return null;
  if (Array.isArray(root?.day)) {
    return root.day?.[dayIndex] ?? null;
  }
  if (Array.isArray(root?.unitSteps)) {
    return root.unitSteps?.[dayIndex] ?? null;
  }
  if (Array.isArray(root?.days)) {
    return root.days?.[dayIndex] ?? null;
  }
  if (Array.isArray(root)) {
    return root?.[dayIndex] ?? null;
  }
  if (Array.isArray(root?.items)) {
    return root;
  }
  return null;
}

function getSourceItem(sourceJson, dayIndex, itemIndex, unitPath?) {
  const root = resolveUnitRoot(sourceJson, unitPath);
  if (!root) return null;
  if (Array.isArray(root?.day)) {
    return root.day?.[dayIndex]?.items?.[itemIndex] ?? null;
  }
  if (Array.isArray(root?.unitSteps)) {
    return root.unitSteps?.[dayIndex]?.items?.[itemIndex] ?? null;
  }
  if (Array.isArray(root?.days)) {
    return root.days?.[dayIndex]?.items?.[itemIndex] ?? null;
  }
  if (Array.isArray(root)) {
    return root?.[dayIndex]?.items?.[itemIndex] ?? null;
  }
  if (Array.isArray(root?.items)) {
    return root.items?.[itemIndex] ?? null;
  }
  return null;
}

function getSourceReading(sourceItem, fallback) {
  if (typeof sourceItem?.reading === "string" && sourceItem.reading) {
    return sourceItem.reading;
  }
  if (typeof sourceItem?.readingParts === "string" && sourceItem.readingParts) {
    return sourceItem.readingParts;
  }
  if (sourceItem?.readingParts && typeof sourceItem.readingParts === "object") {
    const map = sourceItem.readingParts.kanjiToKana ?? {};
    const values = Object.values(map).join("");
    return `${values}${sourceItem.readingParts.restKana ?? ""}` || fallback;
  }
  return fallback;
}

function getSourceExpression(sourceItem, fallback, context) {
  assertNoDisallowedExpressionKeys(sourceItem, context);
  if (typeof sourceItem?.expression === "string" && sourceItem.expression.trim()) {
    return sourceItem.expression;
  }
  if (typeof sourceItem?.targetKanji === "string" && sourceItem.targetKanji.trim()) {
    return sourceItem.targetKanji;
  }
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }
  throw new Error(`${context}: missing expression in source item.`);
}

function getSourceKanjiToKana(sourceItem, fallback) {
  if (sourceItem?.tokens && Array.isArray(sourceItem.tokens)) {
    const mapped = sourceItem.tokens.reduce((acc, token) => {
      if (token?.type === "kanji" && token.surface && token.reading) {
        acc[token.surface] = token.reading;
      }
      return acc;
    }, {});
    if (Object.keys(mapped).length > 0) return mapped;
  }

  if (sourceItem?.readingParts?.kanjiToKana && typeof sourceItem.readingParts.kanjiToKana === "object") {
    return sourceItem.readingParts.kanjiToKana;
  }

  return fallback;
}

export function mergeCurriculumFromSource(curriculum, files) {
  if (!files) return curriculum;

  return curriculum.map((unit) => ({
    ...unit,
    days: unit.days.map((day) => {
        const daySourceRef = day.items.find((item) => item?.sourceRef?.sourcePath)?.sourceRef ?? null;
        const sourceJson = daySourceRef?.sourcePath ? files[daySourceRef.sourcePath] : null;
        const sourceDay = daySourceRef ? getSourceDay(sourceJson, daySourceRef.dayIndex, daySourceRef.unitPath) : null;

        return {
          ...day,
          stage: sourceDay?.stage ?? day.stage,
          stageCompleteDate:
            sourceDay && Object.prototype.hasOwnProperty.call(sourceDay, "stageCompleteDate")
              ? sourceDay.stageCompleteDate
              : day.stageCompleteDate,
          nextReviewDate:
            sourceDay && Object.prototype.hasOwnProperty.call(sourceDay, "nextReviewDate")
              ? sourceDay.nextReviewDate
              : day.nextReviewDate,
          lastAttemptDate: sourceDay?.lastAttemptDate ?? day.lastAttemptDate,
          lastCompletedDate: sourceDay?.lastCompletedDate ?? day.lastCompletedDate,
          items: day.items.map((item) => {
            const sourceRef = item.sourceRef;
            if (!sourceRef?.sourcePath) return item;

            const sourceItemJson = files[sourceRef.sourcePath];
            const sourceItem = getSourceItem(sourceItemJson, sourceRef.dayIndex, sourceRef.itemIndex, sourceRef.unitPath);
            if (!sourceItem) return item;
            const nextExpression = getSourceExpression(
              sourceItem,
              item.expression,
              `mergeCurriculumFromSource:${sourceRef.sourcePath}:day${sourceRef.dayIndex + 1}:item${sourceRef.itemIndex + 1}`,
            );

            return {
              ...item,
              expression: nextExpression,
              reading: getSourceReading(sourceItem, item.reading),
              meaningKo: sourceItem.meaningKo ?? sourceItem.meaning ?? sourceItem.sentence ?? item.meaningKo,
              kanjiToKana: getSourceKanjiToKana(sourceItem, item.kanjiToKana),
              stage: sourceItem.stage ?? item.stage,
              nextReviewDate: Object.prototype.hasOwnProperty.call(sourceItem, "nextReviewDate")
                ? sourceItem.nextReviewDate
                : item.nextReviewDate,
              lastResult: sourceItem.lastResult ?? item.lastResult,
              lastAttemptDate: sourceItem.lastAttemptDate ?? item.lastAttemptDate,
              memoDecomposition: sourceItem.memoDecomposition ?? item.memoDecomposition,
              memoPersonal: sourceItem.memoPersonal ?? item.memoPersonal,
              problem: Object.prototype.hasOwnProperty.call(sourceItem, "problem") ? sourceItem.problem : item.problem,
            };
          }),
        };
      }),
  }));
}
