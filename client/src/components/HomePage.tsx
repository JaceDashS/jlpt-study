import React from "react";
import { toLearningPathKey } from "../domain/learningPath.ts";
import { cx } from "../styles.ts";
import type { AvailableBook } from "../domain/curriculumFiles.ts";
import type { HomeDueDebugRow } from "../domain/clipboardActions.ts";
import type { LearningPlanRow, ReviewDueRow } from "../domain/homeDashboard.ts";
import type { StudyCommitPushResult } from "../domain/gitActions.ts";
import type { LearningPath } from "../domain/studyTypes.ts";
import {
  DaySelectionSection,
  HomeHeaderSection,
  ProgressOverviewSection,
  TodayStudySection,
  type ActionDoneState,
  type ActionHoldState,
  type ActionPendingState,
  type AllDayRow,
  type DateRangeMeta,
  type HomeActionType,
  type OverallMeta,
  type PlanRange,
} from "./HomePageSections.tsx";

const ACTION_DONE_VISIBLE_MS = 1000;

type DashboardProps = {
  allDayRows: AllDayRow[];
  dateRangeMeta: DateRangeMeta;
  debugLogs: string[];
  homeDueDebug: HomeDueDebugRow[];
  learningPlanRows: LearningPlanRow[];
  overallMeta: OverallMeta;
  pendingLearningRows: LearningPlanRow[];
  reviewDue: ReviewDueRow[];
};

type StudyActions = {
  copyDayWordsByPath: (path: LearningPath) => Promise<boolean>;
  copyDebugLogs: () => void;
  importDayDecompositionFromClipboardByPath: (path: LearningPath) => Promise<boolean>;
  importDayDecompositionFromTextByPath: (path: LearningPath, text: string) => Promise<boolean>;
  openLearningDay: (path: LearningPath) => void;
  openReviewDay: (path: LearningPath, dueItemIds: string[]) => void;
};

type AssetActions = {
  backupAssets: () => void;
  commitStudyChanges: () => Promise<StudyCommitPushResult>;
  resetLocalCache: () => void;
  restoreAssets: () => void;
};

type BookSelection = {
  availableBooks: AvailableBook[];
  onSwitchBook: (bookId: string) => void;
  selectedBookId: string;
};

type PlanControls = {
  dailyNewLearningCount: number;
  handleDailyNewLearningCountChange: React.ChangeEventHandler<HTMLSelectElement>;
  planRange: PlanRange;
  setPlanRange: React.Dispatch<React.SetStateAction<PlanRange>>;
};

type HomePageProps = {
  assetActions: AssetActions;
  bookSelection: BookSelection;
  dashboard: DashboardProps;
  planControls: PlanControls;
  studyActions: StudyActions;
  today: string;
};

