import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import https from "node:https";
import os from "node:os";

const ACCESS_TOKEN_PARAM = "access_token";
const ACCESS_TOKEN_ALIASES = [ACCESS_TOKEN_PARAM, "token"];
const ACCESS_TOKEN_COOKIE = "jlpt_access_token";
const ACCESS_TOKEN_HEADER = "x-jlpt-access-token";
const ACCESS_TOKEN_PATH_PREFIX = "/__jlpt_access/";
const ACCESS_TOKEN_SESSION_KEY = "jlpt_access_token";
const API_BASE_PARAM = "api_base";
const API_BASE_ALIASES = [API_BASE_PARAM, "api_url"];
const API_BASE_SESSION_KEY = "jlpt_api_base_url";
const ACCESS_TOKEN = process.env.JLPT_ACCESS_TOKEN || crypto.randomBytes(24).toString("base64url");
const AUTHORIZED_CLIENT_TTL_MS = 12 * 60 * 60 * 1000;
const CLOUDFLARED_OPEN_TIMEOUT_MS = 45_000;
const CLOUDFLARED_URL_PATTERN = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.trycloudflare\.com/i;
const authorizedClients = new Map();
const cloudflaredLogSignatures = new Set();
let activeCloudflareTunnel = null;
let cloudflareTunnelStartPromise = null;

const QR_VERSION = 10;
const QR_SIZE = QR_VERSION * 4 + 17;
const QR_DATA_CODEWORDS = 274;
const QR_BLOCK_DATA_LENGTHS = [68, 68, 69, 69];
const QR_ECC_CODEWORDS_PER_BLOCK = 18;
const QR_ECC_FORMAT_BITS_LOW = 1;
const QR_ALIGNMENT_POSITIONS = [6, 28, 50];

export function getDevServerConfig() {
  return {
    host: "0.0.0.0",
    port: readPortFromEnv(),
    allowedHosts: true,
  };
}

