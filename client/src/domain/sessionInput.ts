type QuizInputActionsOptions = {
  currentItem: any;
  goNextQuizItem: () => void;
  normalizeProblem: (problem: unknown) => any;
  session: any;
  setSession: (updater: (prev: any) => any) => void;
  updateLastResultNow: (itemId: string, result: "PASS" | "FAIL") => void;
};

export function createQuizInputActions({
  currentItem,
  goNextQuizItem,
  normalizeProblem,
  session,
  setSession,
  updateLastResultNow,
}: QuizInputActionsOptions) {
  const selectQuizChoice = (choice) => {
    if (!session || session.phase !== "quiz" || !currentItem) return false;
    const problem = normalizeProblem(currentItem.problem);
    if (!problem || problem.choices.length === 0) return false;

    const choiceOrder = session.choiceOrders?.[currentItem.id] ?? problem.choices;
    if (!choiceOrder.includes(choice)) return false;

    const alreadySelected = session.selectedChoices?.[currentItem.id] === choice;
    if (alreadySelected) {
      goNextQuizItem();
      return true;
    }

    const isPass = problem.answer ? choice === problem.answer : true;
    const result = isPass ? "PASS" : "FAIL";
    updateLastResultNow(currentItem.id, result);
    setSession((prev) => ({
      ...prev,
      graded: {
        ...(prev.graded ?? {}),
        [currentItem.id]: result,
      },
      selectedChoices: {
        ...(prev.selectedChoices ?? {}),
        [currentItem.id]: choice,
      },
      showChoices: {
        ...(prev.showChoices ?? {}),
        [currentItem.id]: true,
      },
    }));
    return true;
  };

  const selectQuizChoiceByIndex = (choiceIndex) => {
    if (!session || session.phase !== "quiz" || !currentItem || choiceIndex < 0) return false;
    const problem = normalizeProblem(currentItem.problem);
    if (!problem || problem.choices.length === 0) return false;
    const choiceOrder = session.choiceOrders?.[currentItem.id] ?? problem.choices;
    if (choiceIndex >= choiceOrder.length) return false;
    return selectQuizChoice(choiceOrder[choiceIndex]);
  };

  const isQuizChoiceVisible = () => {
    if (!session || session.phase !== "quiz" || !currentItem) return false;
    return Boolean(session.showChoices?.[currentItem.id] || session.selectedChoices?.[currentItem.id]);
  };

  const openQuizChoices = () => {
    if (!session || session.phase !== "quiz" || !currentItem) return false;
    const problem = normalizeProblem(currentItem.problem);
    if (!problem || problem.choices.length === 0) return false;
    setSession((prev) => ({
      ...prev,
      showChoices: {
        ...(prev.showChoices ?? {}),
        [currentItem.id]: true,
      },
    }));
    return true;
  };

  return { isQuizChoiceVisible, openQuizChoices, selectQuizChoice, selectQuizChoiceByIndex };
}

type SessionKeyboardHandlerOptions = {
  canGoQuizNext: () => boolean;
  goHome: () => void;
  goNextQuizItem: () => void;
  goNextStudyItem: () => void;
  goPrevQuizItem: () => void;
  goPrevStudyItem: () => void;
  isQuizChoiceVisible: () => boolean;
  openQuizChoices: () => boolean;
  selectQuizChoiceByIndex: (choiceIndex: number) => boolean;
  session: any;
};

function isTextInputTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function createSessionKeyboardHandler({
  canGoQuizNext,
  goHome,
  goNextQuizItem,
  goNextStudyItem,
  goPrevQuizItem,
  goPrevStudyItem,
  isQuizChoiceVisible,
  openQuizChoices,
  selectQuizChoiceByIndex,
  session,
}: SessionKeyboardHandlerOptions) {
  return (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTextInputTarget(event.target)) return;

    if (session.phase === "done") {
      if (event.key === "Enter" || event.code === "Space") {
        event.preventDefault();
        goHome();
      }
      return;
    }

    if (session.phase === "quiz") {
      const key = String(event.key ?? "");
      const choiceIndex = /^[1-4]$/.test(key) ? Number(key) - 1 : -1;
      if (choiceIndex >= 0) {
        if (!isQuizChoiceVisible()) {
          if (openQuizChoices()) {
            event.preventDefault();
            return;
          }
        }
        if (selectQuizChoiceByIndex(choiceIndex)) {
          event.preventDefault();
          return;
        }
      }
    }

    if (event.key === "ArrowLeft") {
      if (session.phase === "study") {
        if (session.index > 0) {
          event.preventDefault();
          goPrevStudyItem();
        }
        return;
      }
      if (session.phase === "quiz") {
        if (session.index > 0) {
          event.preventDefault();
          goPrevQuizItem();
        }
      }
      return;
    }

    if (event.key === "ArrowRight") {
      if (session.phase === "study") {
        event.preventDefault();
        goNextStudyItem();
        return;
      }
      if (session.phase === "quiz" && canGoQuizNext()) {
        event.preventDefault();
        goNextQuizItem();
      }
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (session.phase === "study") {
        goNextStudyItem();
        return;
      }
      if (session.phase === "quiz" && canGoQuizNext()) {
        goNextQuizItem();
      }
    }
  };
}
