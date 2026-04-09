import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function stripBom(text) {
  if (typeof text !== "string") return text;
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const ASSET_BACKUP_FILE = "backup/asset-full-backup.json";

function isIgnoredAssetJson(relPath) {
  const normalized = String(relPath ?? "").replaceAll("\\", "/").toLowerCase();
  return normalized.endsWith("/src.json") || normalized === "src.json";
}

function normalizeRelativePath(relPath) {
  const normalized = String(relPath ?? "").replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Invalid relative path: ${relPath}`);
  }
  return normalized;
}

async function walkFiles(rootDir, currentDir = rootDir, out = []) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(rootDir, fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const relPath = normalizeRelativePath(path.relative(rootDir, fullPath));
    out.push({ fullPath, relPath });
  }
  return out;
}

async function createAssetSnapshot(assetRootDir) {
  const files = {};
  const rows = await walkFiles(assetRootDir);
  for (const row of rows) {
    const raw = await fs.readFile(row.fullPath);
    files[row.relPath] = raw.toString("base64");
  }
  return files;
}

function mojibakeScore(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  const cjkCount = (text.match(/[가-힣ぁ-ゖァ-ヺ一-龯]/g) || []).length;
  const replacementCount = (text.match(/[�]/g) || []).length;
  return cjkCount - replacementCount * 3;
}

function isLikelyMojibakeText(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  if (text.includes("�")) return true;

  const decoded = Buffer.from(text, "latin1").toString("utf8");
  if (decoded === text) return false;
  return mojibakeScore(decoded) > mojibakeScore(text) + 1;
}

function collectMojibakeStrings(node, pointer = "$", out = []) {
  if (typeof node === "string") {
    if (isLikelyMojibakeText(node)) {
      out.push({
        pointer,
        preview: node.slice(0, 80),
      });
    }
    return out;
  }

  if (Array.isArray(node)) {
    node.forEach((value, index) => {
      collectMojibakeStrings(value, `${pointer}[${index}]`, out);
    });
    return out;
  }

  if (node && typeof node === "object") {
    Object.entries(node).forEach(([key, value]) => {
      collectMojibakeStrings(value, `${pointer}.${key}`, out);
    });
  }

  return out;
}

async function findMojibakeInAssetJson(assetRootDir) {
  const rows = await walkFiles(assetRootDir);
  const findings = [];

  for (const row of rows) {
    if (row.relPath.includes("�")) {
      findings.push(`${row.relPath} (file path)`);
      continue;
    }

    if (!row.relPath.toLowerCase().endsWith(".json")) continue;
    if (isIgnoredAssetJson(row.relPath)) continue;

    const rawText = await fs.readFile(row.fullPath, "utf8");
    if (isLikelyMojibakeText(rawText)) {
      findings.push(`${row.relPath} (raw text)`);
      if (findings.length >= 20) break;
      continue;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(stripBom(rawText));
    } catch {
      // Skip structural scan when JSON itself is invalid.
      continue;
    }

    const stringFindings = collectMojibakeStrings(parsed);
    if (stringFindings.length === 0) continue;

    const top = stringFindings[0];
    findings.push(`${row.relPath} @ ${top.pointer}: "${top.preview}"`);
    if (findings.length >= 20) break;
  }

  return findings;
}

async function restoreAssetSnapshot(assetRootDir, snapshotFiles) {
  await fs.mkdir(assetRootDir, { recursive: true });

  const desiredFiles = new Map();
  for (const [rawRelPath, base64Body] of Object.entries(snapshotFiles ?? {})) {
    const relPath = normalizeRelativePath(rawRelPath);
    desiredFiles.set(relPath, String(base64Body ?? ""));
  }

  const existing = await walkFiles(assetRootDir);
  const existingSet = new Set(existing.map((row) => row.relPath));
  const desiredSet = new Set(desiredFiles.keys());

  for (const relPath of existingSet) {
    if (desiredSet.has(relPath)) continue;
    const fullPath = path.join(assetRootDir, relPath);
    await fs.rm(fullPath, { force: true });
  }

  for (const [relPath, base64Body] of desiredFiles.entries()) {
    const fullPath = path.join(assetRootDir, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, Buffer.from(base64Body, "base64"));
  }
}

function saveItemFieldPlugin() {
  const writeQueueByPath = new Map();

  function enqueueWrite(filePath, task) {
    const prev = writeQueueByPath.get(filePath) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (writeQueueByPath.get(filePath) === next) {
          writeQueueByPath.delete(filePath);
        }
      });
    writeQueueByPath.set(filePath, next);
    return next;
  }

  return {
    name: "save-item-field-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? "/", "http://localhost");
        const pathname = requestUrl.pathname;

        if (pathname === "/__api/clipboard-write" && req.method === "POST") {
          try {
            const bodyText = await readBody(req);
            const body = JSON.parse(stripBom(bodyText || "{}"));
            const text = String(body?.text ?? "");
            const base64Text = Buffer.from(text, "utf8").toString("base64");

            await new Promise((resolve, reject) => {
              const command = `$b='${base64Text}';$t=[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b));Set-Clipboard -Value $t`;
              const child = spawn("powershell", ["-NoProfile", "-Command", command], {
                stdio: ["pipe", "pipe", "pipe"],
              });

              let stderr = "";
              child.stderr.on("data", (chunk) => {
                stderr += String(chunk);
              });
              child.on("error", reject);
              child.on("close", (code) => {
                if (code === 0) {
                  resolve();
                  return;
                }
                reject(new Error(stderr || `Set-Clipboard failed with exit code ${code}`));
              });

              child.stdin.end();
            });

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            console.error("clipboard-write error:", error);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error), where: "/__api/clipboard-write" }));
          }
          return;
        }

        if (pathname === "/__api/clipboard-read" && req.method === "GET") {
          try {
            const text = await new Promise((resolve, reject) => {
              const command = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$text=Get-Clipboard -Raw; if ($null -eq $text) { $text='' }; [Console]::Write($text)";
              const child = spawn("powershell", ["-NoProfile", "-Command", command], {
                stdio: ["pipe", "pipe", "pipe"],
              });

              let stdout = "";
              let stderr = "";
              child.stdout.on("data", (chunk) => {
                stdout += String(chunk);
              });
              child.stderr.on("data", (chunk) => {
                stderr += String(chunk);
              });
              child.on("error", reject);
              child.on("close", (code) => {
                if (code === 0) {
                  resolve(stdout);
                  return;
                }
                reject(new Error(stderr || `Get-Clipboard failed with exit code ${code}`));
              });

              child.stdin.end();
            });

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: true, text }));
          } catch (error) {
            console.error("clipboard-read error:", error);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error), where: "/__api/clipboard-read" }));
          }
          return;
        }

        if (pathname === "/__api/reload-curriculum" && req.method === "GET") {
          try {
            const rootDir = path.resolve(process.cwd(), "asset");
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
                const relPath = path.relative(process.cwd(), fullPath).replaceAll("\\", "/");
                const raw = await fs.readFile(fullPath, "utf8");
                files[relPath] = JSON.parse(stripBom(raw));
              }
            }

            await walk(rootDir);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: true, files }));
          } catch (error) {
            console.error("reload-curriculum error:", error);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error), where: "/__api/reload-curriculum" }));
          }
          return;
        }

        if (pathname === "/__api/asset-backup/export" && req.method === "POST") {
          try {
            const bodyText = await readBody(req);
            const body = JSON.parse(stripBom(bodyText || "{}"));
            const force = Boolean(body?.force);
            const assetRoot = path.resolve(process.cwd(), "asset");
            const mojibakeFindings = await findMojibakeInAssetJson(assetRoot);
            if (mojibakeFindings.length > 0 && !force) {
              res.statusCode = 409;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({
                  ok: false,
                  requiresConfirm: true,
                  warningType: "MOJIBAKE_DETECTED",
                  message: "모지바케가 감지되었습니다. 계속하면 해당 내용을 포함해 백업합니다.",
                  findings: mojibakeFindings.slice(0, 20),
                  findingCount: mojibakeFindings.length,
                }),
              );
              return;
            }

            const snapshotFiles = await createAssetSnapshot(assetRoot);
            const backupBody = {
              version: 1,
              root: "asset",
              createdAt: new Date().toISOString(),
              files: snapshotFiles,
            };

            const backupPath = path.resolve(process.cwd(), ASSET_BACKUP_FILE);
            await fs.mkdir(path.dirname(backupPath), { recursive: true });
            await fs.writeFile(backupPath, `${JSON.stringify(backupBody, null, 2)}\n`, "utf8");

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: true,
                backupFile: ASSET_BACKUP_FILE,
                fileCount: Object.keys(snapshotFiles).length,
                mojibakeIncluded: mojibakeFindings.length > 0,
                mojibakeCount: mojibakeFindings.length,
              }),
            );
          } catch (error) {
            console.error("asset-backup export error:", error);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error), where: "/__api/asset-backup/export" }));
          }
          return;
        }

        if (pathname === "/__api/asset-backup/import" && req.method === "POST") {
          try {
            const backupPath = path.resolve(process.cwd(), ASSET_BACKUP_FILE);
            const raw = await fs.readFile(backupPath, "utf8");
            const parsed = JSON.parse(stripBom(raw));
            if (!parsed || typeof parsed !== "object" || typeof parsed.files !== "object") {
              throw new Error("Invalid backup file format");
            }

            const assetRoot = path.resolve(process.cwd(), "asset");
            await restoreAssetSnapshot(assetRoot, parsed.files);

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: true, backupFile: ASSET_BACKUP_FILE, fileCount: Object.keys(parsed.files).length }));
          } catch (error) {
            console.error("asset-backup import error:", error);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error), where: "/__api/asset-backup/import" }));
          }
          return;
        }

        if (pathname !== "/__api/save-item-field") {
          next();
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
          return;
        }

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

          if (!sourcePath.startsWith("asset/")) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: "Invalid sourcePath" }));
            return;
          }

          const allowedItemFields = ["memoDecomposition", "memoPersonal", "problem", "lastResult", "lastAttemptDate"];
          const allowedDayFields = ["stage", "stageCompleteDate", "nextReviewDate", "lastAttemptDate"];
          const allowedFields = targetType === "day" ? allowedDayFields : allowedItemFields;

          if (!allowedFields.includes(field)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: "Invalid field" }));
            return;
          }

          if (!Number.isInteger(dayIndex)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: "Invalid dayIndex" }));
            return;
          }

          if (targetType !== "day" && !Number.isInteger(itemIndex)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: "Invalid itemIndex" }));
            return;
          }

          const filePath = path.resolve(process.cwd(), sourcePath);
          await enqueueWrite(filePath, async () => {
            const raw = await fs.readFile(filePath, "utf8");
            const json = JSON.parse(stripBom(raw));

            // For combined files, resolve to the specific unit root first
            let root = json;
            if (json?.format === "combined" && unitPath) {
              if (Array.isArray(json?.days)) {
                const index = Number(unitPath);
                root = Number.isInteger(index) && index >= 0 ? json.days[index] ?? null : null;
              } else {
                const slash = unitPath.indexOf("/");
                const units = Array.isArray(json?.units) ? json.units : [];
                if (slash >= 0) {
                  const chapterId = unitPath.slice(0, slash);
                  const unitId = unitPath.slice(slash + 1);
                  root = units.find((u) => u?.chapterId === chapterId && u?.unitId === unitId) ?? null;
                } else {
                  root = units.find((u) => u?.unitId === unitPath) ?? null;
                }
              }
              if (!root || typeof root !== "object") {
                throw new Error(`Unit not found in combined file: ${unitPath}`);
              }
            }

            let target = null;
            if (Array.isArray(root?.day)) {
              target = targetType === "day" ? root.day?.[dayIndex] ?? null : root.day?.[dayIndex]?.items?.[itemIndex] ?? null;
            } else if (Array.isArray(root?.unitSteps)) {
              target = targetType === "day"
                ? root.unitSteps?.[dayIndex] ?? null
                : root.unitSteps?.[dayIndex]?.items?.[itemIndex] ?? null;
            } else if (Array.isArray(root?.days)) {
              target = targetType === "day" ? root.days?.[dayIndex] ?? null : root.days?.[dayIndex]?.items?.[itemIndex] ?? null;
            } else if (Array.isArray(root)) {
              target = targetType === "day" ? root?.[dayIndex] ?? null : root?.[dayIndex]?.items?.[itemIndex] ?? null;
            } else if (Array.isArray(root?.items)) {
              target = targetType === "day" ? root : root.items?.[itemIndex] ?? null;
            }

            if (!target || typeof target !== "object") {
              throw new Error("Target item not found");
            }

            target[field] = value;
            await fs.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
          });

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          console.error("save-item-field-plugin error:", error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error), where: "/__api/save-item-field" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), saveItemFieldPlugin()],
});
