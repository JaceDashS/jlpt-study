import { useEffect, useMemo, useRef, useState } from "react";
import { saveState, clearState } from "./data/storage.ts";
import { getTodayString } from "./domain/date.ts";
import { applyQuizResultForDay, applyReviewResultForDay } from "./domain/srs.ts";
import { buildProblemPayload, createProblemDraft, normalizeJsonBlock, normalizeProblem } from "./domain/problem.ts";
import { HomePage } from "./components/HomePage.tsx";
import { SessionPanel } from "./components/SessionPanel.tsx";
import { renderKanjiWithReading, renderSentenceWithTarget } from "./domain/renderers.tsx";
import { mergeCurriculumFromSource } from "./domain/curriculumSource.ts";
import { createDayClipboardActions } from "./domain/dayClipboard.ts";
import { createSessionController } from "./domain/sessionController.ts";
import { createSourcePersistence } from "./domain/sourcePersistence.ts";
import { createProgressActions } from "./domain/progressActions.ts";
import { createAssetBackupActions } from "./domain/assetBackup.ts";
import {
  type AssetFileMap,
  type AvailableBook,
  buildAppState,
  getDefaultBookId,
  listAvailableBooks,
  loadCurriculumFiles,
} from "./domain/curriculumFiles.ts";
import {
  buildDateRangeMeta,
  buildDebugLogs,
  buildHomeDueDebug,
  buildLearningPlanRows,
  buildOverallMeta,
  buildReviewDue,
} from "./domain/homeDashboard.ts";
import { createClipboardActions } from "./domain/clipboardActions.ts";
import { createQuizInputActions, createSessionKeyboardHandler } from "./domain/sessionInput.ts";
import { apiFetch, apiUrl } from "./api.ts";
import {
  areLearningPathListsEqual,
  buildDailyLearningPlanPaths,
  getDayMissingDecompositionCount,
  getDayPassRatio,
  getDisplayDayIndex,
  getDisplayItemId,
  getPathDay,
  getAllDayPaths,
  isFutureReviewDate,
  isQuizTarget,
  isValidLearningPath,
  replaceDay,
  sanitizeCurriculum,
  shuffleArray,
  normalizeDailyNewLearningCount,
} from "./domain/studyHelpers.ts";
import { cx } from "./styles.ts";

const PLAN_RANGE_STORAGE_KEY = "jlpt-n1-plan-range-v1";
const LAYOUT_MAX_WIDTH_STORAGE_KEY = "jlpt-n1-layout-max-width-v1";
const DEFAULT_STUDY_DRAWER_WIDTH = 520;
const DEFAULT_DAY_LIST_DRAWER_WIDTH = 420;
const DEFAULT_LAYOUT_MAX_WIDTH = 1200;

function normalizeStudyDrawerWidth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_STUDY_DRAWER_WIDTH;
  return Math.max(360, Math.min(980, Math.round(parsed)));
}

function normalizeDayListDrawerWidth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAY_LIST_DRAWER_WIDTH;
  return Math.max(280, Math.min(860, Math.round(parsed)));
}

function normalizeLayoutMaxWidth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LAYOUT_MAX_WIDTH;
  return Math.max(720, Math.min(2400, Math.round(parsed)));
}

const SELECTED_BOOK_STORAGE_KEY = "jlpt-selected-book";
type BootState =
  | { status: "loading"; files: null; availableBooks: AvailableBook[]; selectedBookId: "" }
  | { status: "ready"; files: AssetFileMap; availableBooks: AvailableBook[]; selectedBookId: string }
  | { status: "error"; files: null; availableBooks: AvailableBook[]; selectedBookId: ""; error: unknown };

