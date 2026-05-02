import { useEffect } from "react";
import { createProblemDraft, normalizeProblem } from "./problem.ts";
import { createSessionKeyboardHandler } from "./sessionInput.ts";
import type { ProblemEditorState } from "../components/session/sessionViewTypes.ts";
import type { SessionView, SetSession, StudyItem } from "./studyTypes.ts";
import type React from "react";

type ProblemEditorSyncOptions = {
  currentItem: StudyItem | null;
  setProblemEditor: React.Dispatch<React.SetStateAction<ProblemEditorState>>;
};

export function useProblemEditorSync({ currentItem, setProblemEditor }: ProblemEditorSyncOptions) {
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

type QuizChoiceOrderOptions = {
  currentItem: StudyItem | null;
  session: SessionView | null;
  setSession: SetSession;
  shuffleArray: <T>(items: T[]) => T[];
};

export function useQuizChoiceOrders({ currentItem, session, setSession, shuffleArray }: QuizChoiceOrderOptions) {
  useEffect(() => {
    if (!session || session.phase !== "quiz" || !currentItem) return;
    const problem = normalizeProblem(currentItem.problem);
    if (!problem || problem.choices.length === 0) return;
    if (session.choiceOrders?.[currentItem.id]) return;

    setSession((prev) => prev && ({
      ...prev,
      choiceOrders: {
        ...(prev.choiceOrders ?? {}),
        [currentItem.id]: shuffleArray(problem.choices),
      },
    }));
  }, [currentItem?.id, session?.index, session?.phase, setSession, shuffleArray]);
}

type SessionKeyboardShortcutsOptions = {
  canGoQuizNext: () => boolean;
  currentItem: StudyItem | null;
  goHome: () => void;
  goNextQuizItem: () => void;
  goNextStudyItem: () => void;
  goPrevQuizItem: () => void;
  goPrevStudyItem: () => void;
  isQuizChoiceVisible: () => boolean;
  openQuizChoices: () => boolean;
  selectQuizChoiceByIndex: (choiceIndex: number) => boolean;
  session: SessionView | null;
  sessionItems: StudyItem[];
};

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
}: SessionKeyboardShortcutsOptions) {
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
