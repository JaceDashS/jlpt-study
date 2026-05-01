type QueryValue = string | number | boolean | null | undefined;

const ACCESS_TOKEN_ALIASES = ["access_token", "token"];
const ACCESS_TOKEN_PATH_PREFIX = "/__jlpt_access/";
const ACCESS_TOKEN_SESSION_KEY = "jlpt_access_token";
const API_BASE_ALIASES = ["api_base", "api_url"];
const API_BASE_SESSION_KEY = "jlpt_api_base_url";
const DEFAULT_LAN_API_PORT = "3001";
const API_LOG_BODY_LIMIT = 8000;
const SENSITIVE_HEADER_KEYS = new Set(["authorization", "cookie", "set-cookie", "x-api-key", "x-jlpt-access-token"]);
const SENSITIVE_BODY_KEYS = new Set(["access_token", "authorization", "cookie", "password", "secret", "token", "x-api-key"]);
const SENSITIVE_QUERY_KEYS = new Set(["access_token", "password", "secret", "token"]);

let apiRequestLogId = 0;

export function apiUrl(path: string, query?: Record<string, QueryValue>) {
  const normalizedPath = String(path ?? "").replace(/^\/+/, "");
  const apiBaseUrl = readApiBaseUrl();
  if (apiBaseUrl) {
    const url = new URL(`${apiBaseUrl.replace(/\/+$/, "")}/${normalizedPath}`);
    writeQueryParams(url, query);
    return url.toString();
  }

  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(`/api/${normalizedPath}`, origin);
  writeQueryParams(url, query);

  if (typeof window === "undefined") {
    return `${url.pathname}${url.search}`;
  }
  return url.toString();
}

function writeQueryParams(url: URL, query?: Record<string, QueryValue>) {
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    url.searchParams.set(key, String(value));
  });
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  let request = new Request(input, init);
  if (!isApiRequest(request.url)) {
    return fetch(request);
  }
  request = attachApiAccessToken(request);

  const id = ++apiRequestLogId;
  const startedAt = Date.now();
  const method = request.method.toUpperCase();
  const target = formatRequestTarget(request.url);
  const requestLog = {
    id,
    method,
    url: target,
    headers: headersToLogObject(request.headers),
    body: await readBodyForLog(request),
  };

  writeLogGroup(`[jlpt api client] #${id} -> ${method} ${target}`, () => {
    console.log("request", requestLog);
  });

  try {
    const response = await fetch(request);
    const durationMs = Date.now() - startedAt;
    const responseLogBase = {
      id,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      durationMs,
      headers: headersToLogObject(response.headers),
    };

    void readBodyForLog(response).then((body) => {
      writeLogGroup(`[jlpt api client] #${id} <- ${method} ${target} ${response.status} ${durationMs}ms`, () => {
        console.log("request", requestLog);
        console.log("response", {
          ...responseLogBase,
          body,
        });
      });
    });

    return response;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    writeLogGroup(`[jlpt api client] #${id} !! ${method} ${target} ${durationMs}ms`, () => {
      console.log("request", requestLog);
      console.error("error", error);
    });
    throw error;
  }
}

function isApiRequest(url: string) {
  try {
    const parsed = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    return parsed.pathname.startsWith("/api/");
  } catch (error) {
    return false;
  }
}

function attachApiAccessToken(request: Request) {
  const token = readAccessToken();
  if (!token || request.headers.has("X-JLPT-Access-Token")) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set("X-JLPT-Access-Token", token);
  return new Request(request, { headers });
}

function readApiBaseUrl() {
  const fromUrl = readUrlParam(API_BASE_ALIASES);
  if (fromUrl) {
    const normalized = normalizeApiBaseUrl(fromUrl);
    writeSessionValue(API_BASE_SESSION_KEY, normalized);
    return normalized;
  }

  const fromSession = normalizeApiBaseUrl(readSessionValue(API_BASE_SESSION_KEY));
  if (fromSession) {
    return fromSession;
  }

  const derived = deriveLanApiBaseUrl();
  if (derived) {
    writeSessionValue(API_BASE_SESSION_KEY, derived);
  }
  return derived;
}

