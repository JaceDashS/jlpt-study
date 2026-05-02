import { apiUrl } from "../api.ts";
import { clearState, saveState } from "../data/storage.ts";
import { mergeCurriculumFromSource } from "./curriculumSource.ts";
import { buildAppState } from "./curriculumFiles.ts";
import { sanitizeCurriculum } from "./studyHelpers.ts";

const SELECTED_BOOK_STORAGE_KEY = "jlpt-selected-book";

type CurriculumActionsOptions = {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  selectedBookId: string;
  setSelectedBookId: (bookId: string) => void;
  setSession: (session: unknown) => void;
  setSourceFiles: (files: Record<string, unknown>) => void;
  setState: (updater: any) => void;
  sourceFiles: Record<string, unknown>;
  state: any;
};

export function createCurriculumActions({
  apiFetch,
  selectedBookId,
  setSelectedBookId,
  setSession,
  setSourceFiles,
  setState,
  sourceFiles,
  state,
}: CurriculumActionsOptions) {
  const refreshCurriculumFromSource = async () => {
    try {
      const response = await apiFetch(apiUrl("reload-curriculum", { t: Date.now() }), {
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = await response.text();
        console.error("Failed to reload curriculum:", response.status, body);
        return;
      }

      const payload = await response.json();
      if (!payload?.ok || !payload?.files) {
        return;
      }

      setSourceFiles(payload.files);
      setState((prev) => ({
        ...prev,
        curriculum: sanitizeCurriculum(mergeCurriculumFromSource(prev.curriculum, payload.files)),
      }));
    } catch (error) {
      console.error("Failed to reload curriculum:", error);
    }
  };

  const goHome = async () => {
    await refreshCurriculumFromSource();
    setSession(null);
  };

  const resetLocalCache = () => {
    clearState(selectedBookId);
    window.location.reload();
  };

  const switchBook = (newBookId: string) => {
    if (newBookId === selectedBookId) return;
    saveState(state, selectedBookId);
    const newState = buildAppState(newBookId, sourceFiles);
    setState(newState);
    setSelectedBookId(newBookId);
    localStorage.setItem(SELECTED_BOOK_STORAGE_KEY, newBookId);
    setSession(null);
  };

  return { goHome, refreshCurriculumFromSource, resetLocalCache, switchBook };
}
