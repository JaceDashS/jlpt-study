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
}) {
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

  const finalizeQuiz = (gradedMap) => {
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

    if (session.mode === "review") {
      const { day: nextDay } = applyReviewResultForDay(day, today, gradedMap);
      const stageRaised = Number(nextDay?.stage ?? 1) > Number(day?.stage ?? 1);

      setState((prev) => ({
        ...prev,
        curriculum: replaceDay(prev.curriculum, path, nextDay),
      }));

      setSession((prev) => {
        if (failedItemIds.length > 0) {
          return {
            ...prev,
            phase: "study",
            index: 0,
            itemIds: failedItemIds,
            passCount,
            reviewedCount,
            postQuizStudy: true,
          };
        }
        return {
          ...prev,
          phase: "done",
          passCount,
          reviewedCount,
          postQuizStudy: false,
        };
      });
      persistSourceDayField(day, "stage", nextDay.stage);
      persistSourceDayField(day, "stageCompleteDate", nextDay.stageCompleteDate ?? null);
      persistSourceDayField(day, "nextReviewDate", nextDay.nextReviewDate);
      persistSourceDayField(day, "lastAttemptDate", nextDay.lastAttemptDate);
      if (stageRaised) {
        nextDay.items.forEach((item) => {
          persistSourceField(item, "lastResult", "NEUTRAL");
        });
      }
      return;
    }

    const { day: nextDay, allPass } = applyQuizResultForDay(day, today, gradedMap);
    const stageRaised = Number(nextDay?.stage ?? 1) > Number(day?.stage ?? 1);

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));

    setSession((prev) => {
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
    persistSourceDayField(day, "stage", nextDay.stage);
    persistSourceDayField(day, "stageCompleteDate", nextDay.stageCompleteDate ?? null);
    persistSourceDayField(day, "nextReviewDate", nextDay.nextReviewDate);
    persistSourceDayField(day, "lastAttemptDate", nextDay.lastAttemptDate);
    if (stageRaised) {
      nextDay.items.forEach((item) => {
        persistSourceField(item, "lastResult", "NEUTRAL");
      });
    }
  };

  const goPrevStudyItem = () => {
    if (!session || session.phase !== "study") return;
    setSession((prev) => ({
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
    setSession((prev) => ({
      ...prev,
      phase: isLast ? "quiz" : "study",
      index: isLast ? 0 : prev.index + 1,
    }));
  };

  const goPrevQuizItem = () => {
    if (!session || session.phase !== "quiz") return;
    setSession((prev) => ({
      ...prev,
      index: Math.max(0, prev.index - 1),
    }));
  };

  const goNextQuizItem = () => {
    if (!session || session.phase !== "quiz" || !canGoQuizNext()) return;
    const isLast = session.index === sessionItems.length - 1;
    if (isLast) {
      finalizeQuiz(session.graded);
      return;
    }
    setSession((prev) => ({
      ...prev,
      index: prev.index + 1,
    }));
  };

  const openProblemEditor = (problem) => {
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
