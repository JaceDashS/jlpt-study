import { useEffect } from "react";
import { saveState } from "../data/storage.ts";

export function usePersistStudyState({ selectedBookId, state }) {
  useEffect(() => {
    saveState(state, selectedBookId);
  }, [state, selectedBookId]);
}

export function useRefreshCurriculumOnHomeFocus({ refreshCurriculumFromSource, session }) {
  useEffect(() => {
    if (session) return undefined;
    const onFocus = () => {
      refreshCurriculumFromSource();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshCurriculumFromSource, session]);
}

export function useHomeReviewDebugLog({ reviewDueCount, session, stateCurriculum, today }) {
  useEffect(() => {
    if (!isHomeReviewDebugLogEnabled()) return;
    if (session) return;
    console.log("[home] today:", today, "reviewDue:", reviewDueCount);
  }, [session, stateCurriculum, today, reviewDueCount]);
}

function isHomeReviewDebugLogEnabled() {
  const rawValue = String(import.meta.env.VITE_JPC_HOME_DEBUG ?? "").trim().toLowerCase();
  if (rawValue) {
    return ["1", "true", "yes", "on"].includes(rawValue);
  }
  return import.meta.env.DEV;
}
