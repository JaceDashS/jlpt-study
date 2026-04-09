import React from "react";
import { ProgressButton } from "./EditorControls.tsx";
import { toLearningPathKey } from "../domain/studyHelpers.ts";
import { cx } from "../styles.ts";

export function HomePage({
  today,
  dailyNewLearningCount,
  handleDailyNewLearningCountChange,
  resetLocalCache,
  debugLogs,
  homeDueDebug,
  reviewDue,
  pendingLearningRows,
  learningPlanRows,
  openReviewDay,
  openLearningDay,
  overallMeta,
  dateRangeMeta,
  planRange,
  setPlanRange,
  allDayRows,
  selectedBookId,
  availableBooks,
  onSwitchBook,
  backupAssets,
  restoreAssets,
  copyDebugLogs,
}) {
  const averageReviewStage = (1 + overallMeta.avgStageRatio * 4).toFixed(2);

  return (
    <>
      <section className={cx("card")}>
        <div className={cx("home-top-bar")}>
          <div className={cx("home-top-left")}>
            <label className={cx("home-count-inline")} htmlFor="daily-new-learning-count">
              <span>하루 신규 학습 개수</span>
              <select id="daily-new-learning-count" value={dailyNewLearningCount} onChange={handleDailyNewLearningCountChange}>
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}개
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={cx("home-top-date")}>오늘 날짜: {today}</p>
          <div className={cx("home-top-right")}>
            <button type="button" className={cx("action")} onClick={resetLocalCache}>
              캐시 초기화
            </button>
            <button type="button" className={cx("action")} onClick={backupAssets}>
              에셋 백업
            </button>
            <button type="button" className={cx("action")} onClick={restoreAssets}>
              에셋 복구
            </button>
          </div>
        </div>

        {availableBooks.length > 1 && (
          <div className={cx("home-book-selector")}>
            <label htmlFor="book-select">교재</label>
            <select
              id="book-select"
              value={selectedBookId}
              onChange={(event) => onSwitchBook(event.target.value)}
            >
              {availableBooks.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <details className={cx("muted")}>
          <summary className={cx("debug-summary")}>
            <span>디버깅 로그</span>{" "}
            <button
              type="button"
              className={cx("action debug-copy-button")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                copyDebugLogs();
              }}
            >
              copy
            </button>
          </summary>
          {debugLogs.map((line, index) => (
            <p key={`debug-log-${index}`}>{line}</p>
          ))}
          {homeDueDebug
            .filter((row) => row.itemDueCount > 0 || row.dayLevelDue)
            .slice(0, 20)
            .map((row) => (
              <p key={`${row.unitTitle}/${row.dayTitle}`}>
                [review] {row.dayTitle} | stage {row.stage} | next {String(row.nextReviewDate)} |
                itemDue {row.itemDueCount} | dayLevelDue {String(row.dayLevelDue)} | total {row.totalItems}
              </p>
            ))}
        </details>

        <h3>오늘 해야할 학습</h3>
        {reviewDue.length === 0 && <p className={cx("muted")}>반복학습 대상 없음 (기준: nextReviewDate before-or-equal today)</p>}
        <div className={cx("stack")}>
          {reviewDue.map((item) => (
            <button
              type="button"
              key={`${item.unitId}:${item.dayId}`}
              className={cx("card-button")}
              onClick={() =>
                openReviewDay(
                  { unitId: item.unitId, dayId: item.dayId },
                  item.dueItemIds,
                )
              }
            >
              <div className={cx("row between home-card-head")}>
                <strong>{item.dayTitle}</strong>
                <span className={cx("mode-chip review")}>복습</span>
              </div>
              <span>반복학습 대상: {item.dueCount}개</span>
              <span>복습 회차: {Math.max(1, Math.round(item.progress * 4) + 1)}/5</span>
            </button>
          ))}

          {pendingLearningRows.map((row) => (
            <button
              type="button"
              key={toLearningPathKey(row.path)}
              className={cx("card-button")}
              onClick={() => openLearningDay(row.path)}
            >
              <div className={cx("row between home-card-head")}>
                <strong>{row.dayTitle}</strong>
                <span className={cx("mode-chip learning")}>학습</span>
              </div>
              <span>
                Day 인덱스: {row.dayIndex} (전체 순서 {row.sequenceIndex}/{row.totalDayCount})
              </span>
              <span>오늘 신규 학습 할당 목록</span>
            </button>
          ))}
          {pendingLearningRows.length === 0 && learningPlanRows.length > 0 && (
            <p className={cx("muted")}>오늘 신규 학습을 모두 완료했습니다. 내일({today} 이후 날짜) 다시 생성됩니다.</p>
          )}
          {learningPlanRows.length === 0 && <p className={cx("muted")}>신규 학습 가능한 Day가 없습니다.</p>}
        </div>
      </section>

      <section className={cx("card")}>
        <h2>전체 진행도</h2>
        <div className={cx("stack")}>
          <div className={cx("progress-meta")}>
            <span>Day 완료 수</span>
            <span>{overallMeta.completedDays}/{overallMeta.uniqueDayTotal}</span>
          </div>
          <div className={cx("meter")} aria-label="day 완료 진행">
            <span style={{ width: `${Math.round(overallMeta.completedRatio * 100)}%` }} />
          </div>
          <p className={cx("muted")}>데이터상 최대 Day 인덱스: {overallMeta.maxDayIndex || 0}</p>

          <div className={cx("progress-meta")}>
            <span>평균 복습 회차</span>
            <span>{averageReviewStage}</span>
          </div>
          <div className={cx("meter")} aria-label="평균 복습 회차 진행">
            <span style={{ width: `${Math.round(overallMeta.avgStageRatio * 100)}%` }} />
          </div>

          <h3>기간 진행</h3>
          <div className={cx("row range-inputs")}>
            <label className={cx("range-field")}>
              시작일
              <input
                type="date"
                value={planRange.start}
                onChange={(event) => setPlanRange((prev) => ({ ...prev, start: event.target.value }))}
              />
            </label>
            <label className={cx("range-field")}>
              종료일
              <input
                type="date"
                value={planRange.end}
                onChange={(event) => setPlanRange((prev) => ({ ...prev, end: event.target.value }))}
              />
            </label>
          </div>
          {!dateRangeMeta.valid && <p className={cx("muted")}>기간 형식이 올바르지 않거나 종료일이 시작일보다 빠릅니다.</p>}
          {dateRangeMeta.valid && (
            <>
              <div className={cx("progress-meta")}>
                <span>경과 / 전체</span>
                <span>
                  {dateRangeMeta.elapsedDays}/{dateRangeMeta.totalDays}일 (남은 {dateRangeMeta.remainingDays}일)
                </span>
              </div>
              <div className={cx("meter")} aria-label="기간 진행도">
                <span style={{ width: `${Math.round(dateRangeMeta.ratio * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      </section>

      <section className={cx("card")}>
        <h2>Day 선택</h2>
        <div className={cx("stack")}>
          {allDayRows.map((row) => (
            <div key={toLearningPathKey(row.path)}>
              <ProgressButton
                ratio={row.passRatio}
                active={false}
                onClick={() => openLearningDay(row.path)}
              >
                {row.dayTitle}
                {row.failCount > 0 ? ` (오답 ${row.failCount})` : ""}
              </ProgressButton>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
