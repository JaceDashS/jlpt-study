import React, { useEffect, useRef, useState } from "react";
import { AutoGrowTextarea, MemoEditor } from "./EditorControls.tsx";
import { QuizPane } from "./session/QuizPane.tsx";
import { ProblemEditorPane } from "./session/ProblemEditorPane.tsx";
import { cx } from "../styles.ts";
import { renderSimpleMarkdown } from "../domain/markdown.ts";
import { getExpressionStrict } from "../domain/expression.ts";

const DRAWER_ANIMATION_MS = 240;

export function SessionPanel({
  session,
  sessionDay,
  currentItem,
  sessionItems,
  currentSessionDayIndex,
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
  finalizeQuiz,
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
}) {
  if (!session || !sessionDay) return null;

  const [isStudyPopupOpen, setIsStudyPopupOpen] = useState(false);
  const [isStudyPopupClosing, setIsStudyPopupClosing] = useState(false);
  const [isDayListOpen, setIsDayListOpen] = useState(false);
  const [isDayListClosing, setIsDayListClosing] = useState(false);
  const [isDecompositionVisible, setIsDecompositionVisible] = useState(false);
  const [showFurigana, setShowFurigana] = useState(true);
  const [showMeaning, setShowMeaning] = useState(true);
  const [primaryWordAction, setPrimaryWordAction] = useState<"copy" | "input">("copy");
  const [isWordImportOpen, setIsWordImportOpen] = useState(false);
  const [wordImportText, setWordImportText] = useState("");
  const [isResizing, setIsResizing] = useState(false);
  const [isDayListResizing, setIsDayListResizing] = useState(false);
  const closeTimerRef = useRef(null);
  const dayListCloseTimerRef = useRef(null);
  const drawerRef = useRef(null);
  const dayListDrawerRef = useRef(null);
  const studyTopInlineRef = useRef(null);
  const resizeStateRef = useRef({ active: false, startX: 0, startWidth: 0 });
  const dayListResizeStateRef = useRef({ active: false, startX: 0, startWidth: 0 });

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const clearDayListCloseTimer = () => {
    if (dayListCloseTimerRef.current) {
      clearTimeout(dayListCloseTimerRef.current);
      dayListCloseTimerRef.current = null;
    }
  };

  const closeStudyPopup = () => {
    if (!isStudyPopupOpen || isStudyPopupClosing) return;
    setIsStudyPopupClosing(true);
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsStudyPopupOpen(false);
      setIsStudyPopupClosing(false);
      closeTimerRef.current = null;
    }, DRAWER_ANIMATION_MS);
  };

  const openStudyPopup = () => {
    clearCloseTimer();
    setIsStudyPopupClosing(false);
    setIsStudyPopupOpen(true);
    setIsDecompositionVisible(false);
  };

  const closeDayListDrawer = () => {
    if (!isDayListOpen || isDayListClosing) return;
    setIsDayListClosing(true);
    clearDayListCloseTimer();
    dayListCloseTimerRef.current = window.setTimeout(() => {
      setIsDayListOpen(false);
      setIsDayListClosing(false);
      dayListCloseTimerRef.current = null;
    }, DRAWER_ANIMATION_MS);
  };

  const openDayListDrawer = () => {
    clearDayListCloseTimer();
    setIsDayListClosing(false);
    setIsDayListOpen(true);
  };

  useEffect(() => {
    clearCloseTimer();
    setIsStudyPopupOpen(false);
    setIsStudyPopupClosing(false);
    setIsDecompositionVisible(false);
  }, [session.phase, currentItem?.id]);

  useEffect(() => {
    if (session.phase !== "study") {
      setIsWordImportOpen(false);
      setWordImportText("");
    }
  }, [session.phase]);

  useEffect(() => {
    if (session.phase === "study") return;
    clearDayListCloseTimer();
    setIsDayListOpen(false);
    setIsDayListClosing(false);
  }, [session.phase]);

  useEffect(
    () => () => {
      clearCloseTimer();
      clearDayListCloseTimer();
    },
    [],
  );

  useEffect(() => {
    if (session.phase !== "study" || !currentItem) return undefined;
    const el = studyTopInlineRef.current;
    if (!el) return undefined;

    const applyBestSize = () => {
      const maxSize = 16;
      const minSize = 10;
      const step = 0.25;

      let selected = maxSize;
      for (let size = maxSize; size >= minSize; size -= step) {
        el.style.setProperty("--study-top-size", `${size}px`);
        const fitsWidth = el.scrollWidth <= el.clientWidth + 1;
        const fitsHeight = el.scrollHeight <= el.clientHeight + 1;
        if (fitsWidth && fitsHeight) {
          selected = size;
          break;
        }
        selected = Math.max(minSize, size - step);
      }

      el.style.setProperty("--study-top-size", `${selected}px`);
    };

    applyBestSize();

    const observer = new ResizeObserver(() => {
      applyBestSize();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [session.phase, currentItem?.id, sessionItems.length]);

  useEffect(() => {
    if ((!isStudyPopupOpen || isStudyPopupClosing) && (!isDayListOpen || isDayListClosing)) return undefined;

    const onDocumentMouseDown = (event) => {
      if (drawerRef.current?.contains(event.target) || dayListDrawerRef.current?.contains(event.target)) {
        return;
      }
      if (isStudyPopupOpen && !isStudyPopupClosing) {
        closeStudyPopup();
      }
      if (isDayListOpen && !isDayListClosing) {
        closeDayListDrawer();
      }
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, [isStudyPopupOpen, isStudyPopupClosing, isDayListOpen, isDayListClosing]);

  useEffect(() => {
    if (session.phase !== "quiz" || !currentItem) return undefined;

    const isTextInputTarget = (target) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return target.isContentEditable;
    };

    const onKeyDown = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTextInputTarget(event.target)) return;
      if (event.code !== "Backquote") return;

      event.preventDefault();
      if (isStudyPopupOpen && !isStudyPopupClosing) {
        closeStudyPopup();
        return;
      }
      openStudyPopup();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [session.phase, currentItem?.id, isStudyPopupOpen, isStudyPopupClosing]);

  useEffect(() => {
    if (!isResizing) return undefined;

    const onMouseMove = (event) => {
      const state = resizeStateRef.current;
      if (!state.active) return;
      const delta = state.startX - event.clientX;
      const maxByViewport = Math.max(360, window.innerWidth - 24);
      const nextWidth = Math.max(360, Math.min(Math.min(980, maxByViewport), state.startWidth + delta));
      setStudyDrawerWidth(nextWidth);
    };

    const onMouseUp = () => {
      resizeStateRef.current.active = false;
      setIsResizing(false);
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, setStudyDrawerWidth]);

  useEffect(() => {
    if (!isDayListResizing) return undefined;

    const onMouseMove = (event) => {
      const state = dayListResizeStateRef.current;
      if (!state.active) return;
      const delta = event.clientX - state.startX;
      const maxByViewport = Math.max(280, window.innerWidth - 24);
      const nextWidth = Math.max(280, Math.min(Math.min(860, maxByViewport), state.startWidth + delta));
      setDayListDrawerWidth(nextWidth);
    };

    const onMouseUp = () => {
      dayListResizeStateRef.current.active = false;
      setIsDayListResizing(false);
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDayListResizing, setDayListDrawerWidth]);

  const startResize = (event) => {
    event.preventDefault();
    resizeStateRef.current = {
      active: true,
      startX: event.clientX,
      startWidth: Number(studyDrawerWidth) || 520,
    };
    document.body.style.userSelect = "none";
    setIsResizing(true);
  };

  const startDayListResize = (event) => {
    event.preventDefault();
    dayListResizeStateRef.current = {
      active: true,
      startX: event.clientX,
      startWidth: Number(dayListDrawerWidth) || 420,
    };
    document.body.style.userSelect = "none";
    setIsDayListResizing(true);
  };

  const markCurrentDayAttempt = () =>
    markDayAttemptNow({
      unitId: session.unitId,
      dayId: session.dayId,
    });
  const canUseDayWordActions = !!sessionDay && Array.isArray(sessionDay.items) && sessionDay.items.length > 0;
  const runWordAction = (actionType: "copy" | "input" | "resetDecomposition" | "resetProblem") => {
    if (!canUseDayWordActions) return;
    if (actionType === "copy") {
      setIsWordImportOpen(false);
      copyDay1Words();
      setPrimaryWordAction("input");
      return;
    }
    if (actionType === "resetDecomposition") {
      setIsWordImportOpen(false);
      resetDayDecompositions();
      setPrimaryWordAction("copy");
      return;
    }
    if (actionType === "resetProblem") {
      setIsWordImportOpen(false);
      resetDayProblems();
      setPrimaryWordAction("copy");
      return;
    }
    importDay1DecompositionFromClipboard().then((applied) => {
      if (applied) {
        setWordImportText("");
        setIsWordImportOpen(false);
      } else {
        setIsWordImportOpen(true);
      }
      setPrimaryWordAction("copy");
    });
  };

  const submitWordImport = async () => {
    const applied = await importDay1DecompositionFromText(wordImportText);
    if (!applied) return;
    setWordImportText("");
    setIsWordImportOpen(false);
    setPrimaryWordAction("copy");
  };

  const shouldRenderDrawer = session.phase === "quiz" && currentItem && (isStudyPopupOpen || isStudyPopupClosing);
  const shouldRenderDayListDrawer = session.phase === "study" && (isDayListOpen || isDayListClosing);
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
                  aria-label={"뜻 표시 토글"}
                  aria-pressed={showMeaning}
                >
                  <span className={cx("study-meaning-thumb")} />
                </button>
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
                    <button
                      type="button"
                      className={cx("word-action-menu-item")}
                      role="menuitem"
                      onClick={() => runWordAction("copy")}
                    >
                      {"\uB2E8\uC5B4 \uBCF5\uC0AC"}
                    </button>
                    <button
                      type="button"
                      className={cx("word-action-menu-item")}
                      role="menuitem"
                      onClick={() => runWordAction("input")}
                    >
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
                    <p className={cx("word-import-title")}>JSON 붙여넣기</p>
                    <AutoGrowTextarea
                      value={wordImportText}
                      onChange={(event) => setWordImportText(event.target.value)}
                      placeholder={"여기에 Day JSON을 붙여넣으세요"}
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
              </div>
            </div>
          </div>
        ) : (
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
        )}

        {session.phase === "study" && currentItem && (
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
              {currentItem.lastResult === "PASS" && <span className={cx("kanji-last-result pass")}>정답</span>}
              {currentItem.lastResult === "FAIL" && <span className={cx("kanji-last-result fail")}>오답</span>}
              <button type="button" className={cx("action kanji-copy-action")} onClick={copyCurrentWord} disabled={!currentItem}>
                {"copy"}
              </button>
              <button
                type="button"
                className={cx(`kanji-furigana-toggle ${showFurigana ? "on" : "off"}`)}
                onClick={() => setShowFurigana((prev) => !prev)}
                aria-label={"후리가나 표시 토글"}
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

        {session.phase === "done" && (
          <div className={cx("study")}>
            {session.mode === "review" && (
              <p className={cx("done pass-text")}>
                {"\uC624\uB298 \uBCF5\uC2B5 \uBC18\uC601 \uC644\uB8CC. PASS"} {session.passCount}/{session.reviewedCount}
              </p>
            )}
            {session.mode === "learning" && (
              <p className={cx(session.allPass ? "done pass-text" : "done fail-text")}>
                {session.allPass
                  ? "FAIL \uC5C6\uC74C. \uD68C\uCC28\uAC00 \uC0C1\uC2B9\uD588\uC2B5\uB2C8\uB2E4."
                  : "FAIL \uC874\uC7AC. \uD68C\uCC28 \uC720\uC9C0."}
              </p>
            )}
            <button type="button" className={cx("action")} onClick={goHome}>
              {"\uD655\uC778"}
            </button>
          </div>
        )}
      </section>

      {session.phase === "study" && currentItem && (
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
      )}

      {shouldRenderDrawer && (
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
      )}

      {shouldRenderDayListDrawer && (
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
      )}
    </>
  );
}
