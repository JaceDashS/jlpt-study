import type { LearningPath, QuizResult, SessionView, SetStudyState, StudyDay, StudyItem, StudyUnit } from "./studyTypes.ts";

type PersistSourceField = (item: StudyItem, field: string, value: unknown) => Promise<void>;
type PersistSourceDayField = (day: StudyDay, field: string, value: unknown) => Promise<void>;

type ProgressActionsOptions = {
  session: SessionView | null;
  stateCurriculum: StudyUnit[];
  today: string;
  setState: SetStudyState;
  getPathDay: (curriculum: StudyUnit[], path: LearningPath) => StudyDay | null;
  replaceDay: (curriculum: StudyUnit[], targetPath: LearningPath, nextDay: StudyDay) => StudyUnit[];
  persistSourceField: PersistSourceField;
  persistSourceDayField: PersistSourceDayField;
};

export function createProgressActions({
  session,
  stateCurriculum,
  today,
  setState,
  getPathDay,
  replaceDay,
  persistSourceField,
  persistSourceDayField,
}: ProgressActionsOptions) {
  const markDayAttemptNow = (path: LearningPath) => {
    const day = getPathDay(stateCurriculum, path);
    if (!day || day.lastAttemptDate === today) return;

    const nextDay = {
      ...day,
      lastAttemptDate: today,
    };

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));

    void persistSourceDayField(day, "lastAttemptDate", today);
  };

  const updateMemo = (itemId: string, field: "memoPersonal" | "memoDecomposition", value: string) => {
    if (!session) return;
    const path = {
      unitId: session.unitId,
      dayId: session.dayId,
    };

    const day = getPathDay(stateCurriculum, path);
    if (!day) return;

    const targetItem = day.items.find((item) => item.id === itemId);
    if (!targetItem) return;

    const nextDay = {
      ...day,
      items: day.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    };

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));
    void persistSourceField(targetItem, field, value);
  };

  const updateProblem = (itemId: string, value: unknown) => {
    if (!session) return;
    const path = {
      unitId: session.unitId,
      dayId: session.dayId,
    };

    const day = getPathDay(stateCurriculum, path);
    if (!day) return;

    const targetItem = day.items.find((item) => item.id === itemId);
    if (!targetItem) return;

    const nextDay = {
      ...day,
      items: day.items.map((item) => (item.id === itemId ? { ...item, problem: value } : item)),
    };

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));
    void persistSourceField(targetItem, "problem", value);
  };

  const updateLastResultNow = (itemId: string, result: Extract<QuizResult, "PASS" | "FAIL">) => {
    if (!session) return;
    const path = {
      unitId: session.unitId,
      dayId: session.dayId,
    };

    const day = getPathDay(stateCurriculum, path);
    if (!day) return;
    const targetItem = day.items.find((item) => item.id === itemId);
    if (!targetItem) return;

    const nextDay = {
      ...day,
      items: day.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              lastResult: result,
            }
          : item,
      ),
      lastAttemptDate: today,
    };

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));

    void persistSourceField(targetItem, "lastResult", result);
    void persistSourceDayField(day, "lastAttemptDate", today);
  };

  return {
    markDayAttemptNow,
    updateMemo,
    updateProblem,
    updateLastResultNow,
  };
}
