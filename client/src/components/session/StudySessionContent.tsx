import React from "react";
import { MemoEditor } from "../EditorControls.tsx";
import { cx } from "../../styles.ts";
import type { SessionItemView, SessionView, SetBoolean } from "./sessionViewTypes.ts";

export function StudySessionContent({
  copyCurrentWord,
  copyDisplayId,
  currentItem,
  getDisplayItemId,
  renderKanjiWithReading,
  setShowFurigana,
  showFurigana,
  updateMemo,
}: {
  copyCurrentWord: () => void;
  copyDisplayId: (id: string) => void;
  currentItem: SessionItemView;
  getDisplayItemId: (item: SessionItemView) => string;
  renderKanjiWithReading: (item: SessionItemView, options: { showReading: boolean }) => React.ReactNode;
  setShowFurigana: SetBoolean;
  showFurigana: boolean;
  updateMemo: (itemId: string, field: "memoPersonal" | "memoDecomposition", value: string) => void;
}) {
  return (
    <div className={cx("study")}>
      <div className={cx("kanji")}>
        <span
          className={cx("kanji-id kanji-id-copyable")}
          role="button"
          tabIndex={0}
          onClick={() => copyDisplayId(getDisplayItemId(currentItem))}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              copyDisplayId(getDisplayItemId(currentItem));
            }
          }}
        >
          {getDisplayItemId(currentItem)}
        </span>
        {currentItem.lastResult === "PASS" && <span className={cx("kanji-last-result pass")}>{"\uC815\uB2F5"}</span>}
        {currentItem.lastResult === "FAIL" && <span className={cx("kanji-last-result fail")}>{"\uC624\uB2F5"}</span>}
        <button type="button" className={cx("action kanji-copy-action")} onClick={copyCurrentWord} disabled={!currentItem}>
          {"copy"}
        </button>
        <button
          type="button"
          className={cx(`kanji-furigana-toggle ${showFurigana ? "on" : "off"}`)}
          onClick={() => setShowFurigana((prev) => !prev)}
          aria-label={"\uD6C4\uB9AC\uAC00\uB098 \uD45C\uC2DC \uD1A0\uAE00"}
          aria-pressed={showFurigana}
        >
          <span className={cx("kanji-furigana-thumb")} />
        </button>
        {renderKanjiWithReading(currentItem, { showReading: showFurigana })}
      </div>

      <MemoEditor
        label=""
        value={currentItem.memoPersonal}
        onCommit={(value) => updateMemo(currentItem.id, "memoPersonal", value)}
        clickToEdit
        emptyPreviewPlaceholder={"\uBA54\uBAA8"}
      />
      <MemoEditor
        label=""
        value={currentItem.memoDecomposition}
        onCommit={(value) => updateMemo(currentItem.id, "memoDecomposition", value)}
        clickToEdit
        doubleClickToEdit
        emptyPreviewPlaceholder={"\uD55C\uC790 \uB514\uCEF4\uD3EC\uC9C0\uC158 (\uB354\uBE14\uD074\uB9AD)"}
      />
    </div>
  );
}

export function StudySessionNav({
  goNextStudyItem,
  goPrevStudyItem,
  session,
  sessionItems,
}: {
  goNextStudyItem: () => void;
  goPrevStudyItem: () => void;
  session: SessionView;
  sessionItems: SessionItemView[];
}) {
  return (
    <div className={cx("study-nav-fixed")} aria-label={"\uD559\uC2B5 \uC774\uB3D9 \uBC84\uD2BC"}>
      <button
        type="button"
        className={cx("study-nav-arrow left")}
        disabled={session.index === 0}
        onClick={goPrevStudyItem}
        aria-label={"\uC774\uC804 \uD55C\uC790"}
      >
        {"\u2190"}
      </button>
      <button
        type="button"
        className={cx("study-nav-arrow right")}
        onClick={goNextStudyItem}
        aria-label={
          session.index === sessionItems.length - 1
            ? session.postQuizStudy
              ? "\uD648\uC73C\uB85C \uC774\uB3D9"
              : "\uBB38\uC81C\uB85C \uC774\uB3D9"
            : "\uB2E4\uC74C \uD55C\uC790"
        }
      >
        {"\u2192"}
      </button>
    </div>
  );
}
