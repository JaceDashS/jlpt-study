import React from "react";
import { CopyableId, MemoEditor, Switch } from "../common/Primitives.tsx";
import type { SessionItemView } from "./sessionViewTypes.ts";

export function StudyPane({
  copyCurrentWord,
  copyDisplayId,
  currentItem,
  getDisplayItemId,
  renderKanjiWithReading,
  setShowFurigana,
  setShowMeaning,
  showFurigana,
  showMeaning,
  updateMemo,
}: {
  copyCurrentWord: () => void;
  copyDisplayId: (id: string) => void;
  currentItem: SessionItemView;
  getDisplayItemId: (item: SessionItemView) => string;
  renderKanjiWithReading: (item: SessionItemView, options: { showReading: boolean }) => React.ReactNode;
  setShowFurigana: React.Dispatch<React.SetStateAction<boolean>>;
  setShowMeaning: React.Dispatch<React.SetStateAction<boolean>>;
  showFurigana: boolean;
  showMeaning: boolean;
  updateMemo: (itemId: string, field: "memoPersonal" | "memoDecomposition", value: string) => void;
}) {
  return (
    <>
      <section className="jc-word">
        <div className="jc-word-tools">
          <CopyableId id={getDisplayItemId(currentItem)} onCopy={copyDisplayId} />
          {currentItem.lastResult === "PASS" && <span className="jc-chip" data-tone="pass">지난 정답</span>}
          {currentItem.lastResult === "FAIL" && <span className="jc-chip" data-tone="fail">지난 오답</span>}
        </div>

        <div className="jc-word-expression">{renderKanjiWithReading(currentItem, { showReading: showFurigana })}</div>

        {showMeaning && <p className="jc-word-meaning">{currentItem.meaningKo}</p>}

        <div className="jc-word-tools">
          <Switch on={showFurigana} onToggle={() => setShowFurigana((prev) => !prev)} label="후리가나" />
          <Switch on={showMeaning} onToggle={() => setShowMeaning((prev) => !prev)} label="뜻" />
          <button type="button" className="jc-btn" data-variant="ghost" onClick={copyCurrentWord}>
            단어 복사
          </button>
        </div>
      </section>

      <MemoEditor
        label="내 메모"
        value={currentItem.memoPersonal}
        placeholder="눌러서 메모 입력"
        onCommit={(value) => updateMemo(currentItem.id, "memoPersonal", value)}
      />

      <MemoEditor
        label="한자 디컴포지션"
        value={currentItem.memoDecomposition}
        placeholder="더블클릭해서 편집"
        requireDoubleClick
        onCommit={(value) => updateMemo(currentItem.id, "memoDecomposition", value)}
      />
    </>
  );
}
