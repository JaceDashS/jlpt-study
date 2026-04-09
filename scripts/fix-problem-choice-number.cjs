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

function normalizeDays(root) {
  if (Array.isArray(root?.days)) return root.days;
  if (Array.isArray(root)) return root;
  return [];
}

function isTargetStudyJson(root) {
  return !!root && typeof root === "object" && Array.isArray(root.days);
}

function toHalfWidthDigits(text) {
  return String(text ?? "").replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

function numberToKanji(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n === 0) return "零";
  if (n < 0) return `マイナス${numberToKanji(Math.abs(n))}`;

  const digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const units = ["", "十", "百", "千"];
  const bigUnits = ["", "万", "億", "兆"];

  let num = Math.trunc(n);
  let bigIndex = 0;
  let result = "";

  while (num > 0) {
    const chunk = num % 10000;
    if (chunk > 0) {
      let chunkText = "";
      let unitIndex = 0;
      let x = chunk;
      while (x > 0) {
        const d = x % 10;
        if (d > 0) {
          const digitText = d === 1 && unitIndex > 0 ? "" : digits[d];
          chunkText = `${digitText}${units[unitIndex]}${chunkText}`;
        }
        x = Math.floor(x / 10);
        unitIndex += 1;
      }
      result = `${chunkText}${bigUnits[bigIndex]}${result}`;
    }
    num = Math.floor(num / 10000);
    bigIndex += 1;
  }

  return result || String(value);
}

function replaceDigitsWithKanji(text) {
  const normalized = toHalfWidthDigits(text);
  return normalized.replace(/\d+/g, (m) => numberToKanji(m));
}

function run() {
  const cwd = process.cwd();
  const assetRoot = path.join(cwd, "asset");
  if (!fs.existsSync(assetRoot)) {
    console.error("[ERROR] asset folder not found:", assetRoot);
    process.exitCode = 1;
    return;
  }

  const files = walkJsonFiles(assetRoot, []);
  let changedFileCount = 0;
  let changedChoiceCount = 0;

  for (const filePath of files) {
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      parsed = JSON.parse(normalized);
    } catch {
      continue;
    }
    if (!isTargetStudyJson(parsed)) continue;

    let fileChanged = false;
    const days = normalizeDays(parsed);
    days.forEach((day) => {
      const items = Array.isArray(day?.items) ? day.items : [];
      items.forEach((item) => {
        const problem = item?.problem;
        if (!problem || typeof problem !== "object") return;
        if (!Array.isArray(problem.choices) || problem.choices.length === 0) return;

        const nextChoices = problem.choices.map((choice) => {
          const before = String(choice ?? "");
          const after = replaceDigitsWithKanji(before);
          if (before !== after) {
            changedChoiceCount += 1;
            fileChanged = true;
          }
          return after;
        });

        if (fileChanged) {
          problem.choices = nextChoices;
        }
      });
    });

    if (!fileChanged) continue;
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    changedFileCount += 1;
  }

  console.log("=== fix problem choice number report ===");
  console.log(`changedFileCount: ${changedFileCount}`);
  console.log(`changedChoiceCount: ${changedChoiceCount}`);
}

run();
