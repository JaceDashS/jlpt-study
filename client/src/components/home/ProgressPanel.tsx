import React from "react";
import { REVIEW_STAGE_MAX } from "../../domain/constants.ts";
import { MeterRow } from "../common/Primitives.tsx";
import type { DateRangeMeta, OverallMeta, PlanRange } from "./homeTypes.ts";

export function ProgressPanel({
  dateRangeMeta,
  overallMeta,
  planRange,
  setPlanRange,
}: {
  dateRangeMeta: DateRangeMeta;
  overallMeta: OverallMeta;
  planRange: PlanRange;
  setPlanRange: React.Dispatch<React.SetStateAction<PlanRange>>;
}) {
  const averageReviewStage = (1 + overallMeta.avgStageRatio * (REVIEW_STAGE_MAX - 1)).toFixed(2);

  return (
    <div className="jc-stack" style={{ gap: 16 }}>
      <MeterRow
        label="Day 완료"
        value={`${overallMeta.completedDays}/${overallMeta.uniqueDayTotal}`}
        ratio={overallMeta.completedRatio}
      />
      <MeterRow label="평균 복습 회차" value={`${averageReviewStage} / ${REVIEW_STAGE_MAX}`} ratio={overallMeta.avgStageRatio} tone="ai" />
      <p className="jc-dim" style={{ margin: 0 }}>
        데이터상 최대 Day 인덱스 {overallMeta.maxDayIndex || 0}
      </p>

      <div className="jc-row" style={{ gap: 10, flexWrap: "wrap" }}>
        <label className="jc-field" style={{ flex: 1, minWidth: 132 }}>
          <span>시작일</span>
          <input
            className="jc-input"
            type="date"
            value={planRange.start}
            onChange={(event) => setPlanRange((prev) => ({ ...prev, start: event.target.value }))}
          />
        </label>
        <label className="jc-field" style={{ flex: 1, minWidth: 132 }}>
          <span>종료일</span>
          <input
            className="jc-input"
            type="date"
            value={planRange.end}
            onChange={(event) => setPlanRange((prev) => ({ ...prev, end: event.target.value }))}
          />
        </label>
      </div>

      {!dateRangeMeta.valid ? (
        <p className="jc-muted">기간 형식이 올바르지 않거나 종료일이 시작일보다 빠릅니다.</p>
      ) : (
        <MeterRow
          label="기간 경과"
          value={`${dateRangeMeta.elapsedDays}/${dateRangeMeta.totalDays}일 · 남은 ${dateRangeMeta.remainingDays}일`}
          ratio={dateRangeMeta.ratio}
        />
      )}
    </div>
  );
}
