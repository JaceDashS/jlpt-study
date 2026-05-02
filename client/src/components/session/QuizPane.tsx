import React from "react";
import { normalizeProblem } from "../../domain/problem.ts";
import { getExpressionStrict } from "../../domain/expression.ts";
import { cx } from "../../styles.ts";
import type { SessionItemView, SessionView, SetSession } from "./sessionViewTypes.ts";

export function QuizPane({
  session,
  currentItem,
  sessionItems,
  getDisplayItemId,
  copyDisplayId,
  setSession,
  goPrevQuizItem,
  canGoQuizNext,
  goNextQuizItem,
  selectQuizChoice,
  openProblemEditor,
  renderSentenceWithTarget,
}: {
  canGoQuizNext: () => boolean;
  copyDisplayId: (id: string) => void;
  currentItem: SessionItemView | null;
  getDisplayItemId: (item: SessionItemView) => string;
  goNextQuizItem: () => void;
  goPrevQuizItem: () => void;
  openProblemEditor: (problem: unknown) => void;
  renderSentenceWithTarget: (sentence: string, target: string) => React.ReactNode;
  selectQuizChoice: (choice: string) => void;
  session: SessionView;
  sessionItems: SessionItemView[];
  setSession: SetSession;
}) {
  if (!currentItem) return null;
  const displayWord = getExpressionStrict(currentItem, "QuizPane.currentItem");

  const problem = normalizeProblem(currentItem.problem);

  return (
    <div className={cx("study")}>
      {!problem && (
        <div className={cx("quiz-question")}>
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
          <p className={cx("quiz-sentence")}>
            <strong>{displayWord}</strong> ({currentItem.reading}) 문제는 아직 없습니다.
          </p>
          <button type="button" className={cx("action")} onClick={() => openProblemEditor(currentItem.problem)}>
            문제와 보기 추가하기
          </button>
        </div>
      )}

      {problem && problem.choices.length === 0 && (
        <div className={cx("quiz-question")}>
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
          <p className={cx("quiz-sentence")}>
            <strong>{displayWord}</strong> ({currentItem.reading}) 문제에 보기가 없습니다.
          </p>
          <p>{renderSentenceWithTarget(problem.sentence, problem.target)}</p>
          <p className={cx("muted")}>보기가 없습니다. 문제와 보기를 추가해 주세요.</p>
          <button type="button" className={cx("action")} onClick={() => openProblemEditor(currentItem.problem)}>
            문제와 보기 추가하기
          </button>
        </div>
      )}

      {problem && problem.choices.length > 0 && (
        <>
          {(() => {
            const isChoiceVisible = Boolean(session.showChoices?.[currentItem.id] || session.selectedChoices?.[currentItem.id]);

            return (
              <>
                <div className={cx("quiz-question")}>
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
                  <p className={cx("quiz-sentence")}>{renderSentenceWithTarget(problem.sentence, problem.target)}</p>
                </div>
                {!isChoiceVisible && (
                  <button
                    type="button"
                    className={cx("action")}
                    onClick={() =>
                      setSession((prev) => ({
                        ...prev,
                        showChoices: {
                          ...(prev.showChoices ?? {}),
                          [currentItem.id]: true,
                        },
                      }))
                    }
                  >
                    show options
                  </button>
                )}
                {isChoiceVisible && (
                  <div className={cx("quiz-choices stack")}>
                    {(session.choiceOrders?.[currentItem.id] ?? problem.choices).map((choice, index) => (
                      <button
                        key={`${index}-${choice}`}
                        type="button"
                        className={cx(`action choice ${session.selectedChoices?.[currentItem.id] === choice ? "selected-choice" : ""}`)}
                        onClick={() => selectQuizChoice(choice)}
                      >
                        {`${index + 1}. ${choice}`}
                      </button>
                    ))}
                  </div>
                )}
                {session.graded?.[currentItem.id] && (
                  <p className={cx(session.graded[currentItem.id] === "PASS" ? "done pass-text" : "done fail-text")}>
                    {session.graded[currentItem.id] === "PASS" ? "정답입니다." : `오답입니다. 정답: ${problem.answer || "(미설정)"}`}
                  </p>
                )}
              </>
            );
          })()}
        </>
      )}

      <div className={cx("study-nav-fixed")} aria-label="문제 이동 버튼">
        <button
          type="button"
          className={cx("study-nav-arrow left")}
          disabled={session.index === 0}
          onClick={goPrevQuizItem}
          aria-label="이전 문제"
        >
          ←
        </button>
        <button
          type="button"
          className={cx("study-nav-arrow right")}
          disabled={!canGoQuizNext()}
          onClick={goNextQuizItem}
          aria-label={session.index === sessionItems.length - 1 ? "채점 완료" : "다음 문제"}
        >
          →
        </button>
      </div>
    </div>
  );
}



