import React, { useEffect, useRef, useState } from "react";
import { QuizPane } from "./session/QuizPane.tsx";
import { ProblemEditorPane } from "./session/ProblemEditorPane.tsx";
import { StudyPopupDrawer } from "./session/StudyPopupDrawer.tsx";
import { DayListDrawer } from "./session/DayListDrawer.tsx";
import { SessionTopBar, StudySessionTopBar } from "./session/SessionTopBars.tsx";
import { StudySessionContent, StudySessionNav } from "./session/StudySessionContent.tsx";
import { SessionDonePanel } from "./session/SessionDonePanel.tsx";
import { useSessionWordActions } from "./session/useSessionWordActions.ts";
import {
  useAnimatedDrawer,
  useDrawerOutsideDismiss,
  useResizableDrawer,
  useStudyPopupShortcut,
  useStudyTopAutoFit,
} from "./session/useSessionDrawers.ts";
import { cx } from "../styles.ts";
import type {
  ProblemEditorState,
  SessionDayView,
  SessionItemView,
  SessionView,
  SetProblemEditor,
  SetSession,
} from "./session/sessionViewTypes.ts";

type SessionPanelProps = {
  canGoQuizNext: () => boolean;
  copyCurrentWord: () => void;
  copyDay1Words: () => void;
  copyDisplayId: (id: string) => void;
  currentItem: SessionItemView | null;
  dayListDrawerWidth: number;
  getDisplayItemId: (item: SessionItemView) => string;
  goHome: () => void;
  goNextQuizItem: () => void;
  goNextStudyItem: () => void;
  goPrevQuizItem: () => void;
  goPrevStudyItem: () => void;
  importDay1DecompositionFromClipboard: () => Promise<boolean>;
  importDay1DecompositionFromText: (text: string) => Promise<boolean>;
  markDayAttemptNow: (path: { unitId: string; dayId: string }) => void;
  openProblemEditor: (problem: unknown) => void;
  problemEditor: ProblemEditorState;
  renderKanjiWithReading: (item: SessionItemView, options: { showReading: boolean }) => React.ReactNode;
  renderSentenceWithTarget: (sentence: string, target: string) => React.ReactNode;
  resetDayDecompositions: () => void;
  resetDayProblems: () => void;
  saveProblemEditor: () => void;
  selectQuizChoice: (choice: string) => void;
  session: SessionView;
  sessionDay: SessionDayView;
  sessionItems: SessionItemView[];
  setDayListDrawerWidth: (width: number) => void;
  setProblemEditor: SetProblemEditor;
  setSession: SetSession;
  setStudyDrawerWidth: (width: number) => void;
  studyDrawerWidth: number;
  updateMemo: (itemId: string, field: "memoPersonal" | "memoDecomposition", value: string) => void;
};

