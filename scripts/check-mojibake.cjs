#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const SOURCE_FILE_BASENAMES = ["study.json"];

function parseArgs(argv) {
  const args = {
    files: [],
    globs: [],
    root: "asset",
    maxDetails: 120,
    allowSrcBaseline: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") {
      const next = argv[i + 1];
      if (next) {
        args.files.push(next);
        i += 1;
      }
      continue;
    }
    if (arg === "--glob") {
      const next = argv[i + 1];
      if (next) {
        args.globs.push(next);
        i += 1;
      }
      continue;
    }
    if (arg === "--root") {
      const next = argv[i + 1];
      if (next) {
        args.root = next;
        i += 1;
      }
      continue;
    }
    if (arg === "--max-details") {
      const next = Number(argv[i + 1]);
      if (Number.isFinite(next) && next > 0) {
        args.maxDetails = Math.floor(next);
        i += 1;
      }
      continue;
    }
    if (arg === "--no-allow-src-baseline") {
      args.allowSrcBaseline = false;
    }
  }
  return args;
}

function walkFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (entry.isFile()) out.push(full);
  }
  return out;
}

function globToRegExp(glob) {
  const normalized = String(glob || "").replaceAll("\\", "/");
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withStar = escaped.replace(/\\\*\\\*/g, "___DOUBLE_STAR___").replace(/\\\*/g, "[^/]*");
  const withDoubleStar = withStar.replace(/___DOUBLE_STAR___/g, ".*");
  return new RegExp(`^${withDoubleStar}$`);
}

function resolveTargetFiles({ root, files, globs }) {
  const cwd = process.cwd();
  const rootAbs = path.resolve(cwd, root);
  if (!fs.existsSync(rootAbs)) throw new Error(`asset root not found: ${rootAbs}`);

  if (files.length > 0) {
    return files
      .map((f) => path.resolve(cwd, f))
      .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile())
      .filter((p) => path.basename(p).toLowerCase() === "study.json")
      .sort();
  }

  const all = walkFiles(rootAbs, [])
    .filter((p) => SOURCE_FILE_BASENAMES.includes(path.basename(p).toLowerCase()))
    .sort();

  if (globs.length === 0) return all;
  const patterns = globs.map(globToRegExp);
  return all.filter((p) => {
    const rel = path.relative(cwd, p).replaceAll("\\", "/");
    return patterns.some((rx) => rx.test(rel));
  });
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(text);
}

function hasSuspiciousQuestionMark(text) {
  const s = String(text || "");
  const chars = [...s];
  const qIndexes = [];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === "?" || chars[i] === "？") qIndexes.push(i);
  }
  if (qIndexes.length === 0) return false;

  // Ignore question marks used in IDS decomposition notation (e.g., ⿱一厶?土).
  const isNearIdsOperator = (idx) => {
    const start = Math.max(0, idx - 3);
    const end = Math.min(chars.length, idx + 4);
    const window = chars.slice(start, end).join("");
    return /[⿰-⿻]/u.test(window);
  };
  const effectiveSet = new Set(qIndexes.filter((idx) => !isNearIdsOperator(idx)));
  if (effectiveSet.size === 0) return false;

  if (/[\?？]{2,}/.test(s)) return true;

  for (const idx of effectiveSet) {
    const prev = chars[idx - 1] || "";
    const next = chars[idx + 1] || "";
    if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]/u.test(prev) &&
      /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]/u.test(next)) {
      return true;
    }
  }
  return false;
}

function hasMojibakeString(text) {
  const s = String(text || "");
  // Common UTF-8/CP1252 mojibake fragments: Ãxx, Âxx, âxx, replacement char.
  const mojibakeFragmentPattern = /(?:Ã.|Â.|â.|�)/;
  return mojibakeFragmentPattern.test(s) || hasSuspiciousQuestionMark(s);
}

function normalizeSteps(root) {
  if (Array.isArray(root?.unitSteps)) return root.unitSteps;
  if (Array.isArray(root?.days)) return root.days;
  if (Array.isArray(root)) return root;
  return [];
}

