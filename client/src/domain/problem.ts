export function normalizeProblem(problem) {
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
    return {
      sentence: String(problem.sentence ?? "").trim(),
      target: String(problem.target ?? "").trim(),
      choices: Array.isArray(problem.choices)
        ? problem.choices.map((choice) => String(choice).trim()).filter((choice) => choice.length > 0)
        : [],
      answer: String(problem.answer ?? "").trim(),
      exampleSentence: problem.exampleSentence ?? null,
    };
  }

  return null;
}

export function createProblemDraft(problem) {
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

export function normalizeJsonBlock(text) {
  const trimmed = String(text ?? "").trim();
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;
}

export function buildProblemPayload(draft, previousProblem) {
  if (draft.mode === "json") {
    try {
      const parsed = JSON.parse(String(draft.jsonText ?? "").trim());
      const sentence = String(parsed?.sentence ?? "").trim();
      const target = String(parsed?.target ?? "").trim();
      const choices = Array.isArray(parsed?.choices)
        ? parsed.choices.map((choice) => String(choice).trim()).filter((choice) => choice.length > 0)
        : [];
      const answer = String(parsed?.answer ?? "").trim();

      if (!sentence) {
        return { error: "JSON의 sentence가 비어 있습니다.", problem: null };
      }
      if (choices.length < 2) {
        return { error: "JSON의 choices는 2개 이상이어야 합니다.", problem: null };
      }
      if (answer && !choices.includes(answer)) {
        return { error: "JSON의 answer는 choices 중 하나여야 합니다.", problem: null };
      }

      const previous = typeof previousProblem === "object" && previousProblem ? previousProblem : {};
      return {
        error: "",
        problem: {
          ...previous,
          sentence,
          target,
          choices,
          answer,
          exampleSentence: previous.exampleSentence ?? null,
        },
      };
    } catch (error) {
      return {
        error: "유효한 JSON 형식이 아닙니다.",
        problem: null,
      };
    }
  }

  const sentence = draft.sentence.trim();
  const target = draft.target.trim();
  const choices = draft.choicesText
    .split(/\r?\n/)
    .map((choice) => choice.trim())
    .filter((choice) => choice.length > 0);
  const answer = draft.answer.trim();

  if (!sentence) {
    return {
      error: "문제를 입력하세요.",
      problem: null,
    };
  }

  if (choices.length < 2) {
    return {
      error: "보기는 2개 이상 입력하세요. (한 줄에 하나)",
      problem: null,
    };
  }

  if (answer && !choices.includes(answer)) {
    return {
      error: "정답은 보기 중 하나여야 합니다.",
      problem: null,
    };
  }

  const previous = typeof previousProblem === "object" && previousProblem ? previousProblem : {};
  return {
    error: "",
    problem: {
      ...previous,
      sentence,
      target,
      choices,
      answer,
      exampleSentence: previous.exampleSentence ?? null,
    },
  };
}