export default function App() {
  const [boot, setBoot] = useState<BootState>({
    status: "loading",
    files: null,
    availableBooks: [],
    selectedBookId: "",
  });

  useEffect(() => {
    let cancelled = false;
    loadCurriculumFiles()
      .then((files) => {
        if (cancelled) return;
        const availableBooks = listAvailableBooks(files);
        const defaultBookId = getDefaultBookId(availableBooks);
        const savedBookId = localStorage.getItem(SELECTED_BOOK_STORAGE_KEY);
        const selectedBookId = availableBooks.some((book) => book.id === savedBookId) ? savedBookId : defaultBookId;
        if (!selectedBookId) {
          throw new Error("No curriculum books found");
        }
        setBoot({ status: "ready", files, availableBooks, selectedBookId });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to boot app:", error);
        setBoot({ status: "error", files: null, availableBooks: [], selectedBookId: "", error });
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
  const [toast, setToast] = useState(null);
  const [planRange, setPlanRange] = useState(() => {
    const todayValue = getTodayString();
    const defaultRange = {
      start: todayValue,
      end: `${todayValue.slice(0, 4)}-06-01`,
    };

    try {
      const raw = localStorage.getItem(PLAN_RANGE_STORAGE_KEY);
      if (!raw) return defaultRange;
      const parsed = JSON.parse(raw);
      return {
        start: typeof parsed?.start === "string" ? parsed.start : defaultRange.start,
        end: typeof parsed?.end === "string" ? parsed.end : defaultRange.end,
      };
    } catch (error) {
      return defaultRange;
    }
  });
  const [layoutMaxWidth, setLayoutMaxWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_MAX_WIDTH_STORAGE_KEY);
      return normalizeLayoutMaxWidth(raw);
    } catch (error) {
      return DEFAULT_LAYOUT_MAX_WIDTH;
    }
  });
  const [layoutMaxWidthDraft, setLayoutMaxWidthDraft] = useState(String(layoutMaxWidth));
  const layoutWidthSpinnerRef = useRef(false);

  useEffect(() => {
    saveState(state, selectedBookId);
  }, [state, selectedBookId]);

  useEffect(() => {
    localStorage.setItem(PLAN_RANGE_STORAGE_KEY, JSON.stringify(planRange));
  }, [planRange]);

  useEffect(() => {
    localStorage.setItem(LAYOUT_MAX_WIDTH_STORAGE_KEY, String(layoutMaxWidth));
  }, [layoutMaxWidth]);

  useEffect(() => {
    setLayoutMaxWidthDraft(String(layoutMaxWidth));
  }, [layoutMaxWidth]);

  const today = getTodayString();

  const refreshCurriculumFromSource = async () => {
    try {
      const response = await apiFetch(apiUrl("reload-curriculum", { t: Date.now() }), {
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = await response.text();
        console.error("Failed to reload curriculum:", response.status, body);
        return;
      }

      const payload = await response.json();
      if (!payload?.ok || !payload?.files) {
        return;
      }

      setSourceFiles(payload.files);
      setState((prev) => ({
        ...prev,
        curriculum: sanitizeCurriculum(mergeCurriculumFromSource(prev.curriculum, payload.files)),
      }));
    } catch (error) {
      console.error("Failed to reload curriculum:", error);
    }
  };

  const goHome = async () => {
    await refreshCurriculumFromSource();
    setSession(null);
  };

  const resetLocalCache = () => {
    clearState(selectedBookId);
    window.location.reload();
  };

  const switchBook = (newBookId: string) => {
    if (newBookId === selectedBookId) return;
    saveState(state, selectedBookId);
    const newState = buildAppState(newBookId, sourceFiles);
    setState(newState);
    setSelectedBookId(newBookId);
    localStorage.setItem(SELECTED_BOOK_STORAGE_KEY, newBookId);
    setSession(null);
  };

  useEffect(() => {
    if (session) return undefined;
    const onFocus = () => {
      refreshCurriculumFromSource();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [session]);

  const reviewDue = useMemo(() => buildReviewDue(state.curriculum, today), [state.curriculum, today]);

  const homeDueDebug = useMemo(() => buildHomeDueDebug(state.curriculum, today), [state.curriculum, today]);

  useEffect(() => {
    if (session) return;
    console.log("[home] today:", today, "reviewDue:", reviewDue.length);
  }, [session, state.curriculum, today, reviewDue.length]);

  const overallMeta = useMemo(() => buildOverallMeta(state.curriculum, state.totalDay), [state.curriculum, state.totalDay]);

  const dateRangeMeta = useMemo(() => buildDateRangeMeta(planRange, today), [planRange, today]);

  const dailyNewLearningCount = normalizeDailyNewLearningCount(state.dailyNewLearningCount);

  useEffect(() => {
    setState((prev) => {
      const normalizedCount = normalizeDailyNewLearningCount(prev.dailyNewLearningCount);
      const existingPaths = Array.isArray(prev.learningPlan?.paths) ? prev.learningPlan.paths.filter(isValidLearningPath) : [];
      const isTodayPlan = prev.learningPlan?.date === today && normalizeDailyNewLearningCount(prev.learningPlan?.count) === normalizedCount;
      const computedPaths = buildDailyLearningPlanPaths(prev.curriculum, normalizedCount, today);
      const shouldKeepTodayPlan = isTodayPlan && areLearningPathListsEqual(existingPaths, computedPaths);
      const nextPaths = shouldKeepTodayPlan ? existingPaths : computedPaths;

      const nextPlan = {
        date: today,
        count: normalizedCount,
        paths: nextPaths,
      };

      const sameCount = prev.dailyNewLearningCount === normalizedCount;
      const sameDate = prev.learningPlan?.date === nextPlan.date;
      const samePlanCount = normalizeDailyNewLearningCount(prev.learningPlan?.count) === nextPlan.count;
      const samePaths = areLearningPathListsEqual(existingPaths, nextPlan.paths);

      if (sameCount && sameDate && samePlanCount && samePaths) {
        return prev;
      }

      return {
        ...prev,
        dailyNewLearningCount: normalizedCount,
        learningPlan: nextPlan,
      };
    });
  }, [today, state.curriculum, state.dailyNewLearningCount]);

  const learningPlanRows = useMemo(
    () => buildLearningPlanRows(state.curriculum, state.learningPlan, dailyNewLearningCount, today),
    [state.curriculum, state.learningPlan, dailyNewLearningCount, today],
  );

  const pendingLearningRows = useMemo(
    () => learningPlanRows.filter((row) => row.stageCompleteDate !== today),
    [learningPlanRows, today],
  );
  const debugLogs = useMemo(
    () =>
      buildDebugLogs({
        curriculum: state.curriculum,
        learningPlan: state.learningPlan,
        today,
        dailyNewLearningCount,
        learningPlanRows,
        pendingLearningRows,
        reviewDueCount: reviewDue.length,
      }),
    [dailyNewLearningCount, learningPlanRows, pendingLearningRows, reviewDue.length, state.curriculum, state.learningPlan, today],
  );

  const handleDailyNewLearningCountChange = (event) => {
    const nextCount = normalizeDailyNewLearningCount(event.target.value);
    setState((prev) => ({
      ...prev,
      dailyNewLearningCount: nextCount,
      learningPlan: {
        date: today,
        count: nextCount,
        paths: buildDailyLearningPlanPaths(prev.curriculum, nextCount, today),
      },
    }));
  };

  const openLearningDay = (path) => {
    const day = getPathDay(state.curriculum, path);
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

  const showToast = (message, type = "success") => {
    const next = {
      message: String(message ?? ""),
      type,
      token: `${Date.now()}-${Math.random()}`,
    };
    setToast(next);
    window.setTimeout(() => {
      setToast((prev) => (prev?.token === next.token ? null : prev));
    }, 2000);
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

  const sessionDay = session
    ? getPathDay(state.curriculum, {
        unitId: session.unitId,
        dayId: session.dayId,
      })
    : null;

  const sessionItems = useMemo(() => {
    if (!sessionDay || !session) return [];

    const targetItems = sessionDay.items.filter(isQuizTarget);
    const itemIds = Array.isArray(session.itemIds) ? session.itemIds : [];

    if (itemIds.length === 0) {
      return targetItems;
    }

    const byId = new Map(targetItems.map((item) => [item.id, item]));
    return itemIds.map((id) => byId.get(id)).filter(Boolean);
  }, [sessionDay, session]);

  const currentItem = session && sessionItems.length > 0 ? sessionItems[session.index] : null;
  const currentSessionDayIndex = sessionDay ? getDisplayDayIndex(sessionDay, 1) : 1;

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
    finalizeQuiz,
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
  }, [currentItem?.id]);

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
  }, [session?.phase, session?.index, currentItem?.id]);

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

  const allDayRows = useMemo(() => {
    return getAllDayPaths(state.curriculum).map((path) => {
      const day = getPathDay(state.curriculum, path);
      return {
        path,
        dayTitle: path.dayTitle,
        passRatio: day ? getDayPassRatio(day) : 0,
        failCount: day ? day.items.filter((item) => isQuizTarget(item) && item.lastResult === "FAIL").length : 0,
      };
    });
  }, [state.curriculum]);

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
          currentSessionDayIndex={currentSessionDayIndex}
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
          finalizeQuiz={finalizeQuiz}
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

      <section className={cx("layout-width-control")}>
        <label className={cx("layout-width-label")} htmlFor="layout-max-width-input">
          최대 폭
        </label>
        <input
          id="layout-max-width-input"
          className={cx("layout-width-input")}
          type="number"
          min={720}
          max={2400}
          step={10}
          value={layoutMaxWidthDraft}
          onChange={(event) => {
            const nextDraft = event.target.value;
            setLayoutMaxWidthDraft(nextDraft);
            if (!layoutWidthSpinnerRef.current) return;
            setLayoutMaxWidth(normalizeLayoutMaxWidth(nextDraft));
          }}
          onMouseDown={(event) => {
            const input = event.currentTarget;
            const rect = input.getBoundingClientRect();
            // number input spinner area is usually on the right edge.
            layoutWidthSpinnerRef.current = rect.right - event.clientX <= 20;
          }}
          onMouseUp={() => {
            layoutWidthSpinnerRef.current = false;
          }}
          onBlur={() => {
            layoutWidthSpinnerRef.current = false;
            const nextWidth = normalizeLayoutMaxWidth(layoutMaxWidthDraft);
            setLayoutMaxWidth(nextWidth);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const nextWidth = normalizeLayoutMaxWidth(layoutMaxWidthDraft);
            setLayoutMaxWidth(nextWidth);
            event.currentTarget.blur();
          }}
        />
      </section>

    </main>
  );
}























