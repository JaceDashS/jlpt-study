import React, { useEffect, useRef, useState } from "react";
import { isGraduatedStage } from "../../domain/constants.ts";
import { toLearningPathKey } from "../../domain/learningPath.ts";
import { Card } from "../common/Primitives.tsx";
import { DayGrid } from "./DayGrid.tsx";
import { HomeStats } from "./HomeStats.tsx";
import { ProgressPanel } from "./ProgressPanel.tsx";
import { RecentDays } from "./RecentDays.tsx";
import { StageDistribution } from "./StageDistribution.tsx";
import { TodayQueue } from "./TodayQueue.tsx";
import type { AvailableBook } from "../../domain/curriculumFiles.ts";
import type { LearningPlanRow, ReviewDueRow } from "../../domain/homeDashboard.ts";
import type { LearningPath } from "../../domain/studyTypes.ts";
import type { SrsSettings } from "../../domain/srsPreferences.ts";
import type {
  ActionDoneState,
  ActionHoldState,
  ActionPendingState,
  AllDayRow,
  DateRangeMeta,
  HomeActionType,
  OverallMeta,
  PlanRange,
} from "./homeTypes.ts";

const ACTION_DONE_VISIBLE_MS = 1000;

export type HomeTab = "today" | "days" | "progress";

export type HomeViewProps = {
  bookSelection: {
    availableBooks: AvailableBook[];
    onSwitchBook: (bookId: string) => void;
    selectedBookId: string;
  };
  dashboard: {
    allDayRows: AllDayRow[];
    dateRangeMeta: DateRangeMeta;
    learningPlanRows: LearningPlanRow[];
    overallMeta: OverallMeta;
    pendingLearningRows: LearningPlanRow[];
    reviewDue: ReviewDueRow[];
  };
  isPhone: boolean;
  pendingLearningPathKeys: ReadonlySet<string>;
  srsSettings: SrsSettings;
  planControls: {
    planRange: PlanRange;
    setPlanRange: React.Dispatch<React.SetStateAction<PlanRange>>;
  };
  studyActions: {
    copyDayWordsByPath: (path: LearningPath) => Promise<boolean>;
    importDayDecompositionFromClipboardByPath: (path: LearningPath) => Promise<boolean>;
    importDayDecompositionFromTextByPath: (path: LearningPath, text: string) => Promise<boolean>;
    openLearningDay: (path: LearningPath) => void;
    openReviewDay: (path: LearningPath, dueItemIds: string[]) => void;
  };
  tab: HomeTab;
  today: string;
};

