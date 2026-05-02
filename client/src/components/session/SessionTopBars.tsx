import React from "react";
import { AutoGrowTextarea } from "../EditorControls.tsx";
import { cx } from "../../styles.ts";
import type { SessionDayView, SessionItemView, SessionView, SetBoolean, SetSession, SetString } from "./sessionViewTypes.ts";

type WordActionType = "copy" | "input" | "resetDecomposition" | "resetProblem";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M3 10.5L12 3l9 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 9.5V20h13V9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WordActionControls({
  canUseDayWordActions,
  isWordImportOpen,
  primaryWordAction,
  runWordAction,
  setIsWordImportOpen,
  setWordImportText,
  submitWordImport,
  wordImportText,
}: {
  canUseDayWordActions: boolean;
  isWordImportOpen: boolean;
  primaryWordAction: "copy" | "input";
  runWordAction: (actionType: WordActionType) => void;
  setIsWordImportOpen: SetBoolean;
  setWordImportText: SetString;
  submitWordImport: () => void;
  wordImportText: string;
}) {
  return (
    <>
      <div className={cx("word-action-dropdown")}>
        <button
          type="button"
          className={cx("action word-action-main")}
          disabled={!canUseDayWordActions}
          onClick={() => runWordAction(primaryWordAction)}
        >
          {primaryWordAction === "copy" ? "\uB2E8\uC5B4 \uBCF5\uC0AC" : "\uB2E8\uC5B4 \uC785\uB825"}
        </button>
        <button
          type="button"
          className={cx("action word-action-toggle")}
          aria-label={"\uB2E8\uC5B4 \uC561\uC158 \uBAA9\uB85D"}
          disabled={!canUseDayWordActions}
        >
          {"\u25BE"}
        </button>
        <div className={cx("word-action-menu")} role="menu" aria-label={"\uB2E8\uC5B4 \uC561\uC158"}>
          <button type="button" className={cx("word-action-menu-item")} role="menuitem" onClick={() => runWordAction("copy")}>
            {"\uB2E8\uC5B4 \uBCF5\uC0AC"}
          </button>
          <button type="button" className={cx("word-action-menu-item")} role="menuitem" onClick={() => runWordAction("input")}>
            {"\uB2E8\uC5B4 \uC785\uB825"}
          </button>
          <button
            type="button"
            className={cx("word-action-menu-item")}
            role="menuitem"
            onClick={() => runWordAction("resetDecomposition")}
          >
            {"\uBD84\uD574 \uCD08\uAE30\uD654"}
          </button>
          <button
            type="button"
            className={cx("word-action-menu-item")}
            role="menuitem"
            onClick={() => runWordAction("resetProblem")}
          >
            {"\uBB38\uC81C \uCD08\uAE30\uD654"}
          </button>
        </div>
      </div>
      {isWordImportOpen && (
        <div className={cx("word-import-panel")}>
          <p className={cx("word-import-title")}>{"JSON \uBD99\uC5EC\uB123\uAE30"}</p>
          <AutoGrowTextarea
            value={wordImportText}
            onChange={(event) => setWordImportText(event.target.value)}
            placeholder={"\uC5EC\uAE30\uC5D0 Day JSON\uC744 \uBD99\uC5EC\uB123\uC73C\uC138\uC694"}
            className={cx("word-import-textarea")}
            rows={6}
          />
          <div className={cx("word-import-actions")}>
            <button type="button" className={cx("action")} onClick={submitWordImport}>
              {"\uAC00\uC838\uC624\uAE30"}
            </button>
            <button
              type="button"
              className={cx("action")}
              onClick={() => {
                setWordImportText("");
                setIsWordImportOpen(false);
              }}
            >
              {"\uB2EB\uAE30"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function StudySessionTopBar({
  canUseDayWordActions,
  currentItem,
  isWordImportOpen,
  markCurrentDayAttempt,
  openDayListDrawer,
  primaryWordAction,
  runWordAction,
  session,
  sessionDay,
  sessionItems,
  setIsWordImportOpen,
  setSession,
  setShowMeaning,
  setWordImportText,
  showMeaning,
  studyTopInlineRef,
  submitWordImport,
  goHome,
  wordImportText,
}: {
  canUseDayWordActions: boolean;
  currentItem: SessionItemView;
  goHome: () => void;
  isWordImportOpen: boolean;
  markCurrentDayAttempt: () => void;
  openDayListDrawer: () => void;
  primaryWordAction: "copy" | "input";
  runWordAction: (actionType: WordActionType) => void;
  session: SessionView;
  sessionDay: SessionDayView;
  sessionItems: SessionItemView[];
  setIsWordImportOpen: SetBoolean;
  setSession: SetSession;
  setShowMeaning: SetBoolean;
  setWordImportText: SetString;
  showMeaning: boolean;
  studyTopInlineRef: React.RefObject<HTMLElement>;
  submitWordImport: () => void;
  wordImportText: string;
}) {
  return (
    <div className={cx("study-top")}>
      <div ref={studyTopInlineRef} className={cx("study-top-inline")}>
        <div className={cx("study-top-left")}>
          <button type="button" className={cx("action")} onClick={() => setSession(null)}>
            {"\u2190"}
          </button>
          <button
            type="button"
            className={cx("action")}
            disabled={Boolean(session.postQuizStudy)}
            onClick={() => {
              markCurrentDayAttempt();
              setSession((prev) => ({
                ...prev,
                phase: "quiz",
                index: prev.index,
              }));
            }}
          >
            {"\u554f"}
          </button>
          <button type="button" className={cx("action")} onClick={goHome} aria-label={"\uD648"}>
            <HomeIcon />
          </button>
          <button type="button" className={cx("action")} onClick={openDayListDrawer} aria-label={"\uD55C\uC790 \uBAA9\uB85D"}>
            {"\uBAA9\uB85D"}
          </button>
        </div>
        <div className={cx("study-top-center")}>
          <span className={cx("study-top-text")}>{sessionDay.title}</span>
          <span className={cx("study-top-text")}>
            {session.index + 1}/{sessionItems.length}
          </span>
          {showMeaning && <span className={cx("kanji-meaning")}>{"\uB73B"}: {currentItem.meaningKo}</span>}
        </div>
        <div className={cx("study-top-right")}>
          <button
            type="button"
            className={cx(`study-meaning-toggle ${showMeaning ? "on" : "off"}`)}
            onClick={() => setShowMeaning((prev) => !prev)}
            aria-label={"\uB73B \uD45C\uC2DC \uD1A0\uAE00"}
            aria-pressed={showMeaning}
          >
            <span className={cx("study-meaning-thumb")} />
          </button>
          <WordActionControls
            canUseDayWordActions={canUseDayWordActions}
            isWordImportOpen={isWordImportOpen}
            primaryWordAction={primaryWordAction}
            runWordAction={runWordAction}
            setIsWordImportOpen={setIsWordImportOpen}
            setWordImportText={setWordImportText}
            submitWordImport={submitWordImport}
            wordImportText={wordImportText}
          />
        </div>
      </div>
    </div>
  );
}

export function SessionTopBar({
  currentItem,
  markCurrentDayAttempt,
  openStudyPopup,
  session,
  sessionDay,
  sessionItems,
  setSession,
  goHome,
}: {
  currentItem: SessionItemView | null;
  goHome: () => void;
  markCurrentDayAttempt: () => void;
  openStudyPopup: () => void;
  session: SessionView;
  sessionDay: SessionDayView;
  sessionItems: SessionItemView[];
  setSession: SetSession;
}) {
  return (
    <div className={cx("study-top")}>
      <div className={cx("study-top-inline")}>
        <div className={cx("study-top-left")}>
          <button type="button" className={cx("action")} onClick={() => setSession(null)}>
            {"\u2190"}
          </button>
          <button
            type="button"
            className={cx("action")}
            disabled={session.phase === "done"}
            onClick={() => {
              if (session.phase !== "quiz") {
                markCurrentDayAttempt();
              }

              setSession((prev) => ({
                ...prev,
                phase: prev.phase === "quiz" ? "study" : "quiz",
                index: prev.index,
              }));
            }}
          >
            {session.phase === "quiz" ? "\u5b66" : "\u554f"}
          </button>
          <button type="button" className={cx("action")} onClick={goHome} aria-label={"\uD648"}>
            <HomeIcon />
          </button>
        </div>
        <div className={cx("study-top-center")}>
          <span className={cx("study-top-text")}>{sessionDay.title}</span>
          <span className={cx("study-top-text")}>
            {session.phase === "done" ? "-" : session.index + 1}/{sessionItems.length}
          </span>
        </div>
        <div className={cx("study-top-right")}>
          {session.phase === "quiz" && currentItem && (
            <button type="button" className={cx("action")} onClick={openStudyPopup}>
              {"\uD604\uC7AC \uB2E8\uC5B4 \uD559\uC2B5"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
