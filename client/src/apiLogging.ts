const API_LOG_BODY_LIMIT = 8000;
const SENSITIVE_HEADER_KEYS = new Set(["authorization", "cookie", "set-cookie", "x-api-key", "x-jlpt-access-token"]);
const SENSITIVE_BODY_KEYS = new Set(["access_token", "authorization", "cookie", "password", "secret", "token", "x-api-key"]);
const SENSITIVE_QUERY_KEYS = new Set(["access_token", "password", "secret", "token"]);

export function formatRequestTarget(url: string) {
  const base = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const parsed = new URL(url, base);
  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      parsed.searchParams.set(key, "[redacted]");
    }
  }
  return parsed.origin === base ? `${parsed.pathname}${parsed.search}` : parsed.toString();
}

export function headersToLogObject(headers: Headers) {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? "[redacted]" : value;
  });
  return out;
}

export async function readBodyForLog(source: Request | Response) {
  try {
    const text = await source.clone().text();
    return formatBodyForLog(text, source.headers.get("content-type") ?? "");
  } catch (error) {
    return { unavailable: true, error: String(error instanceof Error ? error.message : error) };
  }
}

export function writeLogGroup(title: string, write: () => void) {
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
