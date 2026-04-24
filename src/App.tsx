import { useEffect, useMemo, useRef, useState } from "react";
import { createInitialState, getAvailableBooks } from "./data/initialState.ts";
import { loadState, saveState, clearState } from "./data/storage.ts";
import { getTodayString, isDueOnOrBefore } from "./domain/date.ts";
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
import {
  areLearningPathListsEqual,
  buildDailyLearningPlanPaths,
  diffDays,
  getContinueLearningPath,
  getDayLastAttemptDate,
  getDayLastCompletedDate,
  getDayMissingDecompositionCount,
  getDayNextReviewDate,
  getDayPassRatio,
  getDayProgress,
  getDayStageCompleteDate,
  getDaySequenceIndex,
  getDayStage,
  getDisplayDayIndex,
  getDisplayItemId,
  getPathDay,
  getTodayStartedLearningPath,
  getAllDayPaths,
  isFutureReviewDate,
  isQuizTarget,
  isStateCompatible,
  isValidLearningPath,
  parseYmd,
  replaceDay,
  sanitizeCurriculum,
  shuffleArray,
  toLearningPathKey,
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
const availableBooks = getAvailableBooks();
const defaultBookId = availableBooks.find((b) => b.id === "jlpt-one-book-n1")?.id ?? availableBooks[0]?.id ?? "";

function buildAppState(bookId: string) {
  const initial = createInitialState(bookId);
  const sanitizedInitial = {
    ...initial,
    curriculum: sanitizeCurriculum(initial.curriculum),
    dailyNewLearningCount: 1,
    learningPlan: { date: "", count: 1, paths: [] },
    studyDrawerWidth: DEFAULT_STUDY_DRAWER_WIDTH,
    dayListDrawerWidth: DEFAULT_DAY_LIST_DRAWER_WIDTH,
  };
  const saved = loadState(bookId);
  if (!saved) return sanitizedInitial;
  if (isStateCompatible(saved, initial)) {
    const merged = {
      ...sanitizedInitial,
      ...saved,
      curriculum: sanitizeCurriculum(saved.curriculum),
    };
    const normalizedCount = normalizeDailyNewLearningCount(merged.dailyNewLearningCount);
    const savedPaths = Array.isArray(merged.learningPlan?.paths)
      ? merged.learningPlan.paths.filter(isValidLearningPath)
      : [];
    return {
      ...merged,
      dailyNewLearningCount: normalizedCount,
      studyDrawerWidth: normalizeStudyDrawerWidth(merged.studyDrawerWidth),
      dayListDrawerWidth: normalizeDayListDrawerWidth(merged.dayListDrawerWidth),
      learningPlan: {
        date: typeof merged.learningPlan?.date === "string" ? merged.learningPlan.date : "",
        count: normalizeDailyNewLearningCount(merged.learningPlan?.count ?? normalizedCount),
        paths: savedPaths,
      },
    };
  }
  return sanitizedInitial;
}

export default function App() {
  const [selectedBookId, setSelectedBookId] = useState(
    () => localStorage.getItem(SELECTED_BOOK_STORAGE_KEY) ?? defaultBookId,
  );
  const [state, setState] = useState(() => buildAppState(selectedBookId));
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
      const response = await fetch(`/__api/reload-curriculum?t=${Date.now()}`);
      if (!response.ok) {
        const body = await response.text();
        console.error("Failed to reload curriculum:", response.status, body);
        return;
      }

      const payload = await response.json();
      if (!payload?.ok || !payload?.files) {
        return;
      }

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
    const newState = buildAppState(newBookId);
    setState(newState);
    setSelectedBookId(newBookId);
    localStorage.setItem(SELECTED_BOOK_STORAGE_KEY, newBookId);
    setSession(null);
  };

  const backupAssets = async () => {
    const ok = window.confirm("asset 전체를 단일 백업 파일로 저장할까요?");
    if (!ok) return;
    try {
      const runBackup = (force = false) =>
        fetch("/__api/asset-backup/export", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ force }),
        });

      let response = await runBackup(false);
      if (response.status === 409) {
        const warningPayload = await response.json().catch(() => ({}));
        const findings = Array.isArray(warningPayload?.findings) ? warningPayload.findings : [];
        const warningCount = Number(warningPayload?.findingCount ?? findings.length);
        const warningPreview = findings.slice(0, 5).join("\n");
        const proceed = window.confirm(
          [
            `모지바케 ${warningCount}건이 감지되었습니다.`,
            "계속하면 모지바케를 포함한 상태로 백업이 진행됩니다.",
            warningPreview ? "" : undefined,
            warningPreview || undefined,
            "",
            "계속 진행할까요?",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        if (!proceed) return;
        response = await runBackup(true);
      }

      if (!response.ok) {
        const body = await response.text();
        console.error("Failed to backup assets:", response.status, body);
        showToast("에셋 백업 실패", "error");
        return;
      }
      const payload = await response.json();
      const warningSuffix = payload?.mojibakeIncluded ? ` (모지바케 ${payload?.mojibakeCount ?? 0}건 포함)` : "";
      showToast(`에셋 백업 완료: ${payload?.backupFile ?? "backup/asset-full-backup.json"}${warningSuffix}`);
    } catch (error) {
      console.error("Failed to backup assets:", error);
      showToast("에셋 백업 실패", "error");
    }
  };

  const restoreAssets = async () => {
    const ok = window.confirm("백업 파일로 asset 전체를 복구할까요? 현재 파일이 덮어써질 수 있습니다.");
    if (!ok) return;
    try {
      const response = await fetch("/__api/asset-backup/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error("Failed to restore assets:", response.status, body);
        showToast("에셋 복구 실패", "error");
        return;
      }
      await refreshCurriculumFromSource();
      showToast("에셋 복구 완료");
    } catch (error) {
      console.error("Failed to restore assets:", error);
      showToast("에셋 복구 실패", "error");
    }
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

  const reviewDue = useMemo(() => {
    const list = [];

    state.curriculum.forEach((unit) => {
      unit.days.forEach((day) => {
        const allDayQuizItems = day.items.filter(isQuizTarget);
        const allDayItemIds = allDayQuizItems.map((item) => item.id);
        const dayLevelDue =
          allDayItemIds.length > 0 &&
          getDayStage(day) < 5 &&
          isDueOnOrBefore(getDayNextReviewDate(day), today);

        if (!dayLevelDue) return;

        list.push({
          path: { unitId: unit.id, dayId: day.id },
          unitId: unit.id,
          dayId: day.id,
          unitTitle: unit.title,
          dayTitle: day.title,
          dueCount: allDayItemIds.length,
          dueItemIds: allDayItemIds,
          progress: getDayProgress(day),
          missingDecompositionCount: getDayMissingDecompositionCount(day),
        });
      });
    });

    return list;
  }, [state.curriculum, today]);

  const homeDueDebug = useMemo(() => {
    const rows = [];
    state.curriculum.forEach((unit) => {
      unit.days.forEach((day) => {
        const allDayItems = day.items.filter(isQuizTarget);
        const dayLevelDue =
          allDayItems.length > 0 &&
          getDayStage(day) < 5 &&
          isDueOnOrBefore(getDayNextReviewDate(day), today);

        rows.push({
          unitTitle: unit.title,
          dayTitle: day.title,
          stage: getDayStage(day),
          nextReviewDate: getDayNextReviewDate(day),
          itemDueCount: dayLevelDue ? allDayItems.length : 0,
          dayLevelDue,
          totalItems: allDayItems.length,
        });
      });
    });
    return rows;
  }, [state.curriculum, today]);

  useEffect(() => {
    if (session) return;
    console.log("[home] today:", today, "reviewDue:", reviewDue.length);
  }, [session, state.curriculum, today, reviewDue.length]);

  const overallMeta = useMemo(() => {
    let totalDays = 0;
    const stageRatios = [];
    let maxDayIndex = 0;
    const stageByDayIndex = new Map();

    state.curriculum.forEach((unit) => {
      unit.days.forEach((day) => {
        totalDays += 1;
        const stage = getDayStage(day);
        const dayIndexValue = Number(day?.dayIndex);
        if (Number.isFinite(dayIndexValue) && dayIndexValue > maxDayIndex) {
          maxDayIndex = dayIndexValue;
        }
        if (Number.isFinite(dayIndexValue)) {
          const prevStage = stageByDayIndex.get(dayIndexValue) ?? 1;
          if (stage > prevStage) {
            stageByDayIndex.set(dayIndexValue, stage);
          } else if (!stageByDayIndex.has(dayIndexValue)) {
            stageByDayIndex.set(dayIndexValue, prevStage);
          }
        }
        stageRatios.push(getDayProgress(day));
      });
    });

    const completedUniqueDays = [...stageByDayIndex.values()].filter((stage) => stage >= 2).length;
    const configuredTotalDay = Number(state.totalDay);
    const uniqueDayTotal =
      Number.isInteger(configuredTotalDay) && configuredTotalDay > 0
        ? configuredTotalDay
        : maxDayIndex > 0
          ? maxDayIndex
          : stageByDayIndex.size;
    const completedRatio = uniqueDayTotal > 0 ? completedUniqueDays / uniqueDayTotal : 0;
    const avgStageRatio = stageRatios.length > 0 ? stageRatios.reduce((sum, value) => sum + value, 0) / stageRatios.length : 0;
    const uniqueDayCompletedRatio = uniqueDayTotal > 0 ? completedUniqueDays / uniqueDayTotal : 0;

    return {
      totalDays,
      completedDays: completedUniqueDays,
      completedRatio,
      avgStageRatio,
      maxDayIndex,
      uniqueDayTotal,
      uniqueDayCompletedRatio,
    };
  }, [state.curriculum]);

  const dateRangeMeta = useMemo(() => {
    const startDate = parseYmd(planRange.start);
    const endDate = parseYmd(planRange.end);
    const todayDate = parseYmd(today);

    if (!startDate || !endDate || !todayDate || endDate < startDate) {
      return {
        valid: false,
        ratio: 0,
        elapsedDays: 0,
        totalDays: 0,
        remainingDays: 0,
      };
    }

    const totalDays = diffDays(startDate, endDate) + 1;
    const elapsedRaw = diffDays(startDate, todayDate) + 1;
    const elapsedDays = Math.max(0, Math.min(totalDays, elapsedRaw));
    const remainingDays = Math.max(0, totalDays - elapsedDays);
    const ratio = totalDays > 0 ? elapsedDays / totalDays : 0;

    return {
      valid: true,
      ratio,
      elapsedDays,
      totalDays,
      remainingDays,
    };
  }, [planRange.end, planRange.start, today]);

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

  const learningPlanRows = useMemo(() => {
    const planPaths = state.learningPlan?.date === today
      ? Array.isArray(state.learningPlan?.paths)
        ? state.learningPlan.paths
        : []
      : buildDailyLearningPlanPaths(state.curriculum, dailyNewLearningCount, today);

    return planPaths
      .filter(isValidLearningPath)
      .map((path) => {
        const unit = state.curriculum.find((item) => item.id === path.unitId);
        const day = unit?.days.find((item) => item.id === path.dayId);
        if (!unit || !day) return null;

        const daySeq = getDaySequenceIndex(state.curriculum, path);
        return {
          path,
          unitTitle: unit.title,
          dayTitle: day.title,
          dayIndex: getDisplayDayIndex(day, daySeq.index),
          sequenceIndex: daySeq.index,
          totalDayCount: daySeq.total,
          itemCount: day.items.filter(isQuizTarget).length,
          missingDecompositionCount: getDayMissingDecompositionCount(day),
          stageCompleteDate: getDayStageCompleteDate(day),
          nextReviewDate: getDayNextReviewDate(day),
          lastAttemptDate: getDayLastAttemptDate(day),
          lastCompletedDate: getDayLastCompletedDate(day),
        };
      })
      .filter(Boolean);
  }, [state.learningPlan, state.curriculum, today, dailyNewLearningCount]);

  const pendingLearningRows = useMemo(
    () => learningPlanRows.filter((row) => row.stageCompleteDate !== today),
    [learningPlanRows, today],
  );
  const debugLogs = useMemo(() => {
    const lines = [];
    const continuePath = getContinueLearningPath(state.curriculum, today);
    const todayStartedPath = getTodayStartedLearningPath(state.curriculum, today);
    const rawPlanPaths = state.learningPlan?.date === today && Array.isArray(state.learningPlan?.paths)
      ? state.learningPlan.paths.filter(isValidLearningPath)
      : [];

    lines.push(`today=${today}`);
    lines.push(`dailyNewLearningCount=${dailyNewLearningCount}`);
    lines.push(`learningPlan.date=${String(state.learningPlan?.date ?? "")}`);
    lines.push(`learningPlan.count=${String(state.learningPlan?.count ?? "")}`);
    lines.push(`todayStartedPath=${todayStartedPath ? toLearningPathKey(todayStartedPath) : "-"}`);
    lines.push(`continuePath=${continuePath ? toLearningPathKey(continuePath) : "-"}`);
    lines.push(`savedPlanPaths=${rawPlanPaths.length > 0 ? rawPlanPaths.map(toLearningPathKey).join(", ") : "-"}`);
    lines.push(`renderedPlanRows=${learningPlanRows.map((row) => toLearningPathKey(row.path)).join(", ") || "-"}`);
    lines.push(`pendingRows=${pendingLearningRows.map((row) => toLearningPathKey(row.path)).join(", ") || "-"}`);
    lines.push(`reviewDueCount=${reviewDue.length}`);

    learningPlanRows.forEach((row) => {
      lines.push(
        `[row] ${toLearningPathKey(row.path)} day=${row.dayTitle} next=${String(row.nextReviewDate)} lastAttempt=${String(row.lastAttemptDate)}`,
      );
    });

    return lines;
  }, [dailyNewLearningCount, learningPlanRows, pendingLearningRows, reviewDue.length, state.curriculum, state.learningPlan, today]);

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

  const copyTextViaMiddleware = async (text) => {
    const normalized = String(text ?? "");
    const copyWithNavigator = async () => {
      try {
        if (!navigator?.clipboard?.writeText) return false;
        await navigator.clipboard.writeText(normalized);
        return true;
      } catch (error) {
        console.error("Failed to copy text with navigator.clipboard:", error);
        return false;
      }
    };

    try {
      const response = await fetch("/__api/clipboard-write", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: normalized }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("Failed to copy text:", response.status, body);
        return copyWithNavigator();
      }
      return true;
    } catch (error) {
      console.error("Failed to copy text:", error);
      return copyWithNavigator();
    }
  };

  const copyDebugLogs = async () => {
    const reviewRows = homeDueDebug
      .filter((row) => row.itemDueCount > 0 || row.dayLevelDue)
      .slice(0, 20)
      .map(
        (row) =>
          `[review] ${row.unitTitle} / ${row.dayTitle} | stage ${row.stage} | next ${String(row.nextReviewDate)} | itemDue ${row.itemDueCount} | dayLevelDue ${String(row.dayLevelDue)} | total ${row.totalItems}`,
      );
    const text = [...debugLogs, ...reviewRows].join("\n");
    const ok = await copyTextViaMiddleware(text);
    showToast(ok ? "디버깅 로그 복사 완료" : "디버깅 로그 복사 실패", ok ? "success" : "error");
  };

  const copyDisplayId = async (displayId: string) => {
    const text = String(displayId ?? "").trim();
    if (!text) return;
    const ok = await copyTextViaMiddleware(text);
    showToast(ok ? `${text} 복사` : "ID 복사 실패", ok ? "success" : "error");
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

  const { persistSourceField, persistSourceDayField } = createSourcePersistence(fetch);

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

    const isTextInputTarget = (target) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return target.isContentEditable;
    };

    const onKeyDown = (event) => {
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























