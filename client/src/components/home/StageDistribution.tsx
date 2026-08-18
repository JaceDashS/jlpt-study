import React from "react";
import type { AllDayRow } from "./homeTypes.ts";

import { REVIEW_STAGE_MAX, getStageLabel } from "../../domain/constants.ts";

const STAGE_MAX = REVIEW_STAGE_MAX;

// Day 들이 복습 회차 어디에 몰려 있는지 보여준다. 세로 막대라 회차 진행 방향이 그대로 읽힌다.
export function StageDistribution({ allDayRows }: { allDayRows: AllDayRow[] }) {
  const buckets = Array.from({ length: STAGE_MAX }, (_, index) => {
    const stage = index + 1;
    return {
      stage,
      label: getStageLabel(stage),
      count: allDayRows.filter((row) => clampStage(row.stage) === stage).length,
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

function clampStage(value: unknown) {
  const stage = Number(value);
  if (!Number.isFinite(stage)) return 1;
  return Math.max(1, Math.min(STAGE_MAX, Math.round(stage)));
}
