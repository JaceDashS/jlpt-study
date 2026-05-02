import type { LearningPath } from "../../domain/studyTypes.ts";

export type OverallMeta = {
  avgStageRatio: number;
  completedDays: number;
  completedRatio: number;
  maxDayIndex: number;
  uniqueDayTotal: number;
};

export type DateRangeMeta = {
  elapsedDays: number;
  ratio: number;
  remainingDays: number;
  totalDays: number;
  valid: boolean;
};

export type PlanRange = {
  start: string;
  end: string;
};

export type AllDayRow = {
  dayTitle: string;
  failCount: number;
  passRatio: number;
  path: LearningPath;
};

export type ActionDoneState = Partial<Record<"copy" | "input", boolean>>;
