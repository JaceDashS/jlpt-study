import { useEffect, useState } from "react";
import { normalizePlanRangePreference, writeAppPreferences, type PlanRangePreference } from "./appPreferences.ts";

const PLAN_RANGE_STORAGE_KEY = "jlpt-n1-plan-range-v1";

export function usePlanRange(todayValue: string, initialPlanRange?: Partial<PlanRangePreference>) {
  const [planRange, setPlanRange] = useState(() => {
    const defaultRange = {
      start: todayValue,
      end: getDefaultPlanEnd(todayValue),
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
  const start = normalized.start ?? fallback.start;
  const end = normalized.end ?? fallback.end;
  // 저장된 종료일이 시작일보다 빠르면 못 쓰는 값이므로 기본값으로 되돌린다.
  return {
    start,
    end: end < start ? getDefaultPlanEnd(start) : end,
  };
}

// 시험일(6월 1일) 기준. 올해 날짜가 이미 지났으면 내년으로 넘긴다.
export function getDefaultPlanEnd(startValue: string) {
  const year = Number(startValue.slice(0, 4));
  const thisYear = `${year}-06-01`;
  return thisYear >= startValue ? thisYear : `${year + 1}-06-01`;
}
