import { apiFetch, apiUrl } from "../api.ts";
import { getExpressionStrict } from "./expression.ts";
import { buildDayWordCopyPayload } from "./dayClipboardHelpers.ts";
import {
  applyDayDecompositionImport,
  resetDayDecompositions,
  resetDayProblems,
} from "./dayClipboardImporter.ts";
import type { LearningPath, SetStudyState, StudyDay, StudyItem, StudyUnit } from "./studyTypes.ts";

type ToastType = "success" | "error";
type PersistSourceField = (item: StudyItem, field: string, value: unknown) => Promise<void>;

type DayClipboardActionsOptions = {
  session: { unitId: string; dayId: string } | null;
  stateCurriculum: StudyUnit[];
  currentItem: StudyItem | null;
  copyTextViaMiddleware: (text: string) => Promise<boolean>;
  showToast: (message: string, type?: ToastType) => void;
  setState: SetStudyState;
  persistSourceField: PersistSourceField;
  isQuizTarget: (item: StudyItem) => boolean;
  getPathDay: (curriculum: StudyUnit[], path: LearningPath) => StudyDay | null;
  getDisplayDayIndex: (day: StudyDay, sequenceIndexFallback: number) => number;
  normalizeJsonBlock: (text: string) => string;
  replaceDay: (curriculum: StudyUnit[], targetPath: LearningPath, nextDay: StudyDay) => StudyUnit[];
};

export function createDayClipboardActions({
  session,
  stateCurriculum,
  currentItem,
  copyTextViaMiddleware,
  showToast,
  setState,
  persistSourceField,
  isQuizTarget,
  getPathDay,
  getDisplayDayIndex,
  normalizeJsonBlock,
  replaceDay,
}: DayClipboardActionsOptions) {
  const getSessionPath = () => {
    if (!session) return null;
    return {
      unitId: session.unitId,
      dayId: session.dayId,
    };
  };

  const normalizeTargetPath = (pathOverride?: LearningPath | null) => {
    if (pathOverride?.unitId && pathOverride?.dayId) {
      return {
        unitId: pathOverride.unitId,
        dayId: pathOverride.dayId,
      };
    }
    return getSessionPath();
  };

  const getTargetDay = (pathOverride: LearningPath | undefined = undefined) => {
    const targetPath = normalizeTargetPath(pathOverride);
    if (!targetPath) {
      return {
        targetDay: null,
        targetPath: null,
      };
    }

    return {
      targetDay: getPathDay(stateCurriculum, targetPath),
      targetPath,
    };
  };

  const copyDayWordsForPath = async (pathOverride: LearningPath | undefined = undefined) => {
    const { targetDay } = getTargetDay(pathOverride);
    if (!targetDay || !Array.isArray(targetDay.items) || targetDay.items.length === 0) return false;

    const dayIndexLabel = getDisplayDayIndex(targetDay, 1);
    const payload = buildDayWordCopyPayload(targetDay.items, isQuizTarget);

    if (payload.length === 0) return false;
    const ok = await copyTextViaMiddleware(JSON.stringify(payload));
    if (ok) {
      showToast(`Day${dayIndexLabel} 단어 ${payload.length}개 복사`);
    } else {
      showToast(`Day${dayIndexLabel} 단어 복사 실패`, "error");
    }
    return ok;
  };

  const copyDay1Words = () => {
    void copyDayWordsForPath();
  };

  const copyCurrentWord = () => {
    if (!currentItem) return;
    const word = getExpressionStrict(currentItem, "copyCurrentWord.currentItem");
    if (!word) return;
    copyTextViaMiddleware(word).then((ok) => {
      if (ok) {
        showToast("현재 단어 복사");
      } else {
        showToast("현재 단어 복사 실패", "error");
      }
    });
  };

  const applyDayDecompositionImporter = async (rawText: string, pathOverride?: LearningPath) => {
    const { targetDay, targetPath } = getTargetDay(pathOverride);
    if (!targetDay || !targetPath) {
      showToast("현재 Day를 찾을 수 없습니다.", "error");
      return false;
    }

    return applyDayDecompositionImport({
      getDisplayDayIndex,
      isQuizTarget,
      normalizeJsonBlock,
      persistSourceField,
      rawText,
      replaceDay,
      setState,
      showToast,
      targetDay,
      targetPath,
    });
  };

  const importDayDecompositionFromClipboardForPath = async (pathOverride: LearningPath | undefined = undefined) => {
    const middlewareText = await readClipboardViaMiddleware(showToast);
    if (middlewareText !== null) {
      return applyDayDecompositionImporter(middlewareText, pathOverride);
    }

    const browserText = await readClipboardViaBrowser(showToast);
    if (browserText === null) return false;
    return applyDayDecompositionImporter(browserText, pathOverride);
  };

  const importDayDecompositionFromTextForPath = async (pathOverride: LearningPath | undefined, text: string) => {
    const normalized = String(text ?? "");
    if (!normalized.trim()) {
      showToast("붙여넣은 내용이 비어 있습니다.", "error");
      return false;
    }
    return applyDayDecompositionImporter(normalized, pathOverride);
  };

  const resetCurrentDayDecompositions = async () => {
    const { targetDay, targetPath } = getTargetDay();
    if (!targetDay || !targetPath || !Array.isArray(targetDay.items) || targetDay.items.length === 0) return;
    await resetDayDecompositions({
      getDisplayDayIndex,
      isQuizTarget,
      persistSourceField,
      replaceDay,
      setState,
      showToast,
      targetDay,
      targetPath,
    });
  };

  const resetCurrentDayProblems = async () => {
    const { targetDay, targetPath } = getTargetDay();
    if (!targetDay || !targetPath || !Array.isArray(targetDay.items) || targetDay.items.length === 0) return;
    await resetDayProblems({
      getDisplayDayIndex,
      isQuizTarget,
      persistSourceField,
      replaceDay,
      setState,
      showToast,
      targetDay,
      targetPath,
    });
  };

  return {
    copyDayWordsByPath: copyDayWordsForPath,
    copyDay1Words,
    copyCurrentWord,
    importDayDecompositionFromClipboardByPath: importDayDecompositionFromClipboardForPath,
    importDayDecompositionFromTextByPath: importDayDecompositionFromTextForPath,
    importDay1DecompositionFromClipboard: () => importDayDecompositionFromClipboardForPath(),
    importDay1DecompositionFromText: (text: string) => importDayDecompositionFromTextForPath(undefined, text),
    resetDayDecompositions: resetCurrentDayDecompositions,
    resetDayProblems: resetCurrentDayProblems,
  };
}

async function readClipboardViaMiddleware(showToast: (message: string, type?: ToastType) => void) {
  try {
    const response = await apiFetch(apiUrl("clipboard-read"), {
      credentials: "same-origin",
    });
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const text = String(payload?.text ?? "");
      if (!text.trim()) {
        showToast("클립보드가 비어 있습니다.", "error");
        return "";
      }
      return text;
    }
    const body = await response.text().catch(() => "");
    console.error("Failed to read clipboard:", response.status, body);
  } catch (error) {
    console.error("Failed to read clipboard:", error);
  }
  return null;
}

async function readClipboardViaBrowser(showToast: (message: string, type?: ToastType) => void) {
  if (!navigator?.clipboard?.readText) {
    showToast("클립보드 읽기 권한이 필요합니다.", "error");
    return null;
  }

  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      showToast("클립보드가 비어 있습니다.", "error");
      return null;
    }
    return text;
  } catch (error) {
    showToast("클립보드 읽기 권한이 필요합니다.", "error");
    return null;
  }
}
