import React from "react";
import type { AllDayRow } from "./homeTypes.ts";

import { getStageLabel, normalizeReviewStageLimit } from "../../domain/constants.ts";

// Day 들이 복습 회차 어디에 몰려 있는지 보여준다. 세로 막대라 회차 진행 방향이 그대로 읽힌다.
export function StageDistribution({ allDayRows, maxReviewStage }: { allDayRows: AllDayRow[]; maxReviewStage: number }) {
  const stageMax = normalizeReviewStageLimit(maxReviewStage);
  const buckets = Array.from({ length: stageMax }, (_, index) => {
    const stage = index + 1;
    return {
      stage,
      label: getStageLabel(stage, stageMax),
      count: allDayRows.filter((row) => clampStage(row.stage, stageMax) === stage).length,
    };
  });
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <div className="jc-stage-chart">
      {buckets.map((bucket) => (
        <div key={bucket.stage} className="jc-stage-col">
          <span className="jc-stage-count">{bucket.count}</span>
          <div className="jc-stage-bar" data-empty={bucket.count === 0}>
            <span style={{ height: `${Math.round((bucket.count / max) * 100)}%` }} />
          </div>
          <span className="jc-stage-label">{bucket.label}</span>
        </div>
      ))}
    </div>
  );
}

function clampStage(value: unknown, maxStage: number) {
  const stage = Number(value);
  if (!Number.isFinite(stage)) return 1;
  return Math.max(1, Math.min(maxStage, Math.round(stage)));
}
