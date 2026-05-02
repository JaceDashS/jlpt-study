const ACCESS_TOKEN_ALIASES = ["access_token", "token"];
const ACCESS_TOKEN_PATH_PREFIX = "/__jlpt_access/";
const ACCESS_TOKEN_SESSION_KEY = "jlpt_access_token";
const API_BASE_ALIASES = ["api_base", "api_url"];
const API_BASE_SESSION_KEY = "jlpt_api_base_url";
const DEFAULT_LAN_API_PORT = "3001";

export function readApiBaseUrl() {
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

export function attachApiAccessToken(request: Request) {
  const token = readAccessToken();
  if (!token || request.headers.has("X-JLPT-Access-Token")) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set("X-JLPT-Access-Token", token);
  return new Request(request, { headers });
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
