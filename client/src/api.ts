import { attachApiAccessToken, readApiBaseUrl } from "./apiConfig.ts";
import { formatRequestTarget, headersToLogObject, readBodyForLog, writeLogGroup } from "./apiLogging.ts";

type QueryValue = string | number | boolean | null | undefined;

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

function writeQueryParams(url: URL, query?: Record<string, QueryValue>) {
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    url.searchParams.set(key, String(value));
  });
}

function isApiRequest(url: string) {
  try {
    const parsed = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    return parsed.pathname.startsWith("/api/");
  } catch (error) {
    return false;
  }
}