export function mobileAccessPlugin() {
  return {
    name: "jlpt-mobile-access",
    transformIndexHtml(html) {
      return html.replace("</head>", `${createAccessTokenCleanupScript()}</head>`);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const queryToken = readQueryToken(req);
        const hasValidQueryToken = isValidAccessToken(queryToken);
        const hasValidPathToken = isValidAccessToken(readPathToken(req));
        const hasValidHeaderToken = isValidAccessToken(readHeaderToken(req));
        const hasValidCookieToken = isValidAccessToken(readCookieToken(req));
        const hasAuthorizedClient = isAuthorizedClient(req);
        const hasTrustedInternalLanClient = isTrustedInternalLanRequest(req);

        if (
          !hasValidQueryToken &&
          !hasValidPathToken &&
          !hasValidHeaderToken &&
          !hasValidCookieToken &&
          !hasAuthorizedClient &&
          !hasTrustedInternalLanClient
        ) {
          rejectUnauthorizedHttp(res);
          return;
        }

        if (hasValidQueryToken || hasValidPathToken || hasValidHeaderToken) {
          authorizeClient(req);
          setAccessCookie(res);
        }

        next();
      });

      server.httpServer?.prependListener("upgrade", (req, socket) => {
        if (
          isValidAccessToken(readQueryToken(req)) ||
          isValidAccessToken(readPathToken(req)) ||
          isValidAccessToken(readHeaderToken(req)) ||
          isValidAccessToken(readCookieToken(req)) ||
          isAuthorizedClient(req) ||
          isTrustedInternalLanRequest(req)
        ) {
          return;
        }
        socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      });

      server.httpServer?.once("listening", () => {
        printMobileAccessInfo(server).catch((error) => {
          console.warn(`[jlpt access] Failed to print mobile access info: ${String(error?.message ?? error)}`);
        });
      });

      server.httpServer?.once("close", () => {
        closeActiveCloudflareTunnel();
      });
    },
  };
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
    ACCESS_TOKEN_PATH_PREFIX,
  )};if(u.pathname.indexOf(pathPrefix)===0){var rest=u.pathname.slice(pathPrefix.length);var slash=rest.indexOf("/");var raw=slash>=0?rest.slice(0,slash):rest;if(raw){try{token=decodeURIComponent(raw);}catch(e){token=raw;}u.pathname="/";changed=true;}}var tokenKeys=${JSON.stringify(
    ACCESS_TOKEN_ALIASES,
  )};for(var i=0;i<tokenKeys.length;i++){var k=tokenKeys[i];if(u.searchParams.has(k)){token=token||u.searchParams.get(k)||"";u.searchParams.delete(k);changed=true;}}var apiBase="";var apiKeys=${JSON.stringify(
    API_BASE_ALIASES,
  )};for(var j=0;j<apiKeys.length;j++){var a=apiKeys[j];if(u.searchParams.has(a)){apiBase=apiBase||u.searchParams.get(a)||"";u.searchParams.delete(a);changed=true;}}try{if(token)sessionStorage.setItem(${JSON.stringify(
    ACCESS_TOKEN_SESSION_KEY,
  )},token);if(apiBase)sessionStorage.setItem(${JSON.stringify(
    API_BASE_SESSION_KEY,
  )},apiBase);}catch(e){}if(changed){window.history.replaceState(null,"",u.pathname+u.search+u.hash);}}catch(e){}}());</script>`;
}

function readPortFromEnv() {
  const rawPort = process.env.JLPT_DEV_PORT ?? process.env.PORT;
  if (!rawPort) return undefined;

  const port = Number(rawPort);
  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }

  console.warn(`[jlpt access] Ignoring invalid port: ${rawPort}`);
  return undefined;
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
    `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(ACCESS_TOKEN)}; Path=/; HttpOnly; SameSite=Lax`,
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
    const host = formatUrlHost(manualHost);
    return {
      label: "INTERNAL_LAN",
      description: "Use this without a token when your phone is on the same Wi-Fi/LAN as this PC.",
      url: addApiBaseParamToUrl(`http://${host}:${port}/`, {
        apiBaseUrl: `http://${host}:${apiPort}/api`,
      }),
      note: "LAN host override: JLPT_LAN_HOST",
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
      apiBaseUrl: `http://${formattedHost}:${apiPort}/api`,
    }),
    note,
  };
}

