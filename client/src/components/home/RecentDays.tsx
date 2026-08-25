import React from "react";
import { getStageLabel } from "../../domain/constants.ts";
import { toLearningPathKey } from "../../domain/learningPath.ts";
import type { LearningPath } from "../../domain/studyTypes.ts";
import type { AllDayRow } from "./homeTypes.ts";

export function RecentDays({
  allDayRows,
  maxReviewStage,
  openLearningDay,
  today,
}: {
  allDayRows: AllDayRow[];
  maxReviewStage: number;
  openLearningDay: (path: LearningPath) => void;
  today: string;
}) {
  const rows = allDayRows
    .filter((row) => Boolean(row.lastAttemptDate))
    .sort((a, b) => String(b.lastAttemptDate).localeCompare(String(a.lastAttemptDate)))
    .slice(0, 5);

  if (rows.length === 0) {
    return <div className="jc-empty">아직 학습 기록이 없습니다.</div>;
  }

  return (
    <div className="jc-recent-list">
      {rows.map((row) => (
        <button
          key={toLearningPathKey(row.path)}
          type="button"
          className="jc-recent-row"
          onClick={() => openLearningDay(row.path)}
        >
          <span className="jc-recent-day">{row.dayTitle}</span>
          <span className="jc-recent-meta">
            {formatRelative(row.lastAttemptDate, today)} · 정답률 {Math.round(row.passRatio * 100)}%
          </span>
            <span className="jc-recent-stage">{getStageLabel(row.stage, maxReviewStage)}</span>
        </button>
      ))}
    </div>
  );
}

function formatRelative(dateString: string, today: string) {
  if (dateString === today) return "오늘";
  const diff = diffDays(dateString, today);
  if (diff === 1) return "어제";
  if (diff > 1) return `${diff}일 전`;
  return dateString;
}

function diffDays(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / msPerDay);
}
