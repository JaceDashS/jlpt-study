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
  type AllDayRow,
  type DateRangeMeta,
  type OverallMeta,
  type PlanRange,
} from "./HomePageSections.tsx";

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
  const [actionDoneByKey, setActionDoneByKey] = React.useState<Record<string, Partial<Record<"copy" | "input", boolean>>>>({});

  const markActionDone = (path: LearningPath, action: "copy" | "input") => {
    const key = toLearningPathKey(path);
    setActionDoneByKey((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        [action]: true,
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
    const copied = await studyActions.copyDayWordsByPath(path);
    if (copied) {
      markActionDone(path, "copy");
    }
  };

  const handleWordImportFromClipboard = async (path: LearningPath) => {
    const applied = await studyActions.importDayDecompositionFromClipboardByPath(path);
    if (applied) {
      markActionDone(path, "input");
      if (wordImportTargetKey === toLearningPathKey(path)) {
        closeWordImport();
      }
      return;
    }
    openWordImport(path);
  };

  const submitWordImport = async (path: LearningPath) => {
    const applied = await studyActions.importDayDecompositionFromTextByPath(path, wordImportText);
    if (!applied) return;
    markActionDone(path, "input");
    closeWordImport();
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
