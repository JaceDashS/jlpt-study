import { ProgressButton } from "../EditorControls.tsx";
import { toLearningPathKey } from "../../domain/learningPath.ts";
import { cx } from "../../styles.ts";
import type { LearningPath } from "../../domain/studyTypes.ts";
import type { AllDayRow } from "./HomePageSectionTypes.ts";

export function DaySelectionSection({
  allDayRows,
  openLearningDay,
}: {
  allDayRows: AllDayRow[];
  openLearningDay: (path: LearningPath) => void;
}) {
  return (
    <section className={cx("card")}>
      <h2>Day 선택</h2>
      <div className={cx("stack")}>
        {allDayRows.map((row) => (
          <div key={toLearningPathKey(row.path)}>
            <ProgressButton ratio={row.passRatio} active={false} onClick={() => openLearningDay(row.path)}>
              {row.dayTitle}
              {row.failCount > 0 ? ` (오답 ${row.failCount})` : ""}
            </ProgressButton>
          </div>
        ))}
      </div>
    </section>
  );
}
