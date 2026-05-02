import type React from "react";
import { apiFetch } from "../api.ts";
import { applyQuizResultForDay, applyReviewResultForDay } from "./srs.ts";
import { buildProblemPayload, createProblemDraft, normalizeJsonBlock, normalizeProblem } from "./problem.ts";
import { renderKanjiWithReading, renderSentenceWithTarget } from "./renderers.tsx";
import { createDayClipboardActions } from "./dayClipboard.ts";
import { createSessionController } from "./sessionController.ts";
import { createSourcePersistence } from "./sourcePersistence.ts";
import { createProgressActions } from "./progressActions.ts";
import { createAssetBackupActions } from "./assetBackup.ts";
import { createClipboardActions, type HomeDueDebugRow } from "./clipboardActions.ts";
import { createQuizInputActions } from "./sessionInput.ts";
import { createCurriculumActions } from "./curriculumActions.ts";
import { createGitActions } from "./gitActions.ts";
import { createSessionOpeners } from "./sessionOpeners.ts";
import { useProblemEditorSync, useQuizChoiceOrders, useSessionKeyboardShortcuts } from "./sessionEffects.ts";
import { useSessionSelection } from "./sessionSelectors.ts";
import { useRefreshCurriculumOnHomeFocus } from "./appLifecycle.ts";
import {
  getDisplayDayIndex,
  getDisplayItemId,
  isQuizTarget,
  replaceDay,
  shuffleArray,
} from "./studyHelpers.ts";
import { getPathDay } from "./learningPath.ts";
import type { AssetFileMap } from "./curriculumFiles.ts";
import type { ProblemEditorState } from "../components/session/sessionViewTypes.ts";
import type { SessionView, SetSession, SetStudyState, StudyState } from "./studyTypes.ts";

type UseStudyAppControllersOptions = {
  debugLogs: string[];
  homeDueDebug: HomeDueDebugRow[];
  problemEditor: ProblemEditorState;
  selectedBookId: string;
  session: SessionView | null;
  setProblemEditor: React.Dispatch<React.SetStateAction<ProblemEditorState>>;
  setSelectedBookId: (bookId: string) => void;
  setSession: SetSession;
  setSourceFiles: (files: AssetFileMap) => void;
  setState: SetStudyState;
  showToast: (message: string, type?: "success" | "error") => void;
  sourceFiles: AssetFileMap;
  state: StudyState;
  today: string;
};

export function useStudyAppControllers({
  debugLogs,
  homeDueDebug,
  problemEditor,
  selectedBookId,
  session,
  setProblemEditor,
  setSelectedBookId,
  setSession,
  setSourceFiles,
  setState,
  showToast,
  sourceFiles,
  state,
  today,
}: UseStudyAppControllersOptions) {
  const curriculumActions = createCurriculumActions({
    apiFetch,
    selectedBookId,
    setSelectedBookId,
    setSession,
    setSourceFiles,
    setState,
    sourceFiles,
    state,
  });

  useRefreshCurriculumOnHomeFocus({
    refreshCurriculumFromSource: curriculumActions.refreshCurriculumFromSource,
    session,
  });

  const clipboardActions = createClipboardActions({
    apiFetch,
    debugLogs,
    homeDueDebug,
    showToast,
  });

  const assetBackupActions = createAssetBackupActions({
    apiFetch,
    refreshCurriculumFromSource: curriculumActions.refreshCurriculumFromSource,
    showToast,
  });

  const gitActions = createGitActions({
    apiFetch,
    showToast,
  });

  const { persistSourceField, persistSourceDayField } = createSourcePersistence(apiFetch);

  const progressActions = createProgressActions({
    session,
    stateCurriculum: state.curriculum,
    today,
    setState,
    getPathDay,
    replaceDay,
    persistSourceField,
    persistSourceDayField,
  });

  const { currentItem, sessionDay, sessionItems } = useSessionSelection({
    getPathDay,
    isQuizTarget,
    session,
    stateCurriculum: state.curriculum,
  });

  const dayClipboardActions = createDayClipboardActions({
    session,
    stateCurriculum: state.curriculum,
    currentItem,
    copyTextViaMiddleware: clipboardActions.copyTextViaMiddleware,
    showToast,
    setState,
    persistSourceField,
    isQuizTarget,
    getPathDay,
    getDisplayDayIndex,
    normalizeJsonBlock,
    replaceDay,
  });

  const sessionController = createSessionController({
    session,
    sessionItems,
    currentItem,
    problemEditor,
    setProblemEditor,
    setSession,
    setState,
    stateCurriculum: state.curriculum,
    today,
    markDayAttemptNow: progressActions.markDayAttemptNow,
    normalizeProblem,
    createProblemDraft,
    buildProblemPayload,
    updateProblem: progressActions.updateProblem,
    getPathDay,
    replaceDay,
    applyReviewResultForDay,
    applyQuizResultForDay,
    persistSourceField,
    persistSourceDayField,
    goHome: curriculumActions.goHome,
  });

  const quizInputActions = createQuizInputActions({
    currentItem,
    goNextQuizItem: sessionController.goNextQuizItem,
    normalizeProblem,
    session,
    setSession,
    updateLastResultNow: progressActions.updateLastResultNow,
  });

  const sessionOpeners = createSessionOpeners({
    getPathDay,
    isQuizTarget,
    markDayAttemptNow: progressActions.markDayAttemptNow,
    setSession,
    shuffleArray,
    stateCurriculum: state.curriculum,
  });

  useProblemEditorSync({ currentItem, setProblemEditor });
  useQuizChoiceOrders({ currentItem, session, setSession, shuffleArray });
  useSessionKeyboardShortcuts({
    canGoQuizNext: sessionController.canGoQuizNext,
    currentItem,
    goHome: curriculumActions.goHome,
    goNextQuizItem: sessionController.goNextQuizItem,
    goNextStudyItem: sessionController.goNextStudyItem,
    goPrevQuizItem: sessionController.goPrevQuizItem,
    goPrevStudyItem: sessionController.goPrevStudyItem,
    isQuizChoiceVisible: quizInputActions.isQuizChoiceVisible,
    openQuizChoices: quizInputActions.openQuizChoices,
    selectQuizChoiceByIndex: quizInputActions.selectQuizChoiceByIndex,
    session,
    sessionItems,
  });

  return {
    ...assetBackupActions,
    ...clipboardActions,
    ...curriculumActions,
    ...dayClipboardActions,
    ...gitActions,
    ...progressActions,
    ...quizInputActions,
    ...sessionController,
    ...sessionOpeners,
    currentItem,
    getDisplayItemId,
    renderKanjiWithReading,
    renderSentenceWithTarget,
    sessionDay,
    sessionItems,
  };
}
