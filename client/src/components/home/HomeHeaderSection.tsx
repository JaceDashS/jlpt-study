import React from "react";
import { cx } from "../../styles.ts";
import type { AvailableBook } from "../../domain/curriculumFiles.ts";
import type { HomeDueDebugRow } from "../../domain/clipboardActions.ts";

export function HomeHeaderSection({
  availableBooks,
  backupAssets,
  copyDebugLogs,
  dailyNewLearningCount,
  debugLogs,
  handleDailyNewLearningCountChange,
  homeDueDebug,
  onSwitchBook,
  resetLocalCache,
  restoreAssets,
  selectedBookId,
  today,
}: {
  availableBooks: AvailableBook[];
  backupAssets: () => void;
  copyDebugLogs: () => void;
  dailyNewLearningCount: number;
  debugLogs: string[];
  handleDailyNewLearningCountChange: React.ChangeEventHandler<HTMLSelectElement>;
  homeDueDebug: HomeDueDebugRow[];
  onSwitchBook: (bookId: string) => void;
  resetLocalCache: () => void;
  restoreAssets: () => void;
  selectedBookId: string;
  today: string;
}) {
  return (
    <>
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
          <select id="book-select" value={selectedBookId} onChange={(event) => onSwitchBook(event.target.value)}>
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
              [review] {row.dayTitle} | stage {row.stage} | next {String(row.nextReviewDate)} | itemDue {row.itemDueCount} |
              dayLevelDue {String(row.dayLevelDue)} | total {row.totalItems}
            </p>
          ))}
      </details>
    </>
  );
}
