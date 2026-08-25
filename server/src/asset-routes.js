import fs from "node:fs/promises";
import path from "node:path";
import { readBody, sendJson, setApiLogDetail } from "./api-http.js";
import {
  createAssetSnapshot,
  findMojibakeInAssetJson,
  resolveAssetWritePath,
  restoreAssetSnapshot,
  stripBom,
} from "./asset-services.js";
import { getAllowedSourceFields, writeSourceDayResult, writeSourceField } from "./asset-write-service.js";

const ASSET_BACKUP_FILE = "backup/asset-full-backup.json";

export async function handleReloadCurriculum(res, { repoRoot }) {
  try {
    setApiLogDetail(res, { endpoint: "reload-curriculum" });
    const rootDir = path.resolve(repoRoot, "asset");
    const files = {};

    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }
        const relPath = path.relative(repoRoot, fullPath).replaceAll("\\", "/");
        const raw = await fs.readFile(fullPath, "utf8");
        files[relPath] = JSON.parse(stripBom(raw));
      }
    }

    await walk(rootDir);
    sendJson(res, 200, { ok: true, files });
  } catch (error) {
    console.error("reload-curriculum error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/reload-curriculum" });
  }
}

export async function handleAssetBackupExport(req, res, { repoRoot }) {
  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(stripBom(bodyText || "{}"));
    const force = Boolean(body?.force);
    setApiLogDetail(res, { endpoint: "asset-backup/export", force });
    const assetRoot = path.resolve(repoRoot, "asset");
    const mojibakeFindings = await findMojibakeInAssetJson(assetRoot);
    if (mojibakeFindings.length > 0 && !force) {
      sendJson(res, 409, {
        ok: false,
        requiresConfirm: true,
        warningType: "MOJIBAKE_DETECTED",
        message: "모지바케가 감지되었습니다. 계속하면 해당 내용을 포함해 백업합니다.",
        findings: mojibakeFindings.slice(0, 20),
        findingCount: mojibakeFindings.length,
      });
      return;
    }

    const snapshotFiles = await createAssetSnapshot(assetRoot);
    const backupBody = {
      version: 1,
      root: "asset",
      createdAt: new Date().toISOString(),
      files: snapshotFiles,
    };

    const backupPath = path.resolve(repoRoot, ASSET_BACKUP_FILE);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, `${JSON.stringify(backupBody, null, 2)}\n`, "utf8");

    sendJson(res, 200, {
      ok: true,
      backupFile: ASSET_BACKUP_FILE,
      fileCount: Object.keys(snapshotFiles).length,
      mojibakeIncluded: mojibakeFindings.length > 0,
      mojibakeCount: mojibakeFindings.length,
    });
  } catch (error) {
    console.error("asset-backup export error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/asset-backup/export" });
  }
}

export async function handleAssetBackupImport(res, { repoRoot }) {
  try {
    setApiLogDetail(res, { endpoint: "asset-backup/import" });
    const backupPath = path.resolve(repoRoot, ASSET_BACKUP_FILE);
    const raw = await fs.readFile(backupPath, "utf8");
    const parsed = JSON.parse(stripBom(raw));
    if (!parsed || typeof parsed !== "object" || typeof parsed.files !== "object") {
      throw new Error("Invalid backup file format");
    }

    const assetRoot = path.resolve(repoRoot, "asset");
    const result = await restoreAssetSnapshot(assetRoot, parsed.files);

    sendJson(res, 200, {
      ok: true,
      backupFile: ASSET_BACKUP_FILE,
      fileCount: Object.keys(parsed.files).length,
      skippedProtectedFileCount: result.skippedProtectedFileCount,
    });
  } catch (error) {
    console.error("asset-backup import error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/asset-backup/import" });
  }
}

