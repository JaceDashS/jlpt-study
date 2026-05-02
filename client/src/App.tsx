import { useState } from "react";
import { getTodayString } from "./domain/date.ts";
import { applyQuizResultForDay, applyReviewResultForDay } from "./domain/srs.ts";
import { buildProblemPayload, createProblemDraft, normalizeJsonBlock, normalizeProblem } from "./domain/problem.ts";
import { HomePage } from "./components/HomePage.tsx";
import { SessionPanel } from "./components/SessionPanel.tsx";
import { LayoutWidthControl } from "./components/LayoutWidthControl.tsx";
import { renderKanjiWithReading, renderSentenceWithTarget } from "./domain/renderers.tsx";
import { createDayClipboardActions } from "./domain/dayClipboard.ts";
import { createSessionController } from "./domain/sessionController.ts";
import { createSourcePersistence } from "./domain/sourcePersistence.ts";
import { createProgressActions } from "./domain/progressActions.ts";
import { createAssetBackupActions } from "./domain/assetBackup.ts";
import { type AssetFileMap, type AvailableBook, buildAppState } from "./domain/curriculumFiles.ts";
import { useHomeDashboardData } from "./domain/homeDashboard.ts";
import { createClipboardActions } from "./domain/clipboardActions.ts";
import { createQuizInputActions } from "./domain/sessionInput.ts";
import { useLayoutMaxWidth } from "./domain/layoutPreferences.ts";
import { usePlanRange } from "./domain/planPreferences.ts";
import { createCurriculumActions } from "./domain/curriculumActions.ts";
import { createSessionOpeners } from "./domain/sessionOpeners.ts";
import { useToast } from "./domain/toast.ts";
import { normalizeDayListDrawerWidth, normalizeStudyDrawerWidth } from "./domain/drawerPreferences.ts";
import { useAppBoot } from "./domain/appBoot.ts";
import { useProblemEditorSync, useQuizChoiceOrders, useSessionKeyboardShortcuts } from "./domain/sessionEffects.ts";
import { useSessionSelection } from "./domain/sessionSelectors.ts";
import { useHomeReviewDebugLog, usePersistStudyState, useRefreshCurriculumOnHomeFocus } from "./domain/appLifecycle.ts";
import { updateDailyLearningCount, useLearningPlanSync } from "./domain/learningPlanSync.ts";
import { apiFetch } from "./api.ts";
import {
  getDayMissingDecompositionCount,
  getDisplayDayIndex,
  getDisplayItemId,
  getPathDay,
  isFutureReviewDate,
  isQuizTarget,
  replaceDay,
  shuffleArray,
  normalizeDailyNewLearningCount,
} from "./domain/studyHelpers.ts";
import { cx } from "./styles.ts";

export default function App() {
  const boot = useAppBoot();

  if (boot.status === "loading") {
    return <div className="app-shell">커리큘럼을 불러오는 중...</div>;
  }

  if (boot.status === "error") {
    return <div className="app-shell">커리큘럼을 불러오지 못했습니다. QR을 다시 스캔해 주세요.</div>;
  }

  return (
    <StudyApp
      initialAssetFiles={boot.files}
      initialSelectedBookId={boot.selectedBookId}
      availableBooks={boot.availableBooks}
    />
  );
}

