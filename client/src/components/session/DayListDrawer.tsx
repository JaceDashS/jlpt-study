import React from "react";
import { getExpressionStrict } from "../../domain/expression.ts";
import { cx } from "../../styles.ts";
import type { SessionDayView, SessionItemView } from "./sessionViewTypes.ts";

export function DayListDrawer({
  closeDayListDrawer,
  copyDisplayId,
  currentItem,
  dayItems,
  dayListDrawerRef,
  dayListDrawerWidth,
  getDisplayItemId,
  isDayListClosing,
  isDayListResizing,
  jumpToDayItem,
  sessionDay,
  startDayListResize,
}: {
  closeDayListDrawer: () => void;
  copyDisplayId: (id: string) => void;
  currentItem: SessionItemView | null;
  dayItems: SessionItemView[];
  dayListDrawerRef: React.RefObject<HTMLElement>;
  dayListDrawerWidth: number;
  getDisplayItemId: (item: SessionItemView) => string;
  isDayListClosing: boolean;
  isDayListResizing: boolean;
  jumpToDayItem: (itemId: string) => void;
  sessionDay: SessionDayView;
  startDayListResize: (event: React.MouseEvent) => void;
}) {
  return (
    <div className={cx("drawer-backdrop drawer-backdrop-left")} role="dialog" aria-modal="true" aria-label={"\uD558\uB8E8 \uD55C\uC790 \uBAA9\uB85D"}>
      <section
        ref={dayListDrawerRef}
        className={cx(`card drawer-card drawer-card-left ${isDayListClosing ? "is-closing-left" : ""}`)}
        style={{ width: `${dayListDrawerWidth}px` }}
      >
        <button
          type="button"
          className={cx(`drawer-resize-handle drawer-resize-handle-right ${isDayListResizing ? "active" : ""}`)}
          onMouseDown={startDayListResize}
          aria-label={"\uD55C\uC790 \uBAA9\uB85D \uD328\uB110 \uB108\uBE44 \uC870\uC808"}
        />
        <div className={cx("row between")}>
          <h3>{`${sessionDay.title} \uD55C\uC790 \uBAA9\uB85D`}</h3>
          <button type="button" className={cx("action")} onClick={closeDayListDrawer}>
            {"\uB2EB\uAE30"}
          </button>
        </div>
        <div className={cx("drawer-content day-list-content")}>
          <div className={cx("day-item-grid")}>
            {dayItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx(`day-item-button ${currentItem?.id === item.id ? "active" : ""}`)}
                onClick={() => jumpToDayItem(item.id)}
              >
                <span
                  className={cx("day-item-id kanji-id-copyable")}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    copyDisplayId(getDisplayItemId(item));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      copyDisplayId(getDisplayItemId(item));
                    }
                  }}
                >
                  {getDisplayItemId(item)}
                </span>
                <span className={cx("day-item-kanji")}>{getExpressionStrict(item, "SessionPanel.dayItem")}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
