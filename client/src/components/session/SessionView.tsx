import React, { useEffect, useState } from "react";
import { useSessionWordActions } from "./useSessionWordActions.ts";
import { useResizableSide } from "./useResizableSide.ts";
import { ItemListPanel } from "./ItemListPanel.tsx";
import { ProblemEditorSheet } from "./ProblemEditorSheet.tsx";
import { QuizPane } from "./QuizPane.tsx";
import { StudyPane } from "./StudyPane.tsx";
import { WordActionsSheet } from "./WordActionsSheet.tsx";
import { MarkdownView, Sheet } from "../common/Primitives.tsx";
import type {
  ProblemEditorState,
  SessionDayView,
  SessionItemView,
  SessionView as SessionViewState,
  SetProblemEditor,
  SetSession,
} from "./sessionViewTypes.ts";

export type SessionActions = {
  canGoQuizNext: () => boolean;
  copyCurrentWord: () => void;
  copyDay1Words: () => void;
  copyDisplayId: (id: string) => void;
  goHome: () => void;
  goNextQuizItem: () => void;
  goNextStudyItem: () => void;
  goPrevQuizItem: () => void;
  goPrevStudyItem: () => void;
  importDay1DecompositionFromClipboard: () => Promise<boolean>;
  importDay1DecompositionFromText: (text: string) => Promise<boolean>;
  markDayAttemptNow: (path: { unitId: string; dayId: string }) => void;
  openProblemEditor: (problem: unknown) => void;
  resetDayDecompositions: () => void;
  resetDayProblems: () => void;
  saveProblemEditor: () => void;
  selectQuizChoice: (choice: string) => void;
  updateMemo: (itemId: string, field: "memoPersonal" | "memoDecomposition", value: string) => void;
};

export type SessionRenderers = {
  getDisplayItemId: (item: SessionItemView) => string;
  renderKanjiWithReading: (item: SessionItemView, options: { showReading: boolean }) => React.ReactNode;
  renderSentenceWithTarget: (sentence: string, target: string) => React.ReactNode;
};

type SidePanelKey = "items" | "note" | null;

