import React, { useEffect, useRef, useState } from "react";
import { Card } from "./common/Primitives.tsx";
import type { HomeDueDebugRow } from "../domain/clipboardActions.ts";
import type { StudyCommitPushResult } from "../domain/gitActions.ts";
import type { SourceWriteQueueController } from "../domain/sourcePersistence.ts";
import type { DeviceModePreference } from "../ui/deviceMode.ts";
import type { SrsSettings } from "../domain/srsPreferences.ts";

function queueStatusLabel(status: "pending" | "retrying" | "failed") {
  if (status === "retrying") return "\uC7AC\uC2DC \uB300\uAE30";
  if (status === "failed") return "\uC2E4\uD328";
  return "\uC804\uC1A1 \uB300\uAE30";
}

function formatQueueTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export type ThemeName = "dark" | "light";

export function SettingsView({
  backupAssets,
  commitStudyChanges,
  copyDebugLogs,
  dailyNewLearningCount,
  handleFailureRetryDaysChange,
  handleMaxReviewStageChange,
  debugLogs,
  devicePreference,
  handleDailyNewLearningCountChange,
  homeDueDebug,
  resetLocalCache,
  restoreAssets,
  setDevicePreference,
  setTheme,
  theme,
  sourceWriteQueue,
  srsSettings,
  viewportMode,
}: {
  backupAssets: () => void;
  commitStudyChanges: () => Promise<StudyCommitPushResult>;
  copyDebugLogs: () => void;
  dailyNewLearningCount: number;
  handleFailureRetryDaysChange: React.ChangeEventHandler<HTMLInputElement>;
  handleMaxReviewStageChange: React.ChangeEventHandler<HTMLSelectElement>;
  debugLogs: string[];
  devicePreference: DeviceModePreference;
  handleDailyNewLearningCountChange: React.ChangeEventHandler<HTMLSelectElement>;
  homeDueDebug: HomeDueDebugRow[];
  resetLocalCache: () => void;
  restoreAssets: () => void;
  setDevicePreference: (preference: DeviceModePreference) => void;
  setTheme: (theme: ThemeName) => void;
  theme: ThemeName;
  sourceWriteQueue: SourceWriteQueueController;
  srsSettings: SrsSettings;
  viewportMode: "phone" | "pc";
}) {
  const [syncLabel, setSyncLabel] = useState("커밋 / 풀 / 푸쉬");
  const [isSyncing, setIsSyncing] = useState(false);
  const labelTimerRef = useRef<number | null>(null);
  const queueItems = sourceWriteQueue.items;
  const failedQueueCount = queueItems.filter((item) => item.status === "failed").length;

  useEffect(
    () => () => {
      if (labelTimerRef.current !== null) window.clearTimeout(labelTimerRef.current);
    },
    [],
  );

  const handleCommit = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncLabel("동기화 중...");
    try {
      const result = await commitStudyChanges();
      if (result.status === "committed") setSyncLabel(`완료 (${result.stagedFileCount}개 파일)`);
      else if (result.status === "pulled") setSyncLabel("풀 완료");
      else setSyncLabel("실패");
    } finally {
      setIsSyncing(false);
      if (labelTimerRef.current !== null) window.clearTimeout(labelTimerRef.current);
      labelTimerRef.current = window.setTimeout(() => setSyncLabel("커밋 / 풀 / 푸쉬"), 5000);
    }
  };

  return (
    <>
      <Card title="화면">
        <div className="jc-settings-list">
          <div className="jc-settings-row">
            <span>
              레이아웃 모드
              <br />
              <span className="jc-dim">자동은 현재 {viewportMode === "phone" ? "폰" : "PC"}으로 인식 중</span>
            </span>
            <div className="jc-segment">
              {(["auto", "phone", "pc"] as DeviceModePreference[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-active={devicePreference === value}
                  onClick={() => setDevicePreference(value)}
                >
                  {value === "auto" ? "자동" : value === "phone" ? "폰" : "PC"}
                </button>
              ))}
            </div>
          </div>

          <div className="jc-settings-row">
            <span>테마</span>
            <div className="jc-segment">
              <button type="button" data-active={theme === "dark"} onClick={() => setTheme("dark")}>
                다크 모드
              </button>
              <button type="button" data-active={theme === "light"} onClick={() => setTheme("light")}>
                라이트 모드
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card title="학습">
        <div className="jc-settings-row">
          <label htmlFor="daily-new-learning-count">하루 신규 학습</label>
          <select
            id="daily-new-learning-count"
            className="jc-select"
            value={dailyNewLearningCount}
            onChange={handleDailyNewLearningCountChange}
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count}개
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card title="Review settings" hint="Current values are the defaults">
        <div className="jc-settings-list">
          <div className="jc-settings-row">
            <span>
              Maximum review stage
              <br />
              <span className="jc-dim">The stage at which a Day graduates</span>
            </span>
            <select
              id="max-review-stage"
              className="jc-select"
              value={srsSettings.maxReviewStage}
              onChange={handleMaxReviewStageChange}
            >
              {[2, 3, 4, 5, 6].map((stage) => (
                <option key={stage} value={stage}>
                  Stage {stage}
                </option>
              ))}
            </select>
          </div>

          <div className="jc-settings-row">
            <span>
              Retry after failure
              <br />
              <span className="jc-dim">Days until a failed Day appears again</span>
            </span>
            <label className="jc-row" htmlFor="failure-retry-days" style={{ gap: 6 }}>
              <input
                id="failure-retry-days"
                className="jc-input"
                type="number"
                min={1}
                max={30}
                step={1}
                value={srsSettings.failureRetryDays}
                onChange={handleFailureRetryDaysChange}
                style={{ width: 76 }}
              />
              <span>days</span>
            </label>
          </div>
        </div>
        <p className="jc-dim" style={{ marginBottom: 0 }}>
          Successful review intervals remain 1, 3, 7, and 30 days.
        </p>
      </Card>

      <Card title="데이터">
        <div className="jc-settings-actions">
          <button type="button" className="jc-btn" onClick={handleCommit} disabled={isSyncing}>
            {syncLabel}
          </button>
          <button type="button" className="jc-btn" onClick={backupAssets}>
            에셋 백업
          </button>
          <button type="button" className="jc-btn" onClick={restoreAssets}>
            에셋 복구
          </button>
          <button type="button" className="jc-btn" data-variant="danger" onClick={resetLocalCache}>
            로컬 캐시 초기화
          </button>
        </div>
      </Card>

      <Card title={"\uC804\uC1A1 \uD050"} hint={sourceWriteQueue.isReady ? `${queueItems.length}\uAC74` : "\uBD88\uB7EC\uC624\uB294 \uC911..."}>
        {!sourceWriteQueue.isPersistent && (
          <p className="jc-queue-warning">{"\uC774 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C\uB294 \uC601\uC18D \uC800\uC7A5\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC5B4 \uC571\uC744 \uB2EB\uC73C\uBA74 \uD050\uAC00 \uC0AC\uB77C\uC9C8 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}</p>
        )}
        {queueItems.length === 0 ? (
          <p className="jc-dim jc-queue-empty">{"\uB300\uAE30 \uC911\uC778 \uC804\uC1A1\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}</p>
        ) : (
          <div className="jc-queue-list">
            {queueItems.map((item) => (
              <div className="jc-queue-item" key={item.id}>
                <div className="jc-queue-item-main">
                  <div className="jc-queue-item-head">
                    <strong>{item.label}</strong>
                    <span className="jc-queue-status" data-status={item.status}>
                      {queueStatusLabel(item.status)}
                    </span>
                  </div>
                  <div className="jc-queue-item-meta">
                    {item.retryCount > 0 ? `${"\uC7AC\uC2DC\uB3C4"} ${item.retryCount}\uD68C` : "\uCCAB \uC804\uC1A1"}
                    {item.nextAttemptAt ? ` / ${"\uB2E4\uC74C \uC2DC\uB3C4"} ${formatQueueTime(item.nextAttemptAt)}` : ""}
                  </div>
                  {item.lastError ? <div className="jc-queue-error">{item.lastError}</div> : null}
                </div>
                {item.status === "failed" ? (
                  <div className="jc-queue-item-actions">
                    <button type="button" className="jc-btn" data-variant="ghost" onClick={() => void sourceWriteQueue.retryItem(item.id)}>
                      {"\uC7AC\uC804\uC1A1"}
                    </button>
                    <button type="button" className="jc-btn" data-variant="ghost" onClick={() => void sourceWriteQueue.discardItem(item.id)}>
                      {"\uC0AD\uC81C"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {failedQueueCount > 0 ? (
          <button type="button" className="jc-btn jc-queue-clear" data-variant="ghost" onClick={() => void sourceWriteQueue.discardFailed()}>
            {`\uC2E4\uD328 \uD56D\uBAA9 \uBAA8\uB450 \uC0AD\uC81C (${failedQueueCount})`}
          </button>
        ) : null}
      </Card>
      <details className="jc-debug">
        <summary>
          <span>디버깅 로그</span>
          <span className="jc-spacer" />
          <button
            type="button"
            className="jc-btn"
            data-variant="ghost"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              copyDebugLogs();
            }}
          >
            복사
          </button>
        </summary>
        <div className="jc-debug-body">
          {debugLogs.map((line, index) => (
            <p key={`debug-${index}`}>{line}</p>
          ))}
          {homeDueDebug
            .filter((row) => row.itemDueCount > 0 || row.dayLevelDue)
            .slice(0, 20)
            .map((row) => (
              <p key={`${row.unitTitle}/${row.dayTitle}`}>
                [review] {row.dayTitle} | stage {String(row.stage)} | next {String(row.nextReviewDate)} | itemDue {String(row.itemDueCount)} |
                dayLevelDue {String(row.dayLevelDue)} | total {String(row.totalItems)}
              </p>
            ))}
        </div>
      </details>
    </>
  );
}
