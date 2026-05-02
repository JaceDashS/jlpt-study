import { assertNoDisallowedExpressionKeys } from "../domain/expression.ts";
import type { QuizResult, SourceRef, StudyItem } from "../domain/studyTypes.ts";
import { repairMojibakeText } from "../domain/textRepair.ts";

export type RawRecord = Record<string, unknown>;

export type RawDayBlock = {
  dayNumber: number;
  stage: number;
  stageCompleteDate: string | null;
  nextReviewDate: string | null;
  lastAttemptDate: string;
  lastCompletedDate: string;
  items: RawRecord[];
};

export function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" ? (value as RawRecord) : null;
}

export function createExpressionItem(
  id: string,
  expression: string,
  reading: string,
  meaningKo: string,
  kanjiToKana: Record<string, string> = {},
  problem: unknown = null,
  sourceRef: SourceRef | null = null,
  sourceItem: RawRecord | null = null,
): StudyItem {
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

export function extractDayBlocks(unitGroup: RawRecord | null): RawDayBlock[] {
  if (!unitGroup) return [];
  const rawDays = Array.isArray(unitGroup?.day) ? unitGroup.day : [];
  return rawDays
    .map((rawDay, index) => {
      const day = asRecord(rawDay);
      return {
        dayNumber: Number(day?.day ?? index + 1),
        stage: getDayStageFromRaw(day),
        stageCompleteDate: getDayStageCompleteDateFromRaw(day),
        nextReviewDate: getDayNextReviewDateFromRaw(day),
        lastAttemptDate: getDayLastAttemptDateFromRaw(day),
        lastCompletedDate: getDayLastCompletedDateFromRaw(day),
        items: getRawItems(day),
      };
    })
    .filter((day) => day.items.length > 0);
}

export function toReading(rawItem: RawRecord) {
  if (typeof rawItem?.reading === "string" && rawItem.reading) return repairMojibakeText(rawItem.reading);
  if (typeof rawItem?.readingParts === "string" && rawItem.readingParts) return repairMojibakeText(rawItem.readingParts);
  const readingParts = asRecord(rawItem.readingParts);
  if (readingParts) {
    const kanjiToKana = asRecord(readingParts.kanjiToKana) ?? {};
    const values = Object.values(kanjiToKana).join("");
    return repairMojibakeText(`${values}${readingParts.restKana ?? ""}`);
  }
  return "-";
}

export function toExpression(rawItem: RawRecord, context = "createInitialState.rawItem") {
  assertNoDisallowedExpressionKeys(rawItem, context);
  if (typeof rawItem?.expression !== "string" || !rawItem.expression.trim()) {
    throw new Error(`${context}: missing required expression`);
  }
  return repairMojibakeText(rawItem.expression);
}

export function toMeaning(rawItem: RawRecord) {
  return repairMojibakeText(String(rawItem?.meaningKo ?? rawItem?.meaning ?? rawItem?.sentence ?? "?? ?? ??"));
}

export function toKanjiToKana(rawItem: RawRecord) {
  if (rawItem?.tokens && Array.isArray(rawItem.tokens)) {
    const mapped = rawItem.tokens.reduce<Record<string, string>>((acc, token) => {
      const value = asRecord(token);
      if (value?.type === "kanji" && value.surface && value.reading) {
        acc[repairMojibakeText(String(value.surface))] = repairMojibakeText(String(value.reading));
      }
      return acc;
    }, {});
    if (Object.keys(mapped).length > 0) return mapped;
  }

  const readingParts = asRecord(rawItem.readingParts);
  const rawMap = asRecord(readingParts?.kanjiToKana);
  if (rawMap) {
    return Object.fromEntries(
      Object.entries(rawMap).map(([key, value]) => [
        repairMojibakeText(String(key)),
        repairMojibakeText(String(value)),
      ]),
    );
  }
  return {};
}

export function toItemId(rawItem: RawRecord, fallbackId: string) {
  const rawId = typeof rawItem?.id === "string" ? rawItem.id.trim() : "";
  if (rawId) return rawId;
  return fallbackId;
}

function getRawItems(day: RawRecord | null) {
  return Array.isArray(day?.items) ? day.items.map(asRecord).filter((item): item is RawRecord => Boolean(item)) : [];
}

function toLastResult(value: unknown): QuizResult {
  return value === "PASS" || value === "FAIL" || value === "NEUTRAL" ? value : "NEUTRAL";
}

function toMemoText(value: unknown) {
  if (value === null || value === undefined) return "";
  return repairMojibakeText(String(value));
}

function getDayStageFromRaw(day: RawRecord | null) {
  const fromDay = Number(day?.stage);
  if (Number.isFinite(fromDay)) return fromDay;
  const fromFirstItem = Number(getRawItems(day)[0]?.stage);
  if (Number.isFinite(fromFirstItem)) return fromFirstItem;
  return 1;
}

function toNullableDate(value: unknown): string | null {
  return typeof value === "string" || value === null ? (value as string | null) : null;
}

function getDayNextReviewDateFromRaw(day: RawRecord | null) {
  if (day && Object.prototype.hasOwnProperty.call(day, "nextReviewDate")) return toNullableDate(day.nextReviewDate);
  return toNullableDate(getRawItems(day)[0]?.nextReviewDate);
}

function getDayStageCompleteDateFromRaw(day: RawRecord | null) {
  if (day && Object.prototype.hasOwnProperty.call(day, "stageCompleteDate")) return toNullableDate(day.stageCompleteDate);
  return null;
}

function isValidAttemptDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getDayLastAttemptDateFromRaw(day: RawRecord | null) {
  if (isValidAttemptDate(day?.lastAttemptDate)) return day.lastAttemptDate;
  const items = getRawItems(day);
  const dates = items.map((item) => item?.lastAttemptDate).filter(isValidAttemptDate);
  if (dates.length === 0) return "";
  return dates.reduce((max, value) => (value > max ? value : max), dates[0]);
}

function getDayLastCompletedDateFromRaw(day: RawRecord | null) {
  return isValidAttemptDate(day?.lastCompletedDate) ? day.lastCompletedDate : "";
}