function getDisplayStep(step, indexZeroBased) {
  const value = Number(step?.unitStep ?? step?.day);
  if (Number.isFinite(value)) return value;
  const idx = Number(step?.dayIndex);
  if (Number.isFinite(idx)) return idx;
  return indexZeroBased + 1;
}

function collectMojibakeRows(root, relFile) {
  const rows = [];
  const steps = normalizeSteps(root);

  function scanStringValues(value, onString, currentPath = "$") {
    if (typeof value === "string") {
      onString(value, currentPath);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => scanStringValues(v, onString, `${currentPath}[${i}]`));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => scanStringValues(v, onString, `${currentPath}.${k}`));
    }
  }

  steps.forEach((step, stepIndex) => {
    const items = Array.isArray(step?.items) ? step.items : [];
    items.forEach((item, itemIndex) => {
      const base = {
        file: relFile,
        unitStep: getDisplayStep(step, stepIndex),
        index: Number(item?.index) || itemIndex + 1,
        id: String(item?.id || "(no-id)"),
      };

      scanStringValues(item, (text, pathText) => {
        if (!hasMojibakeString(text)) return;
        rows.push({
          ...base,
          path: pathText,
          sample: String(text).slice(0, 120),
        });
      });
    });
  });
  return rows;
}

function issueSignature(row) {
  return `${row.unitStep}|${row.index}|${row.id}|${row.path}|${row.sample}`;
}

function run() {
  const args = parseArgs(process.argv);
  const files = resolveTargetFiles({
    root: args.root,
    files: args.files,
    globs: args.globs,
  });

  if (args.files.length > 0 && files.length === 0) {
    console.error("[ERROR] no study.json files matched. check:mojibake only validates study.json.");
    process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  const issues = [];
  const acceptedBySrc = [];
  let scannedFiles = 0;
  let scannedItems = 0;

  for (const filePath of files) {
    let root;
    try {
      root = readJson(filePath);
    } catch (error) {
      issues.push({
        file: path.relative(cwd, filePath),
        code: "PARSE_ERROR",
        message: String(error?.message || error),
      });
      continue;
    }

    scannedFiles += 1;
    const rel = path.relative(cwd, filePath);
    const currentRows = collectMojibakeRows(root, rel);
    scannedItems += normalizeSteps(root).reduce((acc, step) => acc + (Array.isArray(step?.items) ? step.items.length : 0), 0);

    let srcSignatures = null;
    if (args.allowSrcBaseline) {
      const srcPath = path.join(path.dirname(filePath), "src.json");
      if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
        try {
          const srcRoot = readJson(srcPath);
          srcSignatures = new Set(
            collectMojibakeRows(srcRoot, path.relative(cwd, srcPath)).map(issueSignature),
          );
        } catch (error) {
          issues.push({
            file: path.relative(cwd, srcPath),
            code: "SRC_PARSE_ERROR",
            message: String(error?.message || error),
          });
        }
      }
    }

    currentRows.forEach((row) => {
      if (srcSignatures && srcSignatures.has(issueSignature(row))) {
        acceptedBySrc.push(row);
      } else {
        issues.push(row);
      }
    });
  }

  console.log("=== check:mojibake ===");
  console.log(`allowSrcBaseline: ${args.allowSrcBaseline ? "on" : "off"}`);
  console.log(`scannedFiles: ${scannedFiles}`);
  console.log(`scannedItems: ${scannedItems}`);
  console.log(`issueCount: ${issues.length}`);
  console.log(`acceptedBySrcCount: ${acceptedBySrc.length}`);

  if (issues.length > 0) {
    console.log("\n[Details]");
    issues.slice(0, args.maxDetails).forEach((row) => {
      if (row.code === "PARSE_ERROR" || row.code === "SRC_PARSE_ERROR") {
        console.log(`- ${row.code} file=${row.file} message=${row.message}`);
        return;
      }
      console.log(
        `- MOJIBAKE file=${row.file} unitStep=${row.unitStep} index=${row.index} id=${row.id} path=${row.path} sample=${row.sample}`,
      );
    });
    if (issues.length > args.maxDetails) {
      console.log(`\n... ${issues.length - args.maxDetails} more`);
    }
    process.exitCode = 1;
  } else {
    console.log("\nNo issues found.");
  }
}

run();
