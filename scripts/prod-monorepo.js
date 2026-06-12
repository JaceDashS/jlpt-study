import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import process from "node:process";

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

  printLocalAccessInfo({ apiPort, previewConnectHost, previewPort });

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

function printLocalAccessInfo({ apiPort, previewConnectHost, previewPort }) {
  writeAccess(`Preview URL: http://${formatUrlHost(previewConnectHost)}:${previewPort}/`);
  writeAccess(`API URL: http://127.0.0.1:${apiPort}/api`);
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

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
process.once("exit", () => {
  stopChildren();
});
