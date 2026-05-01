import { apiUrl } from "../api.ts";

type ToastType = "success" | "error";

type ClipboardActionsOptions = {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  debugLogs: string[];
  homeDueDebug: Array<{
    dayLevelDue: boolean;
    dayTitle: string;
    itemDueCount: number;
    nextReviewDate: unknown;
    stage: unknown;
    totalItems: number;
    unitTitle: string;
  }>;
  showToast: (message: string, type?: ToastType) => void;
};

export function createClipboardActions({ apiFetch, debugLogs, homeDueDebug, showToast }: ClipboardActionsOptions) {
  const copyTextViaMiddleware = async (text) => {
    const normalized = String(text ?? "");
    const copyWithNavigator = async () => {
      try {
        if (!navigator?.clipboard?.writeText) return false;
        await navigator.clipboard.writeText(normalized);
        return true;
      } catch (error) {
        console.error("Failed to copy text with navigator.clipboard:", error);
        return false;
      }
    };

    try {
      const response = await apiFetch(apiUrl("clipboard-write"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: normalized }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("Failed to copy text:", response.status, body);
        return copyWithNavigator();
      }
      return true;
    } catch (error) {
      console.error("Failed to copy text:", error);
      return copyWithNavigator();
    }
  };

  const copyDebugLogs = async () => {
    const reviewRows = homeDueDebug
      .filter((row) => row.itemDueCount > 0 || row.dayLevelDue)
      .slice(0, 20)
      .map(
        (row) =>
          `[review] ${row.unitTitle} / ${row.dayTitle} | stage ${row.stage} | next ${String(row.nextReviewDate)} | itemDue ${row.itemDueCount} | dayLevelDue ${String(row.dayLevelDue)} | total ${row.totalItems}`,
      );
    const text = [...debugLogs, ...reviewRows].join("\n");
    const ok = await copyTextViaMiddleware(text);
    showToast(ok ? "디버깅 로그 복사 완료" : "디버깅 로그 복사 실패", ok ? "success" : "error");
  };

  const copyDisplayId = async (displayId: string) => {
    const text = String(displayId ?? "").trim();
    if (!text) return;
    const ok = await copyTextViaMiddleware(text);
    showToast(ok ? `${text} 복사` : "ID 복사 실패", ok ? "success" : "error");
  };

  return { copyTextViaMiddleware, copyDebugLogs, copyDisplayId };
}
