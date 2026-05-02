import { useEffect } from "react";
import { createProblemDraft, normalizeProblem } from "./problem.ts";
import { createSessionKeyboardHandler } from "./sessionInput.ts";

export function useProblemEditorSync({ currentItem, setProblemEditor }) {
  useEffect(() => {
    if (!currentItem) {
      setProblemEditor({
        open: false,
        draft: createProblemDraft(null),
        error: "",
      });
      return;
    }

    setProblemEditor({
      open: false,
      draft: createProblemDraft(currentItem.problem),
      error: "",
    });
  }, [currentItem?.id, setProblemEditor]);
}

export function useQuizChoiceOrders({ currentItem, session, setSession, shuffleArray }) {
  useEffect(() => {
    if (!session || session.phase !== "quiz" || !currentItem) return;
    const problem = normalizeProblem(currentItem.problem);
    if (!problem || problem.choices.length === 0) return;
    if (session.choiceOrders?.[currentItem.id]) return;

    setSession((prev) => ({
      ...prev,
      choiceOrders: {
        ...(prev.choiceOrders ?? {}),
        [currentItem.id]: shuffleArray(problem.choices),
      },
    }));
  }, [currentItem?.id, session?.index, session?.phase, setSession, shuffleArray]);
}

export function useSessionKeyboardShortcuts({
  canGoQuizNext,
  currentItem,
  goHome,
  goNextQuizItem,
  goNextStudyItem,
  goPrevQuizItem,
  goPrevStudyItem,
  isQuizChoiceVisible,
  openQuizChoices,
  selectQuizChoiceByIndex,
  session,
  sessionItems,
}) {
  useEffect(() => {
    if (!session) return undefined;

    const onKeyDown = createSessionKeyboardHandler({
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
    });

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [session, sessionItems.length, currentItem?.id]);
}