export function SessionView({
  actions,
  currentItem,
  isPhone,
  problemEditor,
  renderers,
  session,
  sessionDay,
  sessionItems,
  setProblemEditor,
  setSession,
  sideWidth,
  setSideWidth,
}: {
  actions: SessionActions;
  currentItem: SessionItemView | null;
  isPhone: boolean;
  problemEditor: ProblemEditorState;
  renderers: SessionRenderers;
  session: SessionViewState;
  sessionDay: SessionDayView;
  sessionItems: SessionItemView[];
  setProblemEditor: SetProblemEditor;
  setSession: SetSession;
  setSideWidth: (width: number) => void;
  sideWidth: number;
}) {
  const [showFurigana, setShowFurigana] = useState(true);
  const [showMeaning, setShowMeaning] = useState(true);
  const [openSheet, setOpenSheet] = useState<"items" | "note" | "words" | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanelKey>("items");
  const { isResizing, startResize } = useResizableSide({ maxWidth: 560, minWidth: 260, setWidth: setSideWidth, width: sideWidth });

  const dayItems = Array.isArray(sessionDay?.items) ? sessionDay.items.filter(Boolean) : [];
  const canUseDayWordActions = dayItems.length > 0;
  const isStudy = session.phase === "study";
  const isQuiz = session.phase === "quiz";

  const wordActions = useSessionWordActions({
    canUseDayWordActions,
    copyDayWords: actions.copyDay1Words,
    importDayDecompositionFromClipboard: actions.importDay1DecompositionFromClipboard,
    importDayDecompositionFromText: actions.importDay1DecompositionFromText,
    phase: session.phase,
    resetDayDecompositions: actions.resetDayDecompositions,
    resetDayProblems: actions.resetDayProblems,
  });

  // 문제 화면에서 ` 키로 현재 단어 노트를 연다(기존 단축키 유지).
  useEffect(() => {
    if (!isQuiz || !currentItem) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.code !== "Backquote") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      if (isPhone) setOpenSheet((prev) => (prev === "note" ? null : "note"));
      else setSidePanel((prev) => (prev === "note" ? "items" : "note"));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentItem, isPhone, isQuiz]);

  const togglePhase = () => {
    if (session.phase === "done") return;
    if (session.phase !== "quiz") {
      actions.markDayAttemptNow({ unitId: session.unitId, dayId: session.dayId });
    }
    setSession((prev) => prev && { ...prev, phase: prev.phase === "quiz" ? "study" : "quiz", index: prev.index });
  };

  const jumpToItem = (itemId: string) => {
    const indexInSession = sessionItems.findIndex((item) => item?.id === itemId);
    if (indexInSession >= 0) {
      setSession((prev) => prev && { ...prev, index: indexInSession });
    } else {
      const allIds = dayItems.map((item) => item.id);
      const nextIndex = allIds.findIndex((id) => id === itemId);
      setSession((prev) => prev && { ...prev, itemIds: allIds, index: nextIndex >= 0 ? nextIndex : 0 });
    }
    setOpenSheet(null);
  };

  const notePanel = currentItem ? (
    <div className="jc-stack">
      <span className="jc-memo-label">내 메모</span>
      <MarkdownView text={currentItem.memoPersonal} placeholder="메모 없음" />
      <span className="jc-memo-label">한자 디컴포지션</span>
      <MarkdownView text={currentItem.memoDecomposition} placeholder="메모 없음" />
    </div>
  ) : null;

  const itemsPanel = (
    <ItemListPanel
      currentItemId={currentItem?.id}
      dayItems={dayItems}
      getDisplayItemId={renderers.getDisplayItemId}
      onCopyId={actions.copyDisplayId}
      onJump={jumpToItem}
    />
  );

  const body = (
    <>
      {isStudy && currentItem && (
        <StudyPane
          copyCurrentWord={actions.copyCurrentWord}
          copyDisplayId={actions.copyDisplayId}
          currentItem={currentItem}
          getDisplayItemId={renderers.getDisplayItemId}
          renderKanjiWithReading={renderers.renderKanjiWithReading}
          setShowFurigana={setShowFurigana}
          setShowMeaning={setShowMeaning}
          showFurigana={showFurigana}
          showMeaning={showMeaning}
          updateMemo={actions.updateMemo}
        />
      )}

      {isQuiz && currentItem && (
        <QuizPane
          copyDisplayId={actions.copyDisplayId}
          currentItem={currentItem}
          getDisplayItemId={renderers.getDisplayItemId}
          openProblemEditor={actions.openProblemEditor}
          renderSentenceWithTarget={renderers.renderSentenceWithTarget}
          selectQuizChoice={actions.selectQuizChoice}
          session={session}
          setSession={setSession}
        />
      )}

      {session.phase === "done" && <DonePane goHome={actions.goHome} session={session} />}
    </>
  );

  return (
    <div className="jc-session">
      <header className="jc-session-top">
        <button type="button" className="jc-btn" data-size="icon" aria-label="세션 닫기" onClick={actions.goHome}>
          ←
        </button>
        <div className="jc-session-title">
          <strong>{sessionDay.title}</strong>
          <span>
            {session.phase === "done" ? "-" : session.index + 1}/{sessionItems.length} ·{" "}
            {session.mode === "review" ? "복습" : "학습"} · {isStudy ? "단어" : isQuiz ? "문제" : "완료"}
          </span>
        </div>
        <span className="jc-spacer" />

        <button
          type="button"
          className="jc-btn"
          disabled={session.phase === "done" || Boolean(session.postQuizStudy && isStudy)}
          onClick={togglePhase}
        >
          {isQuiz ? "学" : "問"}
        </button>
        {isPhone ? (
          <>
            <button type="button" className="jc-btn" data-size="icon" aria-label="목록" onClick={() => setOpenSheet("items")}>
              ▦
            </button>
            <button
              type="button"
              className="jc-btn"
              data-size="icon"
              aria-label="노트"
              disabled={!isQuiz}
              onClick={() => setOpenSheet("note")}
            >
              ✎
            </button>
            <button
              type="button"
              className="jc-btn"
              data-size="icon"
              aria-label="단어 데이터"
              disabled={session.phase === "done"}
              onClick={() => setOpenSheet("words")}
            >
              ⋯
            </button>
          </>
        ) : (
          <>
            <div className="jc-segment">
              <button type="button" data-active={sidePanel === "items"} onClick={() => setSidePanel("items")}>
                목록
              </button>
              <button type="button" data-active={sidePanel === "note"} onClick={() => setSidePanel("note")}>
                노트
              </button>
              <button type="button" data-active={sidePanel === null} onClick={() => setSidePanel(null)}>
                숨김
              </button>
            </div>
            <button
              type="button"
              className="jc-btn"
              disabled={session.phase === "done"}
              onClick={() => setOpenSheet("words")}
            >
              단어 데이터
            </button>
          </>
        )}
      </header>

      <div className="jc-session-body">
        {isPhone || sidePanel === null ? (
          <div className="jc-session-single">{body}</div>
        ) : (
          <div className="jc-session-split" style={{ ["--side-width" as string]: `${sideWidth}px` }}>
            <div className="jc-stack" style={{ gap: 14 }}>
              {body}
            </div>
            <aside className="jc-session-side">
              <button
                type="button"
                className="jc-side-resize"
                data-active={isResizing}
                aria-label="패널 너비 조절"
                onMouseDown={startResize}
              />
              <h3 className="jc-card-title" style={{ margin: 0 }}>
                {sidePanel === "items" ? `${sessionDay.title} 목록` : "현재 단어 노트"}
              </h3>
              {sidePanel === "items" ? itemsPanel : notePanel}
            </aside>
          </div>
        )}
      </div>

      <footer className="jc-session-foot">
        {session.phase !== "done" && (
          <>
            <button
              type="button"
              className="jc-nav-btn"
              disabled={session.index === 0}
              aria-label="이전"
              onClick={isQuiz ? actions.goPrevQuizItem : actions.goPrevStudyItem}
            >
              ←
            </button>
            <span className="jc-spacer" />
            <button
              type="button"
              className="jc-nav-btn"
              data-variant="primary"
              disabled={isQuiz && !actions.canGoQuizNext()}
              aria-label="다음"
              onClick={isQuiz ? actions.goNextQuizItem : actions.goNextStudyItem}
            >
              →
            </button>
          </>
        )}
        {session.phase === "done" && (
          <>
            <span className="jc-spacer" />
            <button type="button" className="jc-btn" data-variant="primary" data-size="lg" onClick={actions.goHome}>
              홈으로
            </button>
          </>
        )}
      </footer>

      {openSheet === "items" && (
        <Sheet title={`${sessionDay.title} 목록`} onClose={() => setOpenSheet(null)}>
          {itemsPanel}
        </Sheet>
      )}

      {openSheet === "note" && (
        <Sheet title="현재 단어 노트" onClose={() => setOpenSheet(null)}>
          {notePanel}
        </Sheet>
      )}

      {openSheet === "words" && (
        <WordActionsSheet
          canUseDayWordActions={canUseDayWordActions}
          isWordImportOpen={wordActions.isWordImportOpen}
          onClose={() => setOpenSheet(null)}
          runWordAction={wordActions.runWordAction}
          setWordImportText={wordActions.setWordImportText}
          submitWordImport={wordActions.submitWordImport}
          wordImportText={wordActions.wordImportText}
        />
      )}

      <ProblemEditorSheet
        currentItem={currentItem}
        problemEditor={problemEditor}
        saveProblemEditor={actions.saveProblemEditor}
        setProblemEditor={setProblemEditor}
      />
    </div>
  );
}

function DonePane({ goHome, session }: { goHome: () => void; session: SessionViewState }) {
  const isReview = session.mode === "review";
  const passed = isReview ? session.passCount ?? 0 : 0;
  const reviewed = isReview ? session.reviewedCount ?? 0 : 0;

  return (
    <div className="jc-word">
      <div className="jc-word-expression" style={{ fontSize: "2.6rem" }}>
        {isReview ? (passed === reviewed ? "満点" : "完") : session.allPass ? "昇" : "続"}
      </div>
      <p className="jc-word-meaning">
        {isReview
          ? `오늘 복습 반영 완료 — PASS ${passed}/${reviewed}`
          : session.allPass
            ? "FAIL 없음. 복습 회차가 올라갔습니다."
            : "FAIL 존재. 회차는 유지됩니다."}
      </p>
      <button type="button" className="jc-btn" data-variant="primary" onClick={goHome}>
        확인
      </button>
    </div>
  );
}
