import { execFile } from "node:child_process";
import { sendJson, setApiLogDetail } from "./api-http.js";

const COMMIT_MESSAGE = "study";
const STUDY_COMMIT_PATHSPEC = "asset";
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
  await runGit(repoRoot, ["add", "-A", "--", STUDY_COMMIT_PATHSPEC]);

  const staged = await runGit(repoRoot, ["diff", "--cached", "--name-only", "--", STUDY_COMMIT_PATHSPEC]);
  const stagedFiles = splitOutputLines(staged.stdout);
  let commit = null;
  if (stagedFiles.length > 0) {
    commit = await runGit(repoRoot, ["commit", "-m", COMMIT_MESSAGE, "--", STUDY_COMMIT_PATHSPEC]);
  }

  const pushTarget = await resolvePushTarget(repoRoot);
  const push = await runGit(repoRoot, pushTarget.args);

  return {
    committed: Boolean(commit),
    pushed: true,
    commitMessage: COMMIT_MESSAGE,
    stagedFileCount: stagedFiles.length,
    stagedFiles,
    pushTarget: pushTarget.label,
    commitOutput: commit ? formatGitOutput(commit) : "",
    pushOutput: formatGitOutput(push),
  };
}

async function resolvePushTarget(repoRoot) {
  const currentBranch = (await runGit(repoRoot, ["branch", "--show-current"])).stdout.trim();
  if (currentBranch) {
    const upstream = await tryGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    if (upstream?.stdout.trim()) {
      return { args: ["push"], label: upstream.stdout.trim() };
    }
    return { args: ["push", "origin", `HEAD:${currentBranch}`], label: `origin/${currentBranch}` };
  }

  const remoteBranch = await findNearestMergedRemoteBranch(repoRoot);
  if (!remoteBranch) {
    throw new Error("Cannot push from detached HEAD because no merged remote branch was found");
  }

  return {
    args: ["push", remoteBranch.remote, `HEAD:${remoteBranch.branch}`],
    label: `${remoteBranch.remote}/${remoteBranch.branch}`,
  };
}

async function findNearestMergedRemoteBranch(repoRoot) {
  const refs = splitOutputLines((await runGit(repoRoot, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"])).stdout)
    .filter((ref) => !ref.endsWith("/HEAD"));
  const candidates = [];

  for (const ref of refs) {
    const isAncestor = await tryGit(repoRoot, ["merge-base", "--is-ancestor", ref, "HEAD"]);
    if (!isAncestor) continue;

    const countResult = await runGit(repoRoot, ["rev-list", "--count", `${ref}..HEAD`]);
    const count = Number(countResult.stdout.trim());
    const slash = ref.indexOf("/");
    if (slash < 0 || !Number.isFinite(count)) continue;
    candidates.push({
      branch: ref.slice(slash + 1),
      count,
      ref,
      remote: ref.slice(0, slash),
    });
  }

  candidates.sort((left, right) => left.count - right.count || left.ref.localeCompare(right.ref));
  return candidates[0] ?? null;
}

async function tryGit(cwd, args) {
  try {
    return await runGit(cwd, args);
  } catch {
    return null;
  }
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
