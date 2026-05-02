import { assertNoDisallowedExpressionKeys } from "./expression.ts";
import type { QuizResult } from "./studyTypes.ts";

export type RawRecord = Record<string, unknown>;

export function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" ? (value as RawRecord) : null;
}

export function toNullableDate(value: unknown, fallback: string | null | undefined): string | null {
  return typeof value === "string" || value === null ? (value as string | null) : (fallback ?? null);
}

export function toOptionalString(value: unknown, fallback: string | undefined) {
  return typeof value === "string" ? value : fallback;
}

export function toStage(value: unknown, fallback: number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toLastResult(value: unknown, fallback: QuizResult | undefined): QuizResult | undefined {
  return value === "PASS" || value === "FAIL" || value === "NEUTRAL" ? value : fallback;
}

export function getSourceDay(sourceJson: unknown, dayIndex: number, unitPath?: string | null): RawRecord | null {
  const root = resolveUnitRoot(sourceJson, unitPath);
  if (!root) return null;
  const rootRecord = asRecord(root);
  if (Array.isArray(rootRecord?.day)) {
    return asRecord(rootRecord.day?.[dayIndex]);
  }
  if (Array.isArray(rootRecord?.unitSteps)) {
    return asRecord(rootRecord.unitSteps?.[dayIndex]);
  }
  if (Array.isArray(rootRecord?.days)) {
    return asRecord(rootRecord.days?.[dayIndex]);
  }
  if (Array.isArray(root)) {
    return asRecord(root?.[dayIndex]);
  }
  if (Array.isArray(rootRecord?.items)) {
    return rootRecord;
  }
  return null;
}

export function getSourceItem(sourceJson: unknown, dayIndex: number, itemIndex: number, unitPath?: string | null): RawRecord | null {
  const root = resolveUnitRoot(sourceJson, unitPath);
  if (!root) return null;
  const rootRecord = asRecord(root);
  if (Array.isArray(rootRecord?.day)) {
    return asRecord(asRecord(rootRecord.day?.[dayIndex])?.items?.[itemIndex]);
  }
  if (Array.isArray(rootRecord?.unitSteps)) {
    return asRecord(asRecord(rootRecord.unitSteps?.[dayIndex])?.items?.[itemIndex]);
  }
  if (Array.isArray(rootRecord?.days)) {
    return asRecord(asRecord(rootRecord.days?.[dayIndex])?.items?.[itemIndex]);
  }
  if (Array.isArray(root)) {
    return asRecord(asRecord(root?.[dayIndex])?.items?.[itemIndex]);
  }
  if (Array.isArray(rootRecord?.items)) {
    return asRecord(rootRecord.items?.[itemIndex]);
  }
  return null;
}

export function getSourceReading(sourceItem: RawRecord, fallback: string | undefined) {
  if (typeof sourceItem?.reading === "string" && sourceItem.reading) {
    return sourceItem.reading;
  }
  if (typeof sourceItem?.readingParts === "string" && sourceItem.readingParts) {
    return sourceItem.readingParts;
  }
  const readingParts = asRecord(sourceItem.readingParts);
  if (readingParts) {
    const map = asRecord(readingParts.kanjiToKana) ?? {};
    const values = Object.values(map).join("");
    return `${values}${readingParts.restKana ?? ""}` || fallback;
  }
  return fallback;
}

export function getSourceExpression(sourceItem: RawRecord, fallback: unknown, context: string) {
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

export function getSourceKanjiToKana(sourceItem: RawRecord, fallback: Record<string, string> | undefined) {
  if (sourceItem?.tokens && Array.isArray(sourceItem.tokens)) {
    const mapped = sourceItem.tokens.reduce<Record<string, string>>((acc, token) => {
      const value = asRecord(token);
      if (value?.type === "kanji" && value.surface && value.reading) {
        acc[String(value.surface)] = String(value.reading);
      }
      return acc;
    }, {});
    if (Object.keys(mapped).length > 0) return mapped;
  }

  const readingParts = asRecord(sourceItem.readingParts);
  const rawMap = asRecord(readingParts?.kanjiToKana);
  if (rawMap) {
    return toStringMap(rawMap, fallback);
  }

  return fallback;
}

function getArrayField(value: RawRecord | null, key: string): unknown[] {
  const field = value?.[key];
  return Array.isArray(field) ? field : [];
}

function toStringMap(value: unknown, fallback: Record<string, string> | undefined) {
  const record = asRecord(value);
  if (!record) return fallback;
  return Object.fromEntries(Object.entries(record).map(([key, fieldValue]) => [key, String(fieldValue)]));
}

function resolveUnitRoot(sourceJson: unknown, unitPath?: string | null): RawRecord | unknown[] | null {
  const sourceRoot = asRecord(sourceJson);
  if (!sourceJson) return null;
  if (sourceRoot?.format !== "combined" || !unitPath) return sourceRoot ?? null;

  if (Array.isArray(sourceRoot?.days)) {
    const index = Number(unitPath);
    if (Number.isInteger(index) && index >= 0) {
      return asRecord(sourceRoot.days[index]) ?? null;
    }
    return null;
  }

  const units = getArrayField(sourceRoot, "units").map(asRecord).filter((unit): unit is RawRecord => Boolean(unit));
  const slash = unitPath.indexOf("/");
  if (slash >= 0) {
    const chapterId = unitPath.slice(0, slash);
    const unitId = unitPath.slice(slash + 1);
    return units.find((u) => u?.chapterId === chapterId && u?.unitId === unitId) ?? null;
  }
  return units.find((u) => u?.unitId === unitPath) ?? null;
}