export function SessionPanel({
  session,
  sessionDay,
  currentItem,
  sessionItems,
  problemEditor,
  setProblemEditor,
  copyCurrentWord,
  copyDay1Words,
  importDay1DecompositionFromClipboard,
  importDay1DecompositionFromText,
  resetDayDecompositions,
  resetDayProblems,
  markDayAttemptNow,
  goPrevQuizItem,
  canGoQuizNext,
  goNextQuizItem,
  selectQuizChoice,
  openProblemEditor,
  saveProblemEditor,
  updateMemo,
  getDisplayItemId,
  copyDisplayId,
  renderKanjiWithReading,
  renderSentenceWithTarget,
  goPrevStudyItem,
  goNextStudyItem,
  setSession,
  goHome,
  studyDrawerWidth,
  setStudyDrawerWidth,
  dayListDrawerWidth,
  setDayListDrawerWidth,
}: SessionPanelProps) {
  if (!session || !sessionDay) return null;

  const studyDrawer = useAnimatedDrawer();
  const dayListDrawer = useAnimatedDrawer();
  const [isDecompositionVisible, setIsDecompositionVisible] = useState(false);
  const [showFurigana, setShowFurigana] = useState(true);
  const [showMeaning, setShowMeaning] = useState(true);
  const drawerRef = useRef<HTMLElement | null>(null);
  const dayListDrawerRef = useRef<HTMLElement | null>(null);
  const studyTopInlineRef = useRef<HTMLElement | null>(null);
  const { isResizing, startResize } = useResizableDrawer({
    defaultWidth: 520,
    maxWidth: 980,
    minWidth: 360,
    resizeFrom: "left",
    setWidth: setStudyDrawerWidth,
    width: studyDrawerWidth,
  });
  const { isResizing: isDayListResizing, startResize: startDayListResize } = useResizableDrawer({
    defaultWidth: 420,
    maxWidth: 860,
    minWidth: 280,
    resizeFrom: "right",
    setWidth: setDayListDrawerWidth,
    width: dayListDrawerWidth,
  });

  const openStudyPopup = () => {
    studyDrawer.open();
    setIsDecompositionVisible(false);
  };
  const closeStudyPopup = studyDrawer.close;
  const openDayListDrawer = dayListDrawer.open;
  const closeDayListDrawer = dayListDrawer.close;

  useStudyTopAutoFit({
    currentItemId: currentItem?.id,
    itemCount: sessionItems.length,
    phase: session.phase,
    studyTopInlineRef,
  });
  useDrawerOutsideDismiss({
    dayListDrawer,
    dayListDrawerRef,
    drawerRef,
    studyDrawer,
  });
  useStudyPopupShortcut({
    currentItemId: currentItem?.id,
    onClose: closeStudyPopup,
    onOpen: openStudyPopup,
    phase: session.phase,
    studyDrawer,
  });

  useEffect(() => {
    studyDrawer.reset();
    setIsDecompositionVisible(false);
  }, [session.phase, currentItem?.id]);

  useEffect(() => {
    if (session.phase === "study") return;
    dayListDrawer.reset();
  }, [session.phase]);

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

  const shouldRenderDrawer = session.phase === "quiz" && currentItem && (studyDrawer.isOpen || studyDrawer.isClosing);
  const shouldRenderDayListDrawer = session.phase === "study" && (dayListDrawer.isOpen || dayListDrawer.isClosing);
  const dayItems = Array.isArray(sessionDay?.items) ? sessionDay.items.filter(Boolean) : [];

  const jumpToDayItem = (itemId) => {
    const indexInCurrentSession = sessionItems.findIndex((item) => item?.id === itemId);
    if (indexInCurrentSession >= 0) {
      setSession((prev) => ({
        ...prev,
        index: indexInCurrentSession,
      }));
      closeDayListDrawer();
      return;
    }

    const allIds = dayItems.map((item) => item.id);
    const nextIndex = allIds.findIndex((id) => id === itemId);
    setSession((prev) => ({
      ...prev,
      itemIds: allIds,
      index: nextIndex >= 0 ? nextIndex : 0,
    }));
    closeDayListDrawer();
  };

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
            openDayListDrawer={openDayListDrawer}
            primaryWordAction={primaryWordAction}
            runWordAction={runWordAction}
            session={session}
            sessionDay={sessionDay}
            sessionItems={sessionItems}
            setIsWordImportOpen={setIsWordImportOpen}
            setSession={setSession}
            setShowMeaning={setShowMeaning}
            setWordImportText={setWordImportText}
            showMeaning={showMeaning}
            studyTopInlineRef={studyTopInlineRef}
            submitWordImport={submitWordImport}
            wordImportText={wordImportText}
          />
        ) : (
          <SessionTopBar
            currentItem={currentItem}
            goHome={goHome}
            markCurrentDayAttempt={markCurrentDayAttempt}
            openStudyPopup={openStudyPopup}
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
            setShowFurigana={setShowFurigana}
            showFurigana={showFurigana}
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

      {shouldRenderDrawer && (
        <StudyPopupDrawer
          closeStudyPopup={closeStudyPopup}
          currentItem={currentItem}
          drawerRef={drawerRef}
          isDecompositionVisible={isDecompositionVisible}
          isResizing={isResizing}
          isStudyPopupClosing={studyDrawer.isClosing}
          setIsDecompositionVisible={setIsDecompositionVisible}
          startResize={startResize}
          studyDrawerWidth={studyDrawerWidth}
        />
      )}

      {shouldRenderDayListDrawer && (
        <DayListDrawer
          closeDayListDrawer={closeDayListDrawer}
          copyDisplayId={copyDisplayId}
          currentItem={currentItem}
          dayItems={dayItems}
          dayListDrawerRef={dayListDrawerRef}
          dayListDrawerWidth={dayListDrawerWidth}
          getDisplayItemId={getDisplayItemId}
          isDayListClosing={dayListDrawer.isClosing}
          isDayListResizing={isDayListResizing}
          jumpToDayItem={jumpToDayItem}
          sessionDay={sessionDay}
          startDayListResize={startDayListResize}
        />
      )}
    </>
  );
}
