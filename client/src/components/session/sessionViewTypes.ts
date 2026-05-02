import type React from "react";
import type { QuizResult, SessionMode, SessionPhase, SessionView as DomainSessionView } from "../../domain/studyTypes.ts";

export type { QuizResult, SessionMode, SessionPhase };
export type SessionView = DomainSessionView;

export type SessionItemView = {
  id: string;
  lastResult?: QuizResult;
  meaningKo?: string;
  memoDecomposition?: string;
  memoPersonal?: string;
  problem?: unknown;
  reading?: string;
  [key: string]: unknown;
};

export type SessionDayView = {
  id?: string;
  items?: SessionItemView[];
  title: string;
  [key: string]: unknown;
};

export type SetSession = React.Dispatch<React.SetStateAction<SessionView | null>>;
export type SetBoolean = React.Dispatch<React.SetStateAction<boolean>>;
export type SetString = React.Dispatch<React.SetStateAction<string>>;

export type ProblemDraft = {
  answer: string;
  choicesText: string;
  jsonText: string;
  mode: "form" | "json";
  sentence: string;
  target: string;
};

export type ProblemEditorState = {
  draft: ProblemDraft;
  error: string;
  open: boolean;
};

export type SetProblemEditor = React.Dispatch<React.SetStateAction<ProblemEditorState>>;
