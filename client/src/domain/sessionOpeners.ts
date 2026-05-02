import type { LearningPath, SessionView, StudyDay, StudyItem, StudyUnit } from "./studyTypes.ts";

type SessionOpenersOptions = {
  getPathDay: (curriculum: StudyUnit[], path: LearningPath) => StudyDay | null;
  isQuizTarget: (item: StudyItem) => boolean;
  markDayAttemptNow: (path: LearningPath) => void;
  setSession: (session: SessionView) => void;
  shuffleArray: <T>(items: T[]) => T[];
  stateCurriculum: StudyUnit[];
};

export function createSessionOpeners({
  getPathDay,
  isQuizTarget,
  markDayAttemptNow,
  setSession,
  shuffleArray,
  stateCurriculum,
}: SessionOpenersOptions) {
  const openLearningDay = (path: LearningPath) => {
    const day = getPathDay(stateCurriculum, path);
    const shuffledItemIds = day ? shuffleArray(day.items.filter(isQuizTarget).map((item) => item.id)) : [];

    setSession({
      unitId: path.unitId,
      dayId: path.dayId,
      mode: "learning",
      phase: "study",
      index: 0,
      graded: {},
      selectedChoices: {},
      choiceOrders: {},
      showChoices: {},
      showMemoPersonal: {},
      allPass: null,
      passCount: 0,
      reviewedCount: 0,
      itemIds: shuffledItemIds,
    });
  };

  const openReviewDay = (path: LearningPath, dueItemIds: string[]) => {
    const shuffledDueIds = shuffleArray(dueItemIds);
    markDayAttemptNow(path);

    setSession({
      unitId: path.unitId,
      dayId: path.dayId,
      mode: "review",
      phase: "quiz",
      index: 0,
      graded: {},
      selectedChoices: {},
      choiceOrders: {},
      showChoices: {},
      showMemoPersonal: {},
      allPass: null,
      passCount: 0,
      reviewedCount: shuffledDueIds.length,
      itemIds: shuffledDueIds,
    });
  };

  return { openLearningDay, openReviewDay };
}
