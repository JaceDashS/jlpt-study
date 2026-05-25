import { apiFetch, apiUrl } from "../api.ts";
import { normalizeDailyNewLearningCount } from "./studyHelpers.ts";

export type PlanRangePreference = {
  end: string;
  start: string;
};

export type AppPreferences = {
  dailyNewLearningCount?: number;
  planRange?: Partial<PlanRangePreference>;
  selectedBookId?: string;
};

export async function readAppPreferences(fetchImpl = apiFetch): Promise<AppPreferences> {
  try {
    const response = await fetchImpl(apiUrl("app-preferences"), {
      credentials: "same-origin",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Failed to read app preferences:", response.status, body);
      return {};
    }

    const payload = await response.json().catch(() => ({}));
    return normalizeAppPreferences(payload?.preferences ?? payload);
  } catch (error) {
    console.error("Failed to read app preferences:", error);
    return {};
  }
}

export async function writeAppPreferences(preferences: AppPreferences, fetchImpl = apiFetch) {
  try {
    const response = await fetchImpl(apiUrl("app-preferences"), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ preferences }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Failed to write app preferences:", response.status, body);
    }
  } catch (error) {
    console.error("Failed to write app preferences:", error);
  }
}

export function normalizeAppPreferences(value: unknown): AppPreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const preferences: AppPreferences = {};
  const selectedBookId = String(source.selectedBookId ?? "").trim();
  if (selectedBookId) {
    preferences.selectedBookId = selectedBookId;
  }
  if (Object.prototype.hasOwnProperty.call(source, "dailyNewLearningCount")) {
    preferences.dailyNewLearningCount = normalizeDailyNewLearningCount(source.dailyNewLearningCount);
  }
  const planRange = normalizePlanRangePreference(source.planRange);
  if (planRange) {
    preferences.planRange = planRange;
  }
  return preferences;
}

export function normalizePlanRangePreference(value: unknown): Partial<PlanRangePreference> | null {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const planRange: Partial<PlanRangePreference> = {};
  const start = String(source.start ?? "").trim();
  const end = String(source.end ?? "").trim();
  if (isYmd(start)) {
    planRange.start = start;
  }
  if (isYmd(end)) {
    planRange.end = end;
  }
  return Object.keys(planRange).length > 0 ? planRange : null;
}

function isYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
