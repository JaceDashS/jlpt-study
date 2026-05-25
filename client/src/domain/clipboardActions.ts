type ToastType = "success" | "error";

export type HomeDueDebugRow = {
  dayLevelDue: boolean;
  dayTitle: string;
  itemDueCount: number;
  nextReviewDate: unknown;
  stage: unknown;
  totalItems: number;
  unitTitle: string;
};

type ClipboardActionsOptions = {
  debugLogs: string[];
  homeDueDebug: HomeDueDebugRow[];
  showToast: (message: string, type?: ToastType) => void;
};

export function createClipboardActions({ debugLogs, homeDueDebug, showToast }: ClipboardActionsOptions) {
  const copyTextViaMiddleware = async (text) => {
    const normalized = String(text ?? "");
    const copyWithNavigator = async () => {
      try {
        if (typeof navigator === "undefined" || !navigator?.clipboard?.writeText) return false;
        await navigator.clipboard.writeText(normalized);
        return true;
      } catch (error) {
        console.error("Failed to copy text with navigator.clipboard:", error);
        return false;
      }
    };

    const copyWithLegacyCommand = () => {
      try {
        if (typeof document === "undefined" || !document?.execCommand || !document.body) return false;
        const textarea = document.createElement("textarea");
        textarea.value = normalized;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        try {
          textarea.focus();
          textarea.select();
          textarea.setSelectionRange(0, textarea.value.length);
          return document.execCommand("copy");
        } finally {
          document.body.removeChild(textarea);
        }
      } catch (error) {
        console.error("Failed to copy text with document.execCommand:", error);
        return false;
      }
    };

    if (await copyWithNavigator()) return true;
    if (copyWithLegacyCommand()) return true;
    return false;
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
