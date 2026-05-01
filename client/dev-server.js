import { createServer, mergeConfig } from "vite";
import config from "./vite.config.js";

const cli = parseCliArgs(process.argv.slice(2));
const serverConfig = mergeConfig(config, {
  configFile: false,
  clearScreen: cli.clearScreen,
  logLevel: cli.logLevel,
  server: {
    host: cli.host,
    port: cli.port,
    strictPort: cli.strictPort,
  },
});

const server = await createServer(serverConfig);
await server.listen();
printClientUrls(server);
server.bindCLIShortcuts?.({ print: true });

async function closeServer() {
  try {
    await server.close();
  } finally {
    process.exit(0);
  }
}

process.once("SIGINT", () => {
  closeServer();
});

process.once("SIGTERM", () => {
  closeServer();
});

function printClientUrls(server) {
  const urls = server.resolvedUrls;
  for (const url of urls?.local ?? []) {
    console.log(`  Local:   ${url}`);
  }
  for (const url of urls?.network ?? []) {
    console.log(`  Network: ${url}`);
  }
}

function parseCliArgs(args) {
  const result = {
    clearScreen: undefined,
    host: undefined,
    logLevel: undefined,
    port: undefined,
    strictPort: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--host") {
      result.host = args[i + 1] ?? "0.0.0.0";
      i += args[i + 1] ? 1 : 0;
      continue;
    }
    if (arg.startsWith("--host=")) {
      result.host = arg.slice("--host=".length) || "0.0.0.0";
      continue;
    }
    if (arg === "--port") {
      result.port = readPort(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--port=")) {
      result.port = readPort(arg.slice("--port=".length));
      continue;
    }
    if (arg === "--strictPort") {
      result.strictPort = true;
      continue;
    }
    if (arg === "--clearScreen") {
      result.clearScreen = readBoolean(args[i + 1], true);
      if (args[i + 1] === "true" || args[i + 1] === "false") i += 1;
      continue;
    }
    if (arg.startsWith("--clearScreen=")) {
      result.clearScreen = readBoolean(arg.slice("--clearScreen=".length), true);
      continue;
    }
    if (arg === "--logLevel" || arg === "-l") {
      result.logLevel = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--logLevel=")) {
      result.logLevel = arg.slice("--logLevel=".length);
    }
  }

  return result;
}

function readPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}

function readBoolean(value, fallback) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
