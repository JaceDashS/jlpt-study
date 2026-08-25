import { useEffect, useState } from "react";
import { getTodayString } from "./domain/date.ts";
import { toLearningPathKey } from "./domain/learningPath.ts";
import { createProblemDraft } from "./domain/problem.ts";
import { type AssetFileMap, type AvailableBook, buildAppState } from "./domain/curriculumFiles.ts";
import { useHomeDashboardData } from "./domain/homeDashboard.ts";
import { usePlanRange } from "./domain/planPreferences.ts";
import { useToast } from "./domain/toast.ts";
import { normalizeStudyDrawerWidth } from "./domain/drawerPreferences.ts";
import { useAppBoot } from "./domain/appBoot.ts";
import { writeAppPreferences } from "./domain/appPreferences.ts";
import { useHomeReviewDebugLog, usePersistStudyState } from "./domain/appLifecycle.ts";
import { updateDailyLearningCount, useLearningPlanSync } from "./domain/learningPlanSync.ts";
import { normalizeDailyNewLearningCount } from "./domain/studyHelpers.ts";
import { normalizeSrsSettings, type SrsSettings } from "./domain/srsPreferences.ts";
import { useStudyAppControllers } from "./domain/useStudyAppControllers.ts";
import type { SessionView as SessionViewState, StudyState } from "./domain/studyTypes.ts";
import { PhoneHeader, TabBar, TopBar, type NavKey } from "./components/AppChrome.tsx";
import { HomeView } from "./components/home/HomeView.tsx";
import { SessionView } from "./components/session/SessionView.tsx";
import { SettingsView, type ThemeName } from "./components/SettingsView.tsx";
import { useDeviceMode } from "./ui/deviceMode.ts";
import { useTheme } from "./ui/useTheme.ts";

export default function App() {
  const boot = useAppBoot();

  if (boot.status === "loading") {
    return <div className="jc-boot">커리큘럼을 불러오는 중...</div>;
  }

  if (boot.status === "error") {
    return (
      <div className="jc-boot">
        <div>커리큘럼을 불러오지 못했습니다.</div>
        <div className="jc-dim">QR을 다시 스캔하거나 서버 상태를 확인해 주세요.</div>
      </div>
    );
  }

  return (
    <StudyApp
      initialAssetFiles={boot.files}
      initialDailyNewLearningCount={boot.dailyNewLearningCount}
      initialSrsSettings={boot.srsSettings}
      initialPlanRange={boot.planRange}
      initialSelectedBookId={boot.selectedBookId}
      availableBooks={boot.availableBooks}
    />
  );
}