function deriveLanApiBaseUrl() {
  if (typeof window === "undefined" || !readAccessToken()) {
    return "";
  }

  const { protocol, hostname, port } = window.location;
  if (!hostname || isLoopbackHost(hostname)) {
    return "";
  }

  if (protocol === "https:" && !port) {
    return `${protocol}//${formatUrlHost(hostname)}/api`;
  }

  const apiPort = readUrlParam(["api_port"]) || DEFAULT_LAN_API_PORT;
  return `${protocol}//${formatUrlHost(hostname)}:${apiPort}/api`;
}

function readAccessToken() {
  const fromPath = readPathToken();
  if (fromPath) {
    writeSessionValue(ACCESS_TOKEN_SESSION_KEY, fromPath);
    return fromPath;
  }

  const fromUrl = readUrlParam(ACCESS_TOKEN_ALIASES);
  if (fromUrl) {
    writeSessionValue(ACCESS_TOKEN_SESSION_KEY, fromUrl);
    return fromUrl;
  }
  return readSessionValue(ACCESS_TOKEN_SESSION_KEY);
}

function readUrlParam(keys: string[]) {
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(window.location.href);
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
  } catch (error) {
    return "";
  }
  return "";
}

function readPathToken() {
  if (typeof window === "undefined") return "";
  try {
    const { pathname } = window.location;
    if (!pathname.startsWith(ACCESS_TOKEN_PATH_PREFIX)) return "";

    const rest = pathname.slice(ACCESS_TOKEN_PATH_PREFIX.length);
    const slash = rest.indexOf("/");
    const rawToken = slash >= 0 ? rest.slice(0, slash) : rest;
    return rawToken ? decodeURIComponent(rawToken) : "";
  } catch (error) {
    return "";
  }
}

function readSessionValue(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch (error) {
    return "";
  }
}

function writeSessionValue(key: string, value: string) {
  if (typeof window === "undefined" || !value) return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch (error) {
    // Session storage can be unavailable in restricted browser modes.
  }
}

function normalizeApiBaseUrl(rawUrl: string) {
  const text = String(rawUrl ?? "").trim();
  if (!text) return "";
  try {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `${window.location.protocol}//${text}`;
    const url = new URL(withProtocol);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/api";
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    return "";
  }
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
}

function formatUrlHost(host: string) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function formatRequestTarget(url: string) {
  const base = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const parsed = new URL(url, base);
  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      parsed.searchParams.set(key, "[redacted]");
    }
  }
  return parsed.origin === base ? `${parsed.pathname}${parsed.search}` : parsed.toString();
}

function headersToLogObject(headers: Headers) {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? "[redacted]" : value;
  });
  return out;
}

async function readBodyForLog(source: Request | Response) {
  try {
    const text = await source.clone().text();
    return formatBodyForLog(text, source.headers.get("content-type") ?? "");
  } catch (error) {
    return { unavailable: true, error: String(error?.message ?? error) };
  }
}

function formatBodyForLog(text: string, contentType: string) {
  if (!text) return "";

  const trimmed = text.trim();
  const looksJson = contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[");
  if (looksJson) {
    try {
      const value = redactLogValue(JSON.parse(text));
      const serialized = JSON.stringify(value);
      if (serialized.length > API_LOG_BODY_LIMIT) {
        return {
          preview: serialized.slice(0, API_LOG_BODY_LIMIT),
          truncated: true,
          length: serialized.length,
        };
      }
      return value;
    } catch (error) {
      // Fall through to raw text preview.
    }
  }

  if (text.length > API_LOG_BODY_LIMIT) {
    return {
      preview: text.slice(0, API_LOG_BODY_LIMIT),
      truncated: true,
      length: text.length,
    };
  }
  return text;
}

function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      SENSITIVE_BODY_KEYS.has(key.toLowerCase()) ? "[redacted]" : redactLogValue(fieldValue),
    ]),
  );
}

function writeLogGroup(title: string, write: () => void) {
  if (typeof console.groupCollapsed === "function") {
    console.groupCollapsed(title);
    try {
      write();
    } finally {
      console.groupEnd();
    }
    return;
  }

  console.log(title);
  write();
}
