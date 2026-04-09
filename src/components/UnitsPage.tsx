import React from "react";
import { ProgressButton } from "./EditorControls.tsx";
import { cx } from "../styles.ts";

export function UnitsPage({
  page,
  selectedUnit,
  selectedDay,
  session,
  selectedDayId,
  getDayPassRatio,
  isQuizTarget,
  setSelectedDayId,
  openLearningDay,
  goHome,
}) {
  return (
    <>
      {page === "units" && selectedUnit && !session && (
        <section className={cx("card")}>
          <div className={cx("row")}>
            <button type="button" className={cx("action")} onClick={goHome}>
              홈으로
            </button>
          </div>
          <h2>Day 선택</h2>
          <p className={cx("muted")}>{selectedUnit.title}</p>
          {selectedUnit.days.length === 0 && <p className={cx("muted")}>이 단원에는 아직 Day 데이터가 없습니다.</p>}
          <div className={cx("stack")}>
            {selectedUnit.days.map((day) => {
              const failCount = day.items.filter((item) => isQuizTarget(item) && item.lastResult === "FAIL").length;
              return (
                <div key={day.id}>
                  <ProgressButton
                    ratio={getDayPassRatio(day)}
                    active={selectedDayId === day.id}
                    onClick={() => {
                      setSelectedDayId(day.id);
                      openLearningDay({
                        unitId: selectedUnit.id,
                        dayId: day.id,
                      });
                    }}
                  >
                    {day.title}
                    {failCount > 0 ? ` (오답 ${failCount})` : ""}
                  </ProgressButton>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