async function readExternalAccessTarget(port) {
  const publicUrl = process.env.JLPT_PUBLIC_URL;
  if (publicUrl) {
    const publicBaseUrl = normalizeUrl(publicUrl);
    return {
      label: "EXTERNAL_INTERNET",
      description: "Use this from another network through the configured public URL.",
      url: addAccessParamsToUrl(publicBaseUrl, {
        apiBaseUrl: readPublicApiBaseUrl(publicBaseUrl),
        token: ACCESS_TOKEN,
      }),
      note: "Public URL override: JLPT_PUBLIC_URL",
    };
  }

  if (shouldUseCloudflareTunnel()) {
    const cloudflareTunnelAccess = await readCloudflareTunnelAccess(port);
    if (!cloudflareTunnelAccess) return null;

    return {
      label: "EXTERNAL_CLOUDFLARE",
      description: "Use this from another network through Cloudflare Tunnel.",
      url: addPathAccessTokenToUrl(cloudflareTunnelAccess.baseUrl, { token: ACCESS_TOKEN }),
      note: formatCloudflareTunnelNote(cloudflareTunnelAccess),
    };
  }

  const publicBaseUrl = await readPublicIpBaseUrl(port);
  if (!publicBaseUrl) return null;
  return {
    label: "EXTERNAL_INTERNET",
    description: "Use this from another network. Port forwarding/firewall access must be configured first.",
    url: addAccessParamsToUrl(publicBaseUrl, {
      apiBaseUrl: readPublicApiBaseUrl(publicBaseUrl),
      token: ACCESS_TOKEN,
    }),
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
  const host = process.env.JLPT_ACCESS_HOST ?? (await readPublicIpv4Address());
  if (!host) return null;

  return `http://${formatUrlHost(host)}:${port}/`;
}

async function readCloudflareTunnelAccess(port) {
  try {
    const tunnel = await openActiveCloudflareTunnel(port);
    return {
      baseUrl: normalizeUrl(tunnel.url),
      command: tunnel.command,
      targetUrl: tunnel.targetUrl,
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

function openActiveCloudflareTunnel(port) {
  if (activeCloudflareTunnel) return Promise.resolve(activeCloudflareTunnel);
  if (cloudflareTunnelStartPromise) return cloudflareTunnelStartPromise;

  const targetUrl = createCloudflareTunnelTargetUrl(port);
  const timeoutMs = readCloudflareOpenTimeoutMs();
  console.log(`[jlpt access] Starting Cloudflare Tunnel for ${targetUrl}`);
  cloudflareTunnelStartPromise = openCloudflareTunnelWithTimeout(targetUrl, timeoutMs)
    .then((tunnel) => {
      activeCloudflareTunnel = tunnel;
      console.log(`[jlpt access] Cloudflare Tunnel URL: ${tunnel.url}`);
      return tunnel;
    })
    .catch((error) => {
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
      stdio: ["ignore", "pipe", "pipe"],
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
          // The process may already be gone after a spawn error on Windows.
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
        url,
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
  return String(text)
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+/, "")
    .replace(/\bconnIndex=\d+\b/g, "connIndex=*")
    .replace(/\bevent=\d+\b/g, "event=*")
    .replace(/\bip=\S+/g, "ip=*");
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
      "C:\\Windows\\Sysnative\\cloudflared.exe",
    ]);
  }

  return ["cloudflared"];
}

function readWindowsCloudflaredServiceCommandCandidates() {
  try {
    const result = spawnSync("sc.exe", ["qc", "Cloudflared"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
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
      // Try the next endpoint, then fall back to LAN address if every lookup fails.
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
        score: scoreLanCandidate(name, entry.address),
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
  const reset = "\x1b[0m";
  const blackFg = "\x1b[30m";
  const whiteFg = "\x1b[97m";
  const blackBg = "\x1b[40m";
  const whiteBg = "\x1b[107m";
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

  appendBits(bits, 0x4, 4);
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
      value = (value << 1) | (bits[i + j] ? 1 : 0);
    }
    codewords.push(value);
  }

  for (let pad = 0; codewords.length < QR_DATA_CODEWORDS; pad += 1) {
    codewords.push(pad % 2 === 0 ? 0xec : 0x11);
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
      ecc: createReedSolomonRemainder(data, QR_ECC_CODEWORDS_PER_BLOCK),
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
    reserved: Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false)),
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
    reserved: qr.reserved.map((row) => [...row]),
  };
}

function drawFinder(qr, left, top) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const x = left + dx;
      const y = top + dy;
      if (!isInQr(x, y)) continue;

      const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark =
        inPattern && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
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
  return (x === 6 && y === 6) || (x === last && y === 6) || (x === 6 && y === last);
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
    const x = QR_SIZE - 11 + (i % 3);
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
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
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
  const data = (QR_ECC_FORMAT_BITS_LOW << 3) | mask;
  return ((data << 10) | createBchRemainder(data, 0x537)) ^ 0x5412;
}

function createVersionBits() {
  return (QR_VERSION << 12) | createBchRemainder(QR_VERSION, 0x1f25);
}

function createBchRemainder(data, generator) {
  let value = data << (bitLength(generator) - 1);
  while (bitLength(value) >= bitLength(generator)) {
    value ^= generator << (bitLength(value) - bitLength(generator));
  }
  return value;
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push(((value >>> i) & 1) === 1);
  }
}

function byteToBits(byte) {
  return Array.from({ length: 8 }, (_, index) => ((byte >>> (7 - index)) & 1) === 1);
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
  return ((value >>> bit) & 1) !== 0;
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
    if (value & 0x100) value ^= 0x11d;
  }

  for (let i = 255; i < exp.length; i += 1) {
    exp[i] = exp[i - 255];
  }

  return { exp, log };
}

const { exp: GF_EXP, log: GF_LOG } = createGaloisTables();
