import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import process from "node:process";
import { addPathAccessTokenToUrl, renderQr } from "../client/dev-mobile-access.js";

const CLOUDFLARED_URL_PATTERN = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.trycloudflare\.com/i;
const ERROR_PATTERN = /\b(error|failed|failure|fatal|exception|unhandled|eaddrinuse|enoent|eperm|ebusy|err)\b/i;
const WARN_PATTERN = /\b(warn|warning|deprecated|deprecation)\b/i;

const cli = parseCliArgs(process.argv.slice(2));
const accessToken = process.env.JLPT_ACCESS_TOKEN || crypto.randomBytes(24).toString("base64url");
const apiPort = readPort(process.env.JLPT_API_PORT ?? "3001", 3001);
const previewHost = process.env.JLPT_PREVIEW_HOST || "127.0.0.1";
const previewConnectHost = previewHost === "0.0.0.0" ? "127.0.0.1" : previewHost;
const previewPort = readPort(process.env.JLPT_PREVIEW_PORT ?? process.env.PORT ?? "5173", 5173);
const children = [];
let shuttingDown = false;

main().catch((error) => {
  writeError(String(error?.stack ?? error?.message ?? error));
  shutdown(1);
});

async function main() {
  if (!cli.skipBuild) {
    await runOneShot({
      name: "BUILD",
      commandLine: npmCommand("run build --workspace client"),
      env: prodEnv(),
    });
  }

  startLongRunning({
    name: "SERVER",
    commandLine: npmCommand("run start --workspace server"),
    env: {
      ...prodEnv(),
      JLPT_ACCESS_TOKEN: accessToken,
      JLPT_API_HOST: process.env.JLPT_API_HOST ?? "127.0.0.1",
      JLPT_API_PORT: String(apiPort),
    },
  });

  startLongRunning({
    name: "PREVIEW",
    commandLine: npmCommand(
      `run preview --workspace client -- --host ${previewHost} --port ${previewPort} --strictPort`,
    ),
    env: {
      ...prodEnv(),
      JLPT_ACCESS_TOKEN: accessToken,
      JLPT_PREVIEW_ACCESS_CONTROL: "1",
    },
  });

  await waitForTcp("127.0.0.1", apiPort, { label: "API server" });
  await waitForTcp(previewConnectHost, previewPort, { label: "preview server" });

  if (!shouldUseCloudflareTunnel()) {
    writeWarn("Cloudflare tunnel is disabled by JLPT_CLOUDFLARED=0.");
    await waitForever();
    return;
  }

  const targetUrl = `http://${formatUrlHost(previewConnectHost)}:${previewPort}/`;
  const tunnel = await openCloudflareTunnel(targetUrl);
  const accessUrl = addPathAccessTokenToUrl(tunnel.url, { token: accessToken });
  printCloudflareAccess(accessUrl);

  await waitForever();
}

function prodEnv() {
  return {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "production",
    JLPT_LOG_LEVEL: process.env.JLPT_LOG_LEVEL ?? "warn",
    VITE_JLPT_API_DEBUG: process.env.VITE_JLPT_API_DEBUG ?? "0",
  };
}

function runOneShot({ name, commandLine, env }) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(commandLine, { env });
    const output = [];

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    pipeLines(child.stdout, (line) => {
      output.push(line);
      writeFilteredLine(name, line);
    });
    pipeLines(child.stderr, (line) => {
      output.push(line);
      writeFilteredLine(name, line);
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = output.slice(-30).join("\n").trim();
      reject(new Error(`${name} exited with ${signal ? `signal ${signal}` : `code ${code}`}${tail ? `\n${tail}` : ""}`));
    });
  });
}

function startLongRunning({ name, commandLine, env }) {
  const child = spawnCommand(commandLine, { env });
  children.push({ child, name });

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  pipeLines(child.stdout, (line) => writeFilteredLine(name, line));
  pipeLines(child.stderr, (line) => writeFilteredLine(name, line));

  child.once("error", (error) => {
    writeError(`[${name}] failed to start: ${error.message}`);
    shutdown(1);
  });

  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    const message = `[${name}] exited with ${signal ? `signal ${signal}` : `code ${code}`}`;
    if (code === 0) {
      writeWarn(message);
      shutdown(0);
      return;
    }
    writeError(message);
    shutdown(1);
  });

  return child;
}

