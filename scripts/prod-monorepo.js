import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";
import process from "node:process";

const ERROR_PATTERN = /\b(error|failed|failure|fatal|exception|unhandled|eaddrinuse|enoent|eperm|ebusy|err)\b/i;
const WARN_PATTERN = /\b(warn|warning|deprecated|deprecation)\b/i;
const DEFAULT_API_PORT = 47833;
const DEFAULT_PREVIEW_PORT = 47832;

const cli = parseCliArgs(process.argv.slice(2));
const accessToken = process.env.JPC_ACCESS_TOKEN || crypto.randomBytes(24).toString("base64url");
const apiPort = readPort(process.env.JPC_API_PORT, DEFAULT_API_PORT);
const defaultPreviewHost = cli.public ? "0.0.0.0" : "127.0.0.1";
const apiHost = process.env.JPC_API_HOST ?? "127.0.0.1";
const previewHost = process.env.JPC_PREVIEW_HOST || defaultPreviewHost;
const previewConnectHost = previewHost === "0.0.0.0" ? "127.0.0.1" : previewHost;
const previewPort = readPort(process.env.JPC_PREVIEW_PORT ?? process.env.PORT, DEFAULT_PREVIEW_PORT);
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
      JPC_ACCESS_TOKEN: accessToken,
      JPC_API_HOST: apiHost,
      JPC_API_PORT: String(apiPort),
    },
  });

  startLongRunning({
    name: "PREVIEW",
    commandLine: npmCommand(
      `run preview --workspace client -- --host ${previewHost} --port ${previewPort} --strictPort`,
    ),
    env: {
      ...prodEnv(),
      JPC_ACCESS_TOKEN: accessToken,
      JPC_API_PORT: String(apiPort),
      JPC_PREVIEW_ACCESS_CONTROL: "1",
    },
  });

  await waitForTcp("127.0.0.1", apiPort, { label: "API server" });
  await waitForTcp(previewConnectHost, previewPort, { label: "preview server" });

  printAccessInfo({ apiPort, previewConnectHost, previewPort });

  await waitForever();
}

function prodEnv() {
  return {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "production",
    JPC_LOG_LEVEL: process.env.JPC_LOG_LEVEL ?? "warn",
    VITE_JPC_API_DEBUG: process.env.VITE_JPC_API_DEBUG ?? "0",
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

function printAccessInfo({ apiPort, previewConnectHost, previewPort }) {
  writeAccess(`${cli.public ? "Public" : "Local"} mode`);
  writeAccess(`Local preview URL: http://${formatUrlHost(previewConnectHost)}:${previewPort}/`);
  writeAccess(`Local API target URL: http://127.0.0.1:${apiPort}/api`);
  writeAccess(`Preview API proxy URL: http://${formatUrlHost(previewConnectHost)}:${previewPort}/api`);
  if (cli.public) {
    const candidates = readLanIpv4Candidates();
    if (candidates.length === 0) {
      writeWarn("No LAN IPv4 address was found. Use this machine's reachable host/IP with the preview port.");
    }
    for (const candidate of candidates.slice(0, 3)) {
      const host = formatUrlHost(candidate.address);
      writeAccess(`Network preview URL: ${addAccessParamsToUrl(`http://${host}:${previewPort}/`, {
        apiPort: previewPort,
        token: accessToken,
      })}`);
      writeAccess(`Network API proxy URL: http://${host}:${previewPort}/api`);
    }
  }
  writeAccess(`External gateway target port: ${previewPort}`);
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
    public: args.includes("--public"),
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

function formatUrlHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function addAccessParamsToUrl(baseUrl, { apiPort, token }) {
  const url = new URL(baseUrl);
  url.searchParams.set("access_token", token);
  url.searchParams.set("api_port", String(apiPort));
  return url.toString();
}

function readLanIpv4Candidates() {
  const candidates = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
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

function isPrivateIpv4(address) {
  return address.startsWith("10.") || address.startsWith("192.168.") || isPrivate172Ipv4(address);
}

function isPrivate172Ipv4(address) {
  const match = /^172\.(\d{1,3})\./.exec(address);
  if (!match) return false;
  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
process.once("exit", () => {
  stopChildren();
});
