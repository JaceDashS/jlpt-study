import React from "react";
import { normalizeProblem } from "../../domain/problem.ts";
import { getExpressionStrict } from "../../domain/expression.ts";
import { CopyableId } from "../common/Primitives.tsx";
import type { SessionItemView, SessionView, SetSession } from "./sessionViewTypes.ts";

export function QuizPane({
  copyDisplayId,
  currentItem,
  getDisplayItemId,
  openProblemEditor,
  renderSentenceWithTarget,
  selectQuizChoice,
  session,
  setSession,
}: {
  copyDisplayId: (id: string) => void;
  currentItem: SessionItemView;
  getDisplayItemId: (item: SessionItemView) => string;
  openProblemEditor: (problem: unknown) => void;
  renderSentenceWithTarget: (sentence: string, target: string) => React.ReactNode;
  selectQuizChoice: (choice: string) => void;
  session: SessionView;
  setSession: SetSession;
}) {
  const problem = normalizeProblem(currentItem.problem);
  const displayWord = getExpressionStrict(currentItem, "QuizPane.currentItem");
  const graded = session.graded?.[currentItem.id];
  const hasChoices = Boolean(problem && problem.choices.length > 0);
  const isChoiceVisible = Boolean(session.showChoices?.[currentItem.id] || session.selectedChoices?.[currentItem.id]);

  if (!problem || !hasChoices) {
    return (
      <>
        <div className="jc-row">
          <CopyableId id={getDisplayItemId(currentItem)} onCopy={copyDisplayId} />
        </div>
        <p className="jc-quiz-sentence">
          {problem ? renderSentenceWithTarget(problem.sentence, problem.target) : `${displayWord} (${currentItem.reading ?? ""})`}
        </p>
        <p className="jc-muted">{problem ? "보기가 없습니다." : "아직 문제가 없습니다."}</p>
        <button type="button" className="jc-btn" data-variant="primary" onClick={() => openProblemEditor(currentItem.problem)}>
          문제와 보기 추가하기
        </button>
      </>
    );
  }

  return (
    <>
      <div className="jc-row">
        <CopyableId id={getDisplayItemId(currentItem)} onCopy={copyDisplayId} />
      </div>

      <p className="jc-quiz-sentence">{renderSentenceWithTarget(problem.sentence, problem.target)}</p>

      {!isChoiceVisible ? (
        <button
          type="button"
          className="jc-btn"
          data-size="lg"
          onClick={() =>
            setSession((prev) =>
              prev && {
                ...prev,
                showChoices: { ...(prev.showChoices ?? {}), [currentItem.id]: true },
              },
            )
          }
        >
          보기 열기
        </button>
      ) : (
        <div className="jc-choices">
          {(session.choiceOrders?.[currentItem.id] ?? problem.choices).map((choice, index) => (
            <button
              key={`${index}-${choice}`}
              type="button"
              className="jc-choice"
              data-selected={session.selectedChoices?.[currentItem.id] === choice}
              onClick={() => selectQuizChoice(choice)}
            >
              <span className="jc-choice-key">{index + 1}</span>
              <span>{choice}</span>
            </button>
          ))}
        </div>
      )}

      {graded && (
        <p className="jc-verdict" data-result={graded}>
          {graded === "PASS" ? "정답입니다." : `오답입니다. 정답: ${problem.answer || "(미설정)"}`}
        </p>
      )}

      <button type="button" className="jc-btn" data-variant="ghost" onClick={() => openProblemEditor(currentItem.problem)}>
        문제 수정
      </button>
    </>
  );
}
