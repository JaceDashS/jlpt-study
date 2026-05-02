import { useState } from "react";
import { getTodayString } from "./domain/date.ts";
import { createProblemDraft } from "./domain/problem.ts";
import { HomePage } from "./components/HomePage.tsx";
import { SessionPanel } from "./components/SessionPanel.tsx";
import { LayoutWidthControl } from "./components/LayoutWidthControl.tsx";
import { type AssetFileMap, type AvailableBook, buildAppState } from "./domain/curriculumFiles.ts";
import { useHomeDashboardData } from "./domain/homeDashboard.ts";
import { useLayoutMaxWidth } from "./domain/layoutPreferences.ts";
import { usePlanRange } from "./domain/planPreferences.ts";
import { useToast } from "./domain/toast.ts";
import { normalizeDayListDrawerWidth, normalizeStudyDrawerWidth } from "./domain/drawerPreferences.ts";
import { useAppBoot } from "./domain/appBoot.ts";
import { useHomeReviewDebugLog, usePersistStudyState } from "./domain/appLifecycle.ts";
import { updateDailyLearningCount, useLearningPlanSync } from "./domain/learningPlanSync.ts";
import {
  normalizeDailyNewLearningCount,
} from "./domain/studyHelpers.ts";
import { useStudyAppControllers } from "./domain/useStudyAppControllers.ts";
import type { SessionView, StudyState } from "./domain/studyTypes.ts";
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
  const [state, setState] = useState<StudyState>(() => buildAppState(initialSelectedBookId, initialAssetFiles));
  const [session, setSession] = useState<SessionView | null>(null);
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

  const {
    backupAssets,
    canGoQuizNext,
    commitStudyChanges,
    copyDebugLogs,
    copyDayWordsByPath,
    copyDay1Words,
    copyCurrentWord,
    copyDisplayId,
    currentItem,
    getDisplayItemId,
    goHome,
    goNextQuizItem,
    goNextStudyItem,
    goPrevQuizItem,
    goPrevStudyItem,
    importDayDecompositionFromClipboardByPath,
    importDayDecompositionFromTextByPath,
    importDay1DecompositionFromClipboard,
    importDay1DecompositionFromText,
    markDayAttemptNow,
    openLearningDay,
    openProblemEditor,
    openReviewDay,
    renderKanjiWithReading,
    renderSentenceWithTarget,
    resetDayDecompositions,
    resetDayProblems,
    resetLocalCache,
    restoreAssets,
    saveProblemEditor,
    selectQuizChoice,
    sessionDay,
    sessionItems,
    switchBook,
    updateMemo,
  } = useStudyAppControllers({
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
  });

  return (
    <main className={cx("layout")} style={{ maxWidth: `${layoutMaxWidth}px` }}>
      {toast && <div className={cx(`toast ${toast.type === "error" ? "error" : "success"}`)}>{toast.message}</div>}

      {!session && (
        <HomePage
          today={today}
          assetActions={{ backupAssets, commitStudyChanges, resetLocalCache, restoreAssets }}
          bookSelection={{ availableBooks, onSwitchBook: switchBook, selectedBookId }}
          dashboard={{
            allDayRows,
            dateRangeMeta,
            debugLogs,
            homeDueDebug,
            learningPlanRows,
            overallMeta,
            pendingLearningRows,
            reviewDue,
          }}
          planControls={{
            dailyNewLearningCount,
            handleDailyNewLearningCountChange,
            planRange,
            setPlanRange,
          }}
          studyActions={{
            copyDayWordsByPath,
            copyDebugLogs,
            importDayDecompositionFromClipboardByPath,
            importDayDecompositionFromTextByPath,
            openLearningDay,
            openReviewDay,
          }}
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
          actions={{
            canGoQuizNext,
            copyCurrentWord,
            copyDay1Words,
            copyDisplayId,
            goHome,
            goNextQuizItem,
            goNextStudyItem,
            goPrevQuizItem,
            goPrevStudyItem,
            importDay1DecompositionFromClipboard,
            importDay1DecompositionFromText,
            markDayAttemptNow,
            openProblemEditor,
            resetDayDecompositions,
            resetDayProblems,
            saveProblemEditor,
            selectQuizChoice,
            updateMemo,
          }}
          renderers={{
            getDisplayItemId,
            renderKanjiWithReading,
            renderSentenceWithTarget,
          }}
          setSession={setSession}
          layout={{
            dayListDrawerWidth: normalizeDayListDrawerWidth(state.dayListDrawerWidth),
            setDayListDrawerWidth: (nextWidth) =>
              setState((prev) => ({
                ...prev,
                dayListDrawerWidth: normalizeDayListDrawerWidth(nextWidth),
              })),
            setStudyDrawerWidth: (nextWidth) =>
              setState((prev) => ({
                ...prev,
                studyDrawerWidth: normalizeStudyDrawerWidth(nextWidth),
              })),
            studyDrawerWidth: normalizeStudyDrawerWidth(state.studyDrawerWidth),
          }}
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
