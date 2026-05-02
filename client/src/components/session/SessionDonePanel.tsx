import React from "react";
import { cx } from "../../styles.ts";
import type { SessionView } from "./sessionViewTypes.ts";

export function SessionDonePanel({ goHome, session }: { goHome: () => void; session: SessionView }) {
  return (
    <div className={cx("study")}>
      {session.mode === "review" && (
        <p className={cx("done pass-text")}>
          {"\uC624\uB298 \uBCF5\uC2B5 \uBC18\uC601 \uC644\uB8CC. PASS"} {session.passCount}/{session.reviewedCount}
        </p>
      )}
      {session.mode === "learning" && (
        <p className={cx(session.allPass ? "done pass-text" : "done fail-text")}>
          {session.allPass ? "FAIL \uC5C6\uC74C. \uD68C\uCC28\uAC00 \uC0C1\uC2B9\uD588\uC2B5\uB2C8\uB2E4." : "FAIL \uC874\uC7AC. \uD68C\uCC28 \uC720\uC9C0."}
        </p>
      )}
      <button type="button" className={cx("action")} onClick={goHome}>
        {"\uD655\uC778"}
      </button>
    </div>
  );
}
