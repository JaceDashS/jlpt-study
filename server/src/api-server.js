import fs from "node:fs/promises";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const API_PREFIX = "/api";
const ASSET_BACKUP_FILE = "backup/asset-full-backup.json";
const API_LOG_CONTEXT = Symbol("apiLogContext");
const API_ACCEPT_ENCODING = Symbol("apiAcceptEncoding");
const ACCESS_TOKEN_ALIASES = ["access_token", "token"];
const ACCESS_TOKEN_COOKIE = "jlpt_access_token";
const ACCESS_TOKEN_HEADER = "x-jlpt-access-token";
const SENSITIVE_QUERY_KEYS = new Set(["access_token", "token", "password", "secret"]);
const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function createApiRequestHandler() {
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

  return async function handleApiRequest(req, res) {
    res[API_ACCEPT_ENCODING] = String(req.headers["accept-encoding"] ?? "");
    const requestUrl = new URL(req.url ?? "/", readRequestBaseUrl(req));
    const pathname = requestUrl.pathname;

    if (!pathname.startsWith(`${API_PREFIX}/`)) {
      sendJson(res, 404, { ok: false, error: "Not Found" });
      return;
    }

    applyCorsHeaders(req, res);
    logApiRequest(req, res, requestUrl);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (!isAuthorizedApiRequest(req, requestUrl)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    if (pathname === "/api/clipboard-write" && req.method === "POST") {
      await handleClipboardWrite(req, res);
      return;
    }

    if (pathname === "/api/clipboard-read" && req.method === "GET") {
      await handleClipboardRead(res);
      return;
    }

    if (pathname === "/api/reload-curriculum" && req.method === "GET") {
      await handleReloadCurriculum(res);
      return;
    }

    if (pathname === "/api/asset-backup/export" && req.method === "POST") {
      await handleAssetBackupExport(req, res);
      return;
    }

    if (pathname === "/api/asset-backup/import" && req.method === "POST") {
      await handleAssetBackupImport(res);
      return;
    }

    if (pathname === "/api/save-item-field") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
        return;
      }
      await handleSaveItemField(req, res, enqueueWrite);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not Found" });
  };
}

export function createApiServer() {
  return http.createServer(createApiRequestHandler());
}

export async function startApiServer(options = {}) {
  const host = String(options.host ?? process.env.JLPT_API_HOST ?? "127.0.0.1");
  const port = readPort(options.port ?? process.env.JLPT_API_PORT ?? process.env.PORT, 3001);
  const server = createApiServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.log(`[jlpt server] API server listening on http://${formatListenHost(host)}:${port}`);
  return server;
}

function readRequestBaseUrl(req) {
  const host = req.headers.host || "localhost";
  return `http://${host}`;
}

function readPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function formatListenHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function applyCorsHeaders(req, res) {
  const origin = String(req.headers.origin ?? "");
  if (origin && isAllowedCorsOrigin(origin)) {
    appendVaryHeader(res, "Origin");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-JLPT-Access-Token, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");

  if (String(req.headers["access-control-request-private-network"] ?? "").toLowerCase() === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function appendVaryHeader(res, value) {
  const current = res.getHeader("Vary");
  if (!current) {
    res.setHeader("Vary", value);
    return;
  }

  const values = Array.isArray(current) ? current.join(",") : String(current);
  if (values.split(",").map((item) => item.trim().toLowerCase()).includes(value.toLowerCase())) return;
  res.setHeader("Vary", `${values}, ${value}`);
}

function isAllowedCorsOrigin(origin) {
  const allowedOrigins = readAllowedCorsOrigins();
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return isLoopbackHost(url.hostname) || isPrivateIpv4(url.hostname);
  } catch {
    return false;
  }
}

function readAllowedCorsOrigins() {
  return String(process.env.JLPT_API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLoopbackHost(hostname) {
  const normalized = String(hostname ?? "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
}

function isPrivateIpv4(hostname) {
  const parts = String(hostname ?? "").split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function isAuthorizedApiRequest(req, requestUrl) {
  const expectedToken = String(process.env.JLPT_ACCESS_TOKEN ?? "");
  if (!expectedToken) return true;

  const actualToken = readApiAccessToken(req, requestUrl);
  if (!actualToken) return false;

  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(actualToken);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readApiAccessToken(req, requestUrl) {
  const headerToken = String(req.headers[ACCESS_TOKEN_HEADER] ?? "").trim();
  if (headerToken) return headerToken;

  const authorization = String(req.headers.authorization ?? "").trim();
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  for (const key of ACCESS_TOKEN_ALIASES) {
    const token = requestUrl.searchParams.get(key);
    if (token) return token;
  }

  const cookieHeader = String(req.headers.cookie ?? "");
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    const key = cookie.slice(0, separator).trim();
    if (key !== ACCESS_TOKEN_COOKIE) continue;
    const value = cookie.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return "";
}

function logApiRequest(req, res, requestUrl) {
  const startedAt = Date.now();
  const method = String(req.method ?? "GET").toUpperCase();
  const target = formatRequestTarget(requestUrl);
  const client = readClientAddress(req);
  const context = {
    details: {},
    result: {},
  };
  let logged = false;

  res[API_LOG_CONTEXT] = context;
  console.log(`[jlpt api] -> ${method} ${target} client=${client}`);

  function writeLog(event) {
    if (logged) return;
    logged = true;
    const durationMs = Date.now() - startedAt;
    const status = Number(res.statusCode) || 0;
    const fields = [
      `status=${status}`,
      `duration=${durationMs}ms`,
      `client=${formatLogValue(client)}`,
      formatGroupedFields("request", context.details),
      formatGroupedFields("result", context.result),
      event ? `event=${formatLogValue(event)}` : "",
    ].filter(Boolean);
    console.log(`[jlpt api] <- ${method} ${target} ${fields.join(" ")}`);
  }

  res.once("finish", () => writeLog(""));
  res.once("close", () => writeLog("closed"));
}

function setApiLogDetail(res, detail) {
  const context = res[API_LOG_CONTEXT];
  if (!context) return;
  Object.assign(context.details, cleanLogObject(detail));
}

function setApiLogResult(res, payload) {
  const context = res[API_LOG_CONTEXT];
  if (!context) return;
  Object.assign(context.result, cleanLogObject(summarizeResponsePayload(payload)));
}

function formatRequestTarget(requestUrl) {
  const url = new URL(requestUrl.toString());
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.set(key, "[redacted]");
    }
  }
  return `${url.pathname}${url.search}`;
}

function summarizeResponsePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const summary = {};
  if (Object.prototype.hasOwnProperty.call(payload, "ok")) summary.ok = Boolean(payload.ok);
  if (typeof payload.error === "string") summary.error = payload.error;
  if (typeof payload.where === "string") summary.where = payload.where;
  if (typeof payload.warningType === "string") summary.warningType = payload.warningType;
  if (Object.prototype.hasOwnProperty.call(payload, "requiresConfirm")) summary.requiresConfirm = Boolean(payload.requiresConfirm);
  if (typeof payload.findingCount === "number") summary.findingCount = payload.findingCount;
  if (typeof payload.fileCount === "number") summary.fileCount = payload.fileCount;
  if (payload.files && typeof payload.files === "object") summary.fileCount = Object.keys(payload.files).length;
  if (typeof payload.backupFile === "string") summary.backupFile = payload.backupFile;
  if (typeof payload.mojibakeCount === "number") summary.mojibakeCount = payload.mojibakeCount;
  if (Object.prototype.hasOwnProperty.call(payload, "mojibakeIncluded")) summary.mojibakeIncluded = Boolean(payload.mojibakeIncluded);
  if (typeof payload.skippedProtectedFileCount === "number") {
    summary.skippedProtectedFileCount = payload.skippedProtectedFileCount;
  }
  if (typeof payload.text === "string") summary.textLength = payload.text.length;
  return summary;
}

function formatGroupedFields(label, fields) {
  const entries = Object.entries(cleanLogObject(fields));
  if (entries.length === 0) return "";
  return `${label}={${entries.map(([key, value]) => `${key}:${formatLogValue(value)}`).join(",")}}`;
}

function cleanLogObject(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null));
}

function formatLogValue(value) {
  if (typeof value === "string") {
    const normalized = value.length > 140 ? `${value.slice(0, 137)}...` : value;
    return JSON.stringify(normalized);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function readClientAddress(req) {
  const address = req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? "unknown";
  const normalized = String(address).startsWith("::ffff:") ? String(address).slice("::ffff:".length) : String(address);
  return normalized || "unknown";
}

async function handleClipboardWrite(req, res) {
  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(stripBom(bodyText || "{}"));
    const text = String(body?.text ?? "");
    setApiLogDetail(res, { endpoint: "clipboard-write", textLength: text.length });
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

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("clipboard-write error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/clipboard-write" });
  }
}

async function handleClipboardRead(res) {
  try {
    setApiLogDetail(res, { endpoint: "clipboard-read" });
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

    sendJson(res, 200, { ok: true, text });
  } catch (error) {
    console.error("clipboard-read error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/clipboard-read" });
  }
}

async function handleReloadCurriculum(res) {
  try {
    setApiLogDetail(res, { endpoint: "reload-curriculum" });
    const rootDir = path.resolve(REPO_ROOT, "asset");
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
        const relPath = path.relative(REPO_ROOT, fullPath).replaceAll("\\", "/");
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

async function handleAssetBackupExport(req, res) {
  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(stripBom(bodyText || "{}"));
    const force = Boolean(body?.force);
    setApiLogDetail(res, { endpoint: "asset-backup/export", force });
    const assetRoot = path.resolve(REPO_ROOT, "asset");
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

    const backupPath = path.resolve(REPO_ROOT, ASSET_BACKUP_FILE);
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

async function handleAssetBackupImport(res) {
  try {
    setApiLogDetail(res, { endpoint: "asset-backup/import" });
    const backupPath = path.resolve(REPO_ROOT, ASSET_BACKUP_FILE);
    const raw = await fs.readFile(backupPath, "utf8");
    const parsed = JSON.parse(stripBom(raw));
    if (!parsed || typeof parsed !== "object" || typeof parsed.files !== "object") {
      throw new Error("Invalid backup file format");
    }

    const assetRoot = path.resolve(REPO_ROOT, "asset");
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

async function handleSaveItemField(req, res, enqueueWrite) {
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

    const filePath = resolveAssetWritePath(sourcePath);
    if (isProtectedAssetJsonPath(path.relative(path.resolve(REPO_ROOT, "asset"), filePath))) {
      sendJson(res, 403, { ok: false, error: "Protected asset src.json cannot be modified" });
      return;
    }

    const allowedItemFields = ["memoDecomposition", "memoPersonal", "problem", "lastResult", "lastAttemptDate"];
    const allowedDayFields = ["stage", "stageCompleteDate", "nextReviewDate", "lastAttemptDate"];
    const allowedFields = targetType === "day" ? allowedDayFields : allowedItemFields;

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
      const raw = await fs.readFile(filePath, "utf8");
      const json = JSON.parse(stripBom(raw));

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
            root = units.find((unit) => unit?.chapterId === chapterId && unit?.unitId === unitId) ?? null;
          } else {
            root = units.find((unit) => unit?.unitId === unitPath) ?? null;
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
      await writeFileAtomically(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    });

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("save-item-field-plugin error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/save-item-field" });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  setApiLogResult(res, payload);
  const body = JSON.stringify(payload);
  const shouldGzip = body.length >= 1024 && /\bgzip\b/i.test(String(res[API_ACCEPT_ENCODING] ?? ""));

  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (shouldGzip) {
    appendVaryHeader(res, "Accept-Encoding");
    res.setHeader("Content-Encoding", "gzip");
    res.end(zlib.gzipSync(body));
    return;
  }

  res.end(body);
}

function stripBom(text) {
  if (typeof text !== "string") return text;
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function resolveAssetWritePath(sourcePath) {
  const rootDir = path.resolve(REPO_ROOT, "asset");
  const relPath = normalizeRelativePath(sourcePath.slice("asset/".length));
  const filePath = path.resolve(rootDir, relPath);
  if (!isPathInsideOrEqual(rootDir, filePath)) {
    throw new Error(`Invalid asset path: ${sourcePath}`);
  }
  return filePath;
}

function isIgnoredAssetJson(relPath) {
  return isProtectedAssetJsonPath(relPath);
}

function isProtectedAssetJsonPath(relPath) {
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

function isPathInsideOrEqual(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function writeFileAtomically(filePath, body, options) {
  const dirPath = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempPath = path.join(dirPath, `.${baseName}.${stamp}.tmp`);
  const backupPath = path.join(dirPath, `.${baseName}.${stamp}.bak`);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(tempPath, body, options);

  try {
    await fs.rename(tempPath, filePath);
    return;
  } catch (error) {
    const code = String(error?.code ?? "");
    if (!["EEXIST", "EPERM", "EBUSY"].includes(code)) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  let movedOriginal = false;
  try {
    await fs.rename(filePath, backupPath);
    movedOriginal = true;
  } catch (error) {
    const code = String(error?.code ?? "");
    if (code !== "ENOENT") {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (movedOriginal) {
      await fs.rename(backupPath, filePath).catch(() => undefined);
    }
    throw error;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    if (movedOriginal) {
      await fs.rm(backupPath, { force: true }).catch(() => undefined);
    }
  }
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
  let skippedProtectedFileCount = 0;
  for (const [rawRelPath, base64Body] of Object.entries(snapshotFiles ?? {})) {
    const relPath = normalizeRelativePath(rawRelPath);
    if (isProtectedAssetJsonPath(relPath)) {
      skippedProtectedFileCount += 1;
      continue;
    }
    desiredFiles.set(relPath, String(base64Body ?? ""));
  }

  const existing = await walkFiles(assetRootDir);
  const existingSet = new Set(existing.map((row) => row.relPath));
  const desiredSet = new Set(desiredFiles.keys());

  for (const relPath of existingSet) {
    if (desiredSet.has(relPath) || isProtectedAssetJsonPath(relPath)) continue;
    const fullPath = path.join(assetRootDir, relPath);
    await fs.rm(fullPath, { force: true });
  }

  for (const [relPath, base64Body] of desiredFiles.entries()) {
    const fullPath = path.join(assetRootDir, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await writeFileAtomically(fullPath, Buffer.from(base64Body, "base64"));
  }

  return { skippedProtectedFileCount };
}
