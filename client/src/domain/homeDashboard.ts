import { useMemo } from "react";
import {
  buildAllDayRows,
  buildDateRangeMeta,
  buildDebugLogs,
  buildHomeDueDebug,
  buildLearningPlanRows,
  buildOverallMeta,
  buildReviewDue,
  type PlanRange,
} from "./homeDashboardBuilders.ts";
import type { StudyState } from "./studyTypes.ts";
import type { SrsSettings } from "./srsPreferences.ts";

export {
  buildAllDayRows,
  buildDateRangeMeta,
  buildDebugLogs,
  buildHomeDueDebug,
  buildLearningPlanRows,
  buildOverallMeta,
  buildReviewDue,
  type LearningPlanRow,
  type PlanRange,
  type ReviewDueRow,
} from "./homeDashboardBuilders.ts";

export function useHomeDashboardData({
  dailyNewLearningCount,
  planRange,
  srsSettings,
  state,
  today,
}: {
  dailyNewLearningCount: number;
  planRange: PlanRange;
  srsSettings: SrsSettings;
  state: StudyState;
  today: string;
}) {
  const reviewDue = useMemo(() => buildReviewDue(state.curriculum, today, srsSettings), [srsSettings, state.curriculum, today]);
  const homeDueDebug = useMemo(() => buildHomeDueDebug(state.curriculum, today, srsSettings), [srsSettings, state.curriculum, today]);
  const overallMeta = useMemo(
    () => buildOverallMeta(state.curriculum, state.totalDay, srsSettings),
    [srsSettings, state.curriculum, state.totalDay],
  );
  const dateRangeMeta = useMemo(() => buildDateRangeMeta(planRange, today), [planRange, today]);
  const learningPlanRows = useMemo(
    () => buildLearningPlanRows(state.curriculum, state.learningPlan, dailyNewLearningCount, today),
    [state.curriculum, state.learningPlan, dailyNewLearningCount, today],
  );
  const pendingLearningRows = useMemo(
    () => learningPlanRows.filter((row) => row.stageCompleteDate !== today),
    [learningPlanRows, today],
  );
  const debugLogs = useMemo(
    () =>
      buildDebugLogs({
        curriculum: state.curriculum,
        learningPlan: state.learningPlan,
        today,
        dailyNewLearningCount,
        learningPlanRows,
        pendingLearningRows,
        reviewDueCount: reviewDue.length,
      }),
    [dailyNewLearningCount, learningPlanRows, pendingLearningRows, reviewDue.length, state.curriculum, state.learningPlan, today],
  );
  const allDayRows = useMemo(() => buildAllDayRows(state.curriculum), [state.curriculum]);

  return {
    allDayRows,
    dateRangeMeta,
    debugLogs,
    homeDueDebug,
    learningPlanRows,
    overallMeta,
    pendingLearningRows,
    reviewDue,
  };
}
