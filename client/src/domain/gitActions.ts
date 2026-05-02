import { apiUrl } from "../api.ts";

type ToastType = "success" | "error";

type GitActionsOptions = {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  showToast: (message: string, type?: ToastType) => void;
};

export type StudyCommitPushResult =
  | { status: "committed"; stagedFileCount: number }
  | { status: "no-changes" }
  | { status: "error"; message: string };

export function createGitActions({ apiFetch, showToast }: GitActionsOptions) {
  const commitStudyChanges = async (): Promise<StudyCommitPushResult> => {
    showToast("study 커밋/푸쉬 시작...");
    try {
      const response = await apiFetch(apiUrl("git-study-commit-push"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error("Failed to commit and push study changes:", response.status, payload);
        const message = String(payload?.error ?? "study 커밋/푸쉬 실패");
        showToast(message, "error");
        return { status: "error", message };
      }

      if (!payload?.committed) {
        showToast("커밋할 변경사항이 없습니다. push는 확인했습니다.");
        return { status: "no-changes" };
      }

      const stagedFileCount = Number(payload?.stagedFileCount ?? 0);
      showToast(`study 커밋/푸쉬 완료 (${stagedFileCount}개 파일)`);
      return { status: "committed", stagedFileCount };
    } catch (error) {
      console.error("Failed to commit and push study changes:", error);
      showToast("study 커밋/푸쉬 실패", "error");
      return { status: "error", message: String(error instanceof Error ? error.message : error) };
    }
  };

  return { commitStudyChanges };
}