export function HomePage({
  assetActions,
  bookSelection,
  dashboard,
  planControls,
  studyActions,
  today,
}: HomePageProps) {
  const [wordImportTargetKey, setWordImportTargetKey] = React.useState<string | null>(null);
  const [wordImportText, setWordImportText] = React.useState("");
  const [actionDoneByKey, setActionDoneByKey] = React.useState<Record<string, ActionDoneState>>({});
  const [actionHoldByKey, setActionHoldByKey] = React.useState<Record<string, ActionHoldState>>({});
  const [actionPendingByKey, setActionPendingByKey] = React.useState<Record<string, ActionPendingState>>({});
  const actionHoldTimersRef = React.useRef<Record<string, number>>({});

  React.useEffect(
    () => () => {
      Object.keys(actionHoldTimersRef.current).forEach((timerKey) => {
        window.clearTimeout(actionHoldTimersRef.current[timerKey]);
      });
    },
    [],
  );

  const markActionDone = (path: LearningPath, action: HomeActionType, holdMs = 0) => {
    const key = toLearningPathKey(path);
    setActionDoneByKey((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        [action]: true,
      },
    }));
    if (holdMs > 0) {
      holdActionDone(path, action, holdMs);
    }
  };

  const holdActionDone = (path: LearningPath, action: HomeActionType, holdMs: number) => {
    const key = toLearningPathKey(path);
    const timerKey = `${key}:${action}`;
    const prevTimerId = actionHoldTimersRef.current[timerKey];
    if (prevTimerId) {
      window.clearTimeout(prevTimerId);
    }

    setActionHoldByKey((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        [action]: true,
      },
    }));

    actionHoldTimersRef.current[timerKey] = window.setTimeout(() => {
      setActionHoldByKey((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? {}),
          [action]: false,
        },
      }));
      delete actionHoldTimersRef.current[timerKey];
    }, holdMs);
  };

  const setActionPending = (path: LearningPath, action: HomeActionType, isPending: boolean) => {
    const key = toLearningPathKey(path);
    setActionPendingByKey((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        [action]: isPending,
      },
    }));
  };

  const closeWordImport = () => {
    setWordImportTargetKey(null);
    setWordImportText("");
  };

  const openWordImport = (path: LearningPath) => {
    setWordImportTargetKey(toLearningPathKey(path));
    setWordImportText("");
  };

  const handleCopy = async (path: LearningPath) => {
    setActionPending(path, "copy", true);
    try {
      const copied = await studyActions.copyDayWordsByPath(path);
      if (copied) {
        markActionDone(path, "copy");
      }
    } finally {
      setActionPending(path, "copy", false);
    }
  };

  const handleWordImportFromClipboard = async (path: LearningPath) => {
    setActionPending(path, "input", true);
    try {
      const applied = await studyActions.importDayDecompositionFromClipboardByPath(path);
      if (applied) {
        markActionDone(path, "input", ACTION_DONE_VISIBLE_MS);
        if (wordImportTargetKey === toLearningPathKey(path)) {
          closeWordImport();
        }
        return;
      }
      openWordImport(path);
    } finally {
      setActionPending(path, "input", false);
    }
  };

  const submitWordImport = async (path: LearningPath) => {
    setActionPending(path, "input", true);
    try {
      const applied = await studyActions.importDayDecompositionFromTextByPath(path, wordImportText);
      if (!applied) return;
      markActionDone(path, "input", ACTION_DONE_VISIBLE_MS);
      closeWordImport();
    } finally {
      setActionPending(path, "input", false);
    }
  };

  return (
    <>
      <section className={cx("card")}>
        <HomeHeaderSection
          availableBooks={bookSelection.availableBooks}
          backupAssets={assetActions.backupAssets}
          copyDebugLogs={studyActions.copyDebugLogs}
          dailyNewLearningCount={planControls.dailyNewLearningCount}
          debugLogs={dashboard.debugLogs}
          handleDailyNewLearningCountChange={planControls.handleDailyNewLearningCountChange}
          homeDueDebug={dashboard.homeDueDebug}
          onSwitchBook={bookSelection.onSwitchBook}
          commitStudyChanges={assetActions.commitStudyChanges}
          resetLocalCache={assetActions.resetLocalCache}
          restoreAssets={assetActions.restoreAssets}
          selectedBookId={bookSelection.selectedBookId}
          today={today}
        />
        <TodayStudySection
          actionDoneByKey={actionDoneByKey}
          actionHoldByKey={actionHoldByKey}
          actionPendingByKey={actionPendingByKey}
          closeWordImport={closeWordImport}
          handleCopy={handleCopy}
          handleWordImportFromClipboard={handleWordImportFromClipboard}
          learningPlanRows={dashboard.learningPlanRows}
          openLearningDay={studyActions.openLearningDay}
          openReviewDay={studyActions.openReviewDay}
          pendingLearningRows={dashboard.pendingLearningRows}
          reviewDue={dashboard.reviewDue}
          setWordImportText={setWordImportText}
          submitWordImport={submitWordImport}
          today={today}
          wordImportTargetKey={wordImportTargetKey}
          wordImportText={wordImportText}
        />
      </section>

      <ProgressOverviewSection
        dateRangeMeta={dashboard.dateRangeMeta}
        overallMeta={dashboard.overallMeta}
        planRange={planControls.planRange}
        setPlanRange={planControls.setPlanRange}
      />

      <DaySelectionSection allDayRows={dashboard.allDayRows} openLearningDay={studyActions.openLearningDay} />
    </>
  );
}
