import { getExpressionStrict } from "./expression.ts";

export function createDayClipboardActions({
  session,
  selectedUnit,
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
}) {
  const cloneProblemValue = (value) => {
    if (value === null) return null;
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  };

  const isMemoEmpty = (value) => String(value ?? "").trim().length === 0;

  const isProblemEmpty = (value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;
    if (typeof value !== "object") return false;

    const sentence = String(value?.sentence ?? "").trim();
    const target = String(value?.target ?? "").trim();
    const choices = Array.isArray(value?.choices)
      ? value.choices.map((choice) => String(choice).trim()).filter((choice) => choice.length > 0)
      : [];
    const answer = String(value?.answer ?? "").trim();

    return sentence.length === 0 && target.length === 0 && choices.length === 0 && answer.length === 0;
  };
  const buildAnswerFromKanjiToKana = (expression, kanjiToKana) => {
    const text = String(expression ?? "");
    const mapping = kanjiToKana && typeof kanjiToKana === "object" ? kanjiToKana : {};
    const entries = Object.entries(mapping)
      .filter(([base, reading]) => String(base).length > 0 && String(reading).length > 0)
      .map(([base, reading]) => [String(base), String(reading)])
      .sort((a, b) => b[0].length - a[0].length);

    if (!text) return "";
    if (entries.length === 0) return text;

    let answer = "";
    let index = 0;
    while (index < text.length) {
      const matched = entries.find(([base]) => text.startsWith(base, index));
      if (matched) {
        answer += matched[1];
        index += matched[0].length;
        continue;
      }
      answer += text[index];
      index += 1;
    }
    return answer.trim();
  };

  const copyDay1Words = () => {
    if (!session) return;
    const targetDay = getPathDay(stateCurriculum, {
      unitId: session.unitId,
      dayId: session.dayId,
    });
    if (!targetDay || !Array.isArray(targetDay.items) || targetDay.items.length === 0) return;

    const dayIndexLabel = getDisplayDayIndex(targetDay, 1);
    const payload = targetDay.items
      .filter(isQuizTarget)
      .map((item) => {
        const word = getExpressionStrict(item, "copyDay1Words.item");
        const kanjiToKana = item?.kanjiToKana ?? {};
        return {
          expression: word,
          kanjiToKana,
          answer: buildAnswerFromKanjiToKana(word, kanjiToKana),
          memoDecomposition: "",
          problem: item.problem === undefined ? null : item.problem,
        };
      })
      .filter((entry) => entry.expression.length > 0);

    if (payload.length === 0) return;
    copyTextViaMiddleware(JSON.stringify(payload)).then((ok) => {
      if (ok) {
        showToast(`Day${dayIndexLabel} 단어 ${payload.length}개 복사`);
      }
    });
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

  const applyDay1DecompositionImporter = async (rawText) => {
    if (!session || !selectedUnit) return;
    const targetDay = getPathDay(stateCurriculum, {
      unitId: session.unitId,
      dayId: session.dayId,
    });
    if (!targetDay) {
      showToast("현재 Day를 찾을 수 없습니다.", "error");
      return;
    }
    const dayIndexLabel = getDisplayDayIndex(targetDay, 1);

    let parsed;
    try {
      const normalized = normalizeJsonBlock(rawText);
      parsed = JSON.parse(normalized);
    } catch (error) {
      showToast("붙여넣은 JSON 파싱 실패", "error");
      return;
    }

    if (!Array.isArray(parsed)) {
      showToast("JSON은 배열 형태여야 합니다.", "error");
      return;
    }

    const mapByExpression = new Map();
    parsed.forEach((entry) => {
      const word = getExpressionStrict(entry, "applyDay1DecompositionImporter.entry");
      if (!word) return;
      const memoDecomposition = String(entry?.memoDecomposition ?? "")
        .split("\\r\\n")
        .join("\n")
        .split("\\n")
        .join("\n");
      const hasProblem = Object.prototype.hasOwnProperty.call(entry ?? {}, "problem");
      mapByExpression.set(word, {
        memoDecomposition,
        hasProblem,
        problem: hasProblem ? cloneProblemValue(entry.problem) : undefined,
      });
    });

    if (mapByExpression.size === 0) {
      showToast("가져올 항목이 없습니다.", "error");
      return;
    }

    const matchedItems = targetDay.items
      .filter((item) => mapByExpression.has(getExpressionStrict(item, "copyDay1Words.item")))
      .map((item) => ({
        item,
        payload: mapByExpression.get(getExpressionStrict(item, "copyDay1Words.item")),
      }));

    if (matchedItems.length === 0) {
      showToast(`Day${dayIndexLabel}에 일치하는 expression이 없어 반영하지 못했습니다.`, "error");
      return;
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
      return;
    }

    const path = {
      unitId: selectedUnit.id,
      dayId: targetDay.id,
    };

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
      curriculum: replaceDay(prev.curriculum, path, nextDay),
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
  };

  const importDay1DecompositionFromClipboard = async () => {
    try {
      const response = await fetch("/__api/clipboard-read");
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        const text = String(payload?.text ?? "");
        if (!text.trim()) {
          showToast("클립보드가 비어 있습니다.", "error");
          return false;
        }
        await applyDay1DecompositionImporter(text);
        return true;
      }
      const body = await response.text().catch(() => "");
      console.error("Failed to read clipboard:", response.status, body);
    } catch (error) {
      console.error("Failed to read clipboard:", error);
    }

    if (!navigator?.clipboard?.readText) {
      showToast("클립보드 읽기 권한이 필요합니다.", "error");
      return false;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        showToast("클립보드가 비어 있습니다.", "error");
        return false;
      }
      await applyDay1DecompositionImporter(text);
      return true;
    } catch (error) {
      showToast("클립보드 읽기 권한이 필요합니다.", "error");
      return false;
    }
  };

  const importDay1DecompositionFromText = async (text) => {
    const normalized = String(text ?? "");
    if (!normalized.trim()) {
      showToast("붙여넣은 내용이 비어 있습니다.", "error");
      return false;
    }
    await applyDay1DecompositionImporter(normalized);
    return true;
  };

  const resetDayDecompositions = async () => {
    if (!session) return;
    const targetDay = getPathDay(stateCurriculum, {
      unitId: session.unitId,
      dayId: session.dayId,
    });
    if (!targetDay || !Array.isArray(targetDay.items) || targetDay.items.length === 0) return;

    const dayIndexLabel = getDisplayDayIndex(targetDay, 1);
    const changedItems = targetDay.items.filter((item) => isQuizTarget(item) && String(item.memoDecomposition ?? "").length > 0);

    if (changedItems.length === 0) {
      showToast(`Day${dayIndexLabel} 분해 초기화할 항목이 없습니다.`);
      return;
    }

    const path = {
      unitId: session.unitId,
      dayId: session.dayId,
    };

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
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));

    await Promise.all(changedItems.map((item) => persistSourceField(item, "memoDecomposition", "")));

    showToast(`Day${dayIndexLabel} 분해 초기화 ${changedItems.length}개 완료`);
  };

  const resetDayProblems = async () => {
    if (!session) return;
    const targetDay = getPathDay(stateCurriculum, {
      unitId: session.unitId,
      dayId: session.dayId,
    });
    if (!targetDay || !Array.isArray(targetDay.items) || targetDay.items.length === 0) return;

    const dayIndexLabel = getDisplayDayIndex(targetDay, 1);
    const changedItems = targetDay.items.filter((item) => isQuizTarget(item) && !isProblemEmpty(item.problem));

    if (changedItems.length === 0) {
      showToast(`Day${dayIndexLabel} 문제 초기화할 항목이 없습니다.`);
      return;
    }

    const path = {
      unitId: session.unitId,
      dayId: session.dayId,
    };

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
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));

    await Promise.all(changedItems.map((item) => persistSourceField(item, "problem", null)));

    showToast(`Day${dayIndexLabel} 문제 초기화 ${changedItems.length}개 완료`);
  };

  return {
    copyDay1Words,
    copyCurrentWord,
    importDay1DecompositionFromClipboard,
    importDay1DecompositionFromText,
    resetDayDecompositions,
    resetDayProblems,
  };
}


