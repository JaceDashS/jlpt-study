import React from "react";
import { createProblemDraft } from "../../domain/problem.ts";
import { AutoGrowTextarea, Sheet } from "../common/Primitives.tsx";
import type { ProblemEditorState, SessionItemView, SetProblemEditor } from "./sessionViewTypes.ts";

export function ProblemEditorSheet({
  currentItem,
  problemEditor,
  saveProblemEditor,
  setProblemEditor,
}: {
  currentItem: SessionItemView | null;
  problemEditor: ProblemEditorState;
  saveProblemEditor: () => void;
  setProblemEditor: SetProblemEditor;
}) {
  if (!problemEditor.open || !currentItem) return null;

  const close = () =>
    setProblemEditor({
      open: false,
      draft: createProblemDraft(currentItem.problem),
      error: "",
    });

  const patchDraft = (patch: Partial<ProblemEditorState["draft"]>) =>
    setProblemEditor((prev) => ({ ...prev, draft: { ...prev.draft, ...patch }, error: "" }));

  return (
    <Sheet title="문제 편집" onClose={close}>
      <div className="jc-segment" style={{ justifySelf: "start" }}>
        <button type="button" data-active={problemEditor.draft.mode === "form"} onClick={() => patchDraft({ mode: "form" })}>
          폼
        </button>
        <button type="button" data-active={problemEditor.draft.mode === "json"} onClick={() => patchDraft({ mode: "json" })}>
          JSON
        </button>
      </div>

      {problemEditor.draft.mode === "json" ? (
        <AutoGrowTextarea
          className="jc-textarea"
          value={problemEditor.draft.jsonText}
          onChange={(event) => patchDraft({ jsonText: event.target.value })}
          placeholder={'{\n  "sentence": "문장",\n  "target": "대상",\n  "choices": ["보기1", "보기2"],\n  "answer": "보기1"\n}'}
        />
      ) : (
        <>
          <label className="jc-field">
            <span>문제 문장</span>
            <AutoGrowTextarea
              className="jc-textarea"
              value={problemEditor.draft.sentence}
              onChange={(event) => patchDraft({ sentence: event.target.value })}
              placeholder="문제 문장을 입력하세요."
            />
          </label>
          <label className="jc-field">
            <span>보기 (한 줄에 하나)</span>
            <AutoGrowTextarea
              className="jc-textarea"
              value={problemEditor.draft.choicesText}
              onChange={(event) => patchDraft({ choicesText: event.target.value })}
              placeholder={"こう\nごう\nほう\nぼう"}
            />
          </label>
          <label className="jc-field">
            <span>정답</span>
            <AutoGrowTextarea
              className="jc-textarea"
              style={{ minHeight: 44 }}
              value={problemEditor.draft.answer}
              onChange={(event) => patchDraft({ answer: event.target.value })}
              placeholder="정답 보기 텍스트"
            />
          </label>
        </>
      )}

      {problemEditor.error && (
        <p className="jc-verdict" data-result="FAIL">
          {problemEditor.error}
        </p>
      )}

      <div className="jc-row">
        <button type="button" className="jc-btn" data-variant="primary" onClick={saveProblemEditor}>
          저장
        </button>
        <button type="button" className="jc-btn" onClick={close}>
          취소
        </button>
      </div>
    </Sheet>
  );
}
