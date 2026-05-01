import { assertNoDisallowedExpressionKeys } from "../domain/expression.ts";

function createExpressionItem(id, expression, reading, meaningKo, kanjiToKana = {}, problem = null, sourceRef = null, sourceItem = null) {
  return {
    id,
    expression,
    reading,
    meaningKo,
    problem,
    kanjiToKana,
    sourceRef,
    lastResult: toLastResult(sourceItem?.lastResult),
    lastAttemptDate: isValidAttemptDate(sourceItem?.lastAttemptDate) ? sourceItem.lastAttemptDate : "",
    memoDecomposition: toMemoText(sourceItem?.memoDecomposition),
    memoPersonal: toMemoText(sourceItem?.memoPersonal),
  };
}

function toLastResult(value) {
  return value === "PASS" || value === "FAIL" || value === "NEUTRAL" ? value : "NEUTRAL";
}

function toMemoText(value) {
  if (value === null || value === undefined) return "";
  return tryFixMojibake(String(value));
}

function getDayStageFromRaw(day) {
  const fromDay = Number(day?.stage);
  if (Number.isFinite(fromDay)) return fromDay;
  const fromFirstItem = Number(day?.items?.[0]?.stage);
  if (Number.isFinite(fromFirstItem)) return fromFirstItem;
  return 1;
}

function getDayNextReviewDateFromRaw(day) {
  if (day && Object.prototype.hasOwnProperty.call(day, "nextReviewDate")) return day.nextReviewDate;
  return day?.items?.[0]?.nextReviewDate ?? null;
}

function getDayStageCompleteDateFromRaw(day) {
  if (day && Object.prototype.hasOwnProperty.call(day, "stageCompleteDate")) return day.stageCompleteDate;
  return null;
}

function isValidAttemptDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getDayLastAttemptDateFromRaw(day) {
  if (isValidAttemptDate(day?.lastAttemptDate)) return day.lastAttemptDate;
  const dates = (day?.items ?? []).map((item) => item?.lastAttemptDate).filter((value) => isValidAttemptDate(value));
  if (dates.length === 0) return "";
  return dates.reduce((max, value) => (value > max ? value : max), dates[0]);
}

function getDayLastCompletedDateFromRaw(day) {
  return isValidAttemptDate(day?.lastCompletedDate) ? day.lastCompletedDate : "";
}

function tryFixMojibake(text) {
  if (typeof text !== "string" || text.length === 0) return text;
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
    return /[?-??-??-??-?]/.test(repaired) ? repaired : text;
  } catch {
    return text;
  }
}

function sortByName(list) {
  return [...list].sort((a, b) => a.localeCompare(b, "ko-KR", { numeric: true, sensitivity: "base" }));
}

function extractBookId(modulePath: string): string {
  const normalized = String(modulePath).split("\\").join("/");
  const marker = "/asset/";
  const markerIndex = normalized.indexOf(marker);
  const filename = markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized;
  return filename.replace(/\.json$/, "");
}

function extractAssetPath(modulePath: string): string {
  const normalized = String(modulePath).split("\\").join("/");
  const marker = "/asset/";
  const markerIndex = normalized.indexOf(marker);
  const relPath = markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized;
  return `asset/${relPath}`;
}

function normalizeAssetPath(value) {
  return String(value ?? "").split("\\").join("/").replace(/^\.\/+/, "");
}

function toModulePath(assetPath) {
  const normalized = normalizeAssetPath(assetPath);
  return normalized.startsWith("../../") ? normalized : `../../${normalized}`;
}

function getAssetModules(files, predicate) {
  if (!files || typeof files !== "object") return {};
  return Object.fromEntries(
    Object.entries(files).filter(([assetPath]) => predicate(normalizeAssetPath(assetPath))).map(([assetPath, value]) => [
      toModulePath(assetPath),
      value,
    ]),
  );
}

