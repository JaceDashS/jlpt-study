// vite.config.js
import { defineConfig } from "file:///C:/workspace/dev/jlpt-study/node_modules/vite/dist/node/index.js";
import react from "file:///C:/workspace/dev/jlpt-study/node_modules/@vitejs/plugin-react/dist/index.js";

// dev-mobile-access.js
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import https from "node:https";
import os from "node:os";
var ACCESS_TOKEN_PARAM = "access_token";
var ACCESS_TOKEN_ALIASES = [ACCESS_TOKEN_PARAM, "token"];
var ACCESS_TOKEN_COOKIE = "jlpt_access_token";
var ACCESS_TOKEN_HEADER = "x-jlpt-access-token";
var ACCESS_TOKEN_PATH_PREFIX = "/__jlpt_access/";
var ACCESS_TOKEN_SESSION_KEY = "jlpt_access_token";
var API_BASE_PARAM = "api_base";
var API_BASE_ALIASES = [API_BASE_PARAM, "api_url"];
var API_BASE_SESSION_KEY = "jlpt_api_base_url";
var ACCESS_TOKEN = process.env.JLPT_ACCESS_TOKEN || crypto.randomBytes(24).toString("base64url");
var AUTHORIZED_CLIENT_TTL_MS = 12 * 60 * 60 * 1e3;
var CLOUDFLARED_OPEN_TIMEOUT_MS = 45e3;
var CLOUDFLARED_URL_PATTERN = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.trycloudflare\.com/i;
var authorizedClients = /* @__PURE__ */ new Map();
var cloudflaredLogSignatures = /* @__PURE__ */ new Set();
var activeCloudflareTunnel = null;
var cloudflareTunnelStartPromise = null;
var QR_VERSION = 10;
var QR_SIZE = QR_VERSION * 4 + 17;
var QR_DATA_CODEWORDS = 274;
var QR_BLOCK_DATA_LENGTHS = [68, 68, 69, 69];
var QR_ECC_CODEWORDS_PER_BLOCK = 18;
var QR_ECC_FORMAT_BITS_LOW = 1;
var QR_ALIGNMENT_POSITIONS = [6, 28, 50];
function getDevServerConfig() {
  return {
    host: "0.0.0.0",
    port: readPortFromEnv(),
    allowedHosts: true
  };
}
function mobileAccessPlugin() {
  return {
    name: "jlpt-mobile-access",
    transformIndexHtml(html) {
      return html.replace("</head>", `${createAccessTokenCleanupScript()}</head>`);
    },
    configureServer(server) {
      installAccessMiddleware(server);
      server.httpServer?.once("listening", () => {
        printMobileAccessInfo(server).catch((error) => {
          console.warn(`[jlpt access] Failed to print mobile access info: ${String(error?.message ?? error)}`);
        });
      });
      server.httpServer?.once("close", () => {
        closeActiveCloudflareTunnel();
      });
    },
    configurePreviewServer(server) {
      if (!shouldUsePreviewAccessControl()) return;
      installAccessMiddleware(server, {
        attachApiAccessToken: true,
        trustLoopbackHost: true
      });
    }
  };
}
function installAccessMiddleware(server, options = {}) {
  const { attachApiAccessToken = false, trustLoopbackHost = false } = options;
  server.middlewares.use((req, res, next) => {
    const queryToken = readQueryToken(req);
    const hasValidQueryToken = isValidAccessToken(queryToken);
    const hasValidPathToken = isValidAccessToken(readPathToken(req));
    const hasValidHeaderToken = isValidAccessToken(readHeaderToken(req));
    const hasValidCookieToken = isValidAccessToken(readCookieToken(req));
    const hasAuthorizedClient = isAuthorizedClient(req);
    const hasTrustedInternalLanClient = isTrustedInternalLanRequest(req);
    const hasTrustedLoopbackHost = trustLoopbackHost && isTrustedLoopbackHostRequest(req);
    if (!hasValidQueryToken && !hasValidPathToken && !hasValidHeaderToken && !hasValidCookieToken && !hasAuthorizedClient && !hasTrustedInternalLanClient && !hasTrustedLoopbackHost) {
      rejectUnauthorizedHttp(res);
      return;
    }
    if (hasValidQueryToken || hasValidPathToken || hasValidHeaderToken) {
      authorizeClient(req);
      setAccessCookie(res);
    }
    if (attachApiAccessToken && isApiRequest(req)) {
      req.headers[ACCESS_TOKEN_HEADER] = ACCESS_TOKEN;
    }
    next();
  });
  server.httpServer?.prependListener("upgrade", (req, socket) => {
    if (isValidAccessToken(readQueryToken(req)) || isValidAccessToken(readPathToken(req)) || isValidAccessToken(readHeaderToken(req)) || isValidAccessToken(readCookieToken(req)) || isAuthorizedClient(req) || isTrustedInternalLanRequest(req) || trustLoopbackHost && isTrustedLoopbackHostRequest(req)) {
      return;
    }
    socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
  });
}
function authorizeClient(req) {
  const address = readClientAddress(req);
  if (!address) return;
  authorizedClients.set(address, Date.now());
  cleanupAuthorizedClients();
}
function isAuthorizedClient(req) {
  const address = readClientAddress(req);
  if (!address) return false;
  const authorizedAt = authorizedClients.get(address);
  if (!authorizedAt) return false;
  if (Date.now() - authorizedAt > AUTHORIZED_CLIENT_TTL_MS) {
    authorizedClients.delete(address);
    return false;
  }
  return true;
}
function cleanupAuthorizedClients() {
  const now = Date.now();
  for (const [address, authorizedAt] of authorizedClients.entries()) {
    if (now - authorizedAt > AUTHORIZED_CLIENT_TTL_MS) {
      authorizedClients.delete(address);
    }
  }
}
function isTrustedInternalLanRequest(req) {
  return isPrivateIpv4(readClientAddress(req));
}
function isTrustedLoopbackHostRequest(req) {
  const hostname = readRequestHostname(req);
  return isLoopbackHostname(hostname);
}
function isApiRequest(req) {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    return url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}
function readRequestHostname(req) {
  const host = String(req.headers?.host ?? "").trim();
  if (!host) return "";
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return host.split(":")[0] ?? "";
  }
}
function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]" || normalized.endsWith(".localhost");
}
function readClientAddress(req) {
  const address = req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? "";
  return normalizeClientAddress(address);
}
function normalizeClientAddress(address) {
  const text = String(address ?? "").trim();
  if (!text) return "";
  if (text.startsWith("::ffff:")) return text.slice("::ffff:".length);
  return text;
}
function createAccessTokenCleanupScript() {
  return `<script>(function(){try{var u=new URL(window.location.href);var changed=false;var token="";var pathPrefix=${JSON.stringify(
    ACCESS_TOKEN_PATH_PREFIX
  )};if(u.pathname.indexOf(pathPrefix)===0){var rest=u.pathname.slice(pathPrefix.length);var slash=rest.indexOf("/");var raw=slash>=0?rest.slice(0,slash):rest;if(raw){try{token=decodeURIComponent(raw);}catch(e){token=raw;}u.pathname="/";changed=true;}}var tokenKeys=${JSON.stringify(
    ACCESS_TOKEN_ALIASES
  )};for(var i=0;i<tokenKeys.length;i++){var k=tokenKeys[i];if(u.searchParams.has(k)){token=token||u.searchParams.get(k)||"";u.searchParams.delete(k);changed=true;}}var apiBase="";var apiKeys=${JSON.stringify(
    API_BASE_ALIASES
  )};for(var j=0;j<apiKeys.length;j++){var a=apiKeys[j];if(u.searchParams.has(a)){apiBase=apiBase||u.searchParams.get(a)||"";u.searchParams.delete(a);changed=true;}}try{if(token)sessionStorage.setItem(${JSON.stringify(
    ACCESS_TOKEN_SESSION_KEY
  )},token);if(apiBase)sessionStorage.setItem(${JSON.stringify(
    API_BASE_SESSION_KEY
  )},apiBase);}catch(e){}if(changed){window.history.replaceState(null,"",u.pathname+u.search+u.hash);}}catch(e){}}());</script>`;
}
function readPortFromEnv() {
  const rawPort = process.env.JLPT_DEV_PORT ?? process.env.PORT;
  if (!rawPort) return void 0;
  const port = Number(rawPort);
  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }
  console.warn(`[jlpt access] Ignoring invalid port: ${rawPort}`);
  return void 0;
}
function readQueryToken(req) {
  const url = new URL(req.url ?? "/", "http://localhost");
  for (const key of ACCESS_TOKEN_ALIASES) {
    const token = url.searchParams.get(key);
    if (token) return token;
  }
  return "";
}
function readPathToken(req) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(ACCESS_TOKEN_PATH_PREFIX)) return "";
  const rest = url.pathname.slice(ACCESS_TOKEN_PATH_PREFIX.length);
  const slash = rest.indexOf("/");
  const rawToken = slash >= 0 ? rest.slice(0, slash) : rest;
  if (!rawToken) return "";
  try {
    return decodeURIComponent(rawToken);
  } catch {
    return rawToken;
  }
}
function readCookieToken(req) {
  const cookieHeader = String(req.headers.cookie ?? "");
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    const key = cookie.slice(0, separator).trim();
    if (key !== ACCESS_TOKEN_COOKIE) continue;
    const rawValue = cookie.slice(separator + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return "";
}
function readHeaderToken(req) {
  return String(req.headers?.[ACCESS_TOKEN_HEADER] ?? "").trim();
}
function isValidAccessToken(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const expected = Buffer.from(ACCESS_TOKEN);
  const actual = Buffer.from(candidate);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function setAccessCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(ACCESS_TOKEN)}; Path=/; HttpOnly; SameSite=Lax`
  );
}
function rejectUnauthorizedHttp(res) {
  res.statusCode = 401;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Unauthorized. Start from the QR URL printed by the dev server.\n");
}
async function printMobileAccessInfo(server) {
  const port = readBoundPort(server);
  const apiPort = readApiPortFromEnv();
  console.log("");
  console.log("[jlpt access] Mobile/network dev server is bound to 0.0.0.0");
  console.log(`[jlpt access] Token: ${ACCESS_TOKEN}`);
  console.log("[jlpt access] Scan the INTERNAL_LAN QR when your phone is on the same Wi-Fi/LAN. No token is required on LAN.");
  console.log("");
  printAccessTarget(readLanAccessTarget(port, apiPort));
  const externalAccessTarget = await readExternalAccessTarget(port);
  if (externalAccessTarget) {
    printAccessTarget(externalAccessTarget);
  }
}
function readBoundPort(server) {
  const address = server.httpServer?.address();
  if (address && typeof address === "object") return address.port;
  return readPortFromEnv() ?? 5173;
}
function printAccessTarget(target) {
  console.log(`[jlpt access] ===== ${target.label} QR =====`);
  console.log(`[jlpt access] ${target.description}`);
  if (target.note) {
    console.log(`[jlpt access] ${target.note}`);
  }
  console.log(`[jlpt access] ${target.label} URL: ${target.url}`);
  console.log("");
  try {
    console.log("[jlpt access] QR IMAGE BEGIN");
    console.log(renderQr(target.url, { unicode: shouldRenderUnicodeQr() }));
    console.log("[jlpt access] QR IMAGE END");
  } catch (error) {
    console.warn(`[jlpt access] ${target.label} QR render skipped: ${String(error?.message ?? error)}`);
  }
  console.log(`[jlpt access] ===== ${target.label} QR END =====`);
  console.log("");
}
function shouldRenderUnicodeQr() {
  const ascii = String(process.env.JLPT_QR_ASCII ?? "").trim().toLowerCase();
  if (ascii === "1" || ascii === "true") return false;
  const unicode = String(process.env.JLPT_QR_UNICODE ?? "").trim().toLowerCase();
  if (unicode === "0" || unicode === "false") return false;
  return true;
}
function readApiPortFromEnv() {
  const rawPort = process.env.JLPT_API_PORT ?? "3001";
  const port = Number(rawPort);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3001;
}
function readLanAccessTarget(port, apiPort) {
  const manualHost = String(process.env.JLPT_LAN_HOST ?? "").trim();
  if (manualHost) {
    const host2 = formatUrlHost(manualHost);
    return {
      label: "INTERNAL_LAN",
      description: "Use this without a token when your phone is on the same Wi-Fi/LAN as this PC.",
      url: addApiBaseParamToUrl(`http://${host2}:${port}/`, {
        apiBaseUrl: `http://${host2}:${apiPort}/api`
      }),
      note: "LAN host override: JLPT_LAN_HOST"
    };
  }
  const candidates = readLanIpv4Candidates();
  const host = candidates[0]?.address ?? "localhost";
  const formattedHost = formatUrlHost(host);
  const note = candidates.length > 1 ? `LAN candidates: ${formatLanCandidates(candidates)}` : "";
  return {
    label: "INTERNAL_LAN",
    description: "Use this without a token when your phone is on the same Wi-Fi/LAN as this PC.",
    url: addApiBaseParamToUrl(`http://${formattedHost}:${port}/`, {
      apiBaseUrl: `http://${formattedHost}:${apiPort}/api`
    }),
    note
  };
}
async function readExternalAccessTarget(port) {
  const publicUrl = process.env.JLPT_PUBLIC_URL;
  if (publicUrl) {
    const publicBaseUrl2 = normalizeUrl(publicUrl);
    return {
      label: "EXTERNAL_INTERNET",
      description: "Use this from another network through the configured public URL.",
      url: addAccessParamsToUrl(publicBaseUrl2, {
        apiBaseUrl: readPublicApiBaseUrl(publicBaseUrl2),
        token: ACCESS_TOKEN
      }),
      note: "Public URL override: JLPT_PUBLIC_URL"
    };
  }
  if (shouldUseCloudflareTunnel()) {
    const cloudflareTunnelAccess = await readCloudflareTunnelAccess(port);
    if (!cloudflareTunnelAccess) return null;
    return {
      label: "EXTERNAL_CLOUDFLARE",
      description: "Use this from another network through Cloudflare Tunnel.",
      url: addPathAccessTokenToUrl(cloudflareTunnelAccess.baseUrl, { token: ACCESS_TOKEN }),
      note: formatCloudflareTunnelNote(cloudflareTunnelAccess)
    };
  }
  const publicBaseUrl = await readPublicIpBaseUrl(port);
  if (!publicBaseUrl) return null;
  return {
    label: "EXTERNAL_INTERNET",
    description: "Use this from another network. Port forwarding/firewall access must be configured first.",
    url: addAccessParamsToUrl(publicBaseUrl, {
      apiBaseUrl: readPublicApiBaseUrl(publicBaseUrl),
      token: ACCESS_TOKEN
    })
  };
}
function readPublicApiBaseUrl(publicBaseUrl) {
  const rawApiUrl = process.env.JLPT_PUBLIC_API_URL ?? process.env.JLPT_API_PUBLIC_URL;
  if (rawApiUrl) return normalizeApiBaseUrl(rawApiUrl);
  const url = new URL(publicBaseUrl);
  url.pathname = "/api";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
async function readPublicIpBaseUrl(port) {
  const host = process.env.JLPT_ACCESS_HOST ?? await readPublicIpv4Address();
  if (!host) return null;
  return `http://${formatUrlHost(host)}:${port}/`;
}
async function readCloudflareTunnelAccess(port) {
  try {
    const tunnel = await openActiveCloudflareTunnel(port);
    return {
      baseUrl: normalizeUrl(tunnel.url),
      command: tunnel.command,
      targetUrl: tunnel.targetUrl
    };
  } catch (error) {
    console.warn(`[jlpt access] Cloudflare Tunnel failed: ${String(error?.message ?? error)}`);
    console.warn("[jlpt access] No external QR will be printed. Install cloudflared or set JLPT_CLOUDFLARED_BIN to cloudflared.exe.");
    return null;
  }
}
function shouldUseCloudflareTunnel() {
  const rawValue = String(process.env.JLPT_CLOUDFLARED ?? process.env.JLPT_CLOUDFLARE_TUNNEL ?? "1").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(rawValue);
}
function shouldUsePreviewAccessControl() {
  const rawValue = String(process.env.JLPT_PREVIEW_ACCESS_CONTROL ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(rawValue);
}
function openActiveCloudflareTunnel(port) {
  if (activeCloudflareTunnel) return Promise.resolve(activeCloudflareTunnel);
  if (cloudflareTunnelStartPromise) return cloudflareTunnelStartPromise;
  const targetUrl = createCloudflareTunnelTargetUrl(port);
  const timeoutMs = readCloudflareOpenTimeoutMs();
  console.log(`[jlpt access] Starting Cloudflare Tunnel for ${targetUrl}`);
  cloudflareTunnelStartPromise = openCloudflareTunnelWithTimeout(targetUrl, timeoutMs).then((tunnel) => {
    activeCloudflareTunnel = tunnel;
    console.log(`[jlpt access] Cloudflare Tunnel URL: ${tunnel.url}`);
    return tunnel;
  }).catch((error) => {
    cloudflareTunnelStartPromise = null;
    throw error;
  });
  return cloudflareTunnelStartPromise;
}
function createCloudflareTunnelTargetUrl(port) {
  const host = String(process.env.JLPT_CLOUDFLARED_LOCAL_HOST ?? process.env.JLPT_CLOUDFLARE_TUNNEL_LOCAL_HOST ?? "127.0.0.1").trim();
  return `http://${formatUrlHost(host)}:${port}/`;
}
function readCloudflareOpenTimeoutMs() {
  const rawValue = process.env.JLPT_CLOUDFLARED_TIMEOUT_MS ?? process.env.JLPT_CLOUDFLARE_TUNNEL_TIMEOUT_MS;
  const timeoutMs = Number(rawValue);
  return Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : CLOUDFLARED_OPEN_TIMEOUT_MS;
}
async function openCloudflareTunnelWithTimeout(targetUrl, timeoutMs) {
  const commands = readCloudflaredCommandCandidates();
  const errors = [];
  for (const command of commands) {
    try {
      return await spawnCloudflaredTunnel(command, targetUrl, timeoutMs);
    } catch (error) {
      errors.push(`${command}: ${String(error?.message ?? error)}`);
    }
  }
  throw new Error(errors.join("; "));
}
function spawnCloudflaredTunnel(command, targetUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = ["tunnel", "--url", targetUrl];
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let settled = false;
    let output = "";
    let lineBuffer = "";
    const timeout = setTimeout(() => {
      fail(new Error(`cloudflared did not print a trycloudflare.com URL within ${timeoutMs}ms`));
    }, timeoutMs);
    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!child.killed && child.exitCode === null) {
        try {
          child.kill();
        } catch {
        }
      }
      const preview = output.trim().split(/\r?\n/).slice(-6).join(" | ");
      reject(preview ? new Error(`${error.message}. Last output: ${preview}`) : error);
    }
    function finish(url) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        command,
        process: child,
        targetUrl,
        url
      });
    }
    function handleOutput(chunk) {
      const text = String(chunk);
      if (!settled) {
        output += text;
      }
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        printCloudflaredLine(line);
      }
      if (settled) return;
      const match = output.match(CLOUDFLARED_URL_PATTERN);
      if (match) {
        finish(normalizeUrl(match[0]));
      }
    }
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", handleOutput);
    child.stderr?.on("data", handleOutput);
    child.once("error", (error) => {
      fail(error);
    });
    child.once("exit", (code, signal) => {
      if (activeCloudflareTunnel?.process === child) {
        activeCloudflareTunnel = null;
        cloudflareTunnelStartPromise = null;
        console.log(`[jlpt access] Cloudflare Tunnel closed${signal ? ` by signal ${signal}` : code === null ? "" : ` with code ${code}`}`);
      }
      if (!settled) {
        fail(new Error(`cloudflared exited before opening a tunnel${signal ? ` by signal ${signal}` : code === null ? "" : ` with code ${code}`}`));
      }
    });
  });
}
function printCloudflaredLine(line) {
  const text = String(line ?? "").trim();
  if (!text) return;
  if (CLOUDFLARED_URL_PATTERN.test(text) || /requesting|created|registered|error|failed|err/i.test(text)) {
    const signature = createCloudflaredLogSignature(text);
    if (cloudflaredLogSignatures.has(signature)) return;
    rememberCloudflaredLogSignature(signature);
    console.log(`[jlpt access] cloudflared: ${text}`);
  }
}
function createCloudflaredLogSignature(text) {
  return String(text).replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+/, "").replace(/\bconnIndex=\d+\b/g, "connIndex=*").replace(/\bevent=\d+\b/g, "event=*").replace(/\bip=\S+/g, "ip=*");
}
function rememberCloudflaredLogSignature(signature) {
  if (cloudflaredLogSignatures.size >= 200) {
    const first = cloudflaredLogSignatures.values().next().value;
    cloudflaredLogSignatures.delete(first);
  }
  cloudflaredLogSignatures.add(signature);
}
function readCloudflaredCommandCandidates() {
  const configured = String(process.env.JLPT_CLOUDFLARED_BIN ?? process.env.JLPT_CLOUDFLARE_TUNNEL_BIN ?? "").trim();
  if (configured) return [configured];
  if (process.platform === "win32") {
    return uniqueStrings([
      ...readWindowsCloudflaredServiceCommandCandidates(),
      "cloudflared.exe",
      "cloudflared",
      "C:\\Program Files\\cloudflared\\cloudflared.exe",
      "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
      "C:\\Windows\\System32\\cloudflared.exe",
      "C:\\Windows\\Sysnative\\cloudflared.exe"
    ]);
  }
  return ["cloudflared"];
}
function readWindowsCloudflaredServiceCommandCandidates() {
  try {
    const result = spawnSync("sc.exe", ["qc", "Cloudflared"], {
      encoding: "utf8",
      windowsHide: true
    });
    const output = `${result.stdout ?? ""}
${result.stderr ?? ""}`;
    const match = /BINARY_PATH_NAME\s*:\s*(?:"([^"]*cloudflared\.exe)"|([^\r\n]*cloudflared\.exe))/i.exec(output);
    const command = (match?.[1] ?? match?.[2] ?? "").trim();
    return command ? [command] : [];
  } catch {
    return [];
  }
}
function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}
function closeActiveCloudflareTunnel() {
  if (!activeCloudflareTunnel) return;
  const tunnel = activeCloudflareTunnel;
  activeCloudflareTunnel = null;
  cloudflareTunnelStartPromise = null;
  if (!tunnel.process.killed && tunnel.process.exitCode === null) {
    tunnel.process.kill();
  }
}
function formatCloudflareTunnelNote(tunnel) {
  const notes = ["Cloudflare Tunnel is enabled by default; set JLPT_CLOUDFLARED=0 to disable it."];
  if (tunnel.command) notes.push(`cloudflared command: ${tunnel.command}.`);
  if (tunnel.targetUrl) notes.push(`Forwarding to ${tunnel.targetUrl}`);
  return notes.join(" ");
}
function normalizeUrl(rawUrl) {
  const text = String(rawUrl).trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  const url = new URL(withProtocol);
  if (!url.pathname) url.pathname = "/";
  return url.toString();
}
function addAccessParamsToUrl(baseUrl, { apiBaseUrl, token }) {
  const url = new URL(baseUrl);
  url.searchParams.set(ACCESS_TOKEN_PARAM, token);
  if (apiBaseUrl) {
    url.searchParams.set(API_BASE_PARAM, normalizeApiBaseUrl(apiBaseUrl));
  }
  return url.toString();
}
function addApiBaseParamToUrl(baseUrl, { apiBaseUrl }) {
  const url = new URL(baseUrl);
  if (apiBaseUrl) {
    url.searchParams.set(API_BASE_PARAM, normalizeApiBaseUrl(apiBaseUrl));
  }
  return url.toString();
}
function addPathAccessTokenToUrl(baseUrl, { token }) {
  const url = new URL(baseUrl);
  url.pathname = `${ACCESS_TOKEN_PATH_PREFIX}${encodeURIComponent(token)}/`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
function normalizeApiBaseUrl(rawUrl) {
  const text = String(rawUrl).trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  const url = new URL(withProtocol);
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/api";
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
function formatUrlHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
async function readPublicIpv4Address() {
  const endpoints = ["https://api.ipify.org", "https://checkip.amazonaws.com"];
  for (const endpoint of endpoints) {
    try {
      const text = await readHttpsText(endpoint, 2500);
      const address = text.trim();
      if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) {
        return address;
      }
    } catch {
    }
  }
  console.warn("[jlpt access] Public IP lookup failed; Internet QR will not be printed unless JLPT_PUBLIC_URL or JLPT_ACCESS_HOST is set.");
  return null;
}
function readHttpsText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve(body));
    });
    req.on("timeout", () => {
      req.destroy(new Error("Public IP lookup timed out"));
    });
    req.on("error", reject);
  });
}
function readLanIpv4Candidates() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      candidates.push({
        name,
        address: entry.address,
        score: scoreLanCandidate(name, entry.address)
      });
    }
  }
  return candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return `${left.name} ${left.address}`.localeCompare(`${right.name} ${right.address}`);
  });
}
function scoreLanCandidate(name, address) {
  const normalizedName = String(name).toLowerCase();
  let score = 0;
  if (isPrivateIpv4(address)) score += 100;
  if (address.startsWith("192.168.")) score += 30;
  if (address.startsWith("10.")) score += 20;
  if (isPrivate172Ipv4(address)) score += 10;
  if (/wi-?fi|wlan|wireless/.test(normalizedName)) score += 40;
  if (/ethernet|lan/.test(normalizedName)) score += 30;
  if (/virtual|vethernet|vmware|virtualbox|docker|wsl|hyper-v|vpn|tailscale|zerotier|tap|tun/.test(normalizedName)) {
    score -= 100;
  }
  return score;
}
function formatLanCandidates(candidates) {
  return candidates.map((candidate) => `${candidate.name}=${candidate.address}`).join(", ");
}
function isPrivateIpv4(address) {
  return address.startsWith("10.") || address.startsWith("192.168.") || isPrivate172Ipv4(address);
}
function isPrivate172Ipv4(address) {
  const match = /^172\.(\d{1,3})\./.exec(address);
  if (!match) return false;
  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}
