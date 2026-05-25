import { useEffect, useState } from "react";
import { normalizePlanRangePreference, writeAppPreferences, type PlanRangePreference } from "./appPreferences.ts";

const PLAN_RANGE_STORAGE_KEY = "jlpt-n1-plan-range-v1";

export function usePlanRange(todayValue: string, initialPlanRange?: Partial<PlanRangePreference>) {
  const [planRange, setPlanRange] = useState(() => {
    const defaultRange = {
      start: todayValue,
      end: `${todayValue.slice(0, 4)}-06-01`,
    };

    const fromInitial = normalizePlanRange(initialPlanRange, defaultRange);
    if (fromInitial) return fromInitial;

    try {
      const raw = localStorage.getItem(PLAN_RANGE_STORAGE_KEY);
      if (!raw) return defaultRange;
      const parsed = JSON.parse(raw);
      return normalizePlanRange(parsed, defaultRange) ?? defaultRange;
    } catch (error) {
      return defaultRange;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PLAN_RANGE_STORAGE_KEY, JSON.stringify(planRange));
    } catch (error) {
      // Ignore restricted browser storage; server preferences remain the source of truth.
    }
    void writeAppPreferences({ planRange });
  }, [planRange]);

  return [planRange, setPlanRange] as const;
}

function normalizePlanRange(value: unknown, fallback: PlanRangePreference) {
  const normalized = normalizePlanRangePreference(value);
  if (!normalized) return null;
  return {
    start: normalized.start ?? fallback.start,
    end: normalized.end ?? fallback.end,
  };
}