export async function handleSaveItemField(req, res, enqueueWrite, { repoRoot }) {
  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(stripBom(bodyText || "{}"));

    const sourcePath = String(body?.sourcePath ?? "");
    const unitPath = String(body?.unitPath ?? "").trim() || null;
    const dayIndex = Number(body?.dayIndex);
    const itemIndex = Number(body?.itemIndex);
    const targetType = String(body?.targetType ?? "item");
    const field = String(body?.field ?? "");
    const value = body?.value ?? "";
    setApiLogDetail(res, {
      endpoint: "save-item-field",
      sourcePath,
      unitPath,
      dayIndex,
      itemIndex: targetType === "day" ? undefined : itemIndex,
      targetType,
      field,
    });

    if (!sourcePath.startsWith("asset/")) {
      sendJson(res, 400, { ok: false, error: "Invalid sourcePath" });
      return;
    }

    const filePath = resolveAssetWritePath(repoRoot, sourcePath);

    const allowedFields = getAllowedSourceFields(targetType);

    if (!allowedFields.includes(field)) {
      sendJson(res, 400, { ok: false, error: "Invalid field" });
      return;
    }

    if (!Number.isInteger(dayIndex)) {
      sendJson(res, 400, { ok: false, error: "Invalid dayIndex" });
      return;
    }

    if (targetType !== "day" && !Number.isInteger(itemIndex)) {
      sendJson(res, 400, { ok: false, error: "Invalid itemIndex" });
      return;
    }

    await enqueueWrite(filePath, async () => {
      await writeSourceField(filePath, { dayIndex, field, itemIndex, targetType, unitPath, value });
    });

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("save-item-field-plugin error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/save-item-field" });
  }
}

export async function handleSaveDayResult(req, res, enqueueWrite, { repoRoot }) {
  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(stripBom(bodyText || "{}"));
    const sourcePath = String(body?.sourcePath ?? "");
    const unitPath = String(body?.unitPath ?? "").trim() || null;
    const dayIndex = Number(body?.dayIndex);
    const rawDay = body?.day;
    const rawItems = body?.items;
    setApiLogDetail(res, {
      endpoint: "save-day-result",
      sourcePath,
      unitPath,
      dayIndex,
      itemCount: Array.isArray(rawItems) ? rawItems.length : undefined,
    });

    if (!sourcePath.startsWith("asset/")) {
      sendJson(res, 400, { ok: false, error: "Invalid sourcePath" });
      return;
    }
    if (!Number.isInteger(dayIndex) || dayIndex < 0) {
      sendJson(res, 400, { ok: false, error: "Invalid dayIndex" });
      return;
    }
    if (!rawDay || typeof rawDay !== "object" || Array.isArray(rawDay)) {
      sendJson(res, 400, { ok: false, error: "Invalid day result" });
      return;
    }
    if (!Array.isArray(rawItems)) {
      sendJson(res, 400, { ok: false, error: "Invalid item results" });
      return;
    }

    const stage = Number(rawDay.stage);
    const stageCompleteDate = readNullableDate(rawDay.stageCompleteDate);
    const nextReviewDate = readNullableDate(rawDay.nextReviewDate);
    const lastAttemptDate = rawDay.lastAttemptDate;
    if (!Number.isInteger(stage) || stage < 1) {
      sendJson(res, 400, { ok: false, error: "Invalid stage" });
      return;
    }
    if (stageCompleteDate === undefined || nextReviewDate === undefined || !isYmd(lastAttemptDate)) {
      sendJson(res, 400, { ok: false, error: "Invalid day dates" });
      return;
    }

    const seenItemIndexes = new Set();
    const items = [];
    for (const rawItem of rawItems) {
      const itemIndex = Number(rawItem?.itemIndex);
      const lastResult = String(rawItem?.lastResult ?? "");
      if (!Number.isInteger(itemIndex) || itemIndex < 0 || seenItemIndexes.has(itemIndex)) {
        sendJson(res, 400, { ok: false, error: "Invalid item result index" });
        return;
      }
      if (!["PASS", "FAIL", "NEUTRAL"].includes(lastResult)) {
        sendJson(res, 400, { ok: false, error: "Invalid item result" });
        return;
      }
      seenItemIndexes.add(itemIndex);
      items.push({ itemIndex, lastResult });
    }

    const filePath = resolveAssetWritePath(repoRoot, sourcePath);
    await enqueueWrite(filePath, async () => {
      await writeSourceDayResult(filePath, {
        dayIndex,
        day: { stage, stageCompleteDate, nextReviewDate, lastAttemptDate },
        items,
        unitPath,
      });
    });

    sendJson(res, 200, { ok: true, itemCount: items.length });
  } catch (error) {
    console.error("save-day-result error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/save-day-result" });
  }
}

function isYmd(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readNullableDate(value) {
  if (value === null) return null;
  return isYmd(value) ? value : undefined;
}
