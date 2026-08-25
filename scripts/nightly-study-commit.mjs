import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const logPath = path.resolve(tmpdir(), "codex-japanese-companion-nightly-study-commit.log");
const commitMessage = "study: nightly Japanese progress";
const progressKeys = new Set([
  "lastResult",
  "lastAttemptDate",
  "stage",
  "stageCompleteDate",
  "nextReviewDate",
  "lastCompletedDate",
]);

function log(message) {
  const line = "[" + new Date().toISOString() + "] " + message;
  console.log(line);
  appendFileSync(logPath, line + "\n", "utf8");
}

function runGit(args) {
  return execFileSync(
    "git",
    ["-c", "safe.directory=" + repoRoot, ...args],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function projectProgress(value, keepProgressFields) {
  if (Array.isArray(value)) {
    return value.map((entry) => projectProgress(entry, keepProgressFields));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const keys = Object.keys(value)
    .filter((key) => keepProgressFields ? progressKeys.has(key) : !progressKeys.has(key))
    .sort();
  return Object.fromEntries(
    keys.map((key) => [key, projectProgress(value[key], keepProgressFields)]),
  );
}

function changed(left, right) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function readJson(text, filePath) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("invalid JSON in " + filePath + ": " + error.message);
  }
}

function getChangedAssetFiles() {
  const output = runGit([
    "status",
    "--porcelain=v1",
    "--untracked-files=no",
    "--",
    "asset",
  ]);

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      const status = line.slice(0, 2);
      const filePath = line.slice(3).trim();
      if (
        status.includes("D") ||
        status.includes("R") ||
        status.includes("C") ||
        !filePath.startsWith("asset/") ||
        !filePath.endsWith(".json")
      ) {
        return [];
      }
      return [filePath];
    });
}

function getEligibleFiles() {
  const eligible = [];
  for (const relativePath of getChangedAssetFiles()) {
    try {
      const head = readJson(runGit(["show", "HEAD:" + relativePath]), "HEAD:" + relativePath);
      const working = readJson(
        readFileSync(path.resolve(repoRoot, relativePath), "utf8"),
        relativePath,
      );

      if (changed(projectProgress(head, false), projectProgress(working, false))) {
        log("skipped " + relativePath + " (contains non-progress asset changes)");
        continue;
      }
      if (!changed(projectProgress(head, true), projectProgress(working, true))) {
        log("skipped " + relativePath + " (no study-progress changes)");
        continue;
      }
      eligible.push(relativePath);
      log("eligible " + relativePath);
    } catch (error) {
      log("skipped " + relativePath + " (" + error.message + ")");
    }
  }
  return eligible;
}

function commitStudyProgress(dryRun) {
  const files = getEligibleFiles();
  if (files.length === 0) {
    log("nothing to commit");
    return;
  }
  if (dryRun) {
    log("dry run: would commit " + files.length + " asset file(s) locally");
    return;
  }

  try {
    runGit(["add", "--", ...files]);
    runGit(["commit", "--only", "-m", commitMessage, "--", ...files]);
    log("committed " + files.length + " asset file(s); remote push was not performed");
  } catch (error) {
    log("commit failed (" + error.message + ")");
  }
}

async function waitForRandomCommitTime() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(3, 0, 0, 0);
  if (now < start) {
    const waitUntilStart = start.getTime() - now.getTime();
    log("scheduled run: waiting until 03:00");
    await sleep(waitUntilStart);
  }

  const current = new Date();
  const end = new Date(current);
  end.setHours(6, 0, 0, 0);
  if (current >= end) {
    log("scheduled run: outside 03:00-06:00 window, skipping");
    return false;
  }

  const delay = randomInt(0, Math.max(1, end.getTime() - current.getTime()));
  log("scheduled run: waiting a random " + Math.ceil(delay / 60000) + " minutes");
  await sleep(delay);
  return true;
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
if (args.has("--scheduled") && !dryRun && !(await waitForRandomCommitTime())) {
  process.exit(0);
}
commitStudyProgress(dryRun);
