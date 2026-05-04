import React from "react";
import { cx } from "../../styles.ts";
import type { AvailableBook } from "../../domain/curriculumFiles.ts";
import type { HomeDueDebugRow } from "../../domain/clipboardActions.ts";
import type { StudyCommitPushResult } from "../../domain/gitActions.ts";

export function HomeHeaderSection({
  availableBooks,
  backupAssets,
  commitStudyChanges,
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
  commitStudyChanges: () => Promise<StudyCommitPushResult>;
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
  const [isSyncingStudy, setIsSyncingStudy] = React.useState(false);
  const [studySyncLabel, setStudySyncLabel] = React.useState("커밋/풀/푸쉬");
  const labelResetTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (labelResetTimerRef.current !== null) {
        window.clearTimeout(labelResetTimerRef.current);
      }
    };
  }, []);

  const queueStudyCommitLabelReset = () => {
    if (labelResetTimerRef.current !== null) {
      window.clearTimeout(labelResetTimerRef.current);
    }
    labelResetTimerRef.current = window.setTimeout(() => {
      setStudySyncLabel("커밋/풀/푸쉬");
      labelResetTimerRef.current = null;
    }, 5000);
  };

  const handleCommitStudyChanges = async () => {
    if (isSyncingStudy) return;
    setIsSyncingStudy(true);
    setStudySyncLabel("동기화 중...");
    try {
      const result = await commitStudyChanges();
      if (result.status === "committed") {
        setStudySyncLabel(`완료 (${result.stagedFileCount}개 파일)`);
      } else if (result.status === "pulled") {
        setStudySyncLabel("풀 완료");
      } else {
        setStudySyncLabel("실패");
      }
      queueStudyCommitLabelReset();
    } finally {
      setIsSyncingStudy(false);
    }
  };

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
          <button type="button" className={cx("action")} onClick={handleCommitStudyChanges} disabled={isSyncingStudy}>
            {studySyncLabel}
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
