import React from "react";
import { AutoGrowTextarea } from "../EditorControls.tsx";
import { toLearningPathKey } from "../../domain/learningPath.ts";
import { cx } from "../../styles.ts";
import type { LearningPlanRow, ReviewDueRow } from "../../domain/homeDashboard.ts";
import type { LearningPath } from "../../domain/studyTypes.ts";
import type { ActionDoneState } from "./HomePageSectionTypes.ts";

export function TodayStudySection({
  actionDoneByKey,
  handleCopy,
  handleWordImportFromClipboard,
  learningPlanRows,
  openLearningDay,
  openReviewDay,
  pendingLearningRows,
  reviewDue,
  submitWordImport,
  today,
  wordImportTargetKey,
  wordImportText,
  closeWordImport,
  setWordImportText,
}: {
  actionDoneByKey: Record<string, ActionDoneState>;
  closeWordImport: () => void;
  handleCopy: (path: LearningPath) => Promise<void>;
  handleWordImportFromClipboard: (path: LearningPath) => Promise<void>;
  learningPlanRows: LearningPlanRow[];
  openLearningDay: (path: LearningPath) => void;
  openReviewDay: (path: LearningPath, dueItemIds: string[]) => void;
  pendingLearningRows: LearningPlanRow[];
  reviewDue: ReviewDueRow[];
  setWordImportText: React.Dispatch<React.SetStateAction<string>>;
  submitWordImport: (path: LearningPath) => Promise<void>;
  today: string;
  wordImportTargetKey: string | null;
  wordImportText: string;
}) {
  const renderDecompositionActionGroup = ({
    path,
    dayTitle,
    totalCount,
    missingCount,
    modeLabel,
    modeTone,
  }: {
    path: LearningPath;
    dayTitle: string;
    totalCount: number;
    missingCount: number;
    modeLabel: string;
    modeTone: "review" | "learning";
  }) => {
    const targetKey = toLearningPathKey(path);
    return (
      <DecompositionActionGroup
        actionDone={actionDoneByKey[targetKey] ?? {}}
        closeWordImport={closeWordImport}
        dayTitle={dayTitle}
        handleCopy={handleCopy}
        handleWordImportFromClipboard={handleWordImportFromClipboard}
        isWordImportOpen={wordImportTargetKey === targetKey}
        missingCount={missingCount}
        modeLabel={modeLabel}
        modeTone={modeTone}
        path={path}
        setWordImportText={setWordImportText}
        submitWordImport={submitWordImport}
        totalCount={totalCount}
        wordImportText={wordImportText}
      />
    );
  };

  return (
    <>
      <h3>오늘 해야할 학습</h3>
      {reviewDue.length === 0 && <p className={cx("muted")}>반복학습 대상 없음 (기준: nextReviewDate before-or-equal today)</p>}
      <div className={cx("stack")}>
        {reviewDue.map((item) =>
          item.missingDecompositionCount > 0
            ? renderDecompositionActionGroup({
                path: item.path,
                dayTitle: item.dayTitle,
                totalCount: item.dueCount,
                missingCount: item.missingDecompositionCount,
                modeLabel: "복습",
                modeTone: "review",
              })
            : (
              <button
                type="button"
                key={toLearningPathKey(item.path)}
                className={cx("card-button")}
                onClick={() => openReviewDay(item.path, item.dueItemIds)}
              >
                <div className={cx("row between home-card-head")}>
                  <strong>{item.dayTitle}</strong>
                  <span className={cx("mode-chip review")}>복습</span>
                </div>
                <span>반복학습 대상: {item.dueCount}개</span>
                <span>복습 회차: {Math.max(1, Math.round(item.progress * 4) + 1)}/5</span>
              </button>
            ),
        )}

        {pendingLearningRows.map((row) =>
          row.missingDecompositionCount > 0
            ? renderDecompositionActionGroup({
                path: row.path,
                dayTitle: row.dayTitle,
                totalCount: row.itemCount,
                missingCount: row.missingDecompositionCount,
                modeLabel: "학습",
                modeTone: "learning",
              })
            : (
              <button type="button" key={toLearningPathKey(row.path)} className={cx("card-button")} onClick={() => openLearningDay(row.path)}>
                <div className={cx("row between home-card-head")}>
                  <strong>{row.dayTitle}</strong>
                  <span className={cx("mode-chip learning")}>학습</span>
                </div>
                <span>
                  Day 인덱스: {row.dayIndex} (전체 순서 {row.sequenceIndex}/{row.totalDayCount})
                </span>
                <span>오늘 신규 학습 할당 목록</span>
              </button>
            ),
        )}
        {pendingLearningRows.length === 0 && learningPlanRows.length > 0 && (
          <p className={cx("muted")}>오늘 신규 학습을 모두 완료했습니다. 내일({today} 이후 날짜) 다시 생성됩니다.</p>
        )}
        {learningPlanRows.length === 0 && <p className={cx("muted")}>신규 학습 가능한 Day가 없습니다.</p>}
      </div>
    </>
  );
}

