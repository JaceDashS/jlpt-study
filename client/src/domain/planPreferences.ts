import { useEffect, useState } from "react";

const PLAN_RANGE_STORAGE_KEY = "jlpt-n1-plan-range-v1";

export function usePlanRange(todayValue: string) {
  const [planRange, setPlanRange] = useState(() => {
    const defaultRange = {
      start: todayValue,
      end: `${todayValue.slice(0, 4)}-06-01`,
    };

    try {
      const raw = localStorage.getItem(PLAN_RANGE_STORAGE_KEY);
      if (!raw) return defaultRange;
      const parsed = JSON.parse(raw);
      return {
        start: typeof parsed?.start === "string" ? parsed.start : defaultRange.start,
        end: typeof parsed?.end === "string" ? parsed.end : defaultRange.end,
      };
    } catch (error) {
      return defaultRange;
    }
  });

  useEffect(() => {
    localStorage.setItem(PLAN_RANGE_STORAGE_KEY, JSON.stringify(planRange));
  }, [planRange]);

  return [planRange, setPlanRange] as const;
}
