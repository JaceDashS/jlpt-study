import React from "react";
import { cx } from "../styles.ts";

export function LayoutWidthControl({
  commitLayoutWidthDraft,
  handleLayoutWidthChange,
  handleLayoutWidthMouseDown,
  layoutMaxWidthDraft,
  stopLayoutWidthSpinner,
}: {
  commitLayoutWidthDraft: () => void;
  handleLayoutWidthChange: (value: string) => void;
  handleLayoutWidthMouseDown: (event: React.MouseEvent<HTMLInputElement>) => void;
  layoutMaxWidthDraft: number | string;
  stopLayoutWidthSpinner: () => void;
}) {
  return (
    <section className={cx("layout-width-control")}>
      <label className={cx("layout-width-label")} htmlFor="layout-max-width-input">
        최대 폭
      </label>
      <input
        id="layout-max-width-input"
        className={cx("layout-width-input")}
        type="number"
        min={720}
        max={2400}
        step={10}
        value={layoutMaxWidthDraft}
        onChange={(event) => {
          handleLayoutWidthChange(event.target.value);
        }}
        onMouseDown={handleLayoutWidthMouseDown}
        onMouseUp={stopLayoutWidthSpinner}
        onBlur={commitLayoutWidthDraft}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commitLayoutWidthDraft();
          event.currentTarget.blur();
        }}
      />
    </section>
  );
}