function spawnCommand(commandLine, { env }) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  return spawn(commandLine, {
    cwd: process.cwd(),
    env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function openCloudflareTunnel(targetUrl) {
  const commands = readCloudflaredCommandCandidates();
  const errors = [];

  return commands.reduce(
    (promise, command) =>
      promise.catch(async () => {
        try {
          return await spawnCloudflaredTunnel(command, targetUrl);
        } catch (error) {
          errors.push(`${command}: ${String(error?.message ?? error)}`);
          throw error;
        }
      }),
    Promise.reject(new Error("No cloudflared command tried")),
  ).catch(() => {
    throw new Error(`Cloudflare Tunnel failed. ${errors.join("; ")}`);
  });
}

function spawnCloudflaredTunnel(command, targetUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["tunnel", "--url", targetUrl], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const output = [];
    let settled = false;
    let ignoreExit = false;
    const timeout = setTimeout(() => {
      fail(new Error("cloudflared did not print a trycloudflare.com URL within 45 seconds"));
    }, 45_000);

    children.push({ child, name: "CLOUDFLARE" });

    function handleLine(line) {
      output.push(line);
      writeFilteredLine("CLOUDFLARE", line);
      if (settled) return;

      const match = line.match(CLOUDFLARED_URL_PATTERN);
      if (match) {
        settled = true;
        clearTimeout(timeout);
        resolve({ child, command, targetUrl, url: normalizeUrl(match[0]) });
      }
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      ignoreExit = true;
      clearTimeout(timeout);
      if (!child.killed && child.exitCode === null) {
        try {
          child.kill();
        } catch {
          // Best effort cleanup.
        }
      }
      const tail = output.slice(-10).join(" | ");
      reject(tail ? new Error(`${error.message}. Last output: ${tail}`) : error);
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    pipeLines(child.stdout, handleLine);
    pipeLines(child.stderr, handleLine);

    child.once("error", fail);
    child.once("exit", (code, signal) => {
      if (shuttingDown) return;
      if (ignoreExit) return;
      if (!settled) {
        fail(new Error(`cloudflared exited before opening a tunnel${signal ? ` by signal ${signal}` : ` with code ${code}`}`));
        return;
      }
      const message = `[CLOUDFLARE] tunnel closed${signal ? ` by signal ${signal}` : ` with code ${code}`}`;
      if (code === 0 || code === null) writeWarn(message);
      else writeError(message);
      shutdown(code === 0 || code === null ? 0 : 1);
    });
  });
}

function printCloudflareAccess(accessUrl) {
  writeAccess(`Cloudflare URL: ${accessUrl}`);
  writeAccess("QR IMAGE BEGIN");
  process.stdout.write(`${renderQr(accessUrl, { unicode: shouldRenderUnicodeQr() })}\n`);
  writeAccess("QR IMAGE END");
}

function shouldRenderUnicodeQr() {
  const ascii = String(process.env.JLPT_QR_ASCII ?? "").trim().toLowerCase();
  if (ascii === "1" || ascii === "true") return false;

  const unicode = String(process.env.JLPT_QR_UNICODE ?? "").trim().toLowerCase();
  if (unicode === "0" || unicode === "false") return false;

  return true;
}

function pipeLines(stream, writeLine) {
  let buffer = "";

  stream?.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      writeLine(line);
    }
  });

  stream?.on("end", () => {
    if (!buffer) return;
    writeLine(buffer);
    buffer = "";
  });
}

function writeFilteredLine(name, line) {
  const text = stripAnsi(String(line ?? "")).trim();
  if (!text) return;
  if (ERROR_PATTERN.test(text)) {
    writeError(`[${name}] ${text}`);
    return;
  }
  if (WARN_PATTERN.test(text)) {
    writeWarn(`[${name}] ${text}`);
  }
}

function writeAccess(message) {
  process.stdout.write(`[ACCESS] ${message}\n`);
}

function writeWarn(message) {
  process.stderr.write(`[WARN] ${message}\n`);
}

function writeError(message) {
  process.stderr.write(`[ERROR] ${message}\n`);
}

function waitForTcp(host, port, { label, timeoutMs = 30_000 }) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", (error) => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`${label} did not accept connections on ${host}:${port}: ${error.message}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    }

    attempt();
  });
}

function waitForever() {
  return new Promise(() => undefined);
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChildren();
  process.exit(exitCode);
}

function stopChildren() {
  for (const { child } of children) {
    if (!child || child.killed || child.exitCode !== null) continue;

    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      continue;
    }

    child.kill("SIGTERM");
  }
}

function parseCliArgs(args) {
  return {
    skipBuild: args.includes("--skip-build"),
  };
}

function npmCommand(args) {
  return `${process.platform === "win32" ? "npm.cmd" : "npm"} ${args}`;
}

function readPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function shouldUseCloudflareTunnel() {
  const rawValue = String(process.env.JLPT_CLOUDFLARED ?? process.env.JLPT_CLOUDFLARE_TUNNEL ?? "1").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(rawValue);
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

function normalizeUrl(rawUrl) {
  const text = String(rawUrl).trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  const url = new URL(withProtocol);
  if (!url.pathname) url.pathname = "/";
  return url.toString();
}

function formatUrlHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
process.once("exit", () => {
  stopChildren();
});
