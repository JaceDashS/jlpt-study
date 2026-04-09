#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    files: [],
    globs: [],
    root: "asset",
    mode: "study", // study only
    maxDetails: 120,
    allowSrcBaseline: true,
    invalidMode: null,
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
    if (arg === "--mode") {
      const next = String(argv[i + 1] || "").toLowerCase();
      if (next === "study") {
        args.mode = next;
        i += 1;
      } else if (next) {
        args.invalidMode = next;
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

function resolveTargetFiles({ root, files, globs, mode }) {
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

  const allowedNames = new Set(["study.json"]);
  const all = walkFiles(rootAbs, []).filter((p) => allowedNames.has(path.basename(p).toLowerCase())).sort();
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

function getExpression(item) {
  if (typeof item?.expression === "string" && item.expression.trim()) return item.expression.trim();
  return "";
}

function hasMeaning(item) {
  const value = item?.meaningKo;
  return typeof value === "string" && value.trim().length > 0;
}

function buildItemKeys(stepIndex, item, itemIndex) {
  const keys = [];
  const id = String(item?.id || "").trim();
  if (id) keys.push(`id:${id}`);
  const expression = getExpression(item);
  if (expression) keys.push(`expr:${expression}`);
  const step = Number(stepIndex) + 1;
  const index = Number(item?.index) || itemIndex + 1;
  keys.push(`pos:${step}:${index}`);
  return keys;
}

function collectMissingMeaningKeys(root) {
  const keys = new Set();
  const steps = normalizeSteps(root);
  steps.forEach((step, stepIndex) => {
    const items = Array.isArray(step?.items) ? step.items : [];
    items.forEach((item, itemIndex) => {
      if (!getExpression(item)) return;
      if (hasMeaning(item)) return;
      buildItemKeys(stepIndex, item, itemIndex).forEach((key) => keys.add(key));
    });
  });
  return keys;
}

function run() {
  const args = parseArgs(process.argv);
  if (args.invalidMode) {
    console.error(`[ERROR] unsupported --mode "${args.invalidMode}". check:missing-meaning only supports --mode study.`);
    process.exitCode = 1;
    return;
  }
  const files = resolveTargetFiles({
    root: args.root,
    files: args.files,
    globs: args.globs,
    mode: args.mode,
  });
  if (args.files.length > 0 && files.length === 0) {
    console.error("[ERROR] no study.json files matched. check:missing-meaning only validates study.json.");
    process.exitCode = 1;
    return;
  }

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
        code: "PARSE_ERROR",
        file: path.relative(process.cwd(), filePath),
        message: String(error?.message || error),
      });
      continue;
    }

    scannedFiles += 1;
    let srcBaseline = null;
    const baseName = path.basename(filePath).toLowerCase();
    const isStudyFile = baseName === "study.json";
    if (args.allowSrcBaseline && isStudyFile) {
      const srcPath = path.join(path.dirname(filePath), "src.json");
      if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
        try {
          const srcRoot = readJson(srcPath);
          srcBaseline = collectMissingMeaningKeys(srcRoot);
        } catch (error) {
          issues.push({
            code: "SRC_PARSE_ERROR",
            file: path.relative(process.cwd(), srcPath),
            message: String(error?.message || error),
          });
        }
      }
    }

    const steps = normalizeSteps(root);
    steps.forEach((step, stepIndex) => {
      const items = Array.isArray(step?.items) ? step.items : [];
      items.forEach((item, itemIndex) => {
        scannedItems += 1;
        const expression = getExpression(item);
        if (!expression) return;
        if (hasMeaning(item)) return;
        const keys = buildItemKeys(stepIndex, item, itemIndex);
        const accepted = srcBaseline && keys.some((key) => srcBaseline.has(key));
        if (accepted) {
          acceptedBySrc.push({
            code: "MISSING_MEANING_KO_ACCEPTED_BY_SRC",
            file: path.relative(process.cwd(), filePath),
            unitStep: getDisplayStep(step, stepIndex),
            index: Number(item?.index) || itemIndex + 1,
            id: String(item?.id || "(no-id)"),
            expression,
          });
          return;
        }
        issues.push({
          code: "MISSING_MEANING_KO",
          file: path.relative(process.cwd(), filePath),
          unitStep: getDisplayStep(step, stepIndex),
          index: Number(item?.index) || itemIndex + 1,
          id: String(item?.id || "(no-id)"),
          expression,
        });
      });
    });
  }

  console.log("=== check:missing-meaning ===");
  console.log(`mode: ${args.mode}`);
  console.log(`allowSrcBaseline: ${args.allowSrcBaseline ? "on" : "off"}`);
  console.log(`scannedFiles: ${scannedFiles}`);
  console.log(`scannedItems: ${scannedItems}`);
  console.log(`issueCount: ${issues.length}`);
  console.log(`acceptedBySrcCount: ${acceptedBySrc.length}`);

  const grouped = issues.reduce((acc, row) => {
    acc[row.code] = (acc[row.code] || 0) + 1;
    return acc;
  }, {});
  if (Object.keys(grouped).length > 0) {
    console.log("\n[Issue Counts]");
    Object.entries(grouped).forEach(([code, count]) => {
      console.log(`- ${code}: ${count}`);
    });
  }

  const acceptedGrouped = acceptedBySrc.reduce((acc, row) => {
    acc[row.code] = (acc[row.code] || 0) + 1;
    return acc;
  }, {});
  if (Object.keys(acceptedGrouped).length > 0) {
    console.log("\n[Accepted By Src]");
    Object.entries(acceptedGrouped).forEach(([code, count]) => {
      console.log(`- ${code}: ${count}`);
    });
  }

  if (issues.length > 0) {
    console.log("\n[Details]");
    issues.slice(0, args.maxDetails).forEach((row) => {
      if (row.code === "PARSE_ERROR" || row.code === "SRC_PARSE_ERROR") {
        console.log(`- PARSE_ERROR file=${row.file} message=${row.message}`);
        return;
      }
      console.log(
        `- MISSING_MEANING_KO file=${row.file} unitStep=${row.unitStep} index=${row.index} id=${row.id} expression=${row.expression}`,
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
