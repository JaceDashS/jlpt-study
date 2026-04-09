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

function parseArgs(argv) {
  const args = { write: false, files: [], dropKanji: false, dropWord: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") {
      args.write = true;
      continue;
    }
    if (arg === "--drop-kanji") {
      args.dropKanji = true;
      continue;
    }
    if (arg === "--drop-word") {
      args.dropWord = true;
      continue;
    }
    if (arg === "--file") {
      const next = argv[i + 1];
      if (next) {
        args.files.push(next);
        i += 1;
      }
    }
  }
  return args;
}

function isStudyJson(root) {
  return !!root && typeof root === "object" && Array.isArray(root.days);
}

function run() {
  const args = parseArgs(process.argv);
  const cwd = process.cwd();
  const assetRoot = path.join(cwd, "asset");
  if (!fs.existsSync(assetRoot)) {
    console.error("[ERROR] asset folder not found:", assetRoot);
    process.exitCode = 1;
    return;
  }

  const targetFiles =
    args.files.length > 0
      ? args.files.map((inputPath) => (path.isAbsolute(inputPath) ? inputPath : path.join(cwd, inputPath)))
      : walkJsonFiles(assetRoot, []);

  let scannedFiles = 0;
  let touchedFiles = 0;
  let scannedItems = 0;
  let addedExpressionCount = 0;
  let droppedKanjiCount = 0;
  let droppedWordCount = 0;
  let parseErrorCount = 0;

  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath)) continue;
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      parsed = JSON.parse(normalized);
    } catch {
      parseErrorCount += 1;
      continue;
    }
    if (!isStudyJson(parsed)) continue;
    scannedFiles += 1;

    let dirty = false;
    for (const day of parsed.days) {
      const items = Array.isArray(day?.items) ? day.items : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        scannedItems += 1;
        const expression = String(item.expression ?? "").trim();
        const word = String(item.word ?? "").trim();
        const kanji = String(item.kanji ?? "").trim();

        if (!expression && (word || kanji)) {
          item.expression = word || kanji;
          addedExpressionCount += 1;
          dirty = true;
        }

        if (args.dropKanji && Object.prototype.hasOwnProperty.call(item, "kanji")) {
          delete item.kanji;
          droppedKanjiCount += 1;
          dirty = true;
        }

        if (args.dropWord && Object.prototype.hasOwnProperty.call(item, "word")) {
          delete item.word;
          droppedWordCount += 1;
          dirty = true;
        }
      }
    }

    if (dirty) {
      touchedFiles += 1;
      if (args.write) {
        fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      }
    }
  }

  console.log("=== migrate expression field ===");
  console.log(`mode: ${args.write ? "write" : "dry-run"}`);
  console.log(`scannedFiles: ${scannedFiles}`);
  console.log(`touchedFiles: ${touchedFiles}`);
  console.log(`scannedItems: ${scannedItems}`);
  console.log(`addedExpressionCount: ${addedExpressionCount}`);
  console.log(`droppedKanjiCount: ${droppedKanjiCount}`);
  console.log(`droppedWordCount: ${droppedWordCount}`);
  console.log(`parseErrorCount: ${parseErrorCount}`);
}

run();
