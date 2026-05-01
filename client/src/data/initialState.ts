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

function getStudyModules(files?: Record<string, unknown>) {
  return getAssetModules(files, (assetPath) => assetPath.startsWith("asset/") && assetPath.toLowerCase().endsWith("/study.json"));
}

function getCombinedModules(files?: Record<string, unknown>) {
  return getAssetModules(files, (assetPath) => {
    const parts = assetPath.split("/").filter(Boolean);
    return parts.length === 2 && parts[0] === "asset" && parts[1].toLowerCase().endsWith(".json");
  });
}

function getManifestModules(files?: Record<string, unknown>) {
  return getAssetModules(files, (assetPath) => {
    const parts = assetPath.split("/").filter(Boolean);
    return parts.length === 3 && parts[0] === "asset" && parts[2].toLowerCase() === "manifest.json";
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

function extractPathParts(modulePath) {
  const normalized = String(modulePath).split("\\").join("/");
  const marker = "/asset/";
  const markerIndex = normalized.indexOf(marker);
  const rel = markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized;
  const segments = rel.split("/").filter(Boolean);
  // preferred: asset/<level>/<chapter>/<unit>/src.json
  // backward-compat: asset/<level>/<track>/<chapter>/<unit>/src.json
  const hasTrackLayer = segments.length >= 5 && !String(segments[2] ?? "").startsWith("chapter-");
  return {
    relPath: rel,
    level: segments[0] ?? "jlpt-n1",
    track: hasTrackLayer ? segments[1] ?? "general" : "general",
    chapterId: hasTrackLayer ? segments[2] ?? "chapter-unknown" : segments[1] ?? "chapter-unknown",
    unitId: hasTrackLayer ? segments[3] ?? "unit-unknown" : segments[2] ?? "unit-unknown",
  };
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

function extractDayBlocks(rawData) {
  if (!rawData) return [];

  const unitSteps = Array.isArray(rawData?.unitSteps)
    ? rawData.unitSteps
    : Array.isArray(rawData?.day)
      ? rawData.day
      : Array.isArray(rawData?.days)
        ? rawData.days
        : null;
  if (Array.isArray(unitSteps)) {
    return unitSteps.map((day, index) => ({
      dayNumber: Number(day?.unitStep ?? day?.day ?? index + 1),
      stage: getDayStageFromRaw(day),
      stageCompleteDate: getDayStageCompleteDateFromRaw(day),
      nextReviewDate: getDayNextReviewDateFromRaw(day),
      lastAttemptDate: getDayLastAttemptDateFromRaw(day),
      lastCompletedDate: getDayLastCompletedDateFromRaw(day),
      items: Array.isArray(day?.items) ? day.items : [],
    }));
  }

  if (Array.isArray(rawData)) {
    return rawData
      .map((entry, index) => ({
        dayNumber: Number(entry?.unitStep ?? entry?.day ?? index + 1),
        stage: getDayStageFromRaw(entry),
        stageCompleteDate: getDayStageCompleteDateFromRaw(entry),
        nextReviewDate: getDayNextReviewDateFromRaw(entry),
        lastAttemptDate: getDayLastAttemptDateFromRaw(entry),
        lastCompletedDate: getDayLastCompletedDateFromRaw(entry),
        items: Array.isArray(entry?.items) ? entry.items : [],
      }))
      .filter((day) => day.items.length > 0);
  }

  if (Array.isArray(rawData?.items)) {
    return [
      {
        dayNumber: 1,
        stage: getDayStageFromRaw(rawData),
        stageCompleteDate: getDayStageCompleteDateFromRaw(rawData),
        nextReviewDate: getDayNextReviewDateFromRaw(rawData),
        lastAttemptDate: getDayLastAttemptDateFromRaw(rawData),
        lastCompletedDate: getDayLastCompletedDateFromRaw(rawData),
        items: rawData.items,
      },
    ];
  }

  return [];
}

function toTitleFromId(value, fallback = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return raw
    .split("-")
    .join(" ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function buildManifestByLevel(files?: Record<string, unknown>) {
  const manifestByLevel = new Map();
  Object.values(getManifestModules(files)).forEach((value) => {
    if (!value || typeof value !== "object") return;
    const level = String((value as { level?: unknown }).level ?? "").trim();
    if (!level) return;
    manifestByLevel.set(level, value as Record<string, unknown>);
  });
  return manifestByLevel;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;
  return parsed;
}

function buildCurriculumFromAssets(bookId?: string, files?: Record<string, unknown>) {
  const unitMap = new Map();

  // Load individual unit study.json files (legacy / other curricula)
  Object.entries(getStudyModules(files)).forEach(([modulePath, rawData]) => {
    const parts = extractPathParts(modulePath);
    const sourceRoot = rawData && typeof rawData === "object" ? (rawData as Record<string, unknown>) : null;
    const meta =
      sourceRoot &&
      Object.prototype.hasOwnProperty.call(sourceRoot, "meta") &&
      sourceRoot.meta &&
      typeof sourceRoot.meta === "object"
        ? (sourceRoot.meta as Record<string, unknown>)
        : {};

    const level = String(meta.level ?? parts.level);
    const chapterId = String(meta.chapterId ?? parts.chapterId);
    const unitId = String(meta.unitId ?? parts.unitId);
    const chapterTitle = String(meta.chapterName ?? `${level} ${toTitleFromId(chapterId, chapterId)}`);
    const unitTitle = tryFixMojibake(String(meta.sourceName ?? meta.unitName ?? toTitleFromId(unitId, unitId)));
    const sourcePath = `asset/${parts.relPath}`;

    const dayBlocks = extractDayBlocks(rawData).filter((dayBlock) => Array.isArray(dayBlock?.items) && dayBlock.items.length > 0);
    if (dayBlocks.length === 0) return;

    unitMap.set(`${level}/${chapterId}/${unitId}`, {
      level,
      chapterId,
      chapterTitle,
      unitId,
      unitTitle,
      sourcePath,
      unitPath: null,
      dayBlocks,
    });
  });

  // Load combined curriculum files (format: "combined")
  Object.entries(getCombinedModules(files)).forEach(([modulePath, rawData]) => {
    const sourceRoot = rawData && typeof rawData === "object" ? (rawData as Record<string, unknown>) : null;
    if (!sourceRoot || sourceRoot.format !== "combined") return;
    if (bookId && extractBookId(modulePath) !== bookId) return;

    const fileMeta = sourceRoot.meta && typeof sourceRoot.meta === "object"
      ? (sourceRoot.meta as Record<string, unknown>)
      : {};
    const level = String(fileMeta.level ?? "jlpt-n1");

    // Derive the asset-relative path from the module path
    const normalized = String(modulePath).split("\\").join("/");
    const marker = "/asset/";
    const markerIndex = normalized.indexOf(marker);
    const relPath = markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized;
    const sourcePath = `asset/${relPath}`;

    // New simplified format: top-level "days" array
    const daysEntries = Array.isArray(sourceRoot.days) ? (sourceRoot.days as Array<Record<string, unknown>>) : [];
    // Legacy format: top-level "units" array
    const unitsEntries = Array.isArray(sourceRoot.units) ? (sourceRoot.units as Array<Record<string, unknown>>) : [];

    if (daysEntries.length > 0) {
      daysEntries.forEach((dayEntry, entryIndex) => {
        const autoUnitId = `unit-${entryIndex + 1}`;
        const unitTitle = autoUnitId;
        const unitPath = String(entryIndex); // numeric index for lookup

        const dayBlocks = extractDayBlocks(dayEntry).filter((dayBlock) => Array.isArray(dayBlock?.items) && dayBlock.items.length > 0);
        if (dayBlocks.length === 0) return;

        unitMap.set(`${level}/${autoUnitId}`, {
          level,
          unitId: autoUnitId,
          unitTitle,
          sourcePath,
          unitPath,
          dayBlocks,
        });
      });
    } else {
      unitsEntries.forEach((unitEntry) => {
        const unitId = String(unitEntry.unitId ?? "").trim();
        if (!unitId) return;

        const unitTitle = tryFixMojibake(String(unitEntry.sourceName ?? unitId));
        const unitPath = unitId;

        const dayBlocks = extractDayBlocks(unitEntry).filter((dayBlock) => Array.isArray(dayBlock?.items) && dayBlock.items.length > 0);
        if (dayBlocks.length === 0) return;

        unitMap.set(`${level}/${unitId}`, {
          level,
          unitId,
          unitTitle,
          sourcePath,
          unitPath,
          dayBlocks,
        });
      });
    }
  });

  const manifestByLevel = buildManifestByLevel(files);
  const defaultLevel = "jlpt-n1";
  const manifest = manifestByLevel.get(defaultLevel);
  const totalDay = toPositiveInteger(manifest?.totalDay);

  if (manifest && Array.isArray(manifest.chapters)) {
    let runningDayIndex = 0;
    let globalUnitIndex = 0;
    const units: Array<{ id: string; title: string; days: unknown[] }> = [];

    (manifest.chapters as Array<Record<string, unknown>>).forEach((manifestChapter) => {
      const chapterId = String(manifestChapter.id ?? "").trim();
      if (!chapterId) return;
      const manifestUnits = Array.isArray(manifestChapter.units) ? (manifestChapter.units as Array<Record<string, unknown>>) : [];

      manifestUnits.forEach((manifestUnit) => {
        const unitId = String(manifestUnit.id ?? "").trim();
        if (!unitId) return;
        const source = unitMap.get(`${defaultLevel}/${unitId}`);
        if (!source) return;
        const unitStartDay = toPositiveInteger(manifestUnit.dayOffsetStart);
        const unitIndex = globalUnitIndex;
        globalUnitIndex += 1;

        const days = source.dayBlocks.map((dayBlock, dayIndex) => {
          const fallbackDayNumber = runningDayIndex + 1;
          const displayDayNumber = unitStartDay > 0 ? unitStartDay + dayIndex : fallbackDayNumber;
          runningDayIndex = Math.max(runningDayIndex + 1, displayDayNumber);
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
                toExpression(item, `createInitialState.rawItem:${source.sourcePath}:day${dayIndex + 1}:item${itemIndex + 1}`),
                toReading(item),
                toMeaning(item),
                toKanjiToKana(item),
                item?.problem ?? null,
                {
                  sourcePath: source.sourcePath,
                  unitPath: source.unitPath ?? null,
                  dayIndex,
                  displayDayIndex: displayDayNumber,
                  itemIndex,
                },
                item,
              ),
            ),
          };
        });

        units.push({
          id: `u${unitIndex + 1}`,
          title: tryFixMojibake(String(manifestUnit.title ?? source.unitTitle)),
          days,
        });
      });
    });

    if (units.length > 0) {
      return { curriculum: units, totalDay };
    }
  }

  // Fallback when manifest is missing — flat unit list, no chapter grouping.
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
  return { curriculum, totalDay };
}

export function createInitialState(bookId?: string, files?: Record<string, unknown>) {
  const { curriculum, totalDay } = buildCurriculumFromAssets(bookId, files);
  return {
    schemaVersion: 19,
    curriculum,
    totalDay,
  };
}

