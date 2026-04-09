#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function walkJsonFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}
const SOURCE_FILE_BASENAMES = ["src.json"];

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(text);
}

function normalizeDays(root) {
  if (Array.isArray(root?.unitSteps)) return root.unitSteps;
  if (Array.isArray(root?.days)) return root.days;
  if (Array.isArray(root)) return root;
  return [];
}

function getDisplayDay(day, dayIndexZeroBased) {
  const n = Number(day?.unitStep ?? day?.day);
  if (Number.isFinite(n)) return n;
  const idx = Number(day?.dayIndex);
  if (Number.isFinite(idx)) return idx;
  return dayIndexZeroBased + 1;
}

function getWord(item) {
  return String(item?.expression ?? item?.word ?? item?.kanji ?? "").trim();
}

function buildIndexItemLookup(indexRoot) {
  const byDayAndKanji = new Map();
  const byKanji = new Map();
  const problemTargetKanjiSet = new Set();
  const splitProblemByDayAndTargetKanji = new Map();
  const splitProblemByTargetKanji = new Map();
  const days = normalizeDays(indexRoot);
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const day = days[dayIndex];
    const dayNo = getDisplayDay(day, dayIndex);
    const items = Array.isArray(day?.items) ? day.items : [];
    for (const item of items) {
      const kanji = getWord(item);
      if (kanji) {
        byDayAndKanji.set(`${dayNo}::${kanji}`, item);
        if (!byKanji.has(kanji)) {
          byKanji.set(kanji, item);
        }
      }

      const targetKanji = String(item?.targetKanji ?? "").trim();
      const hasSplitProblemShape =
        !!String(item?.sentence ?? "").trim() &&
        Array.isArray(item?.choices) &&
        item.choices.length > 0 &&
        String(item?.answer ?? "").trim().length > 0;
      if (targetKanji && hasSplitProblemShape) {
        problemTargetKanjiSet.add(targetKanji);
        const normalizedProblem = {
          sentence: String(item.sentence ?? "").trim(),
          target: targetKanji,
          choices: item.choices.map((choice) => String(choice ?? "").trim()),
          answer: String(item.answer ?? "").trim(),
        };
        splitProblemByDayAndTargetKanji.set(`${dayNo}::${targetKanji}`, normalizedProblem);
        if (!splitProblemByTargetKanji.has(targetKanji)) {
          splitProblemByTargetKanji.set(targetKanji, normalizedProblem);
        }
      }
    }
  }
  return {
    byDayAndKanji,
    byKanji,
    problemTargetKanjiSet,
    splitProblemByDayAndTargetKanji,
    splitProblemByTargetKanji,
  };
}

function findIndexItem(lookup, dayNo, item) {
  const kanji = getWord(item);
  if (kanji) {
    const byKanji = lookup.byDayAndKanji.get(`${dayNo}::${kanji}`);
    if (byKanji) return byKanji;
    const globalKanji = lookup.byKanji.get(kanji);
    if (globalKanji) return globalKanji;
  }

  return null;
}

function hasProblemDataInIndexItem(indexItem) {
  if (!indexItem || typeof indexItem !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(indexItem, "problem")) {
    return indexItem.problem != null;
  }

  const hasSplitProblemShape =
    !!String(indexItem?.sentence ?? "").trim() &&
    Array.isArray(indexItem?.choices) &&
    indexItem.choices.length > 0 &&
    String(indexItem?.answer ?? "").trim().length > 0;
  return hasSplitProblemShape;
}

function cloneProblem(problem) {
  return {
    sentence: String(problem?.sentence ?? "").trim(),
    target: String(problem?.target ?? "").trim(),
    choices: Array.isArray(problem?.choices) ? problem.choices.map((choice) => String(choice ?? "").trim()) : [],
    answer: String(problem?.answer ?? "").trim(),
  };
}

function findSplitProblemForKanji(lookup, dayNo, kanji) {
  if (!kanji) return null;
  const byDay = lookup.splitProblemByDayAndTargetKanji.get(`${dayNo}::${kanji}`);
  if (byDay) return cloneProblem(byDay);
  const global = lookup.splitProblemByTargetKanji.get(kanji);
  if (global) return cloneProblem(global);
  return null;
}

function resolveStudyJsonPath(srcPath) {
  const srcDir = path.dirname(srcPath);
  return path.join(srcDir, "study.json");
}

