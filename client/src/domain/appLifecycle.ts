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
    if (session) return;
    console.log("[home] today:", today, "reviewDue:", reviewDueCount);
  }, [session, stateCurriculum, today, reviewDueCount]);
}
