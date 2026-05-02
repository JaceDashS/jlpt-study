import { apiUrl } from "../api.ts";

type ToastType = "success" | "error";

type GitActionsOptions = {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  showToast: (message: string, type?: ToastType) => void;
};

export function createGitActions({ apiFetch, showToast }: GitActionsOptions) {
  const commitStudyChanges = async () => {
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
        showToast(String(payload?.error ?? "study 커밋/푸쉬 실패"), "error");
        return;
      }

      if (!payload?.committed) {
        showToast("커밋할 변경사항이 없습니다.");
        return;
      }

      showToast(`study 커밋/푸쉬 완료 (${Number(payload?.stagedFileCount ?? 0)}개 파일)`);
    } catch (error) {
      console.error("Failed to commit and push study changes:", error);
      showToast("study 커밋/푸쉬 실패", "error");
    }
  };

  return { commitStudyChanges };
}
