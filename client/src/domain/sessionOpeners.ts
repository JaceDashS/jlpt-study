import type { LearningPath, SessionView, StudyDay, StudyItem, StudyUnit } from "./studyTypes.ts";

type SessionOpenersOptions = {
  getPathDay: (curriculum: StudyUnit[], path: LearningPath) => StudyDay | null;
  isQuizTarget: (item: StudyItem) => boolean;
  markDayAttemptNow: (path: LearningPath) => void;
  setSession: (session: SessionView) => void;
  shuffleArray: <T>(items: T[]) => T[];
  stateCurriculum: StudyUnit[];
};

function orderReviewItemIds({
  day,
  dueItemIds,
  isQuizTarget,
  shuffleArray,
}: {
  day: StudyDay | null;
  dueItemIds: string[];
  isQuizTarget: (item: StudyItem) => boolean;
  shuffleArray: <T>(items: T[]) => T[];
}) {
  if (!day) return shuffleArray(dueItemIds);

  const dueIdSet = new Set(dueItemIds);
  const failedDueIds = day.items
    .filter(isQuizTarget)
    .filter((item) => dueIdSet.has(item.id) && item.lastResult === "FAIL")
    .map((item) => item.id);
  const failedIdSet = new Set(failedDueIds);
  const otherDueIds = dueItemIds.filter((id) => !failedIdSet.has(id));

  return [...shuffleArray(failedDueIds), ...shuffleArray(otherDueIds)];
}

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
    const day = getPathDay(stateCurriculum, path);
    const orderedDueIds = orderReviewItemIds({
      day,
      dueItemIds,
      isQuizTarget,
      shuffleArray,
    });
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
      reviewedCount: orderedDueIds.length,
      itemIds: orderedDueIds,
    });
  };

  return { openLearningDay, openReviewDay };
}
