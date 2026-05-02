import fs from "node:fs/promises";
import path from "node:path";

export function stripBom(text) {
  if (typeof text !== "string") return text;
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function resolveAssetWritePath(repoRoot, sourcePath) {
  const rootDir = path.resolve(repoRoot, "asset");
  const relPath = normalizeRelativePath(sourcePath.slice("asset/".length));
  const filePath = path.resolve(rootDir, relPath);
  if (!isPathInsideOrEqual(rootDir, filePath)) {
    throw new Error(`Invalid asset path: ${sourcePath}`);
  }
  return filePath;
}

export function normalizeRelativePath(relPath) {
  const normalized = String(relPath ?? "").replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Invalid relative path: ${relPath}`);
  }
  return normalized;
}

function isPathInsideOrEqual(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function writeFileAtomically(filePath, body, options) {
  const dirPath = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempPath = path.join(dirPath, `.${baseName}.${stamp}.tmp`);
  const backupPath = path.join(dirPath, `.${baseName}.${stamp}.bak`);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(tempPath, body, options);

  try {
    await fs.rename(tempPath, filePath);
    return;
  } catch (error) {
    const code = String(error?.code ?? "");
    if (!["EEXIST", "EPERM", "EBUSY"].includes(code)) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  let movedOriginal = false;
  try {
    await fs.rename(filePath, backupPath);
    movedOriginal = true;
  } catch (error) {
    const code = String(error?.code ?? "");
    if (code !== "ENOENT") {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (movedOriginal) {
      await fs.rename(backupPath, filePath).catch(() => undefined);
    }
    throw error;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    if (movedOriginal) {
      await fs.rm(backupPath, { force: true }).catch(() => undefined);
    }
  }
}

export async function walkFiles(rootDir, currentDir = rootDir, out = []) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(rootDir, fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const relPath = normalizeRelativePath(path.relative(rootDir, fullPath));
    out.push({ fullPath, relPath });
  }
  return out;
}

export async function createAssetSnapshot(assetRootDir) {
  const files = {};
  const rows = await walkFiles(assetRootDir);
  for (const row of rows) {
    const raw = await fs.readFile(row.fullPath);
    files[row.relPath] = raw.toString("base64");
  }
  return files;
}

function mojibakeScore(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  const cjkCount = (text.match(/[가-힣ぁ-ゖァ-ヺ一-龯]/g) || []).length;
  const replacementCount = (text.match(/[�]/g) || []).length;
  return cjkCount - replacementCount * 3;
}

function isLikelyMojibakeText(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  if (text.includes("�")) return true;

  const decoded = Buffer.from(text, "latin1").toString("utf8");
  if (decoded === text) return false;
  return mojibakeScore(decoded) > mojibakeScore(text) + 1;
}

function collectMojibakeStrings(node, pointer = "$", out = []) {
  if (typeof node === "string") {
    if (isLikelyMojibakeText(node)) {
      out.push({
        pointer,
        preview: node.slice(0, 80),
      });
    }
    return out;
  }

  if (Array.isArray(node)) {
    node.forEach((value, index) => {
      collectMojibakeStrings(value, `${pointer}[${index}]`, out);
    });
    return out;
  }

  if (node && typeof node === "object") {
    Object.entries(node).forEach(([key, value]) => {
      collectMojibakeStrings(value, `${pointer}.${key}`, out);
    });
  }

  return out;
}

export async function findMojibakeInAssetJson(assetRootDir) {
  const rows = await walkFiles(assetRootDir);
  const findings = [];

  for (const row of rows) {
    if (row.relPath.includes("�")) {
      findings.push(`${row.relPath} (file path)`);
      continue;
    }

    if (!row.relPath.toLowerCase().endsWith(".json")) continue;

    const rawText = await fs.readFile(row.fullPath, "utf8");
    if (isLikelyMojibakeText(rawText)) {
      findings.push(`${row.relPath} (raw text)`);
      if (findings.length >= 20) break;
      continue;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(stripBom(rawText));
    } catch {
      continue;
    }

    const stringFindings = collectMojibakeStrings(parsed);
    if (stringFindings.length === 0) continue;

    const top = stringFindings[0];
    findings.push(`${row.relPath} @ ${top.pointer}: "${top.preview}"`);
    if (findings.length >= 20) break;
  }

  return findings;
}

export async function restoreAssetSnapshot(assetRootDir, snapshotFiles) {
  await fs.mkdir(assetRootDir, { recursive: true });

  const desiredFiles = new Map();
  for (const [rawRelPath, base64Body] of Object.entries(snapshotFiles ?? {})) {
    const relPath = normalizeRelativePath(rawRelPath);
    desiredFiles.set(relPath, String(base64Body ?? ""));
  }

  const existing = await walkFiles(assetRootDir);
  const existingSet = new Set(existing.map((row) => row.relPath));
  const desiredSet = new Set(desiredFiles.keys());

  for (const relPath of existingSet) {
    if (desiredSet.has(relPath)) continue;
    const fullPath = path.join(assetRootDir, relPath);
    await fs.rm(fullPath, { force: true });
  }

  for (const [relPath, base64Body] of desiredFiles.entries()) {
    const fullPath = path.join(assetRootDir, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await writeFileAtomically(fullPath, Buffer.from(base64Body, "base64"));
  }

  return { skippedProtectedFileCount: 0 };
}