function renderQr(text, options = {}) {
  const matrix = createQrMatrix(text);
  if (!options.unicode) {
    return renderAsciiQr(matrix);
  }
  const border = 4;
  const renderedSize = matrix.length + border * 2;
  const halfBlock = "\u2580";
  const reset = "\x1B[0m";
  const blackFg = "\x1B[30m";
  const whiteFg = "\x1B[97m";
  const blackBg = "\x1B[40m";
  const whiteBg = "\x1B[107m";
  const lines = [];
  function isDark(x, y) {
    const mx = x - border;
    const my = y - border;
    return mx >= 0 && my >= 0 && mx < matrix.length && my < matrix.length && matrix[my][mx];
  }
  for (let y = 0; y < renderedSize; y += 2) {
    let line = "";
    for (let x = 0; x < renderedSize; x += 1) {
      const upperDark = isDark(x, y);
      const lowerDark = y + 1 < renderedSize && isDark(x, y + 1);
      line += `${upperDark ? blackFg : whiteFg}${lowerDark ? blackBg : whiteBg}${halfBlock}`;
    }
    lines.push(`${line}${reset}`);
  }
  return lines.join("\n");
}
function renderAsciiQr(matrix) {
  const border = 2;
  const renderedSize = matrix.length + border * 2;
  const lines = [];
  function isDark(x, y) {
    const mx = x - border;
    const my = y - border;
    return mx >= 0 && my >= 0 && mx < matrix.length && my < matrix.length && matrix[my][mx];
  }
  for (let y = 0; y < renderedSize; y += 1) {
    let line = "";
    for (let x = 0; x < renderedSize; x += 1) {
      line += isDark(x, y) ? "##" : "  ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}
function createQrMatrix(text) {
  const dataCodewords = createDataCodewords(text);
  const codewordBits = addErrorCorrection(dataCodewords).flatMap((codeword) => byteToBits(codeword));
  const base = createBaseQr();
  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const qr = cloneQr(base);
    drawCodewords(qr, codewordBits, mask);
    drawFormatBits(qr, mask);
    const penalty = calculatePenalty(qr.modules);
    if (!best || penalty < best.penalty) {
      best = { modules: qr.modules, penalty };
    }
  }
  return best.modules;
}
function createDataCodewords(text) {
  const bytes = Buffer.from(text, "utf8");
  const capacityBits = QR_DATA_CODEWORDS * 8;
  const bits = [];
  appendBits(bits, 4, 4);
  appendBits(bits, bytes.length, 16);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }
  if (bits.length > capacityBits) {
    throw new Error(`QR payload is too long for the built-in terminal renderer (${bytes.length} bytes)`);
  }
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(false);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) {
      value = value << 1 | (bits[i + j] ? 1 : 0);
    }
    codewords.push(value);
  }
  for (let pad = 0; codewords.length < QR_DATA_CODEWORDS; pad += 1) {
    codewords.push(pad % 2 === 0 ? 236 : 17);
  }
  return codewords;
}
function addErrorCorrection(dataCodewords) {
  const blocks = [];
  let offset = 0;
  for (const dataLength of QR_BLOCK_DATA_LENGTHS) {
    const data = dataCodewords.slice(offset, offset + dataLength);
    blocks.push({
      data,
      ecc: createReedSolomonRemainder(data, QR_ECC_CODEWORDS_PER_BLOCK)
    });
    offset += dataLength;
  }
  const result = [];
  const maxDataLength = Math.max(...QR_BLOCK_DATA_LENGTHS);
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) result.push(block.data[i]);
    }
  }
  for (let i = 0; i < QR_ECC_CODEWORDS_PER_BLOCK; i += 1) {
    for (const block of blocks) {
      result.push(block.ecc[i]);
    }
  }
  return result;
}
function createReedSolomonRemainder(data, degree) {
  const generator = createReedSolomonGenerator(degree);
  const message = [...data, ...Array(degree).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = message[i];
    if (factor === 0) continue;
    for (let j = 1; j < generator.length; j += 1) {
      message[i + j] ^= gfMultiply(generator[j], factor);
    }
  }
  return message.slice(data.length);
}
function createReedSolomonGenerator(degree) {
  let result = [1];
  for (let i = 0; i < degree; i += 1) {
    result = multiplyPolynomials(result, [1, gfPower(i)]);
  }
  return result;
}
function multiplyPolynomials(left, right) {
  const result = Array(left.length + right.length - 1).fill(0);
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      result[i + j] ^= gfMultiply(left[i], right[j]);
    }
  }
  return result;
}
function gfMultiply(left, right) {
  if (left === 0 || right === 0) return 0;
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}
function gfPower(power) {
  return GF_EXP[power];
}
function createBaseQr() {
  const qr = {
    modules: Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false)),
    reserved: Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false))
  };
  drawFinder(qr, 0, 0);
  drawFinder(qr, QR_SIZE - 7, 0);
  drawFinder(qr, 0, QR_SIZE - 7);
  drawTimingPatterns(qr);
  drawAlignmentPatterns(qr);
  reserveFormatBits(qr);
  drawVersionBits(qr);
  return qr;
}
function cloneQr(qr) {
  return {
    modules: qr.modules.map((row) => [...row]),
    reserved: qr.reserved.map((row) => [...row])
  };
}
function drawFinder(qr, left, top) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const x = left + dx;
      const y = top + dy;
      if (!isInQr(x, y)) continue;
      const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark = inPattern && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      setFunctionModule(qr, x, y, dark);
    }
  }
}
function drawTimingPatterns(qr) {
  for (let i = 8; i < QR_SIZE - 8; i += 1) {
    const dark = i % 2 === 0;
    setFunctionModule(qr, i, 6, dark);
    setFunctionModule(qr, 6, i, dark);
  }
}
function drawAlignmentPatterns(qr) {
  for (const y of QR_ALIGNMENT_POSITIONS) {
    for (const x of QR_ALIGNMENT_POSITIONS) {
      if (isOverlappingFinderCenter(x, y)) continue;
      drawAlignment(qr, x, y);
    }
  }
}
function isOverlappingFinderCenter(x, y) {
  const last = QR_SIZE - 7;
  return x === 6 && y === 6 || x === last && y === 6 || x === 6 && y === last;
}
function drawAlignment(qr, centerX, centerY) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(qr, centerX + dx, centerY + dy, distance === 0 || distance === 2);
    }
  }
}
function reserveFormatBits(qr) {
  for (let i = 0; i <= 5; i += 1) setFunctionModule(qr, 8, i, false);
  setFunctionModule(qr, 8, 7, false);
  setFunctionModule(qr, 8, 8, false);
  setFunctionModule(qr, 7, 8, false);
  for (let i = 9; i < 15; i += 1) setFunctionModule(qr, 14 - i, 8, false);
  for (let i = 0; i < 8; i += 1) setFunctionModule(qr, QR_SIZE - 1 - i, 8, false);
  for (let i = 8; i < 15; i += 1) setFunctionModule(qr, 8, QR_SIZE - 15 + i, false);
  setFunctionModule(qr, 8, QR_SIZE - 8, true);
}
function drawFormatBits(qr, mask) {
  const bits = createFormatBits(mask);
  for (let i = 0; i <= 5; i += 1) setFunctionModule(qr, 8, i, isBitSet(bits, i));
  setFunctionModule(qr, 8, 7, isBitSet(bits, 6));
  setFunctionModule(qr, 8, 8, isBitSet(bits, 7));
  setFunctionModule(qr, 7, 8, isBitSet(bits, 8));
  for (let i = 9; i < 15; i += 1) setFunctionModule(qr, 14 - i, 8, isBitSet(bits, i));
  for (let i = 0; i < 8; i += 1) setFunctionModule(qr, QR_SIZE - 1 - i, 8, isBitSet(bits, i));
  for (let i = 8; i < 15; i += 1) setFunctionModule(qr, 8, QR_SIZE - 15 + i, isBitSet(bits, i));
  setFunctionModule(qr, 8, QR_SIZE - 8, true);
}
function drawVersionBits(qr) {
  const bits = createVersionBits();
  for (let i = 0; i < 18; i += 1) {
    const x = QR_SIZE - 11 + i % 3;
    const y = Math.floor(i / 3);
    const dark = isBitSet(bits, i);
    setFunctionModule(qr, x, y, dark);
    setFunctionModule(qr, y, x, dark);
  }
}
function drawCodewords(qr, bits, mask) {
  let bitIndex = 0;
  let upward = true;
  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < QR_SIZE; vertical += 1) {
      const y = upward ? QR_SIZE - 1 - vertical : vertical;
      for (let dx = 0; dx < 2; dx += 1) {
        const x = right - dx;
        if (qr.reserved[y][x]) continue;
        const raw = bitIndex < bits.length ? bits[bitIndex] : false;
        qr.modules[y][x] = raw !== shouldMask(mask, x, y);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
  if (bitIndex !== bits.length) {
    throw new Error(`QR placement mismatch: placed ${bitIndex} bits, expected ${bits.length}`);
  }
}
function shouldMask(mask, x, y) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return x * y % 2 + x * y % 3 === 0;
    case 6:
      return (x * y % 2 + x * y % 3) % 2 === 0;
    case 7:
      return ((x + y) % 2 + x * y % 3) % 2 === 0;
    default:
      throw new Error(`Invalid QR mask: ${mask}`);
  }
}
function calculatePenalty(matrix) {
  return calculateRunPenalty(matrix) + calculateBlockPenalty(matrix) + calculateFinderPenalty(matrix) + calculateBalancePenalty(matrix);
}
function calculateRunPenalty(matrix) {
  let penalty = 0;
  for (let y = 0; y < QR_SIZE; y += 1) penalty += calculateLineRunPenalty(matrix[y]);
  for (let x = 0; x < QR_SIZE; x += 1) penalty += calculateLineRunPenalty(matrix.map((row) => row[x]));
  return penalty;
}
function calculateLineRunPenalty(line) {
  let penalty = 0;
  let runColor = line[0];
  let runLength = 1;
  for (let i = 1; i <= line.length; i += 1) {
    if (i < line.length && line[i] === runColor) {
      runLength += 1;
      continue;
    }
    if (runLength >= 5) penalty += runLength - 2;
    runColor = line[i];
    runLength = 1;
  }
  return penalty;
}
function calculateBlockPenalty(matrix) {
  let penalty = 0;
  for (let y = 0; y < QR_SIZE - 1; y += 1) {
    for (let x = 0; x < QR_SIZE - 1; x += 1) {
      const color = matrix[y][x];
      if (matrix[y][x + 1] === color && matrix[y + 1][x] === color && matrix[y + 1][x + 1] === color) {
        penalty += 3;
      }
    }
  }
  return penalty;
}
function calculateFinderPenalty(matrix) {
  const darkPattern = [true, false, true, true, true, false, true, false, false, false, false];
  const lightPattern = [false, false, false, false, true, false, true, true, true, false, true];
  let penalty = 0;
  for (let y = 0; y < QR_SIZE; y += 1) {
    penalty += countPatternPenalty(matrix[y], darkPattern);
    penalty += countPatternPenalty(matrix[y], lightPattern);
  }
  for (let x = 0; x < QR_SIZE; x += 1) {
    const column = matrix.map((row) => row[x]);
    penalty += countPatternPenalty(column, darkPattern);
    penalty += countPatternPenalty(column, lightPattern);
  }
  return penalty;
}
function countPatternPenalty(line, pattern) {
  let penalty = 0;
  for (let i = 0; i <= line.length - pattern.length; i += 1) {
    if (pattern.every((color, index) => line[i + index] === color)) {
      penalty += 40;
    }
  }
  return penalty;
}
function calculateBalancePenalty(matrix) {
  const total = QR_SIZE * QR_SIZE;
  const dark = matrix.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  return Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
}
function createFormatBits(mask) {
  const data = QR_ECC_FORMAT_BITS_LOW << 3 | mask;
  return (data << 10 | createBchRemainder(data, 1335)) ^ 21522;
}
function createVersionBits() {
  return QR_VERSION << 12 | createBchRemainder(QR_VERSION, 7973);
}
function createBchRemainder(data, generator) {
  let value = data << bitLength(generator) - 1;
  while (bitLength(value) >= bitLength(generator)) {
    value ^= generator << bitLength(value) - bitLength(generator);
  }
  return value;
}
function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i & 1) === 1);
  }
}
function byteToBits(byte) {
  return Array.from({ length: 8 }, (_, index) => (byte >>> 7 - index & 1) === 1);
}
function setFunctionModule(qr, x, y, dark) {
  if (!isInQr(x, y)) return;
  qr.modules[y][x] = Boolean(dark);
  qr.reserved[y][x] = true;
}
function isInQr(x, y) {
  return x >= 0 && y >= 0 && x < QR_SIZE && y < QR_SIZE;
}
function isBitSet(value, bit) {
  return (value >>> bit & 1) !== 0;
}
function bitLength(value) {
  let result = 0;
  for (let current = value; current > 0; current >>>= 1) result += 1;
  return result;
}
function createGaloisTables() {
  const exp = Array(512).fill(0);
  const log = Array(256).fill(0);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = value;
    log[value] = i;
    value <<= 1;
    if (value & 256) value ^= 285;
  }
  for (let i = 255; i < exp.length; i += 1) {
    exp[i] = exp[i - 255];
  }
  return { exp, log };
}
var { exp: GF_EXP, log: GF_LOG } = createGaloisTables();