function StudyApp({
  initialAssetFiles,
  initialSelectedBookId,
  availableBooks,
}: {
  initialAssetFiles: AssetFileMap;
  initialSelectedBookId: string;
  availableBooks: AvailableBook[];
}) {
  const [sourceFiles, setSourceFiles] = useState(initialAssetFiles);
  const [selectedBookId, setSelectedBookId] = useState(initialSelectedBookId);
  const [state, setState] = useState(() => buildAppState(initialSelectedBookId, initialAssetFiles));
  const [session, setSession] = useState(null);
  const [problemEditor, setProblemEditor] = useState({
    open: false,
    draft: createProblemDraft(null),
    error: "",
  });
  const { showToast, toast } = useToast();
  const today = getTodayString();
  const [planRange, setPlanRange] = usePlanRange(today);
  const {
    commitLayoutWidthDraft,
    handleLayoutWidthChange,
    handleLayoutWidthMouseDown,
    layoutMaxWidth,
    layoutMaxWidthDraft,
    stopLayoutWidthSpinner,
  } = useLayoutMaxWidth();

  usePersistStudyState({ selectedBookId, state });

  const { goHome, refreshCurriculumFromSource, resetLocalCache, switchBook } = createCurriculumActions({
    apiFetch,
    selectedBookId,
    setSelectedBookId,
    setSession,
    setSourceFiles,
    setState,
    sourceFiles,
    state,
  });

  useRefreshCurriculumOnHomeFocus({ refreshCurriculumFromSource, session });

  const dailyNewLearningCount = normalizeDailyNewLearningCount(state.dailyNewLearningCount);
  useLearningPlanSync({ setState, state, today });
  const {
    allDayRows,
    dateRangeMeta,
    debugLogs,
    homeDueDebug,
    learningPlanRows,
    overallMeta,
    pendingLearningRows,
    reviewDue,
  } = useHomeDashboardData({
    dailyNewLearningCount,
    planRange,
    state,
    today,
  });

  useHomeReviewDebugLog({ reviewDueCount: reviewDue.length, session, stateCurriculum: state.curriculum, today });

  const handleDailyNewLearningCountChange = (event) => {
    updateDailyLearningCount({ event, setState, today });
  };

  const { copyTextViaMiddleware, copyDebugLogs, copyDisplayId } = createClipboardActions({
    apiFetch,
    debugLogs,
    homeDueDebug,
    showToast,
  });

  const { backupAssets, restoreAssets } = createAssetBackupActions({
    apiFetch,
    refreshCurriculumFromSource,
    showToast,
  });

  const { persistSourceField, persistSourceDayField } = createSourcePersistence(apiFetch);

  const { markDayAttemptNow, updateMemo, updateProblem, updateLastResultNow } = createProgressActions({
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
  const {
    copyDayWordsByPath,
    copyDay1Words,
    copyCurrentWord,
    importDayDecompositionFromClipboardByPath,
    importDayDecompositionFromTextByPath,
    importDay1DecompositionFromClipboard,
    importDay1DecompositionFromText,
    resetDayDecompositions,
    resetDayProblems,
  } = createDayClipboardActions({
    session,
    stateCurriculum: state.curriculum,
    currentItem,
    copyTextViaMiddleware,
    showToast,
    setState,
    persistSourceField,
    isQuizTarget,
    getPathDay,
    getDisplayDayIndex,
    normalizeJsonBlock,
    replaceDay,
  });

  const {
    canGoQuizNext,
    goPrevStudyItem,
    goNextStudyItem,
    goPrevQuizItem,
    goNextQuizItem,
    openProblemEditor,
    saveProblemEditor,
  } = createSessionController({
    session,
    sessionItems,
    currentItem,
    problemEditor,
    setProblemEditor,
    setSession,
    setState,
    stateCurriculum: state.curriculum,
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
  });

  const { isQuizChoiceVisible, openQuizChoices, selectQuizChoice, selectQuizChoiceByIndex } = createQuizInputActions({
    currentItem,
    goNextQuizItem,
    normalizeProblem,
    session,
    setSession,
    updateLastResultNow,
  });

  const { openLearningDay, openReviewDay } = createSessionOpeners({
    getPathDay,
    isQuizTarget,
    markDayAttemptNow,
    setSession,
    shuffleArray,
    stateCurriculum: state.curriculum,
  });

  useProblemEditorSync({ currentItem, setProblemEditor });
  useQuizChoiceOrders({ currentItem, session, setSession, shuffleArray });
  useSessionKeyboardShortcuts({
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
  });

  return (
    <main className={cx("layout")} style={{ maxWidth: `${layoutMaxWidth}px` }}>
      {toast && <div className={cx(`toast ${toast.type === "error" ? "error" : "success"}`)}>{toast.message}</div>}

      {!session && (
        <HomePage
          today={today}
          dailyNewLearningCount={dailyNewLearningCount}
          handleDailyNewLearningCountChange={handleDailyNewLearningCountChange}
          resetLocalCache={resetLocalCache}
          debugLogs={debugLogs}
          homeDueDebug={homeDueDebug}
          reviewDue={reviewDue}
          pendingLearningRows={pendingLearningRows}
          learningPlanRows={learningPlanRows}
          openReviewDay={openReviewDay}
          openLearningDay={openLearningDay}
          copyDayWordsByPath={copyDayWordsByPath}
          importDayDecompositionFromClipboardByPath={importDayDecompositionFromClipboardByPath}
          importDayDecompositionFromTextByPath={importDayDecompositionFromTextByPath}
          overallMeta={overallMeta}
          dateRangeMeta={dateRangeMeta}
          planRange={planRange}
          setPlanRange={setPlanRange}
          allDayRows={allDayRows}
          selectedBookId={selectedBookId}
          availableBooks={availableBooks}
          onSwitchBook={switchBook}
          backupAssets={backupAssets}
          restoreAssets={restoreAssets}
          copyDebugLogs={copyDebugLogs}
        />
      )}

      {session && sessionDay && (
        <SessionPanel
          session={session}
          sessionDay={sessionDay}
          currentItem={currentItem}
          sessionItems={sessionItems}
          problemEditor={problemEditor}
          setProblemEditor={setProblemEditor}
          copyCurrentWord={copyCurrentWord}
          copyDay1Words={copyDay1Words}
          importDay1DecompositionFromClipboard={importDay1DecompositionFromClipboard}
          importDay1DecompositionFromText={importDay1DecompositionFromText}
          resetDayDecompositions={resetDayDecompositions}
          resetDayProblems={resetDayProblems}
          markDayAttemptNow={markDayAttemptNow}
          goPrevQuizItem={goPrevQuizItem}
          canGoQuizNext={canGoQuizNext}
          goNextQuizItem={goNextQuizItem}
          selectQuizChoice={selectQuizChoice}
          openProblemEditor={openProblemEditor}
          saveProblemEditor={saveProblemEditor}
          updateMemo={updateMemo}
          getDisplayItemId={getDisplayItemId}
          copyDisplayId={copyDisplayId}
          renderKanjiWithReading={renderKanjiWithReading}
          renderSentenceWithTarget={renderSentenceWithTarget}
          goPrevStudyItem={goPrevStudyItem}
          goNextStudyItem={goNextStudyItem}
          setSession={setSession}
          goHome={goHome}
          studyDrawerWidth={normalizeStudyDrawerWidth(state.studyDrawerWidth)}
          setStudyDrawerWidth={(nextWidth) =>
            setState((prev) => ({
              ...prev,
              studyDrawerWidth: normalizeStudyDrawerWidth(nextWidth),
            }))
          }
          dayListDrawerWidth={normalizeDayListDrawerWidth(state.dayListDrawerWidth)}
          setDayListDrawerWidth={(nextWidth) =>
            setState((prev) => ({
              ...prev,
              dayListDrawerWidth: normalizeDayListDrawerWidth(nextWidth),
            }))
          }
        />
      )}

      <LayoutWidthControl
        commitLayoutWidthDraft={commitLayoutWidthDraft}
        handleLayoutWidthChange={handleLayoutWidthChange}
        handleLayoutWidthMouseDown={handleLayoutWidthMouseDown}
        layoutMaxWidthDraft={layoutMaxWidthDraft}
        stopLayoutWidthSpinner={stopLayoutWidthSpinner}
      />
    </main>
  );
}
