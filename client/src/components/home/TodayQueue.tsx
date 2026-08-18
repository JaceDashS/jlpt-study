import React from "react";
import { toLearningPathKey } from "../../domain/learningPath.ts";
import { AutoGrowTextarea, Chip } from "../common/Primitives.tsx";
import type { LearningPlanRow, ReviewDueRow } from "../../domain/homeDashboard.ts";
import type { LearningPath } from "../../domain/studyTypes.ts";
import type { ActionDoneState, ActionHoldState, ActionPendingState } from "./homeTypes.ts";

export type TodayQueueProps = {
  actionDoneByKey: Record<string, ActionDoneState>;
  actionHoldByKey: Record<string, ActionHoldState>;
  actionPendingByKey: Record<string, ActionPendingState>;
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
};

export function TodayQueue(props: TodayQueueProps) {
  const {
    actionDoneByKey,
    actionHoldByKey,
    actionPendingByKey,
    learningPlanRows,
    openLearningDay,
    openReviewDay,
    pendingLearningRows,
    reviewDue,
    today,
  } = props;

  const isEmpty = reviewDue.length === 0 && pendingLearningRows.length === 0;

  return (
    <div className="jc-stack">
      {reviewDue.map((item) => {
        const key = toLearningPathKey(item.path);
        const needsWordAction =
          item.missingDecompositionCount > 0 ||
          hasAnyAction(actionPendingByKey[key]) ||
          hasAnyAction(actionHoldByKey[key]);

        if (needsWordAction) {
          return (
            <WordActionCard
              key={key}
              {...props}
              dayTitle={item.dayTitle}
              hasFail={item.failCount > 0}
              missingCount={item.missingDecompositionCount}
              modeLabel="복습"
              modeTone="review"
              path={item.path}
              totalCount={item.dueCount}
            />
          );
        }

        return (
          <button
            key={key}
            type="button"
            className="jc-day-card"
            data-tone="review"
            onClick={() => openReviewDay(item.path, item.dueItemIds)}
          >
            <div className="jc-day-card-head">
              <strong>{item.dayTitle}</strong>
              <Chip tone={item.failCount > 0 ? "fail" : "review"}>{item.failCount > 0 ? "복습・실패" : "복습"}</Chip>
            </div>
            <div className="jc-day-card-meta">
              <span>대상 {item.dueCount}개</span>
              <span>회차 {item.reviewRound}/5</span>
            </div>
          </button>
        );
      })}

      {pendingLearningRows.map((row) => {
        const key = toLearningPathKey(row.path);
        const needsWordAction =
          row.missingDecompositionCount > 0 ||
          hasAnyAction(actionPendingByKey[key]) ||
          hasAnyAction(actionHoldByKey[key]);

        if (needsWordAction) {
          return (
            <WordActionCard
              key={key}
              {...props}
              dayTitle={row.dayTitle}
              hasFail={row.failCount > 0}
              missingCount={row.missingDecompositionCount}
              modeLabel="학습"
              modeTone="learning"
              path={row.path}
              totalCount={row.itemCount}
            />
          );
        }

        return (
          <button key={key} type="button" className="jc-day-card" data-tone="learning" onClick={() => openLearningDay(row.path)}>
            <div className="jc-day-card-head">
              <strong>{row.dayTitle}</strong>
              <Chip tone={row.failCount > 0 ? "fail" : "learning"}>{row.failCount > 0 ? "학습・실패" : "학습"}</Chip>
            </div>
            <div className="jc-day-card-meta">
              <span>Day {row.dayIndex}</span>
              <span>
                전체 {row.sequenceIndex}/{row.totalDayCount}
              </span>
              <span>신규 {row.itemCount}개</span>
            </div>
          </button>
        );
      })}

      {isEmpty && learningPlanRows.length > 0 && (
        <p className="jc-muted">오늘 몫을 모두 끝냈습니다. 새 학습은 {today} 다음 날에 다시 배정됩니다.</p>
      )}
      {isEmpty && learningPlanRows.length === 0 && <p className="jc-muted">신규 학습 가능한 Day가 없습니다.</p>}
    </div>
  );
}

function WordActionCard({
  actionDoneByKey,
  actionHoldByKey,
  actionPendingByKey,
  closeWordImport,
  dayTitle,
  handleCopy,
  handleWordImportFromClipboard,
  hasFail,
  missingCount,
  modeLabel,
  modeTone,
  path,
  setWordImportText,
  submitWordImport,
  totalCount,
  wordImportTargetKey,
  wordImportText,
}: TodayQueueProps & {
  dayTitle: string;
  hasFail: boolean;
  missingCount: number;
  modeLabel: string;
  modeTone: "review" | "learning";
  path: LearningPath;
  totalCount: number;
}) {
  const key = toLearningPathKey(path);
  const done = actionDoneByKey[key] ?? {};
  const hold = actionHoldByKey[key] ?? {};
  const pending = actionPendingByKey[key] ?? {};
  const isCopyPending = Boolean(pending.copy);
  const isInputPending = Boolean(pending.input);
  const isBusy = isCopyPending || isInputPending || Boolean(hold.input);
  const isImportOpen = wordImportTargetKey === key;

  return (
    <div className="jc-action-card">
      <div className="jc-day-card-head">
        <strong>{dayTitle}</strong>
        <Chip tone={hasFail ? "fail" : modeTone}>{hasFail ? `${modeLabel}・실패` : modeLabel}</Chip>
      </div>
      <p className="jc-dim" style={{ margin: 0 }}>
        디컴포지션 미입력 {missingCount}개 / 전체 {totalCount}개 — {modeLabel} 전에 채워 주세요.
      </p>

      <div className="jc-action-grid">
        <button
          type="button"
          className="jc-action-btn"
          data-done={Boolean(done.copy)}
          disabled={isBusy}
          aria-busy={isCopyPending}
          onClick={() => void handleCopy(path)}
        >
          <strong>
            {isCopyPending ? <span className="jc-spinner" aria-hidden /> : null}
            {isCopyPending ? "복사 중" : done.copy ? "복사됨" : "단어 복사"}
          </strong>
          <span>학습 단어 JSON을 클립보드로</span>
        </button>
        <button
          type="button"
          className="jc-action-btn"
          data-done={Boolean(done.input)}
          disabled={isBusy}
          aria-busy={isInputPending}
          onClick={() => void handleWordImportFromClipboard(path)}
        >
          <strong>
            {isInputPending ? <span className="jc-spinner" aria-hidden /> : null}
            {isInputPending ? "입력 중" : done.input ? "입력됨" : "디컴포지션 입력"}
          </strong>
          <span>클립보드 JSON을 반영</span>
        </button>
      </div>

      {isImportOpen && (
        <div className="jc-stack">
          <span className="jc-memo-label">{dayTitle} JSON 붙여넣기</span>
          <AutoGrowTextarea
            className="jc-textarea"
            value={wordImportText}
            rows={6}
            placeholder="여기에 Day JSON을 붙여넣으세요"
            onChange={(event) => setWordImportText(event.target.value)}
          />
          <div className="jc-row">
            <button
              type="button"
              className="jc-btn"
              data-variant="primary"
              disabled={isInputPending}
              onClick={() => void submitWordImport(path)}
            >
              {isInputPending ? "가져오는 중" : "가져오기"}
            </button>
            <button type="button" className="jc-btn" onClick={closeWordImport}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function hasAnyAction(state: ActionPendingState | ActionHoldState | undefined) {
  return Boolean(state?.copy || state?.input);
}
