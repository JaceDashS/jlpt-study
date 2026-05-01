import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import process from "node:process";

const COLORS = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const processes = [
  {
    name: "SERVER",
    color: COLORS.cyan,
    commandLine: "npm.cmd run dev --workspace server",
  },
  {
    name: "CLIENT",
    color: COLORS.magenta,
    commandLine: "npm.cmd run dev --workspace client",
  },
];

const children = [];
const rawOutputMode = new Map(processes.map((item) => [item.name, false]));
const accessToken = process.env.JLPT_ACCESS_TOKEN || crypto.randomBytes(24).toString("base64url");
let shuttingDown = false;

for (const spec of processes) {
  children.push(startProcess(spec));
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
process.once("exit", () => {
  stopChildren();
});

function startProcess(spec) {
  const child = spawn("cmd.exe", ["/d", "/s", "/c", spec.commandLine], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR ?? "1",
      JLPT_API_HOST: process.env.JLPT_API_HOST ?? "0.0.0.0",
      JLPT_ACCESS_TOKEN: accessToken,
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  pipeLines(spec, child.stdout);
  pipeLines(spec, child.stderr);

  child.once("error", (error) => {
    writePrefixedLine(spec, `failed to start: ${error.message}`);
    shutdown(1);
  });

  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    writePrefixedLine(spec, `process exited with ${signal ? `signal ${signal}` : `code ${code}`}`);
    shutdown(code === 0 ? 0 : 1);
  });

  return child;
}

function pipeLines(spec, stream) {
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      writeLine(spec, line);
    }
  });

  stream.on("end", () => {
    if (buffer) {
      writeLine(spec, buffer);
      buffer = "";
    }
  });
}

function writeLine(spec, line) {
  if (!line) return;

  if (line.includes("[jlpt access] QR IMAGE BEGIN")) {
    rawOutputMode.set(spec.name, true);
    return;
  }

  if (line.includes("[jlpt access] QR IMAGE END")) {
    rawOutputMode.set(spec.name, false);
    return;
  }

  if (rawOutputMode.get(spec.name)) {
    process.stdout.write(`${line}\n`);
    return;
  }

  writePrefixedLine(spec, line);
}

function writePrefixedLine(spec, line) {
  process.stdout.write(`${spec.color}[${spec.name}]${COLORS.reset} ${line}\n`);
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChildren();
  process.exit(exitCode);
}

function stopChildren() {
  for (const child of children) {
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
