import React from "react";
import type { DateRangeMeta, OverallMeta } from "./homeTypes.ts";

// 상단 요약 타일. 숫자 하나와 보조 설명만 담아 한눈에 읽히게 한다.
export function HomeStats({
  dateRangeMeta,
  dueCount,
  dueItemCount,
  failCount,
  masteredCount,
  newCount,
  newItemCount,
  overallMeta,
}: {
  dateRangeMeta: DateRangeMeta;
  dueCount: number;
  dueItemCount: number;
  failCount: number;
  masteredCount: number;
  newCount: number;
  newItemCount: number;
  overallMeta: OverallMeta;
}) {
  const remainLabel = dateRangeMeta.valid ? `${dateRangeMeta.remainingDays}일` : "미설정";

  return (
    <div className="jc-stats">
      <Tile
        accent="ai"
        label="오늘 복습"
        value={`${dueCount}개`}
        hint={dueCount === 0 ? "예정 없음" : `단어 ${dueItemCount}개`}
      />
      <Tile
        accent="matcha"
        label="오늘 신규"
        value={`${newCount}개`}
        hint={newCount === 0 ? "오늘 몫 완료" : `단어 ${newItemCount}개`}
      />
      <Tile
        accent="sakura"
        label="시작한 Day"
        value={`${overallMeta.completedDays}/${overallMeta.uniqueDayTotal}`}
        hint={`졸업 ${masteredCount}개`}
      />
      <Tile accent="kaki" label="시험까지" value={remainLabel} hint={failCount > 0 ? `오답 ${failCount}개 남음` : "오답 없음"} />
    </div>
  );
}

function Tile({
  accent,
  hint,
  label,
  value,
}: {
  accent: "sakura" | "matcha" | "ai" | "kaki";
  hint: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="jc-stat" data-accent={accent}>
      <span className="jc-stat-label">{label}</span>
      <strong className="jc-stat-value">{value}</strong>
      <span className="jc-stat-hint">{hint}</span>
    </div>
  );
}
