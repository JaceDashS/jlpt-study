import { getExpressionStrict } from "./expression.ts";
import type { StudyItem } from "./studyTypes.ts";

export type ImportPayload = {
  memoDecomposition: string;
  hasProblem: boolean;
  problem?: unknown;
};

export function cloneProblemValue(value: unknown) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

export function isMemoEmpty(value: unknown) {
  return String(value ?? "").trim().length === 0;
}

export function isProblemEmpty(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value !== "object") return false;

  const problem = value as { sentence?: unknown; target?: unknown; choices?: unknown; answer?: unknown };
  const sentence = String(problem?.sentence ?? "").trim();
  const target = String(problem?.target ?? "").trim();
  const choices = Array.isArray(problem?.choices)
    ? problem.choices.map((choice) => String(choice).trim()).filter((choice) => choice.length > 0)
    : [];
  const answer = String(problem?.answer ?? "").trim();

  return sentence.length === 0 && target.length === 0 && choices.length === 0 && answer.length === 0;
}

export function buildAnswerFromKanjiToKana(expression: string, kanjiToKana: unknown) {
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
}

export function buildDayWordCopyPayload(items: StudyItem[], isQuizTarget: (item: StudyItem) => boolean) {
  return items
    .filter(isQuizTarget)
    .map((item) => {
      const word = getExpressionStrict(item, "copyDayWords.item");
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
}

export function buildImportPayloadByExpression(parsed: unknown[]) {
  const mapByExpression = new Map<string, ImportPayload>();
  parsed.forEach((entry) => {
    const word = getExpressionStrict(entry, "applyDayDecompositionImporter.entry");
    if (!word) return;
    const source = entry && typeof entry === "object" ? (entry as { memoDecomposition?: unknown; problem?: unknown }) : {};
    const memoDecomposition = String(source.memoDecomposition ?? "")
      .split("\\r\\n")
      .join("\n")
      .split("\\n")
      .join("\n");
    const hasProblem = Object.prototype.hasOwnProperty.call(entry ?? {}, "problem");
    mapByExpression.set(word, {
      memoDecomposition,
      hasProblem,
      problem: hasProblem ? cloneProblemValue(source.problem) : undefined,
    });
  });

  return mapByExpression;
}
