import crypto from "node:crypto";
import zlib from "node:zlib";

export const API_LOG_CONTEXT = Symbol("apiLogContext");
export const API_ACCEPT_ENCODING = Symbol("apiAcceptEncoding");

const ACCESS_TOKEN_ALIASES = ["access_token", "token"];
const ACCESS_TOKEN_COOKIE = "jlpt_access_token";
const ACCESS_TOKEN_HEADER = "x-jlpt-access-token";
const SENSITIVE_QUERY_KEYS = new Set(["access_token", "token", "password", "secret"]);

export function readRequestBaseUrl(req) {
  const host = req.headers.host || "localhost";
  return `http://${host}`;
}

export function applyCorsHeaders(req, res) {
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

export function appendVaryHeader(res, value) {
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

export function isAuthorizedApiRequest(req, requestUrl) {
  const expectedToken = String(process.env.JLPT_ACCESS_TOKEN ?? "");
  if (!expectedToken) return true;
  if (isTrustedInternalLanRequest(req)) return true;

  const actualToken = readApiAccessToken(req, requestUrl);
  if (!actualToken) return false;

  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(actualToken);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isTrustedInternalLanRequest(req) {
  return isPrivateIpv4(readClientAddress(req));
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

export function logApiRequest(req, res, requestUrl) {
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

  function writeLog(event) {
    if (logged) return;
    logged = true;
    const durationMs = Date.now() - startedAt;
    const status = Number(res.statusCode) || 0;
    if (shouldSkipApiLog({ method, status, event })) return;
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

function shouldSkipApiLog({ method, status, event }) {
  return method === "OPTIONS" && status < 400 && !event;
}

export function setApiLogDetail(res, detail) {
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

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function sendJson(res, statusCode, payload) {
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
