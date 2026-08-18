import { spawnSync } from "node:child_process";
import process from "node:process";

const FALLBACK_API_PORT = 47833;
const FALLBACK_CLIENT_PORT = 47832;
const DEFAULT_PORTS = readDefaultProjectPorts();
const ports = readPorts(process.argv.slice(2));

for (const port of ports) {
  killPort(port);
}

function readPorts(args) {
  const values = args.length > 0 ? args : DEFAULT_PORTS.map(String);
  const ports = values.map((value) => Number(value));
  const invalid = values.filter((_, index) => !isValidPort(ports[index]));

  if (invalid.length > 0) {
    writeError(`Invalid port: ${invalid.join(", ")}`);
    writeError("Usage: npm run kill:port -- 47833 47832");
    process.exit(1);
  }

  return [...new Set(ports)];
}

function readDefaultProjectPorts() {
  return uniquePorts([
    readPort(process.env.JPC_API_PORT, FALLBACK_API_PORT),
    readPort(process.env.JPC_DEV_PORT ?? process.env.PORT, FALLBACK_CLIENT_PORT),
    readPort(process.env.JPC_PREVIEW_PORT ?? process.env.PORT, FALLBACK_CLIENT_PORT),
    FALLBACK_API_PORT,
    FALLBACK_CLIENT_PORT,
  ]);
}

function killPort(port) {
  const pids = process.platform === "win32" ? findWindowsPids(port) : findUnixPids(port);

  if (pids.length === 0) {
    writeInfo(`No process is listening on port ${port}.`);
    return;
  }

  for (const pid of pids) {
    const result =
      process.platform === "win32"
        ? spawnSync("taskkill", ["/pid", pid, "/t", "/f"], { encoding: "utf8", windowsHide: true })
        : spawnSync("kill", ["-TERM", pid], { encoding: "utf8" });

    if (result.status === 0) {
      writeInfo(`Killed PID ${pid} on port ${port}.`);
      continue;
    }

    const message = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    writeError(`Failed to kill PID ${pid} on port ${port}.${message ? ` ${message}` : ""}`);
    process.exitCode = 1;
  }
}

function findWindowsPids(port) {
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true });

  if (result.status !== 0) {
    const message = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    writeError(`Failed to inspect TCP ports.${message ? ` ${message}` : ""}`);
    process.exit(1);
  }

  const pattern = new RegExp(`^(?:TCP)\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, "i");
  return uniquePids(
    result.stdout
      .split(/\r?\n/)
      .map((line) => pattern.exec(line.trim())?.[1])
      .filter(Boolean),
  );
}

function findUnixPids(port) {
  const lsof = spawnSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" });

  if (lsof.status === 0) {
    return uniquePids(lsof.stdout.split(/\s+/).filter(Boolean));
  }

  const fuser = spawnSync("fuser", [`${port}/tcp`], { encoding: "utf8" });
  return fuser.status === 0 ? uniquePids(fuser.stdout.split(/\s+/).filter(Boolean)) : [];
}

function uniquePids(values) {
  return [...new Set(values.filter((value) => /^\d+$/.test(value)))];
}

function uniquePorts(values) {
  return [...new Set(values.filter(isValidPort))];
}

function readPort(value, fallback) {
  const port = Number(value);
  return isValidPort(port) ? port : fallback;
}

function isValidPort(port) {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function writeInfo(message) {
  process.stdout.write(`[kill-port] ${message}\n`);
}

function writeError(message) {
  process.stderr.write(`[kill-port] ${message}\n`);
}
