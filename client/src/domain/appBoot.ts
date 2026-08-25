import { useEffect, useState } from "react";
import type { AssetFileMap, AvailableBook } from "./curriculumFiles.ts";
import { getDefaultBookId, listAvailableBooks, loadCurriculumFiles } from "./curriculumFiles.ts";
import { readAppPreferences, writeAppPreferences, type PlanRangePreference } from "./appPreferences.ts";
import type { SrsSettings } from "./srsPreferences.ts";

type BootState =
  | { status: "loading"; files: null; availableBooks: AvailableBook[]; selectedBookId: "" }
  | {
      status: "ready";
      dailyNewLearningCount?: number;
      srsSettings?: Partial<SrsSettings>;
      files: AssetFileMap;
      availableBooks: AvailableBook[];
      planRange?: Partial<PlanRangePreference>;
      selectedBookId: string;
    }
  | { status: "error"; files: null; availableBooks: AvailableBook[]; selectedBookId: ""; error: unknown };

export function useAppBoot() {
  const [boot, setBoot] = useState<BootState>({
    status: "loading",
    files: null,
    availableBooks: [],
    selectedBookId: "",
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCurriculumFiles(), readAppPreferences()])
      .then(([files, preferences]) => {
        if (cancelled) return;
        const availableBooks = listAvailableBooks(files);
        const defaultBookId = getDefaultBookId(availableBooks);
        const savedBookId = preferences.selectedBookId || readLegacySelectedBookId();
        const selectedBookId = availableBooks.some((book) => book.id === savedBookId) ? savedBookId : defaultBookId;
        if (!selectedBookId) {
          throw new Error("No curriculum books found");
        }
        void writeAppPreferences({
          selectedBookId,
          ...(preferences.dailyNewLearningCount ? { dailyNewLearningCount: preferences.dailyNewLearningCount } : {}),
          ...(preferences.srs ? { srs: preferences.srs } : {}),
          ...(preferences.planRange ? { planRange: preferences.planRange } : {}),
        });
        setBoot({
          status: "ready",
          dailyNewLearningCount: preferences.dailyNewLearningCount,
          srsSettings: preferences.srs,
          files,
          availableBooks,
          planRange: preferences.planRange,
          selectedBookId,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to boot app:", error);
        setBoot({ status: "error", files: null, availableBooks: [], selectedBookId: "", error });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return boot;
}

function readLegacySelectedBookId() {
  try {
    return localStorage.getItem("jlpt-selected-book") ?? "";
  } catch (error) {
    return "";
  }
}
