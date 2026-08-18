import React from "react";
import { AutoGrowTextarea, Sheet } from "../common/Primitives.tsx";
import type { WordActionType } from "./useSessionWordActions.ts";

// 예전 UI에서는 hover 드롭다운이라 폰에서 열 수 없었다. 시트로 바꿔 두 모드 모두에서 쓴다.
export function WordActionsSheet({
  canUseDayWordActions,
  isWordImportOpen,
  onClose,
  runWordAction,
  setWordImportText,
  submitWordImport,
  wordImportText,
}: {
  canUseDayWordActions: boolean;
  isWordImportOpen: boolean;
  onClose: () => void;
  runWordAction: (actionType: WordActionType) => void;
  setWordImportText: React.Dispatch<React.SetStateAction<string>>;
  submitWordImport: () => void;
  wordImportText: string;
}) {
  return (
    <Sheet title="단어 데이터" onClose={onClose}>
      <div className="jc-action-grid">
        <button type="button" className="jc-action-btn" disabled={!canUseDayWordActions} onClick={() => runWordAction("copy")}>
          <strong>단어 복사</strong>
          <span>이 Day의 학습 단어 JSON을 클립보드로</span>
        </button>
        <button type="button" className="jc-action-btn" disabled={!canUseDayWordActions} onClick={() => runWordAction("input")}>
          <strong>디컴포지션 입력</strong>
          <span>클립보드 JSON을 이 Day에 반영</span>
        </button>
        <button
          type="button"
          className="jc-action-btn"
          disabled={!canUseDayWordActions}
          onClick={() => runWordAction("resetDecomposition")}
        >
          <strong>분해 초기화</strong>
          <span>디컴포지션 메모를 비웁니다</span>
        </button>
        <button
          type="button"
          className="jc-action-btn"
          disabled={!canUseDayWordActions}
          onClick={() => runWordAction("resetProblem")}
        >
          <strong>문제 초기화</strong>
          <span>이 Day의 문제를 비웁니다</span>
        </button>
      </div>

      {isWordImportOpen && (
        <div className="jc-stack">
          <span className="jc-memo-label">JSON 붙여넣기</span>
          <AutoGrowTextarea
            className="jc-textarea"
            rows={6}
            value={wordImportText}
            placeholder="여기에 Day JSON을 붙여넣으세요"
            onChange={(event) => setWordImportText(event.target.value)}
          />
          <div className="jc-row">
            <button type="button" className="jc-btn" data-variant="primary" onClick={submitWordImport}>
              가져오기
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
