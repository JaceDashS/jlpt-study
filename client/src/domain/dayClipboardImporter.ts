import { getExpressionStrict } from "./expression.ts";
import { buildImportPayloadByExpression, isMemoEmpty, isProblemEmpty } from "./dayClipboardHelpers.ts";
import type { LearningPath, SetStudyState, StudyDay, StudyItem, StudyUnit } from "./studyTypes.ts";

type ToastType = "success" | "error";
type PersistSourceField = (item: StudyItem, field: string, value: unknown) => Promise<void>;

type DayMutationOptions = {
  getDisplayDayIndex: (day: StudyDay, sequenceIndexFallback: number) => number;
  isQuizTarget: (item: StudyItem) => boolean;
  persistSourceField: PersistSourceField;
  replaceDay: (curriculum: StudyUnit[], targetPath: LearningPath, nextDay: StudyDay) => StudyUnit[];
  setState: SetStudyState;
  showToast: (message: string, type?: ToastType) => void;
};

type ApplyImportOptions = DayMutationOptions & {
  normalizeJsonBlock: (text: string) => string;
  rawText: string;
  targetDay: StudyDay;
  targetPath: LearningPath;
};

type ResetDayOptions = DayMutationOptions & {
  targetDay: StudyDay;
  targetPath: LearningPath;
};

export async function applyDayDecompositionImport({
  getDisplayDayIndex,
  normalizeJsonBlock,
  persistSourceField,
  rawText,
  replaceDay,
  setState,
  showToast,
  targetDay,
  targetPath,
}: ApplyImportOptions) {
  const dayIndexLabel = getDisplayDayIndex(targetDay, 1);

  let parsed;
  try {
    const normalized = normalizeJsonBlock(rawText);
    parsed = JSON.parse(normalized);
  } catch (error) {
    showToast("붙여넣은 JSON 파싱 실패", "error");
    return false;
  }

  if (!Array.isArray(parsed)) {
    showToast("JSON은 배열 형태여야 합니다.", "error");
    return false;
  }

  const mapByExpression = buildImportPayloadByExpression(parsed);

  if (mapByExpression.size === 0) {
    showToast("가져올 항목이 없습니다.", "error");
    return false;
  }

  const matchedItems = targetDay.items
    .filter((item) => mapByExpression.has(getExpressionStrict(item, "copyDayWords.item")))
    .map((item) => ({
      item,
      payload: mapByExpression.get(getExpressionStrict(item, "copyDayWords.item")),
    }));

  if (matchedItems.length === 0) {
    showToast(`Day${dayIndexLabel}에 일치하는 expression이 없어 반영하지 못했습니다.`, "error");
    return false;
  }

  const changedItems = matchedItems
    .map(({ item, payload }) => {
      const canWriteMemo = isMemoEmpty(item.memoDecomposition);
      const canWriteProblem = Boolean(payload?.hasProblem && isProblemEmpty(item.problem));
      return {
        item,
        payload,
        canWriteMemo,
        canWriteProblem,
      };
    })
    .filter((entry) => entry.canWriteMemo || entry.canWriteProblem);

  if (changedItems.length === 0) {
    showToast(`Day${dayIndexLabel} 기존 데이터가 있어 반영할 항목이 없습니다.`);
    return true;
  }

  const nextDay = {
    ...targetDay,
    items: targetDay.items.map((item) => {
      const matched = changedItems.find((changed) => changed.item.id === item.id);
      if (!matched) return item;

      return {
        ...item,
        ...(matched.canWriteMemo ? { memoDecomposition: matched.payload?.memoDecomposition ?? "" } : {}),
        ...(matched.canWriteProblem ? { problem: matched.payload?.problem } : {}),
      };
    }),
  };

  setState((prev) => ({
    ...prev,
    curriculum: replaceDay(prev.curriculum, targetPath, nextDay),
  }));

  await Promise.all(
    changedItems.flatMap(({ item, payload, canWriteMemo, canWriteProblem }) => {
      const tasks = [];
      if (canWriteMemo) {
        tasks.push(persistSourceField(item, "memoDecomposition", payload?.memoDecomposition ?? ""));
      }
      if (canWriteProblem) {
        tasks.push(persistSourceField(item, "problem", payload?.problem));
      }
      return tasks;
    }),
  );

  showToast(`Day${dayIndexLabel} 단어 입력 ${changedItems.length}개 반영됨`);
  return true;
}

export async function resetDayDecompositions({
  getDisplayDayIndex,
  isQuizTarget,
  persistSourceField,
  replaceDay,
  setState,
  showToast,
  targetDay,
  targetPath,
}: ResetDayOptions) {
  const dayIndexLabel = getDisplayDayIndex(targetDay, 1);
  const changedItems = targetDay.items.filter((item) => isQuizTarget(item) && String(item.memoDecomposition ?? "").length > 0);

  if (changedItems.length === 0) {
    showToast(`Day${dayIndexLabel} 분해 초기화할 항목이 없습니다.`);
    return;
  }

  const nextDay = {
    ...targetDay,
    items: targetDay.items.map((item) =>
      changedItems.some((changed) => changed.id === item.id)
        ? {
            ...item,
            memoDecomposition: "",
          }
        : item,
    ),
  };

  setState((prev) => ({
    ...prev,
    curriculum: replaceDay(prev.curriculum, targetPath, nextDay),
  }));

  await Promise.all(changedItems.map((item) => persistSourceField(item, "memoDecomposition", "")));

  showToast(`Day${dayIndexLabel} 분해 초기화 ${changedItems.length}개 완료`);
}

export async function resetDayProblems({
  getDisplayDayIndex,
  isQuizTarget,
  persistSourceField,
  replaceDay,
  setState,
  showToast,
  targetDay,
  targetPath,
}: ResetDayOptions) {
  const dayIndexLabel = getDisplayDayIndex(targetDay, 1);
  const changedItems = targetDay.items.filter((item) => isQuizTarget(item) && !isProblemEmpty(item.problem));

  if (changedItems.length === 0) {
    showToast(`Day${dayIndexLabel} 문제 초기화할 항목이 없습니다.`);
    return;
  }

  const nextDay = {
    ...targetDay,
    items: targetDay.items.map((item) =>
      changedItems.some((changed) => changed.id === item.id)
        ? {
            ...item,
            problem: null,
          }
        : item,
    ),
  };

  setState((prev) => ({
    ...prev,
    curriculum: replaceDay(prev.curriculum, targetPath, nextDay),
  }));

  await Promise.all(changedItems.map((item) => persistSourceField(item, "problem", null)));

  showToast(`Day${dayIndexLabel} 문제 초기화 ${changedItems.length}개 완료`);
}