function StudyApp({
  availableBooks,
  initialAssetFiles,
  initialDailyNewLearningCount,
  initialSrsSettings,
  initialPlanRange,
  initialSelectedBookId,
}: {
  availableBooks: AvailableBook[];
  initialAssetFiles: AssetFileMap;
  initialDailyNewLearningCount?: number;
  initialSrsSettings?: Partial<SrsSettings>;
  initialPlanRange?: { end?: string; start?: string };
  initialSelectedBookId: string;
}) {
  const [sourceFiles, setSourceFiles] = useState(initialAssetFiles);
  const [selectedBookId, setSelectedBookId] = useState(initialSelectedBookId);
  const [state, setState] = useState<StudyState>(() =>
    buildAppState(initialSelectedBookId, initialAssetFiles, { dailyNewLearningCount: initialDailyNewLearningCount }),
  );
  const [session, setSession] = useState<SessionViewState | null>(null);
  const [problemEditor, setProblemEditor] = useState({
    open: false,
    draft: createProblemDraft(null),
    error: "",
  });
  const [nav, setNav] = useState<NavKey>("today");

  const { showToast, toast } = useToast();
  const today = getTodayString();
  const [planRange, setPlanRange] = usePlanRange(today, initialPlanRange);
  const device = useDeviceMode();
  const [theme, setTheme] = useTheme();
  const [srsSettings, setSrsSettings] = useState<SrsSettings>(() => normalizeSrsSettings(initialSrsSettings));

  const updateSrsSettings = (patch: Partial<SrsSettings>) => {
    const next = normalizeSrsSettings({ ...srsSettings, ...patch });
    setSrsSettings(next);
    void writeAppPreferences({ srs: next });
  };

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
  } = useHomeDashboardData({ dailyNewLearningCount, planRange, srsSettings, state, today });

  useHomeReviewDebugLog({ reviewDueCount: reviewDue.length, session, stateCurriculum: state.curriculum, today });

  const controllers = useStudyAppControllers({
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
    srsSettings,
    state,
    today,
  });

  // 세션을 열면 홈 탭 위치는 그대로 두고, 세션이 끝나면 오늘 화면으로 돌아온다.
  useEffect(() => {
    if (session) return;
    setProblemEditor((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, [session]);

  const sideWidth = normalizeStudyDrawerWidth(state.studyDrawerWidth);
  const setSideWidth = (nextWidth: number) =>
    setState((prev) => ({ ...prev, studyDrawerWidth: normalizeStudyDrawerWidth(nextWidth) }));

  const homeTab = nav === "settings" ? "today" : nav;
  const pendingLearningPathKeys = new Set(
    controllers.sourceWriteQueue.items
      .filter((item) => item.status === "pending" || item.status === "retrying")
      .flatMap((item) => (item.learningPath ? [toLearningPathKey(item.learningPath)] : [])),
  );

  return (
    <div className="jc-shell">
      {device.isPhone ? (
        <PhoneHeader title={navTitle(nav)} subtitle={today} />
      ) : (
        <TopBar dueCount={reviewDue.length} nav={nav} onNavigate={setNav} today={today} />
      )}

      <main className="jc-main" style={{ maxWidth: device.isPhone ? undefined : 1240 }}>
        {nav === "settings" ? (
          <SettingsView
            backupAssets={controllers.backupAssets}
            commitStudyChanges={controllers.commitStudyChanges}
            copyDebugLogs={controllers.copyDebugLogs}
            dailyNewLearningCount={dailyNewLearningCount}
            handleFailureRetryDaysChange={(event) => updateSrsSettings({ failureRetryDays: Number(event.target.value) })}
            handleMaxReviewStageChange={(event) => updateSrsSettings({ maxReviewStage: Number(event.target.value) })}
            debugLogs={debugLogs}
            devicePreference={device.preference}
            handleDailyNewLearningCountChange={(event) => updateDailyLearningCount({ event, setState, today })}
            homeDueDebug={homeDueDebug}
            resetLocalCache={controllers.resetLocalCache}
            restoreAssets={controllers.restoreAssets}
            setDevicePreference={device.setPreference}
            setTheme={setTheme}
            theme={theme}
            sourceWriteQueue={controllers.sourceWriteQueue}
            srsSettings={srsSettings}
            viewportMode={device.viewportMode}
          />
        ) : (
          <HomeView
            bookSelection={{ availableBooks, onSwitchBook: controllers.switchBook, selectedBookId }}
            dashboard={{ allDayRows, dateRangeMeta, learningPlanRows, overallMeta, pendingLearningRows, reviewDue }}
            isPhone={device.isPhone}
            pendingLearningPathKeys={pendingLearningPathKeys}
            planControls={{ planRange, setPlanRange }}
            studyActions={{
              copyDayWordsByPath: controllers.copyDayWordsByPath,
              importDayDecompositionFromClipboardByPath: controllers.importDayDecompositionFromClipboardByPath,
              importDayDecompositionFromTextByPath: controllers.importDayDecompositionFromTextByPath,
              openLearningDay: controllers.openLearningDay,
              openReviewDay: controllers.openReviewDay,
            }}
            tab={homeTab}
            srsSettings={srsSettings}
            today={today}
          />
        )}
      </main>

      {device.isPhone && <TabBar dueCount={reviewDue.length} nav={nav} onNavigate={setNav} />}

      {session && controllers.sessionDay && (
        <SessionView
          actions={{
            canGoQuizNext: controllers.canGoQuizNext,
            copyCurrentWord: controllers.copyCurrentWord,
            copyDay1Words: controllers.copyDay1Words,
            copyDisplayId: controllers.copyDisplayId,
            goHome: controllers.goHome,
            goNextQuizItem: controllers.goNextQuizItem,
            goNextStudyItem: controllers.goNextStudyItem,
            goPrevQuizItem: controllers.goPrevQuizItem,
            goPrevStudyItem: controllers.goPrevStudyItem,
            importDay1DecompositionFromClipboard: controllers.importDay1DecompositionFromClipboard,
            importDay1DecompositionFromText: controllers.importDay1DecompositionFromText,
            markDayAttemptNow: controllers.markDayAttemptNow,
            openProblemEditor: controllers.openProblemEditor,
            resetDayDecompositions: controllers.resetDayDecompositions,
            resetDayProblems: controllers.resetDayProblems,
            saveProblemEditor: controllers.saveProblemEditor,
            selectQuizChoice: controllers.selectQuizChoice,
            updateMemo: controllers.updateMemo,
          }}
          currentItem={controllers.currentItem}
          isPhone={device.isPhone}
          problemEditor={problemEditor}
          renderers={{
            getDisplayItemId: controllers.getDisplayItemId,
            renderKanjiWithReading: controllers.renderKanjiWithReading,
            renderSentenceWithTarget: controllers.renderSentenceWithTarget,
          }}
          session={session}
          sessionDay={controllers.sessionDay}
          sessionItems={controllers.sessionItems}
          setProblemEditor={setProblemEditor}
          setSession={setSession}
          setSideWidth={setSideWidth}
          sideWidth={sideWidth}
        />
      )}

      {toast && (
        <div className="jc-toast" data-type={toast.type}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function navTitle(nav: NavKey) {
  if (nav === "days") return "Day 선택";
  if (nav === "progress") return "전체 진행률";
  if (nav === "settings") return "설정";
  return "오늘 할 학습";
}
