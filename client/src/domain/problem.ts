import type { ProblemDraft } from "../components/session/sessionViewTypes.ts";
import type { StudyProblem } from "./studyTypes.ts";
import {
  mergeProblemPayload,
  normalizeJsonBlock,
  readProblemPayloadFromDraft,
  validateProblemPayload,
} from "./problemPayload.ts";

export function normalizeProblem(problem: unknown): StudyProblem | null {
  if (!problem) return null;

  if (typeof problem === "string") {
    const sentence = problem.trim();
    if (!sentence) return null;
    return {
      sentence,
      target: "",
      choices: [],
      answer: "",
      exampleSentence: null,
    };
  }

  if (typeof problem === "object") {
    const value = problem as {
      answer?: unknown;
      choices?: unknown;
      exampleSentence?: unknown;
      sentence?: unknown;
      target?: unknown;
    };
    return {
      sentence: String(value.sentence ?? "").trim(),
      target: String(value.target ?? "").trim(),
      choices: Array.isArray(value.choices)
        ? value.choices.map((choice) => String(choice).trim()).filter((choice) => choice.length > 0)
        : [],
      answer: String(value.answer ?? "").trim(),
      exampleSentence: value.exampleSentence ?? null,
    };
  }

  return null;
}

export function createProblemDraft(problem: unknown): ProblemDraft {
  const normalized = normalizeProblem(problem);
  const jsonValue = normalized
    ? JSON.stringify(
        {
          sentence: normalized.sentence,
          target: normalized.target,
          choices: normalized.choices,
          answer: normalized.answer,
        },
        null,
        2,
      )
    : "";

  return {
    mode: "form",
    sentence: normalized?.sentence ?? "",
    target: normalized?.target ?? "",
    choicesText: (normalized?.choices ?? []).join("\n"),
    answer: normalized?.answer ?? "",
    jsonText: jsonValue,
  };
}

export { normalizeJsonBlock } from "./problemPayload.ts";

export function buildProblemPayload(draft: ProblemDraft, previousProblem: unknown) {
  const payload = readProblemPayloadFromDraft(draft);
  if ("error" in payload) {
    return {
      error: payload.error,
      problem: null,
    };
  }

  const error = validateProblemPayload(payload, draft.mode);
  if (error) {
    return {
      error,
      problem: null,
    };
  }

  return {
    error: "",
    problem: mergeProblemPayload(payload, previousProblem),
  };
}
