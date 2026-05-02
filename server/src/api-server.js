import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  API_ACCEPT_ENCODING,
  applyCorsHeaders,
  isAuthorizedApiRequest,
  logApiRequest,
  readBody,
  readRequestBaseUrl,
  sendJson,
  setApiLogDetail,
} from "./api-http.js";
import { readClipboardText, writeClipboardText } from "./clipboard-service.js";
import {
  handleAssetBackupExport,
  handleAssetBackupImport,
  handleReloadCurriculum,
  handleSaveItemField,
} from "./asset-routes.js";
import {
  stripBom,
} from "./asset-services.js";

const API_PREFIX = "/api";
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
      await handleReloadCurriculum(res, { repoRoot: REPO_ROOT });
      return;
    }

    if (pathname === "/api/asset-backup/export" && req.method === "POST") {
      await handleAssetBackupExport(req, res, { repoRoot: REPO_ROOT });
      return;
    }

    if (pathname === "/api/asset-backup/import" && req.method === "POST") {
      await handleAssetBackupImport(res, { repoRoot: REPO_ROOT });
      return;
    }

    if (pathname === "/api/save-item-field") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
        return;
      }
      await handleSaveItemField(req, res, enqueueWrite, { repoRoot: REPO_ROOT });
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

function readPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function formatListenHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

async function handleClipboardWrite(req, res) {
  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(stripBom(bodyText || "{}"));
    const text = String(body?.text ?? "");
    setApiLogDetail(res, { endpoint: "clipboard-write", textLength: text.length });
    await writeClipboardText(text);

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("clipboard-write error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/clipboard-write" });
  }
}

async function handleClipboardRead(res) {
  try {
    setApiLogDetail(res, { endpoint: "clipboard-read" });
    const text = await readClipboardText();

    sendJson(res, 200, { ok: true, text });
  } catch (error) {
    console.error("clipboard-read error:", error);
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error), where: "/api/clipboard-read" });
  }
}
