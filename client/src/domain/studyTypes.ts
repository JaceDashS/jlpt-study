import type React from "react";

export type QuizResult = "PASS" | "FAIL" | "NEUTRAL";

export type LearningPath = {
  unitId: string;
  dayId: string;
};

export type SourceRef = {
  sourcePath: string;
  unitPath?: string | null;
  dayIndex: number;
  displayDayIndex?: number;
  itemIndex: number;
};

export type StudyProblem = {
  sentence?: string;
  target?: string;
  choices: string[];
  answer?: string;
  answerText?: string;
  exampleSentence?: unknown;
  problemType?: string;
};

export type StudyItem = {
  id: string;
  expression?: string;
  reading?: string;
  meaningKo?: string;
  kanjiToKana?: Record<string, string>;
  problem?: unknown;
  sourceRef?: SourceRef | null;
  stage?: number;
  nextReviewDate?: string | null;
  lastResult?: QuizResult;
  lastAttemptDate?: string;
  memoDecomposition?: string;
  memoPersonal?: string;
  [key: string]: unknown;
};

export type StudyDay = {
  id: string;
  title: string;
  dayIndex?: number;
  stage?: number;
  stageCompleteDate?: string | null;
  nextReviewDate?: string | null;
  lastAttemptDate?: string;
  lastCompletedDate?: string;
  items: StudyItem[];
  [key: string]: unknown;
};

export type StudyUnit = {
  id: string;
  title: string;
  days: StudyDay[];
  [key: string]: unknown;
};

export type StudyState = {
  schemaVersion: number;
  curriculum: StudyUnit[];
  totalDay?: number;
  dailyNewLearningCount?: number;
  learningPlan?: {
    date?: string;
    count?: number;
    paths?: LearningPath[];
  };
  studyDrawerWidth?: number;
  dayListDrawerWidth?: number;
  [key: string]: unknown;
};

export type SessionPhase = "study" | "quiz" | "done";
export type SessionMode = "learning" | "review";

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

export type SetStudyState = React.Dispatch<React.SetStateAction<StudyState>>;
export type SetSession = React.Dispatch<React.SetStateAction<SessionView | null>>;
