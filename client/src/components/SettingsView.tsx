import React, { useEffect, useRef, useState } from "react";
import { Card } from "./common/Primitives.tsx";
import type { HomeDueDebugRow } from "../domain/clipboardActions.ts";
import type { StudyCommitPushResult } from "../domain/gitActions.ts";
import type { DeviceModePreference } from "../ui/deviceMode.ts";

export type ThemeName = "dark" | "light";

export function SettingsView({
  backupAssets,
  commitStudyChanges,
  copyDebugLogs,
  dailyNewLearningCount,
  debugLogs,
  devicePreference,
  handleDailyNewLearningCountChange,
  homeDueDebug,
  resetLocalCache,
  restoreAssets,
  setDevicePreference,
  setTheme,
  theme,
  viewportMode,
}: {
  backupAssets: () => void;
  commitStudyChanges: () => Promise<StudyCommitPushResult>;
  copyDebugLogs: () => void;
  dailyNewLearningCount: number;
  debugLogs: string[];
  devicePreference: DeviceModePreference;
  handleDailyNewLearningCountChange: React.ChangeEventHandler<HTMLSelectElement>;
  homeDueDebug: HomeDueDebugRow[];
  resetLocalCache: () => void;
  restoreAssets: () => void;
  setDevicePreference: (preference: DeviceModePreference) => void;
  setTheme: (theme: ThemeName) => void;
  theme: ThemeName;
  viewportMode: "phone" | "pc";
}) {
  const [syncLabel, setSyncLabel] = useState("커밋 / 풀 / 푸쉬");
  const [isSyncing, setIsSyncing] = useState(false);
  const labelTimerRef = useRef<number | null>(null);

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