export function HomeView({ bookSelection, dashboard, isPhone, pendingLearningPathKeys, planControls, srsSettings, studyActions, tab, today }: HomeViewProps) {
  const wordActions = useWordActionState(studyActions);
  const pendingLearningRows = dashboard.pendingLearningRows.filter(
    (row) => !pendingLearningPathKeys.has(toLearningPathKey(row.path)),
  );
  const reviewDue = dashboard.reviewDue.filter(
    (row) => !pendingLearningPathKeys.has(toLearningPathKey(row.path)),
  );

  const todayQueue = (
    <TodayQueue
      {...wordActions.queueProps}
      learningPlanRows={dashboard.learningPlanRows}
      openLearningDay={studyActions.openLearningDay}
      openReviewDay={studyActions.openReviewDay}
      pendingLearningRows={pendingLearningRows}
      reviewDue={reviewDue}
      today={today}
    />
  );

  const dueCount = reviewDue.length;
  const newCount = pendingLearningRows.length;

  if (tab === "days") {
    return (
      <Card title="Day 선택" hint={`${dashboard.allDayRows.length}개`}>
        <DayGrid allDayRows={dashboard.allDayRows} openLearningDay={studyActions.openLearningDay} />
      </Card>
    );
  }

  if (tab === "progress") {
    return (
      <Card title="전체 진행률">
        <ProgressPanel
          dateRangeMeta={dashboard.dateRangeMeta}
          maxReviewStage={srsSettings.maxReviewStage}
          overallMeta={dashboard.overallMeta}
          planRange={planControls.planRange}
          setPlanRange={planControls.setPlanRange}
        />
      </Card>
    );
  }

  const failTotal = dashboard.allDayRows.reduce((sum, row) => sum + row.failCount, 0);
  const masteredCount = dashboard.allDayRows.filter((row) => isGraduatedStage(row.stage, srsSettings.maxReviewStage)).length;
  const dueItemCount = reviewDue.reduce((sum, row) => sum + row.dueCount, 0);
  const newItemCount = pendingLearningRows.reduce((sum, row) => sum + row.itemCount, 0);

  const stats = (
    <HomeStats
      dateRangeMeta={dashboard.dateRangeMeta}
      dueCount={dueCount}
      dueItemCount={dueItemCount}
      failCount={failTotal}
      masteredCount={masteredCount}
      newCount={newCount}
      newItemCount={newItemCount}
      overallMeta={dashboard.overallMeta}
    />
  );

  if (isPhone) {
    return (
      <>
        {stats}
        {bookSelection.availableBooks.length > 1 && <BookSelect {...bookSelection} />}
        <Card title="오늘 할 학습" hint={`복습 ${dueCount} · 신규 ${newCount}`}>
          {todayQueue}
        </Card>
        <Card title="복습 회차 분포" hint={`${dashboard.allDayRows.length}개`}>
          <StageDistribution allDayRows={dashboard.allDayRows} maxReviewStage={srsSettings.maxReviewStage} />
        </Card>
        <Card title="최근 학습">
          <RecentDays allDayRows={dashboard.allDayRows} maxReviewStage={srsSettings.maxReviewStage} openLearningDay={studyActions.openLearningDay} today={today} />
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="jc-page-head">
        <div>
          <h1 className="jc-page-title">오늘 할 학습</h1>
          <p className="jc-page-desc">
            {today} · 복습 {dueCount}개 · 신규 {newCount}개
          </p>
        </div>
        {bookSelection.availableBooks.length > 1 && <BookSelect {...bookSelection} />}
      </div>

      {stats}

      <div className="jc-two-col">
        <Card title="학습 대기열" hint={`${dueCount + newCount}건`}>
          {todayQueue}
        </Card>
        <div className="jc-stack" style={{ gap: 14 }}>
          <Card title="복습 회차 분포" hint={`${dashboard.allDayRows.length}개`}>
            <StageDistribution allDayRows={dashboard.allDayRows} maxReviewStage={srsSettings.maxReviewStage} />
          </Card>
          <Card title="진행률">
            <ProgressPanel
              dateRangeMeta={dashboard.dateRangeMeta}
              maxReviewStage={srsSettings.maxReviewStage}
              overallMeta={dashboard.overallMeta}
              planRange={planControls.planRange}
              setPlanRange={planControls.setPlanRange}
            />
          </Card>
          <Card title="최근 학습">
            <RecentDays allDayRows={dashboard.allDayRows} maxReviewStage={srsSettings.maxReviewStage} openLearningDay={studyActions.openLearningDay} today={today} />
          </Card>
        </div>
      </div>
    </>
  );
}

function BookSelect({
  availableBooks,
  onSwitchBook,
  selectedBookId,
}: {
  availableBooks: AvailableBook[];
  onSwitchBook: (bookId: string) => void;
  selectedBookId: string;
}) {
  return (
    <label className="jc-row jc-book-select" style={{ gap: 10 }}>
      <span className="jc-dim">교재</span>
      <select
        className="jc-select"
        style={{ flex: 1 }}
        value={selectedBookId}
        onChange={(event) => onSwitchBook(event.target.value)}
      >
        {availableBooks.map((book) => (
          <option key={book.id} value={book.id}>
            {book.title}
          </option>
        ))}
      </select>
    </label>
  );
}

// 복사/입력 버튼의 진행·완료 표시와 붙여넣기 패널 상태.
function useWordActionState(studyActions: HomeViewProps["studyActions"]) {
  const [wordImportTargetKey, setWordImportTargetKey] = useState<string | null>(null);
  const [wordImportText, setWordImportText] = useState("");
  const [actionDoneByKey, setActionDoneByKey] = useState<Record<string, ActionDoneState>>({});
  const [actionHoldByKey, setActionHoldByKey] = useState<Record<string, ActionHoldState>>({});
  const [actionPendingByKey, setActionPendingByKey] = useState<Record<string, ActionPendingState>>({});
  const holdTimersRef = useRef<Record<string, number>>({});

  useEffect(
    () => () => {
      Object.values(holdTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    },
    [],
  );

  const setPending = (path: LearningPath, action: HomeActionType, isPending: boolean) => {
    const key = toLearningPathKey(path);
    setActionPendingByKey((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [action]: isPending } }));
  };

  const markDone = (path: LearningPath, action: HomeActionType, holdMs = 0) => {
    const key = toLearningPathKey(path);
    setActionDoneByKey((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [action]: true } }));
    if (holdMs <= 0) return;

    const timerKey = `${key}:${action}`;
    const previousTimer = holdTimersRef.current[timerKey];
    if (previousTimer) window.clearTimeout(previousTimer);

    setActionHoldByKey((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [action]: true } }));
    holdTimersRef.current[timerKey] = window.setTimeout(() => {
      setActionHoldByKey((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [action]: false } }));
      delete holdTimersRef.current[timerKey];
    }, holdMs);
  };

  const closeWordImport = () => {
    setWordImportTargetKey(null);
    setWordImportText("");
  };

  const handleCopy = async (path: LearningPath) => {
    setPending(path, "copy", true);
    try {
      if (await studyActions.copyDayWordsByPath(path)) markDone(path, "copy");
    } finally {
      setPending(path, "copy", false);
    }
  };

  const handleWordImportFromClipboard = async (path: LearningPath) => {
    setPending(path, "input", true);
    try {
      const applied = await studyActions.importDayDecompositionFromClipboardByPath(path);
      if (applied) {
        markDone(path, "input", ACTION_DONE_VISIBLE_MS);
        if (wordImportTargetKey === toLearningPathKey(path)) closeWordImport();
        return;
      }
      setWordImportTargetKey(toLearningPathKey(path));
      setWordImportText("");
    } finally {
      setPending(path, "input", false);
    }
  };

  const submitWordImport = async (path: LearningPath) => {
    setPending(path, "input", true);
    try {
      if (!(await studyActions.importDayDecompositionFromTextByPath(path, wordImportText))) return;
      markDone(path, "input", ACTION_DONE_VISIBLE_MS);
      closeWordImport();
    } finally {
      setPending(path, "input", false);
    }
  };

  return {
    queueProps: {
      actionDoneByKey,
      actionHoldByKey,
      actionPendingByKey,
      closeWordImport,
      handleCopy,
      handleWordImportFromClipboard,
      setWordImportText,
      submitWordImport,
      wordImportTargetKey,
      wordImportText,
    },
  };
}