function DecompositionActionGroup({
  actionDone,
  dayTitle,
  handleCopy,
  handleWordImportFromClipboard,
  isWordImportOpen,
  missingCount,
  modeLabel,
  modeTone,
  path,
  closeWordImport,
  setWordImportText,
  submitWordImport,
  totalCount,
  wordImportText,
}: {
  actionDone: ActionDoneState;
  closeWordImport: () => void;
  dayTitle: string;
  handleCopy: (path: LearningPath) => Promise<void>;
  handleWordImportFromClipboard: (path: LearningPath) => Promise<void>;
  isWordImportOpen: boolean;
  missingCount: number;
  modeLabel: string;
  modeTone: "review" | "learning";
  path: LearningPath;
  setWordImportText: React.Dispatch<React.SetStateAction<string>>;
  submitWordImport: (path: LearningPath) => Promise<void>;
  totalCount: number;
  wordImportText: string;
}) {
  const targetKey = toLearningPathKey(path);
  const copyLabel = actionDone.copy ? "복사됨" : "학습단어 복사";
  const inputLabel = actionDone.input ? "입력됨" : "입력";

  return (
    <div key={`${targetKey}:decomposition-actions`} className={cx("home-action-group")}>
      <div className={cx("home-action-group-head")}>
        <div className={cx("home-action-group-title")}>
          <strong>{dayTitle}</strong>
          <span className={cx(`mode-chip ${modeTone}`)}>{modeLabel}</span>
        </div>
        <span className={cx("muted")}>디컴포지션 미입력: {missingCount}개 / 전체 {totalCount}개</span>
      </div>

      <div className={cx("home-action-button-grid")}>
        <button
          type="button"
          className={cx(`card-button home-action-button ${actionDone.copy ? "home-action-button-done" : ""}`)}
          onClick={() => {
            void handleCopy(path);
          }}
        >
          <strong>{copyLabel}</strong>
          <span>{modeLabel} 전에 필요한 학습 단어 JSON을 복사합니다.</span>
        </button>
        <button
          type="button"
          className={cx(`card-button home-action-button ${actionDone.input ? "home-action-button-done" : ""}`)}
          onClick={() => {
            void handleWordImportFromClipboard(path);
          }}
        >
          <strong>{inputLabel}</strong>
          <span>{modeLabel} 전에 한자 디컴포지션을 반영합니다.</span>
        </button>
      </div>

      {isWordImportOpen && (
        <div className={cx("word-import-panel")}>
          <p className={cx("word-import-title")}>{`${dayTitle} JSON 붙여넣기`}</p>
          <AutoGrowTextarea
            value={wordImportText}
            onChange={(event) => setWordImportText(event.target.value)}
            placeholder="여기에 Day JSON을 붙여넣으세요"
            className={cx("word-import-textarea")}
            rows={6}
          />
          <div className={cx("word-import-actions")}>
            <button
              type="button"
              className={cx("action")}
              onClick={() => {
                void submitWordImport(path);
              }}
            >
              가져오기
            </button>
            <button type="button" className={cx("action")} onClick={closeWordImport}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