// vite.config.js
function readApiPort() {
  const rawPort = process.env.JLPT_API_PORT ?? "3001";
  const port = Number(rawPort);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3001;
}
var vite_config_default = defineConfig({
  plugins: [mobileAccessPlugin(), react()],
  server: {
    ...getDevServerConfig(),
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${readApiPort()}`,
        changeOrigin: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiLCAiZGV2LW1vYmlsZS1hY2Nlc3MuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFx3b3Jrc3BhY2VcXFxcZGV2XFxcXGpscHQtc3R1ZHlcXFxcY2xpZW50XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFx3b3Jrc3BhY2VcXFxcZGV2XFxcXGpscHQtc3R1ZHlcXFxcY2xpZW50XFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi93b3Jrc3BhY2UvZGV2L2pscHQtc3R1ZHkvY2xpZW50L3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgeyBnZXREZXZTZXJ2ZXJDb25maWcsIG1vYmlsZUFjY2Vzc1BsdWdpbiB9IGZyb20gXCIuL2Rldi1tb2JpbGUtYWNjZXNzLmpzXCI7XHJcblxyXG5mdW5jdGlvbiByZWFkQXBpUG9ydCgpIHtcclxuICBjb25zdCByYXdQb3J0ID0gcHJvY2Vzcy5lbnYuSkxQVF9BUElfUE9SVCA/PyBcIjMwMDFcIjtcclxuICBjb25zdCBwb3J0ID0gTnVtYmVyKHJhd1BvcnQpO1xyXG4gIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHBvcnQpICYmIHBvcnQgPiAwICYmIHBvcnQgPD0gNjU1MzUgPyBwb3J0IDogMzAwMTtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBwbHVnaW5zOiBbbW9iaWxlQWNjZXNzUGx1Z2luKCksIHJlYWN0KCldLFxyXG4gIHNlcnZlcjoge1xyXG4gICAgLi4uZ2V0RGV2U2VydmVyQ29uZmlnKCksXHJcbiAgICBwcm94eToge1xyXG4gICAgICBcIi9hcGlcIjoge1xyXG4gICAgICAgIHRhcmdldDogYGh0dHA6Ly8xMjcuMC4wLjE6JHtyZWFkQXBpUG9ydCgpfWAsXHJcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9LFxyXG59KTtcclxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFx3b3Jrc3BhY2VcXFxcZGV2XFxcXGpscHQtc3R1ZHlcXFxcY2xpZW50XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFx3b3Jrc3BhY2VcXFxcZGV2XFxcXGpscHQtc3R1ZHlcXFxcY2xpZW50XFxcXGRldi1tb2JpbGUtYWNjZXNzLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi93b3Jrc3BhY2UvZGV2L2pscHQtc3R1ZHkvY2xpZW50L2Rldi1tb2JpbGUtYWNjZXNzLmpzXCI7aW1wb3J0IHsgc3Bhd24sIHNwYXduU3luYyB9IGZyb20gXCJub2RlOmNoaWxkX3Byb2Nlc3NcIjtcclxuaW1wb3J0IGNyeXB0byBmcm9tIFwibm9kZTpjcnlwdG9cIjtcclxuaW1wb3J0IGh0dHBzIGZyb20gXCJub2RlOmh0dHBzXCI7XHJcbmltcG9ydCBvcyBmcm9tIFwibm9kZTpvc1wiO1xyXG5cclxuY29uc3QgQUNDRVNTX1RPS0VOX1BBUkFNID0gXCJhY2Nlc3NfdG9rZW5cIjtcclxuY29uc3QgQUNDRVNTX1RPS0VOX0FMSUFTRVMgPSBbQUNDRVNTX1RPS0VOX1BBUkFNLCBcInRva2VuXCJdO1xyXG5jb25zdCBBQ0NFU1NfVE9LRU5fQ09PS0lFID0gXCJqbHB0X2FjY2Vzc190b2tlblwiO1xyXG5jb25zdCBBQ0NFU1NfVE9LRU5fSEVBREVSID0gXCJ4LWpscHQtYWNjZXNzLXRva2VuXCI7XHJcbmNvbnN0IEFDQ0VTU19UT0tFTl9QQVRIX1BSRUZJWCA9IFwiL19famxwdF9hY2Nlc3MvXCI7XHJcbmNvbnN0IEFDQ0VTU19UT0tFTl9TRVNTSU9OX0tFWSA9IFwiamxwdF9hY2Nlc3NfdG9rZW5cIjtcclxuY29uc3QgQVBJX0JBU0VfUEFSQU0gPSBcImFwaV9iYXNlXCI7XHJcbmNvbnN0IEFQSV9CQVNFX0FMSUFTRVMgPSBbQVBJX0JBU0VfUEFSQU0sIFwiYXBpX3VybFwiXTtcclxuY29uc3QgQVBJX0JBU0VfU0VTU0lPTl9LRVkgPSBcImpscHRfYXBpX2Jhc2VfdXJsXCI7XHJcbmNvbnN0IEFDQ0VTU19UT0tFTiA9IHByb2Nlc3MuZW52LkpMUFRfQUNDRVNTX1RPS0VOIHx8IGNyeXB0by5yYW5kb21CeXRlcygyNCkudG9TdHJpbmcoXCJiYXNlNjR1cmxcIik7XHJcbmNvbnN0IEFVVEhPUklaRURfQ0xJRU5UX1RUTF9NUyA9IDEyICogNjAgKiA2MCAqIDEwMDA7XHJcbmNvbnN0IENMT1VERkxBUkVEX09QRU5fVElNRU9VVF9NUyA9IDQ1XzAwMDtcclxuY29uc3QgQ0xPVURGTEFSRURfVVJMX1BBVFRFUk4gPSAvaHR0cHM6XFwvXFwvW2EtejAtOS1dKyg/OlxcLlthLXowLTktXSspKlxcLnRyeWNsb3VkZmxhcmVcXC5jb20vaTtcclxuY29uc3QgYXV0aG9yaXplZENsaWVudHMgPSBuZXcgTWFwKCk7XHJcbmNvbnN0IGNsb3VkZmxhcmVkTG9nU2lnbmF0dXJlcyA9IG5ldyBTZXQoKTtcclxubGV0IGFjdGl2ZUNsb3VkZmxhcmVUdW5uZWwgPSBudWxsO1xyXG5sZXQgY2xvdWRmbGFyZVR1bm5lbFN0YXJ0UHJvbWlzZSA9IG51bGw7XHJcblxyXG5jb25zdCBRUl9WRVJTSU9OID0gMTA7XHJcbmNvbnN0IFFSX1NJWkUgPSBRUl9WRVJTSU9OICogNCArIDE3O1xyXG5jb25zdCBRUl9EQVRBX0NPREVXT1JEUyA9IDI3NDtcclxuY29uc3QgUVJfQkxPQ0tfREFUQV9MRU5HVEhTID0gWzY4LCA2OCwgNjksIDY5XTtcclxuY29uc3QgUVJfRUNDX0NPREVXT1JEU19QRVJfQkxPQ0sgPSAxODtcclxuY29uc3QgUVJfRUNDX0ZPUk1BVF9CSVRTX0xPVyA9IDE7XHJcbmNvbnN0IFFSX0FMSUdOTUVOVF9QT1NJVElPTlMgPSBbNiwgMjgsIDUwXTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXREZXZTZXJ2ZXJDb25maWcoKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGhvc3Q6IFwiMC4wLjAuMFwiLFxyXG4gICAgcG9ydDogcmVhZFBvcnRGcm9tRW52KCksXHJcbiAgICBhbGxvd2VkSG9zdHM6IHRydWUsXHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1vYmlsZUFjY2Vzc1BsdWdpbigpIHtcclxuICByZXR1cm4ge1xyXG4gICAgbmFtZTogXCJqbHB0LW1vYmlsZS1hY2Nlc3NcIixcbiAgICB0cmFuc2Zvcm1JbmRleEh0bWwoaHRtbCkge1xuICAgICAgcmV0dXJuIGh0bWwucmVwbGFjZShcIjwvaGVhZD5cIiwgYCR7Y3JlYXRlQWNjZXNzVG9rZW5DbGVhbnVwU2NyaXB0KCl9PC9oZWFkPmApO1xuICAgIH0sXG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xuICAgICAgaW5zdGFsbEFjY2Vzc01pZGRsZXdhcmUoc2VydmVyKTtcblxuICAgICAgc2VydmVyLmh0dHBTZXJ2ZXI/Lm9uY2UoXCJsaXN0ZW5pbmdcIiwgKCkgPT4ge1xuICAgICAgICBwcmludE1vYmlsZUFjY2Vzc0luZm8oc2VydmVyKS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oYFtqbHB0IGFjY2Vzc10gRmFpbGVkIHRvIHByaW50IG1vYmlsZSBhY2Nlc3MgaW5mbzogJHtTdHJpbmcoZXJyb3I/Lm1lc3NhZ2UgPz8gZXJyb3IpfWApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHNlcnZlci5odHRwU2VydmVyPy5vbmNlKFwiY2xvc2VcIiwgKCkgPT4ge1xyXG4gICAgICAgIGNsb3NlQWN0aXZlQ2xvdWRmbGFyZVR1bm5lbCgpO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICBjb25maWd1cmVQcmV2aWV3U2VydmVyKHNlcnZlcikge1xuICAgICAgaWYgKCFzaG91bGRVc2VQcmV2aWV3QWNjZXNzQ29udHJvbCgpKSByZXR1cm47XG4gICAgICBpbnN0YWxsQWNjZXNzTWlkZGxld2FyZShzZXJ2ZXIsIHtcbiAgICAgICAgYXR0YWNoQXBpQWNjZXNzVG9rZW46IHRydWUsXG4gICAgICAgIHRydXN0TG9vcGJhY2tIb3N0OiB0cnVlLFxuICAgICAgfSk7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gaW5zdGFsbEFjY2Vzc01pZGRsZXdhcmUoc2VydmVyLCBvcHRpb25zID0ge30pIHtcbiAgY29uc3QgeyBhdHRhY2hBcGlBY2Nlc3NUb2tlbiA9IGZhbHNlLCB0cnVzdExvb3BiYWNrSG9zdCA9IGZhbHNlIH0gPSBvcHRpb25zO1xuXG4gIHNlcnZlci5taWRkbGV3YXJlcy51c2UoKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gICAgY29uc3QgcXVlcnlUb2tlbiA9IHJlYWRRdWVyeVRva2VuKHJlcSk7XG4gICAgY29uc3QgaGFzVmFsaWRRdWVyeVRva2VuID0gaXNWYWxpZEFjY2Vzc1Rva2VuKHF1ZXJ5VG9rZW4pO1xuICAgIGNvbnN0IGhhc1ZhbGlkUGF0aFRva2VuID0gaXNWYWxpZEFjY2Vzc1Rva2VuKHJlYWRQYXRoVG9rZW4ocmVxKSk7XG4gICAgY29uc3QgaGFzVmFsaWRIZWFkZXJUb2tlbiA9IGlzVmFsaWRBY2Nlc3NUb2tlbihyZWFkSGVhZGVyVG9rZW4ocmVxKSk7XG4gICAgY29uc3QgaGFzVmFsaWRDb29raWVUb2tlbiA9IGlzVmFsaWRBY2Nlc3NUb2tlbihyZWFkQ29va2llVG9rZW4ocmVxKSk7XG4gICAgY29uc3QgaGFzQXV0aG9yaXplZENsaWVudCA9IGlzQXV0aG9yaXplZENsaWVudChyZXEpO1xuICAgIGNvbnN0IGhhc1RydXN0ZWRJbnRlcm5hbExhbkNsaWVudCA9IGlzVHJ1c3RlZEludGVybmFsTGFuUmVxdWVzdChyZXEpO1xuICAgIGNvbnN0IGhhc1RydXN0ZWRMb29wYmFja0hvc3QgPSB0cnVzdExvb3BiYWNrSG9zdCAmJiBpc1RydXN0ZWRMb29wYmFja0hvc3RSZXF1ZXN0KHJlcSk7XG5cbiAgICBpZiAoXG4gICAgICAhaGFzVmFsaWRRdWVyeVRva2VuICYmXG4gICAgICAhaGFzVmFsaWRQYXRoVG9rZW4gJiZcbiAgICAgICFoYXNWYWxpZEhlYWRlclRva2VuICYmXG4gICAgICAhaGFzVmFsaWRDb29raWVUb2tlbiAmJlxuICAgICAgIWhhc0F1dGhvcml6ZWRDbGllbnQgJiZcbiAgICAgICFoYXNUcnVzdGVkSW50ZXJuYWxMYW5DbGllbnQgJiZcbiAgICAgICFoYXNUcnVzdGVkTG9vcGJhY2tIb3N0XG4gICAgKSB7XG4gICAgICByZWplY3RVbmF1dGhvcml6ZWRIdHRwKHJlcyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGhhc1ZhbGlkUXVlcnlUb2tlbiB8fCBoYXNWYWxpZFBhdGhUb2tlbiB8fCBoYXNWYWxpZEhlYWRlclRva2VuKSB7XG4gICAgICBhdXRob3JpemVDbGllbnQocmVxKTtcbiAgICAgIHNldEFjY2Vzc0Nvb2tpZShyZXMpO1xuICAgIH1cblxuICAgIGlmIChhdHRhY2hBcGlBY2Nlc3NUb2tlbiAmJiBpc0FwaVJlcXVlc3QocmVxKSkge1xuICAgICAgcmVxLmhlYWRlcnNbQUNDRVNTX1RPS0VOX0hFQURFUl0gPSBBQ0NFU1NfVE9LRU47XG4gICAgfVxuXG4gICAgbmV4dCgpO1xuICB9KTtcblxuICBzZXJ2ZXIuaHR0cFNlcnZlcj8ucHJlcGVuZExpc3RlbmVyKFwidXBncmFkZVwiLCAocmVxLCBzb2NrZXQpID0+IHtcbiAgICBpZiAoXG4gICAgICBpc1ZhbGlkQWNjZXNzVG9rZW4ocmVhZFF1ZXJ5VG9rZW4ocmVxKSkgfHxcbiAgICAgIGlzVmFsaWRBY2Nlc3NUb2tlbihyZWFkUGF0aFRva2VuKHJlcSkpIHx8XG4gICAgICBpc1ZhbGlkQWNjZXNzVG9rZW4ocmVhZEhlYWRlclRva2VuKHJlcSkpIHx8XG4gICAgICBpc1ZhbGlkQWNjZXNzVG9rZW4ocmVhZENvb2tpZVRva2VuKHJlcSkpIHx8XG4gICAgICBpc0F1dGhvcml6ZWRDbGllbnQocmVxKSB8fFxuICAgICAgaXNUcnVzdGVkSW50ZXJuYWxMYW5SZXF1ZXN0KHJlcSkgfHxcbiAgICAgICh0cnVzdExvb3BiYWNrSG9zdCAmJiBpc1RydXN0ZWRMb29wYmFja0hvc3RSZXF1ZXN0KHJlcSkpXG4gICAgKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHNvY2tldC5lbmQoXCJIVFRQLzEuMSA0MDEgVW5hdXRob3JpemVkXFxyXFxuQ29ubmVjdGlvbjogY2xvc2VcXHJcXG5cXHJcXG5cIik7XG4gIH0pO1xufVxuXHJcbmZ1bmN0aW9uIGF1dGhvcml6ZUNsaWVudChyZXEpIHtcclxuICBjb25zdCBhZGRyZXNzID0gcmVhZENsaWVudEFkZHJlc3MocmVxKTtcclxuICBpZiAoIWFkZHJlc3MpIHJldHVybjtcclxuICBhdXRob3JpemVkQ2xpZW50cy5zZXQoYWRkcmVzcywgRGF0ZS5ub3coKSk7XHJcbiAgY2xlYW51cEF1dGhvcml6ZWRDbGllbnRzKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzQXV0aG9yaXplZENsaWVudChyZXEpIHtcclxuICBjb25zdCBhZGRyZXNzID0gcmVhZENsaWVudEFkZHJlc3MocmVxKTtcclxuICBpZiAoIWFkZHJlc3MpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgY29uc3QgYXV0aG9yaXplZEF0ID0gYXV0aG9yaXplZENsaWVudHMuZ2V0KGFkZHJlc3MpO1xyXG4gIGlmICghYXV0aG9yaXplZEF0KSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKERhdGUubm93KCkgLSBhdXRob3JpemVkQXQgPiBBVVRIT1JJWkVEX0NMSUVOVF9UVExfTVMpIHtcclxuICAgIGF1dGhvcml6ZWRDbGllbnRzLmRlbGV0ZShhZGRyZXNzKTtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcbiAgcmV0dXJuIHRydWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsZWFudXBBdXRob3JpemVkQ2xpZW50cygpIHtcclxuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xyXG4gIGZvciAoY29uc3QgW2FkZHJlc3MsIGF1dGhvcml6ZWRBdF0gb2YgYXV0aG9yaXplZENsaWVudHMuZW50cmllcygpKSB7XHJcbiAgICBpZiAobm93IC0gYXV0aG9yaXplZEF0ID4gQVVUSE9SSVpFRF9DTElFTlRfVFRMX01TKSB7XHJcbiAgICAgIGF1dGhvcml6ZWRDbGllbnRzLmRlbGV0ZShhZGRyZXNzKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzVHJ1c3RlZEludGVybmFsTGFuUmVxdWVzdChyZXEpIHtcbiAgcmV0dXJuIGlzUHJpdmF0ZUlwdjQocmVhZENsaWVudEFkZHJlc3MocmVxKSk7XG59XG5cbmZ1bmN0aW9uIGlzVHJ1c3RlZExvb3BiYWNrSG9zdFJlcXVlc3QocmVxKSB7XG4gIGNvbnN0IGhvc3RuYW1lID0gcmVhZFJlcXVlc3RIb3N0bmFtZShyZXEpO1xuICByZXR1cm4gaXNMb29wYmFja0hvc3RuYW1lKGhvc3RuYW1lKTtcbn1cblxuZnVuY3Rpb24gaXNBcGlSZXF1ZXN0KHJlcSkge1xuICB0cnkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxLnVybCA/PyBcIi9cIiwgXCJodHRwOi8vbG9jYWxob3N0XCIpO1xuICAgIHJldHVybiB1cmwucGF0aG5hbWUuc3RhcnRzV2l0aChcIi9hcGkvXCIpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVhZFJlcXVlc3RIb3N0bmFtZShyZXEpIHtcbiAgY29uc3QgaG9zdCA9IFN0cmluZyhyZXEuaGVhZGVycz8uaG9zdCA/PyBcIlwiKS50cmltKCk7XG4gIGlmICghaG9zdCkgcmV0dXJuIFwiXCI7XG4gIHRyeSB7XG4gICAgcmV0dXJuIG5ldyBVUkwoYGh0dHA6Ly8ke2hvc3R9YCkuaG9zdG5hbWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBob3N0LnNwbGl0KFwiOlwiKVswXSA/PyBcIlwiO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzTG9vcGJhY2tIb3N0bmFtZShob3N0bmFtZSkge1xuICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKGhvc3RuYW1lID8/IFwiXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICByZXR1cm4gbm9ybWFsaXplZCA9PT0gXCJsb2NhbGhvc3RcIiB8fCBub3JtYWxpemVkID09PSBcIjEyNy4wLjAuMVwiIHx8IG5vcm1hbGl6ZWQgPT09IFwiOjoxXCIgfHwgbm9ybWFsaXplZCA9PT0gXCJbOjoxXVwiIHx8IG5vcm1hbGl6ZWQuZW5kc1dpdGgoXCIubG9jYWxob3N0XCIpO1xufVxuXG5mdW5jdGlvbiByZWFkQ2xpZW50QWRkcmVzcyhyZXEpIHtcbiAgY29uc3QgYWRkcmVzcyA9IHJlcS5zb2NrZXQ/LnJlbW90ZUFkZHJlc3MgPz8gcmVxLmNvbm5lY3Rpb24/LnJlbW90ZUFkZHJlc3MgPz8gXCJcIjtcbiAgcmV0dXJuIG5vcm1hbGl6ZUNsaWVudEFkZHJlc3MoYWRkcmVzcyk7XG59XG5cclxuZnVuY3Rpb24gbm9ybWFsaXplQ2xpZW50QWRkcmVzcyhhZGRyZXNzKSB7XHJcbiAgY29uc3QgdGV4dCA9IFN0cmluZyhhZGRyZXNzID8/IFwiXCIpLnRyaW0oKTtcclxuICBpZiAoIXRleHQpIHJldHVybiBcIlwiO1xyXG4gIGlmICh0ZXh0LnN0YXJ0c1dpdGgoXCI6OmZmZmY6XCIpKSByZXR1cm4gdGV4dC5zbGljZShcIjo6ZmZmZjpcIi5sZW5ndGgpO1xyXG4gIHJldHVybiB0ZXh0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVBY2Nlc3NUb2tlbkNsZWFudXBTY3JpcHQoKSB7XHJcbiAgcmV0dXJuIGA8c2NyaXB0PihmdW5jdGlvbigpe3RyeXt2YXIgdT1uZXcgVVJMKHdpbmRvdy5sb2NhdGlvbi5ocmVmKTt2YXIgY2hhbmdlZD1mYWxzZTt2YXIgdG9rZW49XCJcIjt2YXIgcGF0aFByZWZpeD0ke0pTT04uc3RyaW5naWZ5KFxyXG4gICAgQUNDRVNTX1RPS0VOX1BBVEhfUFJFRklYLFxyXG4gICl9O2lmKHUucGF0aG5hbWUuaW5kZXhPZihwYXRoUHJlZml4KT09PTApe3ZhciByZXN0PXUucGF0aG5hbWUuc2xpY2UocGF0aFByZWZpeC5sZW5ndGgpO3ZhciBzbGFzaD1yZXN0LmluZGV4T2YoXCIvXCIpO3ZhciByYXc9c2xhc2g+PTA/cmVzdC5zbGljZSgwLHNsYXNoKTpyZXN0O2lmKHJhdyl7dHJ5e3Rva2VuPWRlY29kZVVSSUNvbXBvbmVudChyYXcpO31jYXRjaChlKXt0b2tlbj1yYXc7fXUucGF0aG5hbWU9XCIvXCI7Y2hhbmdlZD10cnVlO319dmFyIHRva2VuS2V5cz0ke0pTT04uc3RyaW5naWZ5KFxyXG4gICAgQUNDRVNTX1RPS0VOX0FMSUFTRVMsXHJcbiAgKX07Zm9yKHZhciBpPTA7aTx0b2tlbktleXMubGVuZ3RoO2krKyl7dmFyIGs9dG9rZW5LZXlzW2ldO2lmKHUuc2VhcmNoUGFyYW1zLmhhcyhrKSl7dG9rZW49dG9rZW58fHUuc2VhcmNoUGFyYW1zLmdldChrKXx8XCJcIjt1LnNlYXJjaFBhcmFtcy5kZWxldGUoayk7Y2hhbmdlZD10cnVlO319dmFyIGFwaUJhc2U9XCJcIjt2YXIgYXBpS2V5cz0ke0pTT04uc3RyaW5naWZ5KFxyXG4gICAgQVBJX0JBU0VfQUxJQVNFUyxcclxuICApfTtmb3IodmFyIGo9MDtqPGFwaUtleXMubGVuZ3RoO2orKyl7dmFyIGE9YXBpS2V5c1tqXTtpZih1LnNlYXJjaFBhcmFtcy5oYXMoYSkpe2FwaUJhc2U9YXBpQmFzZXx8dS5zZWFyY2hQYXJhbXMuZ2V0KGEpfHxcIlwiO3Uuc2VhcmNoUGFyYW1zLmRlbGV0ZShhKTtjaGFuZ2VkPXRydWU7fX10cnl7aWYodG9rZW4pc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgke0pTT04uc3RyaW5naWZ5KFxyXG4gICAgQUNDRVNTX1RPS0VOX1NFU1NJT05fS0VZLFxyXG4gICl9LHRva2VuKTtpZihhcGlCYXNlKXNlc3Npb25TdG9yYWdlLnNldEl0ZW0oJHtKU09OLnN0cmluZ2lmeShcclxuICAgIEFQSV9CQVNFX1NFU1NJT05fS0VZLFxyXG4gICl9LGFwaUJhc2UpO31jYXRjaChlKXt9aWYoY2hhbmdlZCl7d2luZG93Lmhpc3RvcnkucmVwbGFjZVN0YXRlKG51bGwsXCJcIix1LnBhdGhuYW1lK3Uuc2VhcmNoK3UuaGFzaCk7fX1jYXRjaChlKXt9fSgpKTs8L3NjcmlwdD5gO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWFkUG9ydEZyb21FbnYoKSB7XHJcbiAgY29uc3QgcmF3UG9ydCA9IHByb2Nlc3MuZW52LkpMUFRfREVWX1BPUlQgPz8gcHJvY2Vzcy5lbnYuUE9SVDtcclxuICBpZiAoIXJhd1BvcnQpIHJldHVybiB1bmRlZmluZWQ7XHJcblxyXG4gIGNvbnN0IHBvcnQgPSBOdW1iZXIocmF3UG9ydCk7XHJcbiAgaWYgKE51bWJlci5pc0ludGVnZXIocG9ydCkgJiYgcG9ydCA+IDAgJiYgcG9ydCA8PSA2NTUzNSkge1xyXG4gICAgcmV0dXJuIHBvcnQ7XHJcbiAgfVxyXG5cclxuICBjb25zb2xlLndhcm4oYFtqbHB0IGFjY2Vzc10gSWdub3JpbmcgaW52YWxpZCBwb3J0OiAke3Jhd1BvcnR9YCk7XHJcbiAgcmV0dXJuIHVuZGVmaW5lZDtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZFF1ZXJ5VG9rZW4ocmVxKSB7XHJcbiAgY29uc3QgdXJsID0gbmV3IFVSTChyZXEudXJsID8/IFwiL1wiLCBcImh0dHA6Ly9sb2NhbGhvc3RcIik7XHJcbiAgZm9yIChjb25zdCBrZXkgb2YgQUNDRVNTX1RPS0VOX0FMSUFTRVMpIHtcclxuICAgIGNvbnN0IHRva2VuID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoa2V5KTtcclxuICAgIGlmICh0b2tlbikgcmV0dXJuIHRva2VuO1xyXG4gIH1cclxuICByZXR1cm4gXCJcIjtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZFBhdGhUb2tlbihyZXEpIHtcclxuICBjb25zdCB1cmwgPSBuZXcgVVJMKHJlcS51cmwgPz8gXCIvXCIsIFwiaHR0cDovL2xvY2FsaG9zdFwiKTtcclxuICBpZiAoIXVybC5wYXRobmFtZS5zdGFydHNXaXRoKEFDQ0VTU19UT0tFTl9QQVRIX1BSRUZJWCkpIHJldHVybiBcIlwiO1xyXG5cclxuICBjb25zdCByZXN0ID0gdXJsLnBhdGhuYW1lLnNsaWNlKEFDQ0VTU19UT0tFTl9QQVRIX1BSRUZJWC5sZW5ndGgpO1xyXG4gIGNvbnN0IHNsYXNoID0gcmVzdC5pbmRleE9mKFwiL1wiKTtcclxuICBjb25zdCByYXdUb2tlbiA9IHNsYXNoID49IDAgPyByZXN0LnNsaWNlKDAsIHNsYXNoKSA6IHJlc3Q7XHJcbiAgaWYgKCFyYXdUb2tlbikgcmV0dXJuIFwiXCI7XHJcblxyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHJhd1Rva2VuKTtcclxuICB9IGNhdGNoIHtcclxuICAgIHJldHVybiByYXdUb2tlbjtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlYWRDb29raWVUb2tlbihyZXEpIHtcclxuICBjb25zdCBjb29raWVIZWFkZXIgPSBTdHJpbmcocmVxLmhlYWRlcnMuY29va2llID8/IFwiXCIpO1xyXG4gIGNvbnN0IGNvb2tpZXMgPSBjb29raWVIZWFkZXIuc3BsaXQoXCI7XCIpO1xyXG4gIGZvciAoY29uc3QgY29va2llIG9mIGNvb2tpZXMpIHtcclxuICAgIGNvbnN0IHNlcGFyYXRvciA9IGNvb2tpZS5pbmRleE9mKFwiPVwiKTtcclxuICAgIGlmIChzZXBhcmF0b3IgPCAwKSBjb250aW51ZTtcclxuICAgIGNvbnN0IGtleSA9IGNvb2tpZS5zbGljZSgwLCBzZXBhcmF0b3IpLnRyaW0oKTtcclxuICAgIGlmIChrZXkgIT09IEFDQ0VTU19UT0tFTl9DT09LSUUpIGNvbnRpbnVlO1xyXG4gICAgY29uc3QgcmF3VmFsdWUgPSBjb29raWUuc2xpY2Uoc2VwYXJhdG9yICsgMSkudHJpbSgpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChyYXdWYWx1ZSk7XHJcbiAgICB9IGNhdGNoIHtcclxuICAgICAgcmV0dXJuIHJhd1ZhbHVlO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gXCJcIjtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZEhlYWRlclRva2VuKHJlcSkge1xyXG4gIHJldHVybiBTdHJpbmcocmVxLmhlYWRlcnM/LltBQ0NFU1NfVE9LRU5fSEVBREVSXSA/PyBcIlwiKS50cmltKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzVmFsaWRBY2Nlc3NUb2tlbihjYW5kaWRhdGUpIHtcclxuICBpZiAodHlwZW9mIGNhbmRpZGF0ZSAhPT0gXCJzdHJpbmdcIiB8fCBjYW5kaWRhdGUubGVuZ3RoID09PSAwKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gIGNvbnN0IGV4cGVjdGVkID0gQnVmZmVyLmZyb20oQUNDRVNTX1RPS0VOKTtcclxuICBjb25zdCBhY3R1YWwgPSBCdWZmZXIuZnJvbShjYW5kaWRhdGUpO1xyXG4gIHJldHVybiBhY3R1YWwubGVuZ3RoID09PSBleHBlY3RlZC5sZW5ndGggJiYgY3J5cHRvLnRpbWluZ1NhZmVFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0QWNjZXNzQ29va2llKHJlcykge1xyXG4gIHJlcy5zZXRIZWFkZXIoXHJcbiAgICBcIlNldC1Db29raWVcIixcclxuICAgIGAke0FDQ0VTU19UT0tFTl9DT09LSUV9PSR7ZW5jb2RlVVJJQ29tcG9uZW50KEFDQ0VTU19UT0tFTil9OyBQYXRoPS87IEh0dHBPbmx5OyBTYW1lU2l0ZT1MYXhgLFxyXG4gICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlamVjdFVuYXV0aG9yaXplZEh0dHAocmVzKSB7XHJcbiAgcmVzLnN0YXR1c0NvZGUgPSA0MDE7XHJcbiAgcmVzLnNldEhlYWRlcihcIkNvbnRlbnQtVHlwZVwiLCBcInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLThcIik7XHJcbiAgcmVzLmVuZChcIlVuYXV0aG9yaXplZC4gU3RhcnQgZnJvbSB0aGUgUVIgVVJMIHByaW50ZWQgYnkgdGhlIGRldiBzZXJ2ZXIuXFxuXCIpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBwcmludE1vYmlsZUFjY2Vzc0luZm8oc2VydmVyKSB7XHJcbiAgY29uc3QgcG9ydCA9IHJlYWRCb3VuZFBvcnQoc2VydmVyKTtcclxuICBjb25zdCBhcGlQb3J0ID0gcmVhZEFwaVBvcnRGcm9tRW52KCk7XHJcblxyXG4gIGNvbnNvbGUubG9nKFwiXCIpO1xyXG4gIGNvbnNvbGUubG9nKFwiW2pscHQgYWNjZXNzXSBNb2JpbGUvbmV0d29yayBkZXYgc2VydmVyIGlzIGJvdW5kIHRvIDAuMC4wLjBcIik7XHJcbiAgY29uc29sZS5sb2coYFtqbHB0IGFjY2Vzc10gVG9rZW46ICR7QUNDRVNTX1RPS0VOfWApO1xyXG4gIGNvbnNvbGUubG9nKFwiW2pscHQgYWNjZXNzXSBTY2FuIHRoZSBJTlRFUk5BTF9MQU4gUVIgd2hlbiB5b3VyIHBob25lIGlzIG9uIHRoZSBzYW1lIFdpLUZpL0xBTi4gTm8gdG9rZW4gaXMgcmVxdWlyZWQgb24gTEFOLlwiKTtcclxuICBjb25zb2xlLmxvZyhcIlwiKTtcclxuXHJcbiAgcHJpbnRBY2Nlc3NUYXJnZXQocmVhZExhbkFjY2Vzc1RhcmdldChwb3J0LCBhcGlQb3J0KSk7XHJcblxyXG4gIGNvbnN0IGV4dGVybmFsQWNjZXNzVGFyZ2V0ID0gYXdhaXQgcmVhZEV4dGVybmFsQWNjZXNzVGFyZ2V0KHBvcnQpO1xyXG4gIGlmIChleHRlcm5hbEFjY2Vzc1RhcmdldCkge1xyXG4gICAgcHJpbnRBY2Nlc3NUYXJnZXQoZXh0ZXJuYWxBY2Nlc3NUYXJnZXQpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZEJvdW5kUG9ydChzZXJ2ZXIpIHtcclxuICBjb25zdCBhZGRyZXNzID0gc2VydmVyLmh0dHBTZXJ2ZXI/LmFkZHJlc3MoKTtcclxuICBpZiAoYWRkcmVzcyAmJiB0eXBlb2YgYWRkcmVzcyA9PT0gXCJvYmplY3RcIikgcmV0dXJuIGFkZHJlc3MucG9ydDtcclxuICByZXR1cm4gcmVhZFBvcnRGcm9tRW52KCkgPz8gNTE3MztcclxufVxyXG5cclxuZnVuY3Rpb24gcHJpbnRBY2Nlc3NUYXJnZXQodGFyZ2V0KSB7XHJcbiAgY29uc29sZS5sb2coYFtqbHB0IGFjY2Vzc10gPT09PT0gJHt0YXJnZXQubGFiZWx9IFFSID09PT09YCk7XHJcbiAgY29uc29sZS5sb2coYFtqbHB0IGFjY2Vzc10gJHt0YXJnZXQuZGVzY3JpcHRpb259YCk7XHJcbiAgaWYgKHRhcmdldC5ub3RlKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgW2pscHQgYWNjZXNzXSAke3RhcmdldC5ub3RlfWApO1xyXG4gIH1cclxuICBjb25zb2xlLmxvZyhgW2pscHQgYWNjZXNzXSAke3RhcmdldC5sYWJlbH0gVVJMOiAke3RhcmdldC51cmx9YCk7XHJcbiAgY29uc29sZS5sb2coXCJcIik7XHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zb2xlLmxvZyhcIltqbHB0IGFjY2Vzc10gUVIgSU1BR0UgQkVHSU5cIik7XHJcbiAgICBjb25zb2xlLmxvZyhyZW5kZXJRcih0YXJnZXQudXJsLCB7IHVuaWNvZGU6IHNob3VsZFJlbmRlclVuaWNvZGVRcigpIH0pKTtcclxuICAgIGNvbnNvbGUubG9nKFwiW2pscHQgYWNjZXNzXSBRUiBJTUFHRSBFTkRcIik7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2FybihgW2pscHQgYWNjZXNzXSAke3RhcmdldC5sYWJlbH0gUVIgcmVuZGVyIHNraXBwZWQ6ICR7U3RyaW5nKGVycm9yPy5tZXNzYWdlID8/IGVycm9yKX1gKTtcclxuICB9XHJcblxyXG4gIGNvbnNvbGUubG9nKGBbamxwdCBhY2Nlc3NdID09PT09ICR7dGFyZ2V0LmxhYmVsfSBRUiBFTkQgPT09PT1gKTtcclxuICBjb25zb2xlLmxvZyhcIlwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvdWxkUmVuZGVyVW5pY29kZVFyKCkge1xyXG4gIGNvbnN0IGFzY2lpID0gU3RyaW5nKHByb2Nlc3MuZW52LkpMUFRfUVJfQVNDSUkgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XHJcbiAgaWYgKGFzY2lpID09PSBcIjFcIiB8fCBhc2NpaSA9PT0gXCJ0cnVlXCIpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgY29uc3QgdW5pY29kZSA9IFN0cmluZyhwcm9jZXNzLmVudi5KTFBUX1FSX1VOSUNPREUgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XHJcbiAgaWYgKHVuaWNvZGUgPT09IFwiMFwiIHx8IHVuaWNvZGUgPT09IFwiZmFsc2VcIikgcmV0dXJuIGZhbHNlO1xyXG5cclxuICByZXR1cm4gdHJ1ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZEFwaVBvcnRGcm9tRW52KCkge1xyXG4gIGNvbnN0IHJhd1BvcnQgPSBwcm9jZXNzLmVudi5KTFBUX0FQSV9QT1JUID8/IFwiMzAwMVwiO1xyXG4gIGNvbnN0IHBvcnQgPSBOdW1iZXIocmF3UG9ydCk7XHJcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIocG9ydCkgJiYgcG9ydCA+IDAgJiYgcG9ydCA8PSA2NTUzNSA/IHBvcnQgOiAzMDAxO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWFkTGFuQWNjZXNzVGFyZ2V0KHBvcnQsIGFwaVBvcnQpIHtcclxuICBjb25zdCBtYW51YWxIb3N0ID0gU3RyaW5nKHByb2Nlc3MuZW52LkpMUFRfTEFOX0hPU1QgPz8gXCJcIikudHJpbSgpO1xyXG4gIGlmIChtYW51YWxIb3N0KSB7XHJcbiAgICBjb25zdCBob3N0ID0gZm9ybWF0VXJsSG9zdChtYW51YWxIb3N0KTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGxhYmVsOiBcIklOVEVSTkFMX0xBTlwiLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJVc2UgdGhpcyB3aXRob3V0IGEgdG9rZW4gd2hlbiB5b3VyIHBob25lIGlzIG9uIHRoZSBzYW1lIFdpLUZpL0xBTiBhcyB0aGlzIFBDLlwiLFxyXG4gICAgICB1cmw6IGFkZEFwaUJhc2VQYXJhbVRvVXJsKGBodHRwOi8vJHtob3N0fToke3BvcnR9L2AsIHtcclxuICAgICAgICBhcGlCYXNlVXJsOiBgaHR0cDovLyR7aG9zdH06JHthcGlQb3J0fS9hcGlgLFxyXG4gICAgICB9KSxcclxuICAgICAgbm90ZTogXCJMQU4gaG9zdCBvdmVycmlkZTogSkxQVF9MQU5fSE9TVFwiLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSByZWFkTGFuSXB2NENhbmRpZGF0ZXMoKTtcclxuICBjb25zdCBob3N0ID0gY2FuZGlkYXRlc1swXT8uYWRkcmVzcyA/PyBcImxvY2FsaG9zdFwiO1xyXG4gIGNvbnN0IGZvcm1hdHRlZEhvc3QgPSBmb3JtYXRVcmxIb3N0KGhvc3QpO1xyXG4gIGNvbnN0IG5vdGUgPSBjYW5kaWRhdGVzLmxlbmd0aCA+IDEgPyBgTEFOIGNhbmRpZGF0ZXM6ICR7Zm9ybWF0TGFuQ2FuZGlkYXRlcyhjYW5kaWRhdGVzKX1gIDogXCJcIjtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGxhYmVsOiBcIklOVEVSTkFMX0xBTlwiLFxyXG4gICAgZGVzY3JpcHRpb246IFwiVXNlIHRoaXMgd2l0aG91dCBhIHRva2VuIHdoZW4geW91ciBwaG9uZSBpcyBvbiB0aGUgc2FtZSBXaS1GaS9MQU4gYXMgdGhpcyBQQy5cIixcclxuICAgIHVybDogYWRkQXBpQmFzZVBhcmFtVG9VcmwoYGh0dHA6Ly8ke2Zvcm1hdHRlZEhvc3R9OiR7cG9ydH0vYCwge1xyXG4gICAgICBhcGlCYXNlVXJsOiBgaHR0cDovLyR7Zm9ybWF0dGVkSG9zdH06JHthcGlQb3J0fS9hcGlgLFxyXG4gICAgfSksXHJcbiAgICBub3RlLFxyXG4gIH07XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlYWRFeHRlcm5hbEFjY2Vzc1RhcmdldChwb3J0KSB7XHJcbiAgY29uc3QgcHVibGljVXJsID0gcHJvY2Vzcy5lbnYuSkxQVF9QVUJMSUNfVVJMO1xyXG4gIGlmIChwdWJsaWNVcmwpIHtcclxuICAgIGNvbnN0IHB1YmxpY0Jhc2VVcmwgPSBub3JtYWxpemVVcmwocHVibGljVXJsKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGxhYmVsOiBcIkVYVEVSTkFMX0lOVEVSTkVUXCIsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlVzZSB0aGlzIGZyb20gYW5vdGhlciBuZXR3b3JrIHRocm91Z2ggdGhlIGNvbmZpZ3VyZWQgcHVibGljIFVSTC5cIixcclxuICAgICAgdXJsOiBhZGRBY2Nlc3NQYXJhbXNUb1VybChwdWJsaWNCYXNlVXJsLCB7XHJcbiAgICAgICAgYXBpQmFzZVVybDogcmVhZFB1YmxpY0FwaUJhc2VVcmwocHVibGljQmFzZVVybCksXHJcbiAgICAgICAgdG9rZW46IEFDQ0VTU19UT0tFTixcclxuICAgICAgfSksXHJcbiAgICAgIG5vdGU6IFwiUHVibGljIFVSTCBvdmVycmlkZTogSkxQVF9QVUJMSUNfVVJMXCIsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgaWYgKHNob3VsZFVzZUNsb3VkZmxhcmVUdW5uZWwoKSkge1xyXG4gICAgY29uc3QgY2xvdWRmbGFyZVR1bm5lbEFjY2VzcyA9IGF3YWl0IHJlYWRDbG91ZGZsYXJlVHVubmVsQWNjZXNzKHBvcnQpO1xyXG4gICAgaWYgKCFjbG91ZGZsYXJlVHVubmVsQWNjZXNzKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBsYWJlbDogXCJFWFRFUk5BTF9DTE9VREZMQVJFXCIsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlVzZSB0aGlzIGZyb20gYW5vdGhlciBuZXR3b3JrIHRocm91Z2ggQ2xvdWRmbGFyZSBUdW5uZWwuXCIsXHJcbiAgICAgIHVybDogYWRkUGF0aEFjY2Vzc1Rva2VuVG9VcmwoY2xvdWRmbGFyZVR1bm5lbEFjY2Vzcy5iYXNlVXJsLCB7IHRva2VuOiBBQ0NFU1NfVE9LRU4gfSksXHJcbiAgICAgIG5vdGU6IGZvcm1hdENsb3VkZmxhcmVUdW5uZWxOb3RlKGNsb3VkZmxhcmVUdW5uZWxBY2Nlc3MpLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHB1YmxpY0Jhc2VVcmwgPSBhd2FpdCByZWFkUHVibGljSXBCYXNlVXJsKHBvcnQpO1xyXG4gIGlmICghcHVibGljQmFzZVVybCkgcmV0dXJuIG51bGw7XHJcbiAgcmV0dXJuIHtcclxuICAgIGxhYmVsOiBcIkVYVEVSTkFMX0lOVEVSTkVUXCIsXHJcbiAgICBkZXNjcmlwdGlvbjogXCJVc2UgdGhpcyBmcm9tIGFub3RoZXIgbmV0d29yay4gUG9ydCBmb3J3YXJkaW5nL2ZpcmV3YWxsIGFjY2VzcyBtdXN0IGJlIGNvbmZpZ3VyZWQgZmlyc3QuXCIsXHJcbiAgICB1cmw6IGFkZEFjY2Vzc1BhcmFtc1RvVXJsKHB1YmxpY0Jhc2VVcmwsIHtcclxuICAgICAgYXBpQmFzZVVybDogcmVhZFB1YmxpY0FwaUJhc2VVcmwocHVibGljQmFzZVVybCksXHJcbiAgICAgIHRva2VuOiBBQ0NFU1NfVE9LRU4sXHJcbiAgICB9KSxcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWFkUHVibGljQXBpQmFzZVVybChwdWJsaWNCYXNlVXJsKSB7XHJcbiAgY29uc3QgcmF3QXBpVXJsID0gcHJvY2Vzcy5lbnYuSkxQVF9QVUJMSUNfQVBJX1VSTCA/PyBwcm9jZXNzLmVudi5KTFBUX0FQSV9QVUJMSUNfVVJMO1xyXG4gIGlmIChyYXdBcGlVcmwpIHJldHVybiBub3JtYWxpemVBcGlCYXNlVXJsKHJhd0FwaVVybCk7XHJcblxyXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwocHVibGljQmFzZVVybCk7XHJcbiAgdXJsLnBhdGhuYW1lID0gXCIvYXBpXCI7XHJcbiAgdXJsLnNlYXJjaCA9IFwiXCI7XHJcbiAgdXJsLmhhc2ggPSBcIlwiO1xyXG4gIHJldHVybiB1cmwudG9TdHJpbmcoKS5yZXBsYWNlKC9cXC8kLywgXCJcIik7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlYWRQdWJsaWNJcEJhc2VVcmwocG9ydCkge1xyXG4gIGNvbnN0IGhvc3QgPSBwcm9jZXNzLmVudi5KTFBUX0FDQ0VTU19IT1NUID8/IChhd2FpdCByZWFkUHVibGljSXB2NEFkZHJlc3MoKSk7XHJcbiAgaWYgKCFob3N0KSByZXR1cm4gbnVsbDtcclxuXHJcbiAgcmV0dXJuIGBodHRwOi8vJHtmb3JtYXRVcmxIb3N0KGhvc3QpfToke3BvcnR9L2A7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlYWRDbG91ZGZsYXJlVHVubmVsQWNjZXNzKHBvcnQpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgdHVubmVsID0gYXdhaXQgb3BlbkFjdGl2ZUNsb3VkZmxhcmVUdW5uZWwocG9ydCk7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBiYXNlVXJsOiBub3JtYWxpemVVcmwodHVubmVsLnVybCksXHJcbiAgICAgIGNvbW1hbmQ6IHR1bm5lbC5jb21tYW5kLFxyXG4gICAgICB0YXJnZXRVcmw6IHR1bm5lbC50YXJnZXRVcmwsXHJcbiAgICB9O1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oYFtqbHB0IGFjY2Vzc10gQ2xvdWRmbGFyZSBUdW5uZWwgZmFpbGVkOiAke1N0cmluZyhlcnJvcj8ubWVzc2FnZSA/PyBlcnJvcil9YCk7XHJcbiAgICBjb25zb2xlLndhcm4oXCJbamxwdCBhY2Nlc3NdIE5vIGV4dGVybmFsIFFSIHdpbGwgYmUgcHJpbnRlZC4gSW5zdGFsbCBjbG91ZGZsYXJlZCBvciBzZXQgSkxQVF9DTE9VREZMQVJFRF9CSU4gdG8gY2xvdWRmbGFyZWQuZXhlLlwiKTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2hvdWxkVXNlQ2xvdWRmbGFyZVR1bm5lbCgpIHtcbiAgY29uc3QgcmF3VmFsdWUgPSBTdHJpbmcocHJvY2Vzcy5lbnYuSkxQVF9DTE9VREZMQVJFRCA/PyBwcm9jZXNzLmVudi5KTFBUX0NMT1VERkxBUkVfVFVOTkVMID8/IFwiMVwiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgcmV0dXJuICFbXCIwXCIsIFwiZmFsc2VcIiwgXCJub1wiLCBcIm9mZlwiXS5pbmNsdWRlcyhyYXdWYWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHNob3VsZFVzZVByZXZpZXdBY2Nlc3NDb250cm9sKCkge1xuICBjb25zdCByYXdWYWx1ZSA9IFN0cmluZyhwcm9jZXNzLmVudi5KTFBUX1BSRVZJRVdfQUNDRVNTX0NPTlRST0wgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIHJldHVybiBbXCIxXCIsIFwidHJ1ZVwiLCBcInllc1wiLCBcIm9uXCJdLmluY2x1ZGVzKHJhd1ZhbHVlKTtcbn1cblxyXG5mdW5jdGlvbiBvcGVuQWN0aXZlQ2xvdWRmbGFyZVR1bm5lbChwb3J0KSB7XHJcbiAgaWYgKGFjdGl2ZUNsb3VkZmxhcmVUdW5uZWwpIHJldHVybiBQcm9taXNlLnJlc29sdmUoYWN0aXZlQ2xvdWRmbGFyZVR1bm5lbCk7XHJcbiAgaWYgKGNsb3VkZmxhcmVUdW5uZWxTdGFydFByb21pc2UpIHJldHVybiBjbG91ZGZsYXJlVHVubmVsU3RhcnRQcm9taXNlO1xyXG5cclxuICBjb25zdCB0YXJnZXRVcmwgPSBjcmVhdGVDbG91ZGZsYXJlVHVubmVsVGFyZ2V0VXJsKHBvcnQpO1xyXG4gIGNvbnN0IHRpbWVvdXRNcyA9IHJlYWRDbG91ZGZsYXJlT3BlblRpbWVvdXRNcygpO1xyXG4gIGNvbnNvbGUubG9nKGBbamxwdCBhY2Nlc3NdIFN0YXJ0aW5nIENsb3VkZmxhcmUgVHVubmVsIGZvciAke3RhcmdldFVybH1gKTtcclxuICBjbG91ZGZsYXJlVHVubmVsU3RhcnRQcm9taXNlID0gb3BlbkNsb3VkZmxhcmVUdW5uZWxXaXRoVGltZW91dCh0YXJnZXRVcmwsIHRpbWVvdXRNcylcclxuICAgIC50aGVuKCh0dW5uZWwpID0+IHtcclxuICAgICAgYWN0aXZlQ2xvdWRmbGFyZVR1bm5lbCA9IHR1bm5lbDtcclxuICAgICAgY29uc29sZS5sb2coYFtqbHB0IGFjY2Vzc10gQ2xvdWRmbGFyZSBUdW5uZWwgVVJMOiAke3R1bm5lbC51cmx9YCk7XHJcbiAgICAgIHJldHVybiB0dW5uZWw7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICBjbG91ZGZsYXJlVHVubmVsU3RhcnRQcm9taXNlID0gbnVsbDtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9KTtcclxuXHJcbiAgcmV0dXJuIGNsb3VkZmxhcmVUdW5uZWxTdGFydFByb21pc2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUNsb3VkZmxhcmVUdW5uZWxUYXJnZXRVcmwocG9ydCkge1xyXG4gIGNvbnN0IGhvc3QgPSBTdHJpbmcocHJvY2Vzcy5lbnYuSkxQVF9DTE9VREZMQVJFRF9MT0NBTF9IT1NUID8/IHByb2Nlc3MuZW52LkpMUFRfQ0xPVURGTEFSRV9UVU5ORUxfTE9DQUxfSE9TVCA/PyBcIjEyNy4wLjAuMVwiKS50cmltKCk7XHJcbiAgcmV0dXJuIGBodHRwOi8vJHtmb3JtYXRVcmxIb3N0KGhvc3QpfToke3BvcnR9L2A7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlYWRDbG91ZGZsYXJlT3BlblRpbWVvdXRNcygpIHtcclxuICBjb25zdCByYXdWYWx1ZSA9IHByb2Nlc3MuZW52LkpMUFRfQ0xPVURGTEFSRURfVElNRU9VVF9NUyA/PyBwcm9jZXNzLmVudi5KTFBUX0NMT1VERkxBUkVfVFVOTkVMX1RJTUVPVVRfTVM7XHJcbiAgY29uc3QgdGltZW91dE1zID0gTnVtYmVyKHJhd1ZhbHVlKTtcclxuICByZXR1cm4gTnVtYmVyLmlzSW50ZWdlcih0aW1lb3V0TXMpICYmIHRpbWVvdXRNcyA+IDAgPyB0aW1lb3V0TXMgOiBDTE9VREZMQVJFRF9PUEVOX1RJTUVPVVRfTVM7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIG9wZW5DbG91ZGZsYXJlVHVubmVsV2l0aFRpbWVvdXQodGFyZ2V0VXJsLCB0aW1lb3V0TXMpIHtcclxuICBjb25zdCBjb21tYW5kcyA9IHJlYWRDbG91ZGZsYXJlZENvbW1hbmRDYW5kaWRhdGVzKCk7XHJcbiAgY29uc3QgZXJyb3JzID0gW107XHJcblxyXG4gIGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kcykge1xyXG4gICAgdHJ5IHtcclxuICAgICAgcmV0dXJuIGF3YWl0IHNwYXduQ2xvdWRmbGFyZWRUdW5uZWwoY29tbWFuZCwgdGFyZ2V0VXJsLCB0aW1lb3V0TXMpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgZXJyb3JzLnB1c2goYCR7Y29tbWFuZH06ICR7U3RyaW5nKGVycm9yPy5tZXNzYWdlID8/IGVycm9yKX1gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHRocm93IG5ldyBFcnJvcihlcnJvcnMuam9pbihcIjsgXCIpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3Bhd25DbG91ZGZsYXJlZFR1bm5lbChjb21tYW5kLCB0YXJnZXRVcmwsIHRpbWVvdXRNcykge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBjb25zdCBhcmdzID0gW1widHVubmVsXCIsIFwiLS11cmxcIiwgdGFyZ2V0VXJsXTtcclxuICAgIGNvbnN0IGNoaWxkID0gc3Bhd24oY29tbWFuZCwgYXJncywge1xyXG4gICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcclxuICAgICAgc3RkaW86IFtcImlnbm9yZVwiLCBcInBpcGVcIiwgXCJwaXBlXCJdLFxyXG4gICAgfSk7XHJcbiAgICBsZXQgc2V0dGxlZCA9IGZhbHNlO1xyXG4gICAgbGV0IG91dHB1dCA9IFwiXCI7XHJcbiAgICBsZXQgbGluZUJ1ZmZlciA9IFwiXCI7XHJcbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIGZhaWwobmV3IEVycm9yKGBjbG91ZGZsYXJlZCBkaWQgbm90IHByaW50IGEgdHJ5Y2xvdWRmbGFyZS5jb20gVVJMIHdpdGhpbiAke3RpbWVvdXRNc31tc2ApKTtcclxuICAgIH0sIHRpbWVvdXRNcyk7XHJcblxyXG4gICAgZnVuY3Rpb24gZmFpbChlcnJvcikge1xyXG4gICAgICBpZiAoc2V0dGxlZCkgcmV0dXJuO1xyXG4gICAgICBzZXR0bGVkID0gdHJ1ZTtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xyXG4gICAgICBpZiAoIWNoaWxkLmtpbGxlZCAmJiBjaGlsZC5leGl0Q29kZSA9PT0gbnVsbCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjaGlsZC5raWxsKCk7XHJcbiAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAvLyBUaGUgcHJvY2VzcyBtYXkgYWxyZWFkeSBiZSBnb25lIGFmdGVyIGEgc3Bhd24gZXJyb3Igb24gV2luZG93cy5cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgcHJldmlldyA9IG91dHB1dC50cmltKCkuc3BsaXQoL1xccj9cXG4vKS5zbGljZSgtNikuam9pbihcIiB8IFwiKTtcclxuICAgICAgcmVqZWN0KHByZXZpZXcgPyBuZXcgRXJyb3IoYCR7ZXJyb3IubWVzc2FnZX0uIExhc3Qgb3V0cHV0OiAke3ByZXZpZXd9YCkgOiBlcnJvcik7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZmluaXNoKHVybCkge1xyXG4gICAgICBpZiAoc2V0dGxlZCkgcmV0dXJuO1xyXG4gICAgICBzZXR0bGVkID0gdHJ1ZTtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xyXG4gICAgICByZXNvbHZlKHtcclxuICAgICAgICBjb21tYW5kLFxyXG4gICAgICAgIHByb2Nlc3M6IGNoaWxkLFxyXG4gICAgICAgIHRhcmdldFVybCxcclxuICAgICAgICB1cmwsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGhhbmRsZU91dHB1dChjaHVuaykge1xyXG4gICAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKGNodW5rKTtcclxuICAgICAgaWYgKCFzZXR0bGVkKSB7XHJcbiAgICAgICAgb3V0cHV0ICs9IHRleHQ7XHJcbiAgICAgIH1cclxuICAgICAgbGluZUJ1ZmZlciArPSB0ZXh0O1xyXG4gICAgICBjb25zdCBsaW5lcyA9IGxpbmVCdWZmZXIuc3BsaXQoL1xccj9cXG4vKTtcclxuICAgICAgbGluZUJ1ZmZlciA9IGxpbmVzLnBvcCgpID8/IFwiXCI7XHJcbiAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xyXG4gICAgICAgIHByaW50Q2xvdWRmbGFyZWRMaW5lKGxpbmUpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoc2V0dGxlZCkgcmV0dXJuO1xyXG4gICAgICBjb25zdCBtYXRjaCA9IG91dHB1dC5tYXRjaChDTE9VREZMQVJFRF9VUkxfUEFUVEVSTik7XHJcbiAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgIGZpbmlzaChub3JtYWxpemVVcmwobWF0Y2hbMF0pKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNoaWxkLnN0ZG91dD8uc2V0RW5jb2RpbmcoXCJ1dGY4XCIpO1xyXG4gICAgY2hpbGQuc3RkZXJyPy5zZXRFbmNvZGluZyhcInV0ZjhcIik7XHJcbiAgICBjaGlsZC5zdGRvdXQ/Lm9uKFwiZGF0YVwiLCBoYW5kbGVPdXRwdXQpO1xyXG4gICAgY2hpbGQuc3RkZXJyPy5vbihcImRhdGFcIiwgaGFuZGxlT3V0cHV0KTtcclxuXHJcbiAgICBjaGlsZC5vbmNlKFwiZXJyb3JcIiwgKGVycm9yKSA9PiB7XHJcbiAgICAgIGZhaWwoZXJyb3IpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgY2hpbGQub25jZShcImV4aXRcIiwgKGNvZGUsIHNpZ25hbCkgPT4ge1xyXG4gICAgICBpZiAoYWN0aXZlQ2xvdWRmbGFyZVR1bm5lbD8ucHJvY2VzcyA9PT0gY2hpbGQpIHtcclxuICAgICAgICBhY3RpdmVDbG91ZGZsYXJlVHVubmVsID0gbnVsbDtcclxuICAgICAgICBjbG91ZGZsYXJlVHVubmVsU3RhcnRQcm9taXNlID0gbnVsbDtcclxuICAgICAgICBjb25zb2xlLmxvZyhgW2pscHQgYWNjZXNzXSBDbG91ZGZsYXJlIFR1bm5lbCBjbG9zZWQke3NpZ25hbCA/IGAgYnkgc2lnbmFsICR7c2lnbmFsfWAgOiBjb2RlID09PSBudWxsID8gXCJcIiA6IGAgd2l0aCBjb2RlICR7Y29kZX1gfWApO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICghc2V0dGxlZCkge1xyXG4gICAgICAgIGZhaWwobmV3IEVycm9yKGBjbG91ZGZsYXJlZCBleGl0ZWQgYmVmb3JlIG9wZW5pbmcgYSB0dW5uZWwke3NpZ25hbCA/IGAgYnkgc2lnbmFsICR7c2lnbmFsfWAgOiBjb2RlID09PSBudWxsID8gXCJcIiA6IGAgd2l0aCBjb2RlICR7Y29kZX1gfWApKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHByaW50Q2xvdWRmbGFyZWRMaW5lKGxpbmUpIHtcclxuICBjb25zdCB0ZXh0ID0gU3RyaW5nKGxpbmUgPz8gXCJcIikudHJpbSgpO1xyXG4gIGlmICghdGV4dCkgcmV0dXJuO1xyXG4gIGlmIChDTE9VREZMQVJFRF9VUkxfUEFUVEVSTi50ZXN0KHRleHQpIHx8IC9yZXF1ZXN0aW5nfGNyZWF0ZWR8cmVnaXN0ZXJlZHxlcnJvcnxmYWlsZWR8ZXJyL2kudGVzdCh0ZXh0KSkge1xyXG4gICAgY29uc3Qgc2lnbmF0dXJlID0gY3JlYXRlQ2xvdWRmbGFyZWRMb2dTaWduYXR1cmUodGV4dCk7XHJcbiAgICBpZiAoY2xvdWRmbGFyZWRMb2dTaWduYXR1cmVzLmhhcyhzaWduYXR1cmUpKSByZXR1cm47XHJcbiAgICByZW1lbWJlckNsb3VkZmxhcmVkTG9nU2lnbmF0dXJlKHNpZ25hdHVyZSk7XHJcbiAgICBjb25zb2xlLmxvZyhgW2pscHQgYWNjZXNzXSBjbG91ZGZsYXJlZDogJHt0ZXh0fWApO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQ2xvdWRmbGFyZWRMb2dTaWduYXR1cmUodGV4dCkge1xyXG4gIHJldHVybiBTdHJpbmcodGV4dClcclxuICAgIC5yZXBsYWNlKC9eXFxkezR9LVxcZHsyfS1cXGR7Mn1UXFxkezJ9OlxcZHsyfTpcXGR7Mn1aXFxzKy8sIFwiXCIpXHJcbiAgICAucmVwbGFjZSgvXFxiY29ubkluZGV4PVxcZCtcXGIvZywgXCJjb25uSW5kZXg9KlwiKVxyXG4gICAgLnJlcGxhY2UoL1xcYmV2ZW50PVxcZCtcXGIvZywgXCJldmVudD0qXCIpXHJcbiAgICAucmVwbGFjZSgvXFxiaXA9XFxTKy9nLCBcImlwPSpcIik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbWVtYmVyQ2xvdWRmbGFyZWRMb2dTaWduYXR1cmUoc2lnbmF0dXJlKSB7XHJcbiAgaWYgKGNsb3VkZmxhcmVkTG9nU2lnbmF0dXJlcy5zaXplID49IDIwMCkge1xyXG4gICAgY29uc3QgZmlyc3QgPSBjbG91ZGZsYXJlZExvZ1NpZ25hdHVyZXMudmFsdWVzKCkubmV4dCgpLnZhbHVlO1xyXG4gICAgY2xvdWRmbGFyZWRMb2dTaWduYXR1cmVzLmRlbGV0ZShmaXJzdCk7XHJcbiAgfVxyXG4gIGNsb3VkZmxhcmVkTG9nU2lnbmF0dXJlcy5hZGQoc2lnbmF0dXJlKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZENsb3VkZmxhcmVkQ29tbWFuZENhbmRpZGF0ZXMoKSB7XHJcbiAgY29uc3QgY29uZmlndXJlZCA9IFN0cmluZyhwcm9jZXNzLmVudi5KTFBUX0NMT1VERkxBUkVEX0JJTiA/PyBwcm9jZXNzLmVudi5KTFBUX0NMT1VERkxBUkVfVFVOTkVMX0JJTiA/PyBcIlwiKS50cmltKCk7XHJcbiAgaWYgKGNvbmZpZ3VyZWQpIHJldHVybiBbY29uZmlndXJlZF07XHJcblxyXG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSBcIndpbjMyXCIpIHtcclxuICAgIHJldHVybiB1bmlxdWVTdHJpbmdzKFtcclxuICAgICAgLi4ucmVhZFdpbmRvd3NDbG91ZGZsYXJlZFNlcnZpY2VDb21tYW5kQ2FuZGlkYXRlcygpLFxyXG4gICAgICBcImNsb3VkZmxhcmVkLmV4ZVwiLFxyXG4gICAgICBcImNsb3VkZmxhcmVkXCIsXHJcbiAgICAgIFwiQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxjbG91ZGZsYXJlZFxcXFxjbG91ZGZsYXJlZC5leGVcIixcclxuICAgICAgXCJDOlxcXFxQcm9ncmFtIEZpbGVzICh4ODYpXFxcXGNsb3VkZmxhcmVkXFxcXGNsb3VkZmxhcmVkLmV4ZVwiLFxyXG4gICAgICBcIkM6XFxcXFdpbmRvd3NcXFxcU3lzdGVtMzJcXFxcY2xvdWRmbGFyZWQuZXhlXCIsXHJcbiAgICAgIFwiQzpcXFxcV2luZG93c1xcXFxTeXNuYXRpdmVcXFxcY2xvdWRmbGFyZWQuZXhlXCIsXHJcbiAgICBdKTtcclxuICB9XHJcblxyXG4gIHJldHVybiBbXCJjbG91ZGZsYXJlZFwiXTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZFdpbmRvd3NDbG91ZGZsYXJlZFNlcnZpY2VDb21tYW5kQ2FuZGlkYXRlcygpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzdWx0ID0gc3Bhd25TeW5jKFwic2MuZXhlXCIsIFtcInFjXCIsIFwiQ2xvdWRmbGFyZWRcIl0sIHtcclxuICAgICAgZW5jb2Rpbmc6IFwidXRmOFwiLFxyXG4gICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcclxuICAgIH0pO1xyXG4gICAgY29uc3Qgb3V0cHV0ID0gYCR7cmVzdWx0LnN0ZG91dCA/PyBcIlwifVxcbiR7cmVzdWx0LnN0ZGVyciA/PyBcIlwifWA7XHJcbiAgICBjb25zdCBtYXRjaCA9IC9CSU5BUllfUEFUSF9OQU1FXFxzKjpcXHMqKD86XCIoW15cIl0qY2xvdWRmbGFyZWRcXC5leGUpXCJ8KFteXFxyXFxuXSpjbG91ZGZsYXJlZFxcLmV4ZSkpL2kuZXhlYyhvdXRwdXQpO1xyXG4gICAgY29uc3QgY29tbWFuZCA9IChtYXRjaD8uWzFdID8/IG1hdGNoPy5bMl0gPz8gXCJcIikudHJpbSgpO1xyXG4gICAgcmV0dXJuIGNvbW1hbmQgPyBbY29tbWFuZF0gOiBbXTtcclxuICB9IGNhdGNoIHtcclxuICAgIHJldHVybiBbXTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVuaXF1ZVN0cmluZ3ModmFsdWVzKSB7XHJcbiAgcmV0dXJuIFsuLi5uZXcgU2V0KHZhbHVlcy5maWx0ZXIoQm9vbGVhbikpXTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2xvc2VBY3RpdmVDbG91ZGZsYXJlVHVubmVsKCkge1xyXG4gIGlmICghYWN0aXZlQ2xvdWRmbGFyZVR1bm5lbCkgcmV0dXJuO1xyXG4gIGNvbnN0IHR1bm5lbCA9IGFjdGl2ZUNsb3VkZmxhcmVUdW5uZWw7XHJcbiAgYWN0aXZlQ2xvdWRmbGFyZVR1bm5lbCA9IG51bGw7XHJcbiAgY2xvdWRmbGFyZVR1bm5lbFN0YXJ0UHJvbWlzZSA9IG51bGw7XHJcbiAgaWYgKCF0dW5uZWwucHJvY2Vzcy5raWxsZWQgJiYgdHVubmVsLnByb2Nlc3MuZXhpdENvZGUgPT09IG51bGwpIHtcclxuICAgIHR1bm5lbC5wcm9jZXNzLmtpbGwoKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZvcm1hdENsb3VkZmxhcmVUdW5uZWxOb3RlKHR1bm5lbCkge1xyXG4gIGNvbnN0IG5vdGVzID0gW1wiQ2xvdWRmbGFyZSBUdW5uZWwgaXMgZW5hYmxlZCBieSBkZWZhdWx0OyBzZXQgSkxQVF9DTE9VREZMQVJFRD0wIHRvIGRpc2FibGUgaXQuXCJdO1xyXG4gIGlmICh0dW5uZWwuY29tbWFuZCkgbm90ZXMucHVzaChgY2xvdWRmbGFyZWQgY29tbWFuZDogJHt0dW5uZWwuY29tbWFuZH0uYCk7XHJcbiAgaWYgKHR1bm5lbC50YXJnZXRVcmwpIG5vdGVzLnB1c2goYEZvcndhcmRpbmcgdG8gJHt0dW5uZWwudGFyZ2V0VXJsfWApO1xyXG4gIHJldHVybiBub3Rlcy5qb2luKFwiIFwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gbm9ybWFsaXplVXJsKHJhd1VybCkge1xyXG4gIGNvbnN0IHRleHQgPSBTdHJpbmcocmF3VXJsKS50cmltKCk7XHJcbiAgY29uc3Qgd2l0aFByb3RvY29sID0gL15bYS16XVthLXpcXGQrLi1dKjpcXC9cXC8vaS50ZXN0KHRleHQpID8gdGV4dCA6IGBodHRwOi8vJHt0ZXh0fWA7XHJcbiAgY29uc3QgdXJsID0gbmV3IFVSTCh3aXRoUHJvdG9jb2wpO1xyXG4gIGlmICghdXJsLnBhdGhuYW1lKSB1cmwucGF0aG5hbWUgPSBcIi9cIjtcclxuICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZEFjY2Vzc1BhcmFtc1RvVXJsKGJhc2VVcmwsIHsgYXBpQmFzZVVybCwgdG9rZW4gfSkge1xyXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwoYmFzZVVybCk7XHJcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoQUNDRVNTX1RPS0VOX1BBUkFNLCB0b2tlbik7XHJcbiAgaWYgKGFwaUJhc2VVcmwpIHtcclxuICAgIHVybC5zZWFyY2hQYXJhbXMuc2V0KEFQSV9CQVNFX1BBUkFNLCBub3JtYWxpemVBcGlCYXNlVXJsKGFwaUJhc2VVcmwpKTtcclxuICB9XHJcbiAgcmV0dXJuIHVybC50b1N0cmluZygpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhZGRBcGlCYXNlUGFyYW1Ub1VybChiYXNlVXJsLCB7IGFwaUJhc2VVcmwgfSkge1xyXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwoYmFzZVVybCk7XHJcbiAgaWYgKGFwaUJhc2VVcmwpIHtcclxuICAgIHVybC5zZWFyY2hQYXJhbXMuc2V0KEFQSV9CQVNFX1BBUkFNLCBub3JtYWxpemVBcGlCYXNlVXJsKGFwaUJhc2VVcmwpKTtcclxuICB9XHJcbiAgcmV0dXJuIHVybC50b1N0cmluZygpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYWRkUGF0aEFjY2Vzc1Rva2VuVG9VcmwoYmFzZVVybCwgeyB0b2tlbiB9KSB7XG4gIGNvbnN0IHVybCA9IG5ldyBVUkwoYmFzZVVybCk7XHJcbiAgdXJsLnBhdGhuYW1lID0gYCR7QUNDRVNTX1RPS0VOX1BBVEhfUFJFRklYfSR7ZW5jb2RlVVJJQ29tcG9uZW50KHRva2VuKX0vYDtcclxuICB1cmwuc2VhcmNoID0gXCJcIjtcclxuICB1cmwuaGFzaCA9IFwiXCI7XHJcbiAgcmV0dXJuIHVybC50b1N0cmluZygpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBub3JtYWxpemVBcGlCYXNlVXJsKHJhd1VybCkge1xyXG4gIGNvbnN0IHRleHQgPSBTdHJpbmcocmF3VXJsKS50cmltKCk7XHJcbiAgY29uc3Qgd2l0aFByb3RvY29sID0gL15bYS16XVthLXpcXGQrLi1dKjpcXC9cXC8vaS50ZXN0KHRleHQpID8gdGV4dCA6IGBodHRwOi8vJHt0ZXh0fWA7XHJcbiAgY29uc3QgdXJsID0gbmV3IFVSTCh3aXRoUHJvdG9jb2wpO1xyXG4gIGlmICghdXJsLnBhdGhuYW1lIHx8IHVybC5wYXRobmFtZSA9PT0gXCIvXCIpIHtcclxuICAgIHVybC5wYXRobmFtZSA9IFwiL2FwaVwiO1xyXG4gIH1cclxuICB1cmwuc2VhcmNoID0gXCJcIjtcclxuICB1cmwuaGFzaCA9IFwiXCI7XHJcbiAgcmV0dXJuIHVybC50b1N0cmluZygpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZm9ybWF0VXJsSG9zdChob3N0KSB7XHJcbiAgcmV0dXJuIGhvc3QuaW5jbHVkZXMoXCI6XCIpICYmICFob3N0LnN0YXJ0c1dpdGgoXCJbXCIpID8gYFske2hvc3R9XWAgOiBob3N0O1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZWFkUHVibGljSXB2NEFkZHJlc3MoKSB7XHJcbiAgY29uc3QgZW5kcG9pbnRzID0gW1wiaHR0cHM6Ly9hcGkuaXBpZnkub3JnXCIsIFwiaHR0cHM6Ly9jaGVja2lwLmFtYXpvbmF3cy5jb21cIl07XHJcbiAgZm9yIChjb25zdCBlbmRwb2ludCBvZiBlbmRwb2ludHMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCByZWFkSHR0cHNUZXh0KGVuZHBvaW50LCAyNTAwKTtcclxuICAgICAgY29uc3QgYWRkcmVzcyA9IHRleHQudHJpbSgpO1xyXG4gICAgICBpZiAoL14oPzpcXGR7MSwzfVxcLil7M31cXGR7MSwzfSQvLnRlc3QoYWRkcmVzcykpIHtcclxuICAgICAgICByZXR1cm4gYWRkcmVzcztcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgIC8vIFRyeSB0aGUgbmV4dCBlbmRwb2ludCwgdGhlbiBmYWxsIGJhY2sgdG8gTEFOIGFkZHJlc3MgaWYgZXZlcnkgbG9va3VwIGZhaWxzLlxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29uc29sZS53YXJuKFwiW2pscHQgYWNjZXNzXSBQdWJsaWMgSVAgbG9va3VwIGZhaWxlZDsgSW50ZXJuZXQgUVIgd2lsbCBub3QgYmUgcHJpbnRlZCB1bmxlc3MgSkxQVF9QVUJMSUNfVVJMIG9yIEpMUFRfQUNDRVNTX0hPU1QgaXMgc2V0LlwiKTtcclxuICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZEh0dHBzVGV4dCh1cmwsIHRpbWVvdXRNcykge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBjb25zdCByZXEgPSBodHRwcy5nZXQodXJsLCB7IHRpbWVvdXQ6IHRpbWVvdXRNcyB9LCAocmVzKSA9PiB7XHJcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XHJcbiAgICAgICAgcmVzLnJlc3VtZSgpO1xyXG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsZXQgYm9keSA9IFwiXCI7XHJcbiAgICAgIHJlcy5zZXRFbmNvZGluZyhcInV0ZjhcIik7XHJcbiAgICAgIHJlcy5vbihcImRhdGFcIiwgKGNodW5rKSA9PiB7XHJcbiAgICAgICAgYm9keSArPSBjaHVuaztcclxuICAgICAgfSk7XHJcbiAgICAgIHJlcy5vbihcImVuZFwiLCAoKSA9PiByZXNvbHZlKGJvZHkpKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHJlcS5vbihcInRpbWVvdXRcIiwgKCkgPT4ge1xyXG4gICAgICByZXEuZGVzdHJveShuZXcgRXJyb3IoXCJQdWJsaWMgSVAgbG9va3VwIHRpbWVkIG91dFwiKSk7XHJcbiAgICB9KTtcclxuICAgIHJlcS5vbihcImVycm9yXCIsIHJlamVjdCk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlYWRMYW5JcHY0Q2FuZGlkYXRlcygpIHtcclxuICBjb25zdCBpbnRlcmZhY2VzID0gb3MubmV0d29ya0ludGVyZmFjZXMoKTtcclxuICBjb25zdCBjYW5kaWRhdGVzID0gW107XHJcblxyXG4gIGZvciAoY29uc3QgW25hbWUsIGVudHJpZXNdIG9mIE9iamVjdC5lbnRyaWVzKGludGVyZmFjZXMpKSB7XHJcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMgPz8gW10pIHtcclxuICAgICAgaWYgKGVudHJ5LmZhbWlseSAhPT0gXCJJUHY0XCIgfHwgZW50cnkuaW50ZXJuYWwpIGNvbnRpbnVlO1xyXG4gICAgICBpZiAoZW50cnkuYWRkcmVzcy5zdGFydHNXaXRoKFwiMTY5LjI1NC5cIikpIGNvbnRpbnVlO1xyXG4gICAgICBjYW5kaWRhdGVzLnB1c2goe1xyXG4gICAgICAgIG5hbWUsXHJcbiAgICAgICAgYWRkcmVzczogZW50cnkuYWRkcmVzcyxcclxuICAgICAgICBzY29yZTogc2NvcmVMYW5DYW5kaWRhdGUobmFtZSwgZW50cnkuYWRkcmVzcyksXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGNhbmRpZGF0ZXMuc29ydCgobGVmdCwgcmlnaHQpID0+IHtcclxuICAgIGlmIChyaWdodC5zY29yZSAhPT0gbGVmdC5zY29yZSkgcmV0dXJuIHJpZ2h0LnNjb3JlIC0gbGVmdC5zY29yZTtcclxuICAgIHJldHVybiBgJHtsZWZ0Lm5hbWV9ICR7bGVmdC5hZGRyZXNzfWAubG9jYWxlQ29tcGFyZShgJHtyaWdodC5uYW1lfSAke3JpZ2h0LmFkZHJlc3N9YCk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNjb3JlTGFuQ2FuZGlkYXRlKG5hbWUsIGFkZHJlc3MpIHtcclxuICBjb25zdCBub3JtYWxpemVkTmFtZSA9IFN0cmluZyhuYW1lKS50b0xvd2VyQ2FzZSgpO1xyXG4gIGxldCBzY29yZSA9IDA7XHJcblxyXG4gIGlmIChpc1ByaXZhdGVJcHY0KGFkZHJlc3MpKSBzY29yZSArPSAxMDA7XHJcbiAgaWYgKGFkZHJlc3Muc3RhcnRzV2l0aChcIjE5Mi4xNjguXCIpKSBzY29yZSArPSAzMDtcclxuICBpZiAoYWRkcmVzcy5zdGFydHNXaXRoKFwiMTAuXCIpKSBzY29yZSArPSAyMDtcclxuICBpZiAoaXNQcml2YXRlMTcySXB2NChhZGRyZXNzKSkgc2NvcmUgKz0gMTA7XHJcblxyXG4gIGlmICgvd2ktP2ZpfHdsYW58d2lyZWxlc3MvLnRlc3Qobm9ybWFsaXplZE5hbWUpKSBzY29yZSArPSA0MDtcclxuICBpZiAoL2V0aGVybmV0fGxhbi8udGVzdChub3JtYWxpemVkTmFtZSkpIHNjb3JlICs9IDMwO1xyXG4gIGlmICgvdmlydHVhbHx2ZXRoZXJuZXR8dm13YXJlfHZpcnR1YWxib3h8ZG9ja2VyfHdzbHxoeXBlci12fHZwbnx0YWlsc2NhbGV8emVyb3RpZXJ8dGFwfHR1bi8udGVzdChub3JtYWxpemVkTmFtZSkpIHtcclxuICAgIHNjb3JlIC09IDEwMDtcclxuICB9XHJcblxyXG4gIHJldHVybiBzY29yZTtcclxufVxyXG5cclxuZnVuY3Rpb24gZm9ybWF0TGFuQ2FuZGlkYXRlcyhjYW5kaWRhdGVzKSB7XHJcbiAgcmV0dXJuIGNhbmRpZGF0ZXMubWFwKChjYW5kaWRhdGUpID0+IGAke2NhbmRpZGF0ZS5uYW1lfT0ke2NhbmRpZGF0ZS5hZGRyZXNzfWApLmpvaW4oXCIsIFwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNQcml2YXRlSXB2NChhZGRyZXNzKSB7XHJcbiAgcmV0dXJuIGFkZHJlc3Muc3RhcnRzV2l0aChcIjEwLlwiKSB8fCBhZGRyZXNzLnN0YXJ0c1dpdGgoXCIxOTIuMTY4LlwiKSB8fCBpc1ByaXZhdGUxNzJJcHY0KGFkZHJlc3MpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1ByaXZhdGUxNzJJcHY0KGFkZHJlc3MpIHtcclxuICBjb25zdCBtYXRjaCA9IC9eMTcyXFwuKFxcZHsxLDN9KVxcLi8uZXhlYyhhZGRyZXNzKTtcclxuICBpZiAoIW1hdGNoKSByZXR1cm4gZmFsc2U7XHJcbiAgY29uc3Qgc2Vjb25kT2N0ZXQgPSBOdW1iZXIobWF0Y2hbMV0pO1xyXG4gIHJldHVybiBzZWNvbmRPY3RldCA+PSAxNiAmJiBzZWNvbmRPY3RldCA8PSAzMTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclFyKHRleHQsIG9wdGlvbnMgPSB7fSkge1xuICBjb25zdCBtYXRyaXggPSBjcmVhdGVRck1hdHJpeCh0ZXh0KTtcclxuICBpZiAoIW9wdGlvbnMudW5pY29kZSkge1xyXG4gICAgcmV0dXJuIHJlbmRlckFzY2lpUXIobWF0cml4KTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGJvcmRlciA9IDQ7XHJcbiAgY29uc3QgcmVuZGVyZWRTaXplID0gbWF0cml4Lmxlbmd0aCArIGJvcmRlciAqIDI7XHJcbiAgY29uc3QgaGFsZkJsb2NrID0gXCJcXHUyNTgwXCI7XHJcbiAgY29uc3QgcmVzZXQgPSBcIlxceDFiWzBtXCI7XHJcbiAgY29uc3QgYmxhY2tGZyA9IFwiXFx4MWJbMzBtXCI7XHJcbiAgY29uc3Qgd2hpdGVGZyA9IFwiXFx4MWJbOTdtXCI7XHJcbiAgY29uc3QgYmxhY2tCZyA9IFwiXFx4MWJbNDBtXCI7XHJcbiAgY29uc3Qgd2hpdGVCZyA9IFwiXFx4MWJbMTA3bVwiO1xyXG4gIGNvbnN0IGxpbmVzID0gW107XHJcblxyXG4gIGZ1bmN0aW9uIGlzRGFyayh4LCB5KSB7XHJcbiAgICBjb25zdCBteCA9IHggLSBib3JkZXI7XHJcbiAgICBjb25zdCBteSA9IHkgLSBib3JkZXI7XHJcbiAgICByZXR1cm4gbXggPj0gMCAmJiBteSA+PSAwICYmIG14IDwgbWF0cml4Lmxlbmd0aCAmJiBteSA8IG1hdHJpeC5sZW5ndGggJiYgbWF0cml4W215XVtteF07XHJcbiAgfVxyXG5cclxuICBmb3IgKGxldCB5ID0gMDsgeSA8IHJlbmRlcmVkU2l6ZTsgeSArPSAyKSB7XHJcbiAgICBsZXQgbGluZSA9IFwiXCI7XHJcbiAgICBmb3IgKGxldCB4ID0gMDsgeCA8IHJlbmRlcmVkU2l6ZTsgeCArPSAxKSB7XHJcbiAgICAgIGNvbnN0IHVwcGVyRGFyayA9IGlzRGFyayh4LCB5KTtcclxuICAgICAgY29uc3QgbG93ZXJEYXJrID0geSArIDEgPCByZW5kZXJlZFNpemUgJiYgaXNEYXJrKHgsIHkgKyAxKTtcclxuICAgICAgbGluZSArPSBgJHt1cHBlckRhcmsgPyBibGFja0ZnIDogd2hpdGVGZ30ke2xvd2VyRGFyayA/IGJsYWNrQmcgOiB3aGl0ZUJnfSR7aGFsZkJsb2NrfWA7XHJcbiAgICB9XHJcbiAgICBsaW5lcy5wdXNoKGAke2xpbmV9JHtyZXNldH1gKTtcclxuICB9XHJcblxyXG4gIHJldHVybiBsaW5lcy5qb2luKFwiXFxuXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJBc2NpaVFyKG1hdHJpeCkge1xyXG4gIGNvbnN0IGJvcmRlciA9IDI7XHJcbiAgY29uc3QgcmVuZGVyZWRTaXplID0gbWF0cml4Lmxlbmd0aCArIGJvcmRlciAqIDI7XHJcbiAgY29uc3QgbGluZXMgPSBbXTtcclxuXHJcbiAgZnVuY3Rpb24gaXNEYXJrKHgsIHkpIHtcclxuICAgIGNvbnN0IG14ID0geCAtIGJvcmRlcjtcclxuICAgIGNvbnN0IG15ID0geSAtIGJvcmRlcjtcclxuICAgIHJldHVybiBteCA+PSAwICYmIG15ID49IDAgJiYgbXggPCBtYXRyaXgubGVuZ3RoICYmIG15IDwgbWF0cml4Lmxlbmd0aCAmJiBtYXRyaXhbbXldW214XTtcclxuICB9XHJcblxyXG4gIGZvciAobGV0IHkgPSAwOyB5IDwgcmVuZGVyZWRTaXplOyB5ICs9IDEpIHtcclxuICAgIGxldCBsaW5lID0gXCJcIjtcclxuICAgIGZvciAobGV0IHggPSAwOyB4IDwgcmVuZGVyZWRTaXplOyB4ICs9IDEpIHtcclxuICAgICAgbGluZSArPSBpc0RhcmsoeCwgeSkgPyBcIiMjXCIgOiBcIiAgXCI7XHJcbiAgICB9XHJcbiAgICBsaW5lcy5wdXNoKGxpbmUpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGxpbmVzLmpvaW4oXCJcXG5cIik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVFyTWF0cml4KHRleHQpIHtcclxuICBjb25zdCBkYXRhQ29kZXdvcmRzID0gY3JlYXRlRGF0YUNvZGV3b3Jkcyh0ZXh0KTtcclxuICBjb25zdCBjb2Rld29yZEJpdHMgPSBhZGRFcnJvckNvcnJlY3Rpb24oZGF0YUNvZGV3b3JkcykuZmxhdE1hcCgoY29kZXdvcmQpID0+IGJ5dGVUb0JpdHMoY29kZXdvcmQpKTtcclxuICBjb25zdCBiYXNlID0gY3JlYXRlQmFzZVFyKCk7XHJcbiAgbGV0IGJlc3QgPSBudWxsO1xyXG5cclxuICBmb3IgKGxldCBtYXNrID0gMDsgbWFzayA8IDg7IG1hc2sgKz0gMSkge1xyXG4gICAgY29uc3QgcXIgPSBjbG9uZVFyKGJhc2UpO1xyXG4gICAgZHJhd0NvZGV3b3JkcyhxciwgY29kZXdvcmRCaXRzLCBtYXNrKTtcclxuICAgIGRyYXdGb3JtYXRCaXRzKHFyLCBtYXNrKTtcclxuICAgIGNvbnN0IHBlbmFsdHkgPSBjYWxjdWxhdGVQZW5hbHR5KHFyLm1vZHVsZXMpO1xyXG4gICAgaWYgKCFiZXN0IHx8IHBlbmFsdHkgPCBiZXN0LnBlbmFsdHkpIHtcclxuICAgICAgYmVzdCA9IHsgbW9kdWxlczogcXIubW9kdWxlcywgcGVuYWx0eSB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGJlc3QubW9kdWxlcztcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRGF0YUNvZGV3b3Jkcyh0ZXh0KSB7XHJcbiAgY29uc3QgYnl0ZXMgPSBCdWZmZXIuZnJvbSh0ZXh0LCBcInV0ZjhcIik7XHJcbiAgY29uc3QgY2FwYWNpdHlCaXRzID0gUVJfREFUQV9DT0RFV09SRFMgKiA4O1xyXG4gIGNvbnN0IGJpdHMgPSBbXTtcclxuXHJcbiAgYXBwZW5kQml0cyhiaXRzLCAweDQsIDQpO1xyXG4gIGFwcGVuZEJpdHMoYml0cywgYnl0ZXMubGVuZ3RoLCAxNik7XHJcbiAgZm9yIChjb25zdCBieXRlIG9mIGJ5dGVzKSB7XHJcbiAgICBhcHBlbmRCaXRzKGJpdHMsIGJ5dGUsIDgpO1xyXG4gIH1cclxuXHJcbiAgaWYgKGJpdHMubGVuZ3RoID4gY2FwYWNpdHlCaXRzKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFFSIHBheWxvYWQgaXMgdG9vIGxvbmcgZm9yIHRoZSBidWlsdC1pbiB0ZXJtaW5hbCByZW5kZXJlciAoJHtieXRlcy5sZW5ndGh9IGJ5dGVzKWApO1xyXG4gIH1cclxuXHJcbiAgYXBwZW5kQml0cyhiaXRzLCAwLCBNYXRoLm1pbig0LCBjYXBhY2l0eUJpdHMgLSBiaXRzLmxlbmd0aCkpO1xyXG4gIHdoaWxlIChiaXRzLmxlbmd0aCAlIDggIT09IDApIGJpdHMucHVzaChmYWxzZSk7XHJcblxyXG4gIGNvbnN0IGNvZGV3b3JkcyA9IFtdO1xyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYml0cy5sZW5ndGg7IGkgKz0gOCkge1xyXG4gICAgbGV0IHZhbHVlID0gMDtcclxuICAgIGZvciAobGV0IGogPSAwOyBqIDwgODsgaiArPSAxKSB7XHJcbiAgICAgIHZhbHVlID0gKHZhbHVlIDw8IDEpIHwgKGJpdHNbaSArIGpdID8gMSA6IDApO1xyXG4gICAgfVxyXG4gICAgY29kZXdvcmRzLnB1c2godmFsdWUpO1xyXG4gIH1cclxuXHJcbiAgZm9yIChsZXQgcGFkID0gMDsgY29kZXdvcmRzLmxlbmd0aCA8IFFSX0RBVEFfQ09ERVdPUkRTOyBwYWQgKz0gMSkge1xyXG4gICAgY29kZXdvcmRzLnB1c2gocGFkICUgMiA9PT0gMCA/IDB4ZWMgOiAweDExKTtcclxuICB9XHJcblxyXG4gIHJldHVybiBjb2Rld29yZHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZEVycm9yQ29ycmVjdGlvbihkYXRhQ29kZXdvcmRzKSB7XHJcbiAgY29uc3QgYmxvY2tzID0gW107XHJcbiAgbGV0IG9mZnNldCA9IDA7XHJcblxyXG4gIGZvciAoY29uc3QgZGF0YUxlbmd0aCBvZiBRUl9CTE9DS19EQVRBX0xFTkdUSFMpIHtcclxuICAgIGNvbnN0IGRhdGEgPSBkYXRhQ29kZXdvcmRzLnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgZGF0YUxlbmd0aCk7XHJcbiAgICBibG9ja3MucHVzaCh7XHJcbiAgICAgIGRhdGEsXHJcbiAgICAgIGVjYzogY3JlYXRlUmVlZFNvbG9tb25SZW1haW5kZXIoZGF0YSwgUVJfRUNDX0NPREVXT1JEU19QRVJfQkxPQ0spLFxyXG4gICAgfSk7XHJcbiAgICBvZmZzZXQgKz0gZGF0YUxlbmd0aDtcclxuICB9XHJcblxyXG4gIGNvbnN0IHJlc3VsdCA9IFtdO1xyXG4gIGNvbnN0IG1heERhdGFMZW5ndGggPSBNYXRoLm1heCguLi5RUl9CTE9DS19EQVRBX0xFTkdUSFMpO1xyXG5cclxuICBmb3IgKGxldCBpID0gMDsgaSA8IG1heERhdGFMZW5ndGg7IGkgKz0gMSkge1xyXG4gICAgZm9yIChjb25zdCBibG9jayBvZiBibG9ja3MpIHtcclxuICAgICAgaWYgKGkgPCBibG9jay5kYXRhLmxlbmd0aCkgcmVzdWx0LnB1c2goYmxvY2suZGF0YVtpXSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmb3IgKGxldCBpID0gMDsgaSA8IFFSX0VDQ19DT0RFV09SRFNfUEVSX0JMT0NLOyBpICs9IDEpIHtcclxuICAgIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzKSB7XHJcbiAgICAgIHJlc3VsdC5wdXNoKGJsb2NrLmVjY1tpXSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVSZWVkU29sb21vblJlbWFpbmRlcihkYXRhLCBkZWdyZWUpIHtcclxuICBjb25zdCBnZW5lcmF0b3IgPSBjcmVhdGVSZWVkU29sb21vbkdlbmVyYXRvcihkZWdyZWUpO1xyXG4gIGNvbnN0IG1lc3NhZ2UgPSBbLi4uZGF0YSwgLi4uQXJyYXkoZGVncmVlKS5maWxsKDApXTtcclxuXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSArPSAxKSB7XHJcbiAgICBjb25zdCBmYWN0b3IgPSBtZXNzYWdlW2ldO1xyXG4gICAgaWYgKGZhY3RvciA9PT0gMCkgY29udGludWU7XHJcbiAgICBmb3IgKGxldCBqID0gMTsgaiA8IGdlbmVyYXRvci5sZW5ndGg7IGogKz0gMSkge1xyXG4gICAgICBtZXNzYWdlW2kgKyBqXSBePSBnZk11bHRpcGx5KGdlbmVyYXRvcltqXSwgZmFjdG9yKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBtZXNzYWdlLnNsaWNlKGRhdGEubGVuZ3RoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlUmVlZFNvbG9tb25HZW5lcmF0b3IoZGVncmVlKSB7XHJcbiAgbGV0IHJlc3VsdCA9IFsxXTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGRlZ3JlZTsgaSArPSAxKSB7XHJcbiAgICByZXN1bHQgPSBtdWx0aXBseVBvbHlub21pYWxzKHJlc3VsdCwgWzEsIGdmUG93ZXIoaSldKTtcclxuICB9XHJcbiAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZnVuY3Rpb24gbXVsdGlwbHlQb2x5bm9taWFscyhsZWZ0LCByaWdodCkge1xyXG4gIGNvbnN0IHJlc3VsdCA9IEFycmF5KGxlZnQubGVuZ3RoICsgcmlnaHQubGVuZ3RoIC0gMSkuZmlsbCgwKTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGxlZnQubGVuZ3RoOyBpICs9IDEpIHtcclxuICAgIGZvciAobGV0IGogPSAwOyBqIDwgcmlnaHQubGVuZ3RoOyBqICs9IDEpIHtcclxuICAgICAgcmVzdWx0W2kgKyBqXSBePSBnZk11bHRpcGx5KGxlZnRbaV0sIHJpZ2h0W2pdKTtcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2ZNdWx0aXBseShsZWZ0LCByaWdodCkge1xyXG4gIGlmIChsZWZ0ID09PSAwIHx8IHJpZ2h0ID09PSAwKSByZXR1cm4gMDtcclxuICByZXR1cm4gR0ZfRVhQW0dGX0xPR1tsZWZ0XSArIEdGX0xPR1tyaWdodF1dO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZlBvd2VyKHBvd2VyKSB7XHJcbiAgcmV0dXJuIEdGX0VYUFtwb3dlcl07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUJhc2VRcigpIHtcclxuICBjb25zdCBxciA9IHtcclxuICAgIG1vZHVsZXM6IEFycmF5LmZyb20oeyBsZW5ndGg6IFFSX1NJWkUgfSwgKCkgPT4gQXJyYXkoUVJfU0laRSkuZmlsbChmYWxzZSkpLFxyXG4gICAgcmVzZXJ2ZWQ6IEFycmF5LmZyb20oeyBsZW5ndGg6IFFSX1NJWkUgfSwgKCkgPT4gQXJyYXkoUVJfU0laRSkuZmlsbChmYWxzZSkpLFxyXG4gIH07XHJcblxyXG4gIGRyYXdGaW5kZXIocXIsIDAsIDApO1xyXG4gIGRyYXdGaW5kZXIocXIsIFFSX1NJWkUgLSA3LCAwKTtcclxuICBkcmF3RmluZGVyKHFyLCAwLCBRUl9TSVpFIC0gNyk7XHJcbiAgZHJhd1RpbWluZ1BhdHRlcm5zKHFyKTtcclxuICBkcmF3QWxpZ25tZW50UGF0dGVybnMocXIpO1xyXG4gIHJlc2VydmVGb3JtYXRCaXRzKHFyKTtcclxuICBkcmF3VmVyc2lvbkJpdHMocXIpO1xyXG4gIHJldHVybiBxcjtcclxufVxyXG5cclxuZnVuY3Rpb24gY2xvbmVRcihxcikge1xyXG4gIHJldHVybiB7XHJcbiAgICBtb2R1bGVzOiBxci5tb2R1bGVzLm1hcCgocm93KSA9PiBbLi4ucm93XSksXHJcbiAgICByZXNlcnZlZDogcXIucmVzZXJ2ZWQubWFwKChyb3cpID0+IFsuLi5yb3ddKSxcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3RmluZGVyKHFyLCBsZWZ0LCB0b3ApIHtcclxuICBmb3IgKGxldCBkeSA9IC0xOyBkeSA8PSA3OyBkeSArPSAxKSB7XHJcbiAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSA3OyBkeCArPSAxKSB7XHJcbiAgICAgIGNvbnN0IHggPSBsZWZ0ICsgZHg7XHJcbiAgICAgIGNvbnN0IHkgPSB0b3AgKyBkeTtcclxuICAgICAgaWYgKCFpc0luUXIoeCwgeSkpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgY29uc3QgaW5QYXR0ZXJuID0gZHggPj0gMCAmJiBkeCA8PSA2ICYmIGR5ID49IDAgJiYgZHkgPD0gNjtcclxuICAgICAgY29uc3QgZGFyayA9XHJcbiAgICAgICAgaW5QYXR0ZXJuICYmIChkeCA9PT0gMCB8fCBkeCA9PT0gNiB8fCBkeSA9PT0gMCB8fCBkeSA9PT0gNiB8fCAoZHggPj0gMiAmJiBkeCA8PSA0ICYmIGR5ID49IDIgJiYgZHkgPD0gNCkpO1xyXG4gICAgICBzZXRGdW5jdGlvbk1vZHVsZShxciwgeCwgeSwgZGFyayk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3VGltaW5nUGF0dGVybnMocXIpIHtcclxuICBmb3IgKGxldCBpID0gODsgaSA8IFFSX1NJWkUgLSA4OyBpICs9IDEpIHtcclxuICAgIGNvbnN0IGRhcmsgPSBpICUgMiA9PT0gMDtcclxuICAgIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCBpLCA2LCBkYXJrKTtcclxuICAgIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCA2LCBpLCBkYXJrKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdBbGlnbm1lbnRQYXR0ZXJucyhxcikge1xyXG4gIGZvciAoY29uc3QgeSBvZiBRUl9BTElHTk1FTlRfUE9TSVRJT05TKSB7XHJcbiAgICBmb3IgKGNvbnN0IHggb2YgUVJfQUxJR05NRU5UX1BPU0lUSU9OUykge1xyXG4gICAgICBpZiAoaXNPdmVybGFwcGluZ0ZpbmRlckNlbnRlcih4LCB5KSkgY29udGludWU7XHJcbiAgICAgIGRyYXdBbGlnbm1lbnQocXIsIHgsIHkpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaXNPdmVybGFwcGluZ0ZpbmRlckNlbnRlcih4LCB5KSB7XHJcbiAgY29uc3QgbGFzdCA9IFFSX1NJWkUgLSA3O1xyXG4gIHJldHVybiAoeCA9PT0gNiAmJiB5ID09PSA2KSB8fCAoeCA9PT0gbGFzdCAmJiB5ID09PSA2KSB8fCAoeCA9PT0gNiAmJiB5ID09PSBsYXN0KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0FsaWdubWVudChxciwgY2VudGVyWCwgY2VudGVyWSkge1xyXG4gIGZvciAobGV0IGR5ID0gLTI7IGR5IDw9IDI7IGR5ICs9IDEpIHtcclxuICAgIGZvciAobGV0IGR4ID0gLTI7IGR4IDw9IDI7IGR4ICs9IDEpIHtcclxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLm1heChNYXRoLmFicyhkeCksIE1hdGguYWJzKGR5KSk7XHJcbiAgICAgIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCBjZW50ZXJYICsgZHgsIGNlbnRlclkgKyBkeSwgZGlzdGFuY2UgPT09IDAgfHwgZGlzdGFuY2UgPT09IDIpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcmVzZXJ2ZUZvcm1hdEJpdHMocXIpIHtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8PSA1OyBpICs9IDEpIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCA4LCBpLCBmYWxzZSk7XHJcbiAgc2V0RnVuY3Rpb25Nb2R1bGUocXIsIDgsIDcsIGZhbHNlKTtcclxuICBzZXRGdW5jdGlvbk1vZHVsZShxciwgOCwgOCwgZmFsc2UpO1xyXG4gIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCA3LCA4LCBmYWxzZSk7XHJcbiAgZm9yIChsZXQgaSA9IDk7IGkgPCAxNTsgaSArPSAxKSBzZXRGdW5jdGlvbk1vZHVsZShxciwgMTQgLSBpLCA4LCBmYWxzZSk7XHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCA4OyBpICs9IDEpIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCBRUl9TSVpFIC0gMSAtIGksIDgsIGZhbHNlKTtcclxuICBmb3IgKGxldCBpID0gODsgaSA8IDE1OyBpICs9IDEpIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCA4LCBRUl9TSVpFIC0gMTUgKyBpLCBmYWxzZSk7XHJcbiAgc2V0RnVuY3Rpb25Nb2R1bGUocXIsIDgsIFFSX1NJWkUgLSA4LCB0cnVlKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0Zvcm1hdEJpdHMocXIsIG1hc2spIHtcclxuICBjb25zdCBiaXRzID0gY3JlYXRlRm9ybWF0Qml0cyhtYXNrKTtcclxuXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPD0gNTsgaSArPSAxKSBzZXRGdW5jdGlvbk1vZHVsZShxciwgOCwgaSwgaXNCaXRTZXQoYml0cywgaSkpO1xyXG4gIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCA4LCA3LCBpc0JpdFNldChiaXRzLCA2KSk7XHJcbiAgc2V0RnVuY3Rpb25Nb2R1bGUocXIsIDgsIDgsIGlzQml0U2V0KGJpdHMsIDcpKTtcclxuICBzZXRGdW5jdGlvbk1vZHVsZShxciwgNywgOCwgaXNCaXRTZXQoYml0cywgOCkpO1xyXG4gIGZvciAobGV0IGkgPSA5OyBpIDwgMTU7IGkgKz0gMSkgc2V0RnVuY3Rpb25Nb2R1bGUocXIsIDE0IC0gaSwgOCwgaXNCaXRTZXQoYml0cywgaSkpO1xyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgODsgaSArPSAxKSBzZXRGdW5jdGlvbk1vZHVsZShxciwgUVJfU0laRSAtIDEgLSBpLCA4LCBpc0JpdFNldChiaXRzLCBpKSk7XHJcbiAgZm9yIChsZXQgaSA9IDg7IGkgPCAxNTsgaSArPSAxKSBzZXRGdW5jdGlvbk1vZHVsZShxciwgOCwgUVJfU0laRSAtIDE1ICsgaSwgaXNCaXRTZXQoYml0cywgaSkpO1xyXG4gIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCA4LCBRUl9TSVpFIC0gOCwgdHJ1ZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdWZXJzaW9uQml0cyhxcikge1xyXG4gIGNvbnN0IGJpdHMgPSBjcmVhdGVWZXJzaW9uQml0cygpO1xyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMTg7IGkgKz0gMSkge1xyXG4gICAgY29uc3QgeCA9IFFSX1NJWkUgLSAxMSArIChpICUgMyk7XHJcbiAgICBjb25zdCB5ID0gTWF0aC5mbG9vcihpIC8gMyk7XHJcbiAgICBjb25zdCBkYXJrID0gaXNCaXRTZXQoYml0cywgaSk7XHJcbiAgICBzZXRGdW5jdGlvbk1vZHVsZShxciwgeCwgeSwgZGFyayk7XHJcbiAgICBzZXRGdW5jdGlvbk1vZHVsZShxciwgeSwgeCwgZGFyayk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3Q29kZXdvcmRzKHFyLCBiaXRzLCBtYXNrKSB7XHJcbiAgbGV0IGJpdEluZGV4ID0gMDtcclxuICBsZXQgdXB3YXJkID0gdHJ1ZTtcclxuXHJcbiAgZm9yIChsZXQgcmlnaHQgPSBRUl9TSVpFIC0gMTsgcmlnaHQgPj0gMTsgcmlnaHQgLT0gMikge1xyXG4gICAgaWYgKHJpZ2h0ID09PSA2KSByaWdodCAtPSAxO1xyXG5cclxuICAgIGZvciAobGV0IHZlcnRpY2FsID0gMDsgdmVydGljYWwgPCBRUl9TSVpFOyB2ZXJ0aWNhbCArPSAxKSB7XHJcbiAgICAgIGNvbnN0IHkgPSB1cHdhcmQgPyBRUl9TSVpFIC0gMSAtIHZlcnRpY2FsIDogdmVydGljYWw7XHJcbiAgICAgIGZvciAobGV0IGR4ID0gMDsgZHggPCAyOyBkeCArPSAxKSB7XHJcbiAgICAgICAgY29uc3QgeCA9IHJpZ2h0IC0gZHg7XHJcbiAgICAgICAgaWYgKHFyLnJlc2VydmVkW3ldW3hdKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgY29uc3QgcmF3ID0gYml0SW5kZXggPCBiaXRzLmxlbmd0aCA/IGJpdHNbYml0SW5kZXhdIDogZmFsc2U7XHJcbiAgICAgICAgcXIubW9kdWxlc1t5XVt4XSA9IHJhdyAhPT0gc2hvdWxkTWFzayhtYXNrLCB4LCB5KTtcclxuICAgICAgICBiaXRJbmRleCArPSAxO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdXB3YXJkID0gIXVwd2FyZDtcclxuICB9XHJcblxyXG4gIGlmIChiaXRJbmRleCAhPT0gYml0cy5sZW5ndGgpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgUVIgcGxhY2VtZW50IG1pc21hdGNoOiBwbGFjZWQgJHtiaXRJbmRleH0gYml0cywgZXhwZWN0ZWQgJHtiaXRzLmxlbmd0aH1gKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNob3VsZE1hc2sobWFzaywgeCwgeSkge1xyXG4gIHN3aXRjaCAobWFzaykge1xyXG4gICAgY2FzZSAwOlxyXG4gICAgICByZXR1cm4gKHggKyB5KSAlIDIgPT09IDA7XHJcbiAgICBjYXNlIDE6XHJcbiAgICAgIHJldHVybiB5ICUgMiA9PT0gMDtcclxuICAgIGNhc2UgMjpcclxuICAgICAgcmV0dXJuIHggJSAzID09PSAwO1xyXG4gICAgY2FzZSAzOlxyXG4gICAgICByZXR1cm4gKHggKyB5KSAlIDMgPT09IDA7XHJcbiAgICBjYXNlIDQ6XHJcbiAgICAgIHJldHVybiAoTWF0aC5mbG9vcih5IC8gMikgKyBNYXRoLmZsb29yKHggLyAzKSkgJSAyID09PSAwO1xyXG4gICAgY2FzZSA1OlxyXG4gICAgICByZXR1cm4gKCh4ICogeSkgJSAyKSArICgoeCAqIHkpICUgMykgPT09IDA7XHJcbiAgICBjYXNlIDY6XHJcbiAgICAgIHJldHVybiAoKCh4ICogeSkgJSAyKSArICgoeCAqIHkpICUgMykpICUgMiA9PT0gMDtcclxuICAgIGNhc2UgNzpcclxuICAgICAgcmV0dXJuICgoKHggKyB5KSAlIDIpICsgKCh4ICogeSkgJSAzKSkgJSAyID09PSAwO1xyXG4gICAgZGVmYXVsdDpcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIFFSIG1hc2s6ICR7bWFza31gKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZVBlbmFsdHkobWF0cml4KSB7XHJcbiAgcmV0dXJuIGNhbGN1bGF0ZVJ1blBlbmFsdHkobWF0cml4KSArIGNhbGN1bGF0ZUJsb2NrUGVuYWx0eShtYXRyaXgpICsgY2FsY3VsYXRlRmluZGVyUGVuYWx0eShtYXRyaXgpICsgY2FsY3VsYXRlQmFsYW5jZVBlbmFsdHkobWF0cml4KTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2FsY3VsYXRlUnVuUGVuYWx0eShtYXRyaXgpIHtcclxuICBsZXQgcGVuYWx0eSA9IDA7XHJcbiAgZm9yIChsZXQgeSA9IDA7IHkgPCBRUl9TSVpFOyB5ICs9IDEpIHBlbmFsdHkgKz0gY2FsY3VsYXRlTGluZVJ1blBlbmFsdHkobWF0cml4W3ldKTtcclxuICBmb3IgKGxldCB4ID0gMDsgeCA8IFFSX1NJWkU7IHggKz0gMSkgcGVuYWx0eSArPSBjYWxjdWxhdGVMaW5lUnVuUGVuYWx0eShtYXRyaXgubWFwKChyb3cpID0+IHJvd1t4XSkpO1xyXG4gIHJldHVybiBwZW5hbHR5O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYWxjdWxhdGVMaW5lUnVuUGVuYWx0eShsaW5lKSB7XHJcbiAgbGV0IHBlbmFsdHkgPSAwO1xyXG4gIGxldCBydW5Db2xvciA9IGxpbmVbMF07XHJcbiAgbGV0IHJ1bkxlbmd0aCA9IDE7XHJcblxyXG4gIGZvciAobGV0IGkgPSAxOyBpIDw9IGxpbmUubGVuZ3RoOyBpICs9IDEpIHtcclxuICAgIGlmIChpIDwgbGluZS5sZW5ndGggJiYgbGluZVtpXSA9PT0gcnVuQ29sb3IpIHtcclxuICAgICAgcnVuTGVuZ3RoICs9IDE7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG4gICAgaWYgKHJ1bkxlbmd0aCA+PSA1KSBwZW5hbHR5ICs9IHJ1bkxlbmd0aCAtIDI7XHJcbiAgICBydW5Db2xvciA9IGxpbmVbaV07XHJcbiAgICBydW5MZW5ndGggPSAxO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHBlbmFsdHk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZUJsb2NrUGVuYWx0eShtYXRyaXgpIHtcclxuICBsZXQgcGVuYWx0eSA9IDA7XHJcbiAgZm9yIChsZXQgeSA9IDA7IHkgPCBRUl9TSVpFIC0gMTsgeSArPSAxKSB7XHJcbiAgICBmb3IgKGxldCB4ID0gMDsgeCA8IFFSX1NJWkUgLSAxOyB4ICs9IDEpIHtcclxuICAgICAgY29uc3QgY29sb3IgPSBtYXRyaXhbeV1beF07XHJcbiAgICAgIGlmIChtYXRyaXhbeV1beCArIDFdID09PSBjb2xvciAmJiBtYXRyaXhbeSArIDFdW3hdID09PSBjb2xvciAmJiBtYXRyaXhbeSArIDFdW3ggKyAxXSA9PT0gY29sb3IpIHtcclxuICAgICAgICBwZW5hbHR5ICs9IDM7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIHBlbmFsdHk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZUZpbmRlclBlbmFsdHkobWF0cml4KSB7XHJcbiAgY29uc3QgZGFya1BhdHRlcm4gPSBbdHJ1ZSwgZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIGZhbHNlLCB0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV07XHJcbiAgY29uc3QgbGlnaHRQYXR0ZXJuID0gW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCB0cnVlLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgZmFsc2UsIHRydWVdO1xyXG4gIGxldCBwZW5hbHR5ID0gMDtcclxuXHJcbiAgZm9yIChsZXQgeSA9IDA7IHkgPCBRUl9TSVpFOyB5ICs9IDEpIHtcclxuICAgIHBlbmFsdHkgKz0gY291bnRQYXR0ZXJuUGVuYWx0eShtYXRyaXhbeV0sIGRhcmtQYXR0ZXJuKTtcclxuICAgIHBlbmFsdHkgKz0gY291bnRQYXR0ZXJuUGVuYWx0eShtYXRyaXhbeV0sIGxpZ2h0UGF0dGVybik7XHJcbiAgfVxyXG5cclxuICBmb3IgKGxldCB4ID0gMDsgeCA8IFFSX1NJWkU7IHggKz0gMSkge1xyXG4gICAgY29uc3QgY29sdW1uID0gbWF0cml4Lm1hcCgocm93KSA9PiByb3dbeF0pO1xyXG4gICAgcGVuYWx0eSArPSBjb3VudFBhdHRlcm5QZW5hbHR5KGNvbHVtbiwgZGFya1BhdHRlcm4pO1xyXG4gICAgcGVuYWx0eSArPSBjb3VudFBhdHRlcm5QZW5hbHR5KGNvbHVtbiwgbGlnaHRQYXR0ZXJuKTtcclxuICB9XHJcblxyXG4gIHJldHVybiBwZW5hbHR5O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb3VudFBhdHRlcm5QZW5hbHR5KGxpbmUsIHBhdHRlcm4pIHtcclxuICBsZXQgcGVuYWx0eSA9IDA7XHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPD0gbGluZS5sZW5ndGggLSBwYXR0ZXJuLmxlbmd0aDsgaSArPSAxKSB7XHJcbiAgICBpZiAocGF0dGVybi5ldmVyeSgoY29sb3IsIGluZGV4KSA9PiBsaW5lW2kgKyBpbmRleF0gPT09IGNvbG9yKSkge1xyXG4gICAgICBwZW5hbHR5ICs9IDQwO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gcGVuYWx0eTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2FsY3VsYXRlQmFsYW5jZVBlbmFsdHkobWF0cml4KSB7XHJcbiAgY29uc3QgdG90YWwgPSBRUl9TSVpFICogUVJfU0laRTtcclxuICBjb25zdCBkYXJrID0gbWF0cml4LnJlZHVjZSgoc3VtLCByb3cpID0+IHN1bSArIHJvdy5maWx0ZXIoQm9vbGVhbikubGVuZ3RoLCAwKTtcclxuICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLmFicyhkYXJrICogMjAgLSB0b3RhbCAqIDEwKSAvIHRvdGFsKSAqIDEwO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVGb3JtYXRCaXRzKG1hc2spIHtcclxuICBjb25zdCBkYXRhID0gKFFSX0VDQ19GT1JNQVRfQklUU19MT1cgPDwgMykgfCBtYXNrO1xyXG4gIHJldHVybiAoKGRhdGEgPDwgMTApIHwgY3JlYXRlQmNoUmVtYWluZGVyKGRhdGEsIDB4NTM3KSkgXiAweDU0MTI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVZlcnNpb25CaXRzKCkge1xyXG4gIHJldHVybiAoUVJfVkVSU0lPTiA8PCAxMikgfCBjcmVhdGVCY2hSZW1haW5kZXIoUVJfVkVSU0lPTiwgMHgxZjI1KTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQmNoUmVtYWluZGVyKGRhdGEsIGdlbmVyYXRvcikge1xyXG4gIGxldCB2YWx1ZSA9IGRhdGEgPDwgKGJpdExlbmd0aChnZW5lcmF0b3IpIC0gMSk7XHJcbiAgd2hpbGUgKGJpdExlbmd0aCh2YWx1ZSkgPj0gYml0TGVuZ3RoKGdlbmVyYXRvcikpIHtcclxuICAgIHZhbHVlIF49IGdlbmVyYXRvciA8PCAoYml0TGVuZ3RoKHZhbHVlKSAtIGJpdExlbmd0aChnZW5lcmF0b3IpKTtcclxuICB9XHJcbiAgcmV0dXJuIHZhbHVlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhcHBlbmRCaXRzKGJpdHMsIHZhbHVlLCBsZW5ndGgpIHtcclxuICBmb3IgKGxldCBpID0gbGVuZ3RoIC0gMTsgaSA+PSAwOyBpIC09IDEpIHtcclxuICAgIGJpdHMucHVzaCgoKHZhbHVlID4+PiBpKSAmIDEpID09PSAxKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGJ5dGVUb0JpdHMoYnl0ZSkge1xyXG4gIHJldHVybiBBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sIChfLCBpbmRleCkgPT4gKChieXRlID4+PiAoNyAtIGluZGV4KSkgJiAxKSA9PT0gMSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldEZ1bmN0aW9uTW9kdWxlKHFyLCB4LCB5LCBkYXJrKSB7XHJcbiAgaWYgKCFpc0luUXIoeCwgeSkpIHJldHVybjtcclxuICBxci5tb2R1bGVzW3ldW3hdID0gQm9vbGVhbihkYXJrKTtcclxuICBxci5yZXNlcnZlZFt5XVt4XSA9IHRydWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzSW5Rcih4LCB5KSB7XHJcbiAgcmV0dXJuIHggPj0gMCAmJiB5ID49IDAgJiYgeCA8IFFSX1NJWkUgJiYgeSA8IFFSX1NJWkU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzQml0U2V0KHZhbHVlLCBiaXQpIHtcclxuICByZXR1cm4gKCh2YWx1ZSA+Pj4gYml0KSAmIDEpICE9PSAwO1xyXG59XHJcblxyXG5mdW5jdGlvbiBiaXRMZW5ndGgodmFsdWUpIHtcclxuICBsZXQgcmVzdWx0ID0gMDtcclxuICBmb3IgKGxldCBjdXJyZW50ID0gdmFsdWU7IGN1cnJlbnQgPiAwOyBjdXJyZW50ID4+Pj0gMSkgcmVzdWx0ICs9IDE7XHJcbiAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlR2Fsb2lzVGFibGVzKCkge1xyXG4gIGNvbnN0IGV4cCA9IEFycmF5KDUxMikuZmlsbCgwKTtcclxuICBjb25zdCBsb2cgPSBBcnJheSgyNTYpLmZpbGwoMCk7XHJcbiAgbGV0IHZhbHVlID0gMTtcclxuXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCAyNTU7IGkgKz0gMSkge1xyXG4gICAgZXhwW2ldID0gdmFsdWU7XHJcbiAgICBsb2dbdmFsdWVdID0gaTtcclxuICAgIHZhbHVlIDw8PSAxO1xyXG4gICAgaWYgKHZhbHVlICYgMHgxMDApIHZhbHVlIF49IDB4MTFkO1xyXG4gIH1cclxuXHJcbiAgZm9yIChsZXQgaSA9IDI1NTsgaSA8IGV4cC5sZW5ndGg7IGkgKz0gMSkge1xyXG4gICAgZXhwW2ldID0gZXhwW2kgLSAyNTVdO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHsgZXhwLCBsb2cgfTtcclxufVxyXG5cclxuY29uc3QgeyBleHA6IEdGX0VYUCwgbG9nOiBHRl9MT0cgfSA9IGNyZWF0ZUdhbG9pc1RhYmxlcygpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWtTLFNBQVMsb0JBQW9CO0FBQy9ULE9BQU8sV0FBVzs7O0FDRDRSLFNBQVMsT0FBTyxpQkFBaUI7QUFDL1UsT0FBTyxZQUFZ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
