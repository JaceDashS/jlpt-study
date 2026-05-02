import { useEffect } from "react";
import {
  buildDailyLearningPlanPaths,
  normalizeDailyNewLearningCount,
} from "./studyHelpers.ts";
import { areLearningPathListsEqual, isValidLearningPath } from "./learningPath.ts";

export function updateDailyLearningCount({ event, setState, today }) {
  const nextCount = normalizeDailyNewLearningCount(event.target.value);
  setState((prev) => ({
    ...prev,
    dailyNewLearningCount: nextCount,
    learningPlan: {
      date: today,
      count: nextCount,
      paths: buildDailyLearningPlanPaths(prev.curriculum, nextCount, today),
    },
  }));
}

export function useLearningPlanSync({ setState, state, today }) {
  useEffect(() => {
    setState((prev) => {
      const normalizedCount = normalizeDailyNewLearningCount(prev.dailyNewLearningCount);
      const existingPaths = Array.isArray(prev.learningPlan?.paths) ? prev.learningPlan.paths.filter(isValidLearningPath) : [];
      const isTodayPlan = prev.learningPlan?.date === today && normalizeDailyNewLearningCount(prev.learningPlan?.count) === normalizedCount;
      const computedPaths = buildDailyLearningPlanPaths(prev.curriculum, normalizedCount, today);
      const shouldKeepTodayPlan = isTodayPlan && areLearningPathListsEqual(existingPaths, computedPaths);
      const nextPaths = shouldKeepTodayPlan ? existingPaths : computedPaths;

      const nextPlan = {
        date: today,
        count: normalizedCount,
        paths: nextPaths,
      };

      const sameCount = prev.dailyNewLearningCount === normalizedCount;
      const sameDate = prev.learningPlan?.date === nextPlan.date;
      const samePlanCount = normalizeDailyNewLearningCount(prev.learningPlan?.count) === nextPlan.count;
      const samePaths = areLearningPathListsEqual(existingPaths, nextPlan.paths);

      if (sameCount && sameDate && samePlanCount && samePaths) {
        return prev;
      }

      return {
        ...prev,
        dailyNewLearningCount: normalizedCount,
        learningPlan: nextPlan,
      };
    });
  }, [setState, state.curriculum, state.dailyNewLearningCount, today]);
}
