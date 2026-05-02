import React from "react";
import { QuizPane } from "./session/QuizPane.tsx";
import { ProblemEditorPane } from "./session/ProblemEditorPane.tsx";
import { StudyPopupDrawer } from "./session/StudyPopupDrawer.tsx";
import { DayListDrawer } from "./session/DayListDrawer.tsx";
import { SessionTopBar, StudySessionTopBar } from "./session/SessionTopBars.tsx";
import { StudySessionContent, StudySessionNav } from "./session/StudySessionContent.tsx";
import { SessionDonePanel } from "./session/SessionDonePanel.tsx";
import { useSessionWordActions } from "./session/useSessionWordActions.ts";
import { useSessionPanelState } from "./session/useSessionPanelState.ts";
import { cx } from "../styles.ts";
import type {
  ProblemEditorState,
  SessionDayView,
  SessionItemView,
  SessionView,
  SetProblemEditor,
  SetSession,
} from "./session/sessionViewTypes.ts";

type SessionPanelActions = {
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

type SessionPanelLayout = {
  dayListDrawerWidth: number;
  setDayListDrawerWidth: (width: number) => void;
  setStudyDrawerWidth: (width: number) => void;
  studyDrawerWidth: number;
};

type SessionPanelRenderers = {
  getDisplayItemId: (item: SessionItemView) => string;
  renderKanjiWithReading: (item: SessionItemView, options: { showReading: boolean }) => React.ReactNode;
  renderSentenceWithTarget: (sentence: string, target: string) => React.ReactNode;
};

type SessionPanelProps = {
  actions: SessionPanelActions;
  currentItem: SessionItemView | null;
  layout: SessionPanelLayout;
  problemEditor: ProblemEditorState;
  renderers: SessionPanelRenderers;
  session: SessionView;
  sessionDay: SessionDayView;
  sessionItems: SessionItemView[];
  setProblemEditor: SetProblemEditor;
  setSession: SetSession;
};

export function SessionPanel({
  actions,
  currentItem,
  layout,
  problemEditor,
  renderers,
  session,
  sessionDay,
  sessionItems,
  setProblemEditor,
  setSession,
}: SessionPanelProps) {
  if (!session || !sessionDay) return null;
  const {
    canGoQuizNext,
    copyCurrentWord,
    copyDay1Words,
    copyDisplayId,
    goHome,
    goNextQuizItem,
    goNextStudyItem,
    goPrevQuizItem,
    goPrevStudyItem,
    importDay1DecompositionFromClipboard,
    importDay1DecompositionFromText,
    markDayAttemptNow,
    openProblemEditor,
    resetDayDecompositions,
    resetDayProblems,
    saveProblemEditor,
    selectQuizChoice,
    updateMemo,
  } = actions;
  const { getDisplayItemId, renderKanjiWithReading, renderSentenceWithTarget } = renderers;
  const panelState = useSessionPanelState({
    currentItem,
    layout,
    session,
    sessionDay,
    sessionItems,
    setSession,
  });

  const markCurrentDayAttempt = () =>
    markDayAttemptNow({
      unitId: session.unitId,
      dayId: session.dayId,
    });
  const canUseDayWordActions = !!sessionDay && Array.isArray(sessionDay.items) && sessionDay.items.length > 0;
  const {
    isWordImportOpen,
    primaryWordAction,
    runWordAction,
    setIsWordImportOpen,
    setWordImportText,
    submitWordImport,
    wordImportText,
  } = useSessionWordActions({
    canUseDayWordActions,
    copyDayWords: copyDay1Words,
    importDayDecompositionFromClipboard: importDay1DecompositionFromClipboard,
    importDayDecompositionFromText: importDay1DecompositionFromText,
    phase: session.phase,
    resetDayDecompositions,
    resetDayProblems,
  });

  return (
    <>
      <section className={cx("card")}>
        {session.phase === "study" && currentItem ? (
          <StudySessionTopBar
            canUseDayWordActions={canUseDayWordActions}
            currentItem={currentItem}
            goHome={goHome}
            isWordImportOpen={isWordImportOpen}
            markCurrentDayAttempt={markCurrentDayAttempt}
            openDayListDrawer={panelState.openDayListDrawer}
            primaryWordAction={primaryWordAction}
            runWordAction={runWordAction}
            session={session}
            sessionDay={sessionDay}
            sessionItems={sessionItems}
            setIsWordImportOpen={setIsWordImportOpen}
            setSession={setSession}
            setShowMeaning={panelState.setShowMeaning}
            setWordImportText={setWordImportText}
            showMeaning={panelState.showMeaning}
            studyTopInlineRef={panelState.studyTopInlineRef}
            submitWordImport={submitWordImport}
            wordImportText={wordImportText}
          />
        ) : (
          <SessionTopBar
            currentItem={currentItem}
            goHome={goHome}
            markCurrentDayAttempt={markCurrentDayAttempt}
            openStudyPopup={panelState.openStudyPopup}
            session={session}
            sessionDay={sessionDay}
            sessionItems={sessionItems}
            setSession={setSession}
          />
        )}

        {session.phase === "study" && currentItem && (
          <StudySessionContent
            copyCurrentWord={copyCurrentWord}
            copyDisplayId={copyDisplayId}
            currentItem={currentItem}
            getDisplayItemId={getDisplayItemId}
            renderKanjiWithReading={renderKanjiWithReading}
            setShowFurigana={panelState.setShowFurigana}
            showFurigana={panelState.showFurigana}
            updateMemo={updateMemo}
          />
        )}

        {session.phase === "quiz" && currentItem && (
          <>
            <QuizPane
              session={session}
              currentItem={currentItem}
              sessionItems={sessionItems}
              getDisplayItemId={getDisplayItemId}
              copyDisplayId={copyDisplayId}
              setSession={setSession}
              goPrevQuizItem={goPrevQuizItem}
              canGoQuizNext={canGoQuizNext}
              goNextQuizItem={goNextQuizItem}
              selectQuizChoice={selectQuizChoice}
              openProblemEditor={openProblemEditor}
              renderSentenceWithTarget={renderSentenceWithTarget}
            />
            <ProblemEditorPane
              problemEditor={problemEditor}
              setProblemEditor={setProblemEditor}
              currentItem={currentItem}
              saveProblemEditor={saveProblemEditor}
            />
          </>
        )}

        {session.phase === "done" && <SessionDonePanel goHome={goHome} session={session} />}
      </section>

      {session.phase === "study" && currentItem && (
        <StudySessionNav
          goNextStudyItem={goNextStudyItem}
          goPrevStudyItem={goPrevStudyItem}
          session={session}
          sessionItems={sessionItems}
        />
      )}

      {panelState.shouldRenderDrawer && currentItem && (
        <StudyPopupDrawer
          closeStudyPopup={panelState.closeStudyPopup}
          currentItem={currentItem}
          drawerRef={panelState.drawerRef}
          isDecompositionVisible={panelState.isDecompositionVisible}
          isResizing={panelState.isResizing}
          isStudyPopupClosing={panelState.studyDrawer.isClosing}
          setIsDecompositionVisible={panelState.setIsDecompositionVisible}
          startResize={panelState.startResize}
          studyDrawerWidth={layout.studyDrawerWidth}
        />
      )}

      {panelState.shouldRenderDayListDrawer && (
        <DayListDrawer
          closeDayListDrawer={panelState.closeDayListDrawer}
          copyDisplayId={copyDisplayId}
          currentItem={currentItem}
          dayItems={panelState.dayItems}
          dayListDrawerRef={panelState.dayListDrawerRef}
          dayListDrawerWidth={layout.dayListDrawerWidth}
          getDisplayItemId={getDisplayItemId}
          isDayListClosing={panelState.dayListDrawer.isClosing}
          isDayListResizing={panelState.isDayListResizing}
          jumpToDayItem={panelState.jumpToDayItem}
          sessionDay={sessionDay}
          startDayListResize={panelState.startDayListResize}
        />
      )}
    </>
  );
}
