import { apiUrl } from "../api.ts";

type ToastType = "success" | "error";

type AssetBackupActionsOptions = {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  refreshCurriculumFromSource: () => Promise<void>;
  showToast: (message: string, type?: ToastType) => void;
};

export function createAssetBackupActions({
  apiFetch,
  refreshCurriculumFromSource,
  showToast,
}: AssetBackupActionsOptions) {
  const backupAssets = async () => {
    const ok = window.confirm("asset 전체를 단일 백업 파일로 저장할까요?");
    if (!ok) return;
    try {
      const runBackup = (force = false) =>
        apiFetch(apiUrl("asset-backup/export"), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ force }),
        });

      let response = await runBackup(false);
      if (response.status === 409) {
        const warningPayload = await response.json().catch(() => ({}));
        const findings = Array.isArray(warningPayload?.findings) ? warningPayload.findings : [];
        const warningCount = Number(warningPayload?.findingCount ?? findings.length);
        const warningPreview = findings.slice(0, 5).join("\n");
        const proceed = window.confirm(
          [
            `모지바케 ${warningCount}건이 감지되었습니다.`,
            "계속하면 모지바케를 포함한 상태로 백업이 진행됩니다.",
            warningPreview ? "" : undefined,
            warningPreview || undefined,
            "",
            "계속 진행할까요?",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        if (!proceed) return;
        response = await runBackup(true);
      }

      if (!response.ok) {
        const body = await response.text();
        console.error("Failed to backup assets:", response.status, body);
        showToast("에셋 백업 실패", "error");
        return;
      }
      const payload = await response.json();
      const warningSuffix = payload?.mojibakeIncluded ? ` (모지바케 ${payload?.mojibakeCount ?? 0}건 포함)` : "";
      showToast(`에셋 백업 완료: ${payload?.backupFile ?? "backup/asset-full-backup.json"}${warningSuffix}`);
    } catch (error) {
      console.error("Failed to backup assets:", error);
      showToast("에셋 백업 실패", "error");
    }
  };

  const restoreAssets = async () => {
    const ok = window.confirm("백업 파일로 asset 전체를 복구할까요? 현재 파일이 덮어써질 수 있습니다.");
    if (!ok) return;
    try {
      const response = await apiFetch(apiUrl("asset-backup/import"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error("Failed to restore assets:", response.status, body);
        showToast("에셋 복구 실패", "error");
        return;
      }
      await refreshCurriculumFromSource();
      showToast("에셋 복구 완료");
    } catch (error) {
      console.error("Failed to restore assets:", error);
      showToast("에셋 복구 실패", "error");
    }
  };

  return { backupAssets, restoreAssets };
}
