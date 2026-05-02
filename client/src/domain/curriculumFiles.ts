import { apiFetch, apiUrl } from "../api.ts";
import { createInitialState, getAvailableBooks } from "../data/initialState.ts";
import { loadState } from "../data/storage.ts";
import { mergeCurriculumFromSource } from "./curriculumSource.ts";
import {
  DEFAULT_DAY_LIST_DRAWER_WIDTH,
  DEFAULT_STUDY_DRAWER_WIDTH,
  normalizeDayListDrawerWidth,
  normalizeStudyDrawerWidth,
} from "./drawerPreferences.ts";
import {
  isStateCompatible,
  normalizeDailyNewLearningCount,
  sanitizeCurriculum,
} from "./studyHelpers.ts";
import { isValidLearningPath } from "./learningPath.ts";

export type AssetFileMap = Record<string, unknown>;
export type AvailableBook = { id: string; title: string };

export async function loadCurriculumFiles() {
  const response = await apiFetch(apiUrl("reload-curriculum", { t: Date.now() }), {
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to load curriculum: ${response.status} ${body}`);
  }

  const payload = await response.json();
  if (!payload?.ok || !payload?.files) {
    throw new Error("Failed to load curriculum: invalid response");
  }
  return payload.files as AssetFileMap;
}

export function getDefaultBookId(availableBooks: AvailableBook[]) {
  return availableBooks.find((b) => b.id === "jlpt-one-book-n1")?.id ?? availableBooks[0]?.id ?? "";
}

export function listAvailableBooks(files: AssetFileMap) {
  return getAvailableBooks(files);
}

export function buildAppState(bookId: string, assetFiles: AssetFileMap) {
  const initial = createInitialState(bookId, assetFiles);
  const sanitizedInitial = {
    ...initial,
    curriculum: sanitizeCurriculum(initial.curriculum),
    dailyNewLearningCount: 1,
    learningPlan: { date: "", count: 1, paths: [] },
    studyDrawerWidth: DEFAULT_STUDY_DRAWER_WIDTH,
    dayListDrawerWidth: DEFAULT_DAY_LIST_DRAWER_WIDTH,
  };
  const saved = loadState(bookId);
  if (!saved) return sanitizedInitial;
  if (isStateCompatible(saved, initial)) {
    const sourceCurriculum = sanitizeCurriculum(mergeCurriculumFromSource(saved.curriculum, assetFiles));
    const merged = {
      ...sanitizedInitial,
      ...saved,
      curriculum: sourceCurriculum,
    };
    const normalizedCount = normalizeDailyNewLearningCount(merged.dailyNewLearningCount);
    const savedPaths = Array.isArray(merged.learningPlan?.paths)
      ? merged.learningPlan.paths.filter(isValidLearningPath)
      : [];
    return {
      ...merged,
      dailyNewLearningCount: normalizedCount,
      studyDrawerWidth: normalizeStudyDrawerWidth(merged.studyDrawerWidth),
      dayListDrawerWidth: normalizeDayListDrawerWidth(merged.dayListDrawerWidth),
      learningPlan: {
        date: typeof merged.learningPlan?.date === "string" ? merged.learningPlan.date : "",
        count: normalizeDailyNewLearningCount(merged.learningPlan?.count ?? normalizedCount),
        paths: savedPaths,
      },
    };
  }
  return sanitizedInitial;
}