function getCombinedModules(files?: Record<string, unknown>) {
  return getAssetModules(files, (assetPath) => {
    const parts = assetPath.split("/").filter(Boolean);
    return parts.length === 2 && parts[0] === "asset" && parts[1].toLowerCase().endsWith(".json");
  });
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

function toReading(rawItem) {
  if (typeof rawItem?.reading === "string" && rawItem.reading) return tryFixMojibake(rawItem.reading);
  if (typeof rawItem?.readingParts === "string" && rawItem.readingParts) return tryFixMojibake(rawItem.readingParts);
  if (rawItem?.readingParts && typeof rawItem.readingParts === "object") {
    const values = Object.values(rawItem.readingParts.kanjiToKana ?? {}).join("");
    return tryFixMojibake(`${values}${rawItem.readingParts.restKana ?? ""}`);
  }
  return "-";
}

function toExpression(rawItem, context = "createInitialState.rawItem") {
  assertNoDisallowedExpressionKeys(rawItem, context);
  if (typeof rawItem?.expression !== "string" || !rawItem.expression.trim()) {
    throw new Error(`${context}: missing required expression`);
  }
  return tryFixMojibake(rawItem.expression);
}

function toMeaning(rawItem) {
  return tryFixMojibake(rawItem?.meaningKo ?? rawItem?.meaning ?? rawItem?.sentence ?? "?? ?? ??");
}

function toKanjiToKana(rawItem) {
  if (rawItem?.tokens && Array.isArray(rawItem.tokens)) {
    const mapped = rawItem.tokens.reduce((acc, token) => {
      if (token?.type === "kanji" && token.surface && token.reading) {
        acc[tryFixMojibake(token.surface)] = tryFixMojibake(token.reading);
      }
      return acc;
    }, {});
    if (Object.keys(mapped).length > 0) return mapped;
  }

  if (rawItem?.readingParts?.kanjiToKana && typeof rawItem.readingParts.kanjiToKana === "object") {
    return Object.fromEntries(
      Object.entries(rawItem.readingParts.kanjiToKana).map(([key, value]) => [tryFixMojibake(key), tryFixMojibake(value)]),
    );
  }
  return {};
}

function toItemId(rawItem, fallbackId) {
  const rawId = typeof rawItem?.id === "string" ? rawItem.id.trim() : "";
  if (rawId) return rawId;
  return fallbackId;
}

function extractDayBlocks(unitGroup) {
  if (!unitGroup) return [];
  const rawDays = Array.isArray(unitGroup?.day) ? unitGroup.day : [];
  return rawDays
    .map((day, index) => ({
      dayNumber: Number(day?.day ?? index + 1),
      stage: getDayStageFromRaw(day),
      stageCompleteDate: getDayStageCompleteDateFromRaw(day),
      nextReviewDate: getDayNextReviewDateFromRaw(day),
      lastAttemptDate: getDayLastAttemptDateFromRaw(day),
      lastCompletedDate: getDayLastCompletedDateFromRaw(day),
      items: Array.isArray(day?.items) ? day.items : [],
    }))
    .filter((day) => day.items.length > 0);
}

function buildCurriculumFromAssets(bookId?: string, files?: Record<string, unknown>) {
  const unitMap = new Map();

  Object.entries(getCombinedModules(files)).forEach(([modulePath, rawData]) => {
    const sourceRoot = rawData && typeof rawData === "object" ? (rawData as Record<string, unknown>) : null;
    if (!sourceRoot || sourceRoot.format !== "combined") return;
    if (bookId && extractBookId(modulePath) !== bookId) return;

    const fileMeta = sourceRoot.meta && typeof sourceRoot.meta === "object"
      ? (sourceRoot.meta as Record<string, unknown>)
      : {};
    const level = String(fileMeta.level ?? "jlpt-n1");
    const sourcePath = extractAssetPath(modulePath);
    const unitGroups = Array.isArray(sourceRoot.days) ? (sourceRoot.days as Array<Record<string, unknown>>) : [];

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
    const days = unit.dayBlocks.map((dayBlock, dayIndex) => {
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
  };
}
