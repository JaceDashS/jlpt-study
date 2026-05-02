import React from "react";
import { cx } from "../../styles.ts";
import type { DateRangeMeta, OverallMeta, PlanRange } from "./HomePageSectionTypes.ts";

export function ProgressOverviewSection({
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
  const averageReviewStage = (1 + overallMeta.avgStageRatio * 4).toFixed(2);

  return (
    <section className={cx("card")}>
      <h2>전체 진행률</h2>
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
            <input type="date" value={planRange.start} onChange={(event) => setPlanRange((prev) => ({ ...prev, start: event.target.value }))} />
          </label>
          <label className={cx("range-field")}>
            종료일
            <input type="date" value={planRange.end} onChange={(event) => setPlanRange((prev) => ({ ...prev, end: event.target.value }))} />
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
            <div className={cx("meter")} aria-label="기간 진행률">
              <span style={{ width: `${Math.round(dateRangeMeta.ratio * 100)}%` }} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
