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
    sendJson(res, 409, { ok: false, error: "Git study sync is already running", where: "/api/git-study-commit-push" });
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
  await assertNoUnmergedFiles(repoRoot);
  const syncTarget = await resolveSyncTarget(repoRoot);
  const fetch = await runGit(repoRoot, ["fetch", syncTarget.remote]);

  await runGit(repoRoot, ["add", "-A", "--", STUDY_COMMIT_PATHSPEC]);

  const staged = await runGit(repoRoot, ["diff", "--cached", "--name-only", "--", STUDY_COMMIT_PATHSPEC]);
  const stagedFiles = splitOutputLines(staged.stdout);
  let commit = null;
  let pull = null;
  let push = null;
  if (stagedFiles.length > 0) {
    commit = await runGit(repoRoot, ["commit", "-m", COMMIT_MESSAGE, "--", STUDY_COMMIT_PATHSPEC]);
    pull = await runPullRebase(repoRoot, syncTarget);
    push = await runGit(repoRoot, ["push", syncTarget.remote, `HEAD:${syncTarget.branch}`]);
  } else {
    pull = await runGit(repoRoot, ["pull", "--ff-only", syncTarget.remote, syncTarget.branch]);
  }

  return {
    fetched: true,
    committed: Boolean(commit),
    pushed: Boolean(push),
    pulled: true,
    commitMessage: COMMIT_MESSAGE,
    stagedFileCount: stagedFiles.length,
    stagedFiles,
    fetchOutput: formatGitOutput(fetch),
    pushTarget: push ? syncTarget.label : "",
    pullTarget: syncTarget.label,
    pullMode: commit ? "rebase" : "ff-only",
    commitOutput: commit ? formatGitOutput(commit) : "",
    pushOutput: push ? formatGitOutput(push) : "",
    pullOutput: formatGitOutput(pull),
  };
}

async function resolveSyncTarget(repoRoot) {
  const currentBranch = (await runGit(repoRoot, ["branch", "--show-current"])).stdout.trim();
  if (currentBranch) {
    const upstream = await tryGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    if (upstream?.stdout.trim()) {
      return parseRemoteBranchRef(upstream.stdout.trim());
    }
    return { remote: "origin", branch: currentBranch, label: `origin/${currentBranch}` };
  }

  const remoteBranch = await findNearestMergedRemoteBranch(repoRoot);
  if (!remoteBranch) {
    throw new Error("Cannot sync from detached HEAD because no merged remote branch was found");
  }

  return remoteBranch;
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
      label: ref,
      ref,
      remote: ref.slice(0, slash),
    });
  }

  candidates.sort((left, right) => left.count - right.count || left.ref.localeCompare(right.ref));
  return candidates[0] ?? null;
}

async function runPullRebase(repoRoot, syncTarget) {
  try {
    return await runGit(repoRoot, ["pull", "--rebase", syncTarget.remote, syncTarget.branch]);
  } catch (error) {
    await tryGit(repoRoot, ["rebase", "--abort"]);
    throw error;
  }
}

async function assertNoUnmergedFiles(repoRoot) {
  const unmerged = splitOutputLines((await runGit(repoRoot, ["diff", "--name-only", "--diff-filter=U"])).stdout);
  if (unmerged.length <= 0) return;

  throw new Error(`Git conflict 상태라서 중단했습니다. 먼저 충돌을 해결해 주세요: ${unmerged.join(", ")}`);
}

function parseRemoteBranchRef(ref) {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash >= ref.length - 1) {
    throw new Error(`Cannot resolve upstream branch: ${ref}`);
  }

  return {
    branch: ref.slice(slash + 1),
    label: ref,
    remote: ref.slice(0, slash),
  };
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
