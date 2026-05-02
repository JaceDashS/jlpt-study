import React from "react";
import { renderSimpleMarkdown } from "../../domain/markdown.ts";
import { cx } from "../../styles.ts";
import type { SessionItemView, SetBoolean } from "./sessionViewTypes.ts";

export function StudyPopupDrawer({
  closeStudyPopup,
  currentItem,
  drawerRef,
  isDecompositionVisible,
  isResizing,
  isStudyPopupClosing,
  setIsDecompositionVisible,
  startResize,
  studyDrawerWidth,
}: {
  closeStudyPopup: () => void;
  currentItem: SessionItemView;
  drawerRef: React.RefObject<HTMLElement>;
  isDecompositionVisible: boolean;
  isResizing: boolean;
  isStudyPopupClosing: boolean;
  setIsDecompositionVisible: SetBoolean;
  startResize: (event: React.MouseEvent) => void;
  studyDrawerWidth: number;
}) {
  return (
    <div className={cx("drawer-backdrop")} role="dialog" aria-modal="true" aria-label={"\uD604\uC7AC \uB2E8\uC5B4 \uD559\uC2B5 \uD31D\uC5C5"}>
      <section
        ref={drawerRef}
        className={cx(`card drawer-card ${isStudyPopupClosing ? "is-closing" : ""}`)}
        style={{ width: `${studyDrawerWidth}px` }}
      >
        <button
          type="button"
          className={cx(`drawer-resize-handle ${isResizing ? "active" : ""}`)}
          onMouseDown={startResize}
          aria-label={"\uD559\uC2B5 \uD328\uB110 \uB108\uBE44 \uC870\uC808"}
        />
        <div className={cx("row between")}>
          <h3>{"\uD604\uC7AC \uB2E8\uC5B4 \uD559\uC2B5"}</h3>
          <button type="button" className={cx("action")} onClick={closeStudyPopup}>
            {"\uB2EB\uAE30"}
          </button>
        </div>
        <div className={cx("study drawer-content")}>
          <div
            className={cx("memo-preview")}
            dangerouslySetInnerHTML={{
              __html: currentItem.memoPersonal
                ? renderSimpleMarkdown(String(currentItem.memoPersonal))
                : "<span class='placeholder'>\uBA54\uBAA8 \uC5C6\uC74C</span>",
            }}
          />
          <button type="button" className={cx("action")} onClick={() => setIsDecompositionVisible((prev) => !prev)}>
            {isDecompositionVisible
              ? "\uD55C\uC790 \uB514\uCEF4\uD3EC\uC9C0\uC158 \uC228\uAE30\uAE30"
              : "\uD55C\uC790 \uB514\uCEF4\uD3EC\uC9C0\uC158 \uBCF4\uAE30"}
          </button>
          {isDecompositionVisible && (
            <div
              className={cx("memo-preview")}
              dangerouslySetInnerHTML={{
                __html: currentItem.memoDecomposition
                  ? renderSimpleMarkdown(String(currentItem.memoDecomposition))
                  : "<span class='placeholder'>\uBA54\uBAA8 \uC5C6\uC74C</span>",
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}