function run() {
  const writeMode = process.argv.includes("--write");
  const cwd = process.cwd();
  const assetRoot = path.join(cwd, "asset");

  if (!fs.existsSync(assetRoot)) {
    console.error("[ERROR] asset folder not found:", assetRoot);
    process.exitCode = 1;
    return;
  }

  const allJson = walkJsonFiles(assetRoot, []);
  const indexFiles = allJson.filter((p) => SOURCE_FILE_BASENAMES.includes(path.basename(p).toLowerCase()));

  let scannedStudyItems = 0;
  let clearedProblems = 0;
  let injectedProblems = 0;
  let updatedFiles = 0;
  let pairCount = 0;
  const updatedStudyPaths = [];
  const skippedPairs = [];
  const parseErrors = [];

  for (const indexPath of indexFiles) {
    const studyPath = resolveStudyJsonPath(indexPath);
    if (!fs.existsSync(studyPath)) {
      continue;
    }

    let indexRoot;
    let studyRoot;
    try {
      indexRoot = readJson(indexPath);
      studyRoot = readJson(studyPath);
    } catch (error) {
      parseErrors.push({
        index: path.relative(cwd, indexPath),
        study: path.relative(cwd, studyPath),
        error: String(error?.message || error),
      });
      continue;
    }

    const indexLookup = buildIndexItemLookup(indexRoot);
    const studyDays = normalizeDays(studyRoot);
    if (studyDays.length === 0) {
      skippedPairs.push({
        index: path.relative(cwd, indexPath),
        study: path.relative(cwd, studyPath),
        reason: "study json has no days[]",
      });
      continue;
    }

    pairCount += 1;
    let fileChanged = false;

    for (let dayIndex = 0; dayIndex < studyDays.length; dayIndex += 1) {
      const day = studyDays[dayIndex];
      const dayNo = getDisplayDay(day, dayIndex);
      const items = Array.isArray(day?.items) ? day.items : [];
      for (const item of items) {
        scannedStudyItems += 1;
        const indexItem = findIndexItem(indexLookup, dayNo, item);
        const itemKanji = getWord(item);
        const hasMergedProblemByKanji =
          itemKanji.length > 0 && indexLookup.problemTargetKanjiSet.has(itemKanji);
        const splitProblem = findSplitProblemForKanji(indexLookup, dayNo, itemKanji);

        if (splitProblem && item.problem == null) {
          item.problem = splitProblem;
          fileChanged = true;
          injectedProblems += 1;
          continue;
        }

        const shouldNull =
          !hasMergedProblemByKanji &&
          (!indexItem || !hasProblemDataInIndexItem(indexItem));

        if (!shouldNull) continue;
        if (item.problem == null) continue;

        item.problem = null;
        fileChanged = true;
        clearedProblems += 1;
      }
    }

    if (fileChanged) {
      updatedFiles += 1;
      updatedStudyPaths.push(path.relative(cwd, studyPath));
      if (writeMode) {
        fs.writeFileSync(studyPath, `${JSON.stringify(studyRoot, null, 2)}\n`, "utf8");
      }
    }
  }

  console.log("=== sync problem by kanji ===");
  console.log(`mode: ${writeMode ? "write" : "dry-run"}`);
  console.log(`indexPairCount: ${pairCount}`);
  console.log(`scannedStudyItems: ${scannedStudyItems}`);
  console.log(`clearedProblemCount: ${clearedProblems}`);
  console.log(`injectedProblemCount: ${injectedProblems}`);
  console.log(`updatedFileCount: ${updatedFiles}`);
  console.log(`skippedPairCount: ${skippedPairs.length}`);
  console.log(`parseErrorCount: ${parseErrors.length}`);
  console.log("");

  if (updatedFiles > 0) {
    console.log("[Updated Targets]");
    for (const relPath of updatedStudyPaths) {
      console.log(`- ${relPath}`);
    }
    console.log("");
  }

  if (skippedPairs.length > 0) {
    console.log("[Skipped]");
    for (const row of skippedPairs) {
      console.log(`- index: ${row.index}`);
      console.log(`  study: ${row.study}`);
      console.log(`  reason: ${row.reason}`);
    }
    console.log("");
  }

  if (parseErrors.length > 0) {
    console.log("[Parse Errors]");
    for (const row of parseErrors) {
      console.log(`- index: ${row.index}`);
      console.log(`  study: ${row.study}`);
      console.log(`  error: ${row.error}`);
    }
    process.exitCode = 2;
  }
}

run();

