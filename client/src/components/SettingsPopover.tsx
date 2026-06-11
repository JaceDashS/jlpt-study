import React from "react";
import { cx } from "../styles.ts";
import type { HomeDueDebugRow } from "../domain/clipboardActions.ts";
import type { StudyCommitPushResult } from "../domain/gitActions.ts";
import { LayoutWidthControl } from "./LayoutWidthControl.tsx";

export function SettingsPopover({
  backupAssets,
  commitLayoutWidthDraft,
  commitStudyChanges,
  copyDebugLogs,
  dailyNewLearningCount,
  debugLogs,
  handleDailyNewLearningCountChange,
  handleLayoutWidthChange,
  handleLayoutWidthMouseDown,
  homeDueDebug,
  layoutMaxWidthDraft,
  resetLocalCache,
  restoreAssets,
  stopLayoutWidthSpinner,
}: {
  backupAssets: () => void;
  commitLayoutWidthDraft: () => void;
  commitStudyChanges: () => Promise<StudyCommitPushResult>;
  copyDebugLogs: () => void;
  dailyNewLearningCount: number;
  debugLogs: string[];
  handleDailyNewLearningCountChange: React.ChangeEventHandler<HTMLSelectElement>;
  handleLayoutWidthChange: (value: string) => void;
  handleLayoutWidthMouseDown: (event: React.MouseEvent<HTMLInputElement>) => void;
  homeDueDebug: HomeDueDebugRow[];
  layoutMaxWidthDraft: number | string;
  resetLocalCache: () => void;
  restoreAssets: () => void;
  stopLayoutWidthSpinner: () => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSyncingStudy, setIsSyncingStudy] = React.useState(false);
  const [studySyncLabel, setStudySyncLabel] = React.useState("커밋/풀/푸쉬");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const labelResetTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!isOpen) return undefined;

    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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
    <div ref={rootRef} className={cx("settings-popover-root")}>
      {isOpen && (
        <section id="settings-popover-panel" className={cx("settings-popover-panel")} aria-label="옵션">
          <div className={cx("settings-popover-head")}>
            <strong>옵션</strong>
            <button type="button" className={cx("settings-popover-close")} aria-label="옵션 닫기" onClick={() => setIsOpen(false)}>
              ×
            </button>
          </div>

          <div className={cx("settings-option-list")}>
            <LayoutWidthControl
              commitLayoutWidthDraft={commitLayoutWidthDraft}
              handleLayoutWidthChange={handleLayoutWidthChange}
              handleLayoutWidthMouseDown={handleLayoutWidthMouseDown}
              layoutMaxWidthDraft={layoutMaxWidthDraft}
              stopLayoutWidthSpinner={stopLayoutWidthSpinner}
            />

            <label className={cx("settings-option-row")} htmlFor="settings-daily-new-learning-count">
              <span>하루 신규 학습</span>
              <select
                id="settings-daily-new-learning-count"
                className={cx("settings-select")}
                value={dailyNewLearningCount}
                onChange={handleDailyNewLearningCountChange}
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}개
                  </option>
                ))}
              </select>
            </label>

            <div className={cx("settings-action-grid")}>
              <button type="button" className={cx("action settings-action")} onClick={resetLocalCache}>
                캐시 초기화
              </button>
              <button type="button" className={cx("action settings-action")} onClick={handleCommitStudyChanges} disabled={isSyncingStudy}>
                {studySyncLabel}
              </button>
              <button type="button" className={cx("action settings-action")} onClick={backupAssets}>
                에셋 백업
              </button>
              <button type="button" className={cx("action settings-action")} onClick={restoreAssets}>
                에셋 복구
              </button>
            </div>

            <details className={cx("settings-debug-panel")}>
              <summary className={cx("settings-debug-summary")}>
                <span>디버깅 로그</span>
                <button
                  type="button"
                  className={cx("action debug-copy-button settings-debug-copy")}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    copyDebugLogs();
                  }}
                >
                  copy
                </button>
              </summary>
              <div className={cx("settings-debug-body")}>
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
              </div>
            </details>
          </div>
        </section>
      )}

      <button
        type="button"
        className={cx("settings-fab")}
        aria-controls="settings-popover-panel"
        aria-expanded={isOpen}
        aria-label={isOpen ? "옵션 닫기" : "옵션 열기"}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className={cx("settings-fab-icon")} aria-hidden="true">
          ⚙
        </span>
      </button>
    </div>
  );
}
