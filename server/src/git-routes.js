import { execFile } from "node:child_process";
import { sendJson, setApiLogDetail } from "./api-http.js";

const COMMIT_MESSAGE = "study";
const GIT_EXEC_BUFFER_LIMIT = 1_000_000;
const GIT_RESPONSE_OUTPUT_LIMIT = 20_000;

let activeStudyCommitPush = null;

export async function handleGitStudyCommitPush(res, { repoRoot }) {
  setApiLogDetail(res, { endpoint: "git-study-commit-push" });

  if (activeStudyCommitPush) {
    sendJson(res, 409, { ok: false, error: "Git commit/push is already running", where: "/api/git-study-commit-push" });
    return;
  }

  activeStudyCommitPush = runStudyCommitPush(repoRoot);
  try {
    const result = await activeStudyCommitPush;
    sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error("git-study-commit-push error:", error);
    sendJson(res, 500, {
      ok: false,
      error: String(error?.message ?? error),
      where: "/api/git-study-commit-push",
      git: error?.git,
    });
  } finally {
    activeStudyCommitPush = null;
  }
}

async function runStudyCommitPush(repoRoot) {
  await runGit(repoRoot, ["add", "-A"]);

  const staged = await runGit(repoRoot, ["diff", "--cached", "--name-only"]);
  const stagedFiles = splitOutputLines(staged.stdout);
  if (stagedFiles.length === 0) {
    return {
      committed: false,
      pushed: false,
      message: "No changes to commit",
      stagedFileCount: 0,
      stagedFiles: [],
    };
  }

  const commit = await runGit(repoRoot, ["commit", "-m", COMMIT_MESSAGE]);
  const push = await runGit(repoRoot, ["push"]);

  return {
    committed: true,
    pushed: true,
    commitMessage: COMMIT_MESSAGE,
    stagedFileCount: stagedFiles.length,
    stagedFiles,
    commitOutput: formatGitOutput(commit),
    pushOutput: formatGitOutput(push),
  };
}

function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        maxBuffer: GIT_EXEC_BUFFER_LIMIT,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const result = {
          command: `git ${args.join(" ")}`,
          stdout: String(stdout ?? "").trim(),
          stderr: String(stderr ?? "").trim(),
        };

        if (error) {
          const failure = new Error(formatGitError(result));
          failure.git = result;
          reject(failure);
          return;
        }

        resolve(result);
      },
    );
  });
}

function splitOutputLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatGitOutput(result) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (output.length <= GIT_RESPONSE_OUTPUT_LIMIT) return output;
  return `${output.slice(0, GIT_RESPONSE_OUTPUT_LIMIT)}\n... truncated ${output.length - GIT_RESPONSE_OUTPUT_LIMIT} chars`;
}

function formatGitError(result) {
  const output = formatGitOutput(result);
  return output ? `${result.command} failed: ${output}` : `${result.command} failed`;
}
