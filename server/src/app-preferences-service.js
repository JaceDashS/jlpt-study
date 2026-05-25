import fs from "node:fs/promises";
import path from "node:path";
import { stripBom, writeFileAtomically } from "./asset-services.js";

const PREFERENCES_FILE = "server-data/app-preferences.json";

export function normalizeAppPreferences(value) {
  const preferences = {};
  const selectedBookId = String(value?.selectedBookId ?? "").trim();
  if (selectedBookId) {
    preferences.selectedBookId = selectedBookId;
  }

  if (Object.prototype.hasOwnProperty.call(value ?? {}, "dailyNewLearningCount")) {
    preferences.dailyNewLearningCount = normalizeDailyNewLearningCount(value.dailyNewLearningCount);
  }

  const planRange = normalizePlanRange(value?.planRange);
  if (planRange) {
    preferences.planRange = planRange;
  }

  return preferences;
}

export async function readAppPreferences(repoRoot) {
  const filePath = resolvePreferencesPath(repoRoot);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeAppPreferences(JSON.parse(stripBom(raw)));
  } catch (error) {
    if (String(error?.code ?? "") === "ENOENT") return {};
    throw error;
  }
}

export async function writeAppPreferences(repoRoot, patch) {
  const current = await readAppPreferences(repoRoot);
  const normalizedPatch = normalizeAppPreferences(patch);
  const next = normalizeAppPreferences({
    ...current,
    ...normalizedPatch,
    planRange: normalizedPatch.planRange
      ? {
          ...current.planRange,
          ...normalizedPatch.planRange,
        }
      : current.planRange,
  });
  const filePath = resolvePreferencesPath(repoRoot);
  await writeFileAtomically(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function resolvePreferencesPath(repoRoot) {
  return path.resolve(repoRoot, PREFERENCES_FILE);
}

function normalizeDailyNewLearningCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

function normalizePlanRange(value) {
  if (!value || typeof value !== "object") return null;
  const planRange = {};
  const start = String(value.start ?? "").trim();
  const end = String(value.end ?? "").trim();
  if (isYmd(start)) {
    planRange.start = start;
  }
  if (isYmd(end)) {
    planRange.end = end;
  }
  return Object.keys(planRange).length > 0 ? planRange : null;
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}
