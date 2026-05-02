import type React from "react";

export type SessionPhase = "study" | "quiz" | "done";
export type SessionMode = "learning" | "review";
export type QuizResult = "PASS" | "FAIL" | "NEUTRAL";

export type SessionView = {
  allPass?: boolean | null;
  choiceOrders?: Record<string, string[]>;
  dayId: string;
  graded?: Record<string, QuizResult>;
  index: number;
  itemIds?: string[];
  mode: SessionMode;
  passCount?: number;
  phase: SessionPhase;
  postQuizStudy?: boolean;
  reviewedCount?: number;
  selectedChoices?: Record<string, string>;
  showChoices?: Record<string, boolean>;
  showMemoPersonal?: Record<string, boolean>;
  unitId: string;
};

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
