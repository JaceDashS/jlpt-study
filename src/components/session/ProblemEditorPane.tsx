import React from "react";
import { AutoGrowTextarea } from "../EditorControls.tsx";
import { createProblemDraft } from "../../domain/problem.ts";
import { cx } from "../../styles.ts";

export function ProblemEditorPane({ problemEditor, setProblemEditor, currentItem, saveProblemEditor }) {
  if (!problemEditor.open || !currentItem) return null;

  return (
    <div className={cx("problem-editor")}>
      <div className={cx("row")}>
        <button
          type="button"
          className={cx(`action ${problemEditor.draft.mode === "form" ? "active-tab" : ""}`)}
          onClick={() =>
            setProblemEditor((prev) => ({
              ...prev,
              draft: { ...prev.draft, mode: "form" },
              error: "",
            }))
          }
        >
          폼 입력
        </button>
        <button
          type="button"
          className={cx(`action ${problemEditor.draft.mode === "json" ? "active-tab" : ""}`)}
          onClick={() =>
            setProblemEditor((prev) => ({
              ...prev,
              draft: { ...prev.draft, mode: "json" },
              error: "",
            }))
          }
        >
          JSON 입력
        </button>
      </div>
      {problemEditor.draft.mode === "json" ? (
        <AutoGrowTextarea
          className={cx("memo-input")}
          value={problemEditor.draft.jsonText}
          onChange={(event) =>
            setProblemEditor((prev) => ({
              ...prev,
              draft: { ...prev.draft, jsonText: event.target.value },
              error: "",
            }))
          }
          placeholder={`{\n  "sentence": "문장",\n  "target": "대상",\n  "choices": ["보기1", "보기2"],\n  "answer": "보기1"\n}`}
        />
      ) : (
        <>
          <AutoGrowTextarea
            className={cx("memo-input")}
            value={problemEditor.draft.sentence}
            onChange={(event) =>
              setProblemEditor((prev) => ({
                ...prev,
                draft: { ...prev.draft, sentence: event.target.value },
                error: "",
              }))
            }
            placeholder="문제 문장을 입력하세요."
          />
          <AutoGrowTextarea
            className={cx("memo-input")}
            value={problemEditor.draft.choicesText}
            onChange={(event) =>
              setProblemEditor((prev) => ({
                ...prev,
                draft: { ...prev.draft, choicesText: event.target.value },
                error: "",
              }))
            }
            placeholder={"보기를 한 줄에 하나씩 입력하세요.\n예) こう\nごう\nほう\nぼう"}
          />
          <AutoGrowTextarea
            className={cx("memo-input")}
            value={problemEditor.draft.answer}
            onChange={(event) =>
              setProblemEditor((prev) => ({
                ...prev,
                draft: { ...prev.draft, answer: event.target.value },
                error: "",
              }))
            }
            placeholder="정답 보기 텍스트를 입력하세요."
          />
        </>
      )}
      {problemEditor.error && <p className={cx("error-text")}>{problemEditor.error}</p>}
      <div className={cx("row")}>
        <button type="button" className={cx("action")} onClick={saveProblemEditor}>
          저장
        </button>
        <button
          type="button"
          className={cx("action")}
          onClick={() =>
            setProblemEditor({
              open: false,
              draft: createProblemDraft(currentItem.problem),
              error: "",
            })
          }
        >
          취소
        </button>
      </div>
    </div>
  );
}
