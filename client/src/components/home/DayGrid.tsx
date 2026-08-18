import React, { useMemo, useState } from "react";
import { toLearningPathKey } from "../../domain/learningPath.ts";
import type { LearningPath } from "../../domain/studyTypes.ts";
import type { AllDayRow } from "./homeTypes.ts";

export function DayGrid({
  allDayRows,
  openLearningDay,
}: {
  allDayRows: AllDayRow[];
  openLearningDay: (path: LearningPath) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyFail, setOnlyFail] = useState(false);

  const rows = useMemo(() => {
    const keyword = query.trim();
    return allDayRows.filter((row) => {
      if (onlyFail && row.failCount === 0) return false;
      if (!keyword) return true;
      return row.dayTitle.includes(keyword);
    });
  }, [allDayRows, onlyFail, query]);

  return (
    <div className="jc-stack">
      <div className="jc-row" style={{ flexWrap: "wrap" }}>
        <input
          className="jc-input"
          style={{ flex: 1, minWidth: 140 }}
          value={query}
          placeholder="Day 검색"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="jc-btn"
          data-variant={onlyFail ? "danger" : undefined}
          onClick={() => setOnlyFail((prev) => !prev)}
        >
          오답만
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="jc-empty">조건에 맞는 Day가 없습니다.</div>
      ) : (
        <div className="jc-day-grid">
          {rows.map((row) => (
            <button
              key={toLearningPathKey(row.path)}
              type="button"
              className="jc-day-tile"
              onClick={() => openLearningDay(row.path)}
            >
              <span
                className="jc-day-tile-fill"
                style={{ width: `${Math.max(0, Math.min(100, Math.round(row.passRatio * 100)))}%` }}
              />
              <span className="jc-day-tile-label">{row.dayTitle}</span>
              <span className="jc-day-tile-sub">
                {row.failCount > 0 ? `오답 ${row.failCount}` : `정답률 ${Math.round(row.passRatio * 100)}%`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
