import type React from "react";
import type { ProblemDraft, ProblemEditorState } from "../components/session/sessionViewTypes.ts";
import type {
  LearningPath,
  QuizResult,
  SessionView,
  SetSession,
  SetStudyState,
  StudyDay,
  StudyItem,
  StudyProblem,
  StudyUnit,
} from "./studyTypes.ts";

type PersistSourceField = (item: StudyItem, field: string, value: unknown) => Promise<void>;
type PersistSourceDayField = (day: StudyDay, field: string, value: unknown) => Promise<void>;
type DayResult = { day: StudyDay; allPass?: boolean };
type ProblemPayload = { error: string; problem: unknown };

type SessionControllerOptions = {
  session: SessionView | null;
  sessionItems: StudyItem[];
  currentItem: StudyItem | null;
  problemEditor: ProblemEditorState;
  setProblemEditor: React.Dispatch<React.SetStateAction<ProblemEditorState>>;
  setSession: SetSession;
  setState: SetStudyState;
  stateCurriculum: StudyUnit[];
  today: string;
  markDayAttemptNow: (path: LearningPath) => void;
  normalizeProblem: (problem: unknown) => StudyProblem | null;
  createProblemDraft: (problem: unknown) => ProblemDraft;
  buildProblemPayload: (draft: ProblemDraft, previousProblem: unknown) => ProblemPayload;
  updateProblem: (itemId: string, value: unknown) => void;
  getPathDay: (curriculum: StudyUnit[], path: LearningPath) => StudyDay | null;
  replaceDay: (curriculum: StudyUnit[], targetPath: LearningPath, nextDay: StudyDay) => StudyUnit[];
  applyReviewResultForDay: (day: StudyDay, today: string, gradedMap: Record<string, QuizResult>) => DayResult;
  applyQuizResultForDay: (day: StudyDay, today: string, gradedMap: Record<string, QuizResult>) => DayResult;
  persistSourceField: PersistSourceField;
  persistSourceDayField: PersistSourceDayField;
  goHome: () => void;
};

