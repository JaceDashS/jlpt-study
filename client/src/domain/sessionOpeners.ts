type SessionOpenersOptions = {
  getPathDay: (curriculum: any, path: any) => any;
  isQuizTarget: (item: any) => boolean;
  markDayAttemptNow: (path: any) => void;
  setSession: (session: any) => void;
  shuffleArray: <T>(items: T[]) => T[];
  stateCurriculum: any;
};

export function createSessionOpeners({
  getPathDay,
  isQuizTarget,
  markDayAttemptNow,
  setSession,
  shuffleArray,
  stateCurriculum,
}: SessionOpenersOptions) {
  const openLearningDay = (path) => {
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

  const openReviewDay = (path, dueItemIds) => {
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