export function createSessionController({
  session,
  sessionItems,
  currentItem,
  problemEditor,
  setProblemEditor,
  setSession,
  setState,
  stateCurriculum,
  today,
  markDayAttemptNow,
  normalizeProblem,
  createProblemDraft,
  buildProblemPayload,
  updateProblem,
  getPathDay,
  replaceDay,
  applyReviewResultForDay,
  applyQuizResultForDay,
  persistSourceField,
  persistSourceDayField,
  goHome,
}: SessionControllerOptions) {
  const canFinalizeQuiz = () => {
    if (!session || session.phase !== "quiz") return false;
    return sessionItems.every((item) => {
      const problem = normalizeProblem(item.problem);
      if (!problem || problem.choices.length === 0) return true;
      return Boolean(session.graded?.[item.id]);
    });
  };

  const canGoQuizNext = () => {
    if (!session || session.phase !== "quiz" || !currentItem) return false;
    const isLast = session.index === sessionItems.length - 1;
    if (!isLast) return true;
    return canFinalizeQuiz();
  };

  const persistDaySchedule = (sourceDay: StudyDay, nextDay: StudyDay) => {
    void persistSourceDayField(sourceDay, "stage", nextDay.stage);
    void persistSourceDayField(sourceDay, "stageCompleteDate", nextDay.stageCompleteDate ?? null);
    void persistSourceDayField(sourceDay, "nextReviewDate", nextDay.nextReviewDate);
    void persistSourceDayField(sourceDay, "lastAttemptDate", nextDay.lastAttemptDate);
  };

  const resetPersistedResults = (items: StudyItem[]) => {
    items.forEach((item) => {
      void persistSourceField(item, "lastResult", "NEUTRAL");
    });
  };

  const finishSession = ({
    allPass,
    failedItemIds,
    passCount,
    reviewedCount,
  }: {
    allPass?: boolean;
    failedItemIds: string[];
    passCount: number;
    reviewedCount: number;
  }) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (failedItemIds.length > 0) {
        return {
          ...prev,
          phase: "study",
          index: 0,
          itemIds: failedItemIds,
          allPass,
          passCount,
          reviewedCount,
          postQuizStudy: true,
        };
      }
      return {
        ...prev,
        phase: "done",
        allPass,
        passCount,
        reviewedCount,
        postQuizStudy: false,
      };
    });
  };

  const finalizeQuiz = (gradedMap: Record<string, QuizResult> = {}) => {
    if (!session || !canFinalizeQuiz()) return;

    const path = {
      unitId: session.unitId,
      dayId: session.dayId,
    };

    const day = getPathDay(stateCurriculum, path);
    if (!day) return;

    const passCount = Object.values(gradedMap).filter((result) => result === "PASS").length;
    const reviewedCount = Object.keys(gradedMap).length;
    const failedItemIds = sessionItems
      .filter((item) => gradedMap?.[item.id] === "FAIL")
      .map((item) => item.id);

    const { day: nextDay, allPass } =
      session.mode === "review"
        ? applyReviewResultForDay(day, today, gradedMap)
        : applyQuizResultForDay(day, today, gradedMap);
    const stageRaised = Number(nextDay?.stage ?? 1) > Number(day?.stage ?? 1);

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));

    finishSession({
      allPass,
      failedItemIds,
      passCount,
      reviewedCount,
    });

    persistDaySchedule(day, nextDay);
    if (stageRaised) {
      resetPersistedResults(nextDay.items);
    }
  };

  const goPrevStudyItem = () => {
    if (!session || session.phase !== "study") return;
    setSession((prev) => prev && ({
      ...prev,
      index: Math.max(0, prev.index - 1),
    }));
  };

  const goNextStudyItem = () => {
    if (!session || session.phase !== "study" || sessionItems.length === 0) return;
    const isLast = session.index === sessionItems.length - 1;
    if (isLast && session.postQuizStudy) {
      markDayAttemptNow({
        unitId: session.unitId,
        dayId: session.dayId,
      });
      goHome();
      return;
    }
    if (isLast) {
      markDayAttemptNow({
        unitId: session.unitId,
        dayId: session.dayId,
      });
    }
    setSession((prev) => prev && ({
      ...prev,
      phase: isLast ? "quiz" : "study",
      index: isLast ? 0 : prev.index + 1,
    }));
  };

  const goPrevQuizItem = () => {
    if (!session || session.phase !== "quiz") return;
    setSession((prev) => prev && ({
      ...prev,
      index: Math.max(0, prev.index - 1),
    }));
  };

  const goNextQuizItem = () => {
    if (!session || session.phase !== "quiz" || !canGoQuizNext()) return;
    const isLast = session.index === sessionItems.length - 1;
    if (isLast) {
      finalizeQuiz(session.graded ?? {});
      return;
    }
    setSession((prev) => prev && ({
      ...prev,
      index: prev.index + 1,
    }));
  };

  const openProblemEditor = (problem: unknown) => {
    setProblemEditor({
      open: true,
      draft: createProblemDraft(problem),
      error: "",
    });
  };

  const saveProblemEditor = () => {
    if (!currentItem) return;

    const { error, problem } = buildProblemPayload(problemEditor.draft, currentItem.problem);
    if (error) {
      setProblemEditor((prev) => ({ ...prev, error }));
      return;
    }

    updateProblem(currentItem.id, problem);
    setSession((prev) => {
      if (!prev) return prev;
      const nextChoiceOrders = { ...(prev.choiceOrders ?? {}) };
      delete nextChoiceOrders[currentItem.id];
      return {
        ...prev,
        choiceOrders: nextChoiceOrders,
      };
    });
    setProblemEditor((prev) => ({ ...prev, open: false, error: "" }));
  };

  return {
    canGoQuizNext,
    finalizeQuiz,
    goPrevStudyItem,
    goNextStudyItem,
    goPrevQuizItem,
    goNextQuizItem,
    openProblemEditor,
    saveProblemEditor,
  };
}
