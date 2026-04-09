#!/usr/bin/env node
// Merges all unit-level study.json files for jlpt-one-book-n1
// into a single asset/jlpt-one-book-n1.json (combined format).
//
// Usage:  node scripts/merge-study-json.cjs
//         node scripts/merge-study-json.cjs --dry-run

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "asset/jlpt-one-book-n1/manifest.json");
const OUTPUT_PATH = path.join(ROOT, "asset/jlpt-one-book-n1.json");

const DRY_RUN = process.argv.includes("--dry-run");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function main() {
  const manifest = readJson(MANIFEST_PATH);
  const level = "jlpt-n1"; // matches meta.level in existing study.json files

  const units = [];

  for (const manifestChapter of manifest.chapters ?? []) {
    const chapterId = String(manifestChapter.id ?? "").trim();
    if (!chapterId) continue;

    for (const manifestUnit of manifestChapter.units ?? []) {
      const unitId = String(manifestUnit.id ?? "").trim();
      if (!unitId) continue;

      // outputPath is relative to the asset/<level>/ directory
      const outputPath = String(manifestUnit.outputPath ?? "").trim();
      if (!outputPath) {
        console.warn(`  SKIP ${chapterId}/${unitId}: no outputPath in manifest`);
        continue;
      }

      const studyPath = path.join(ROOT, "asset/jlpt-one-book-n1", outputPath);
      if (!fs.existsSync(studyPath)) {
        console.warn(`  SKIP ${chapterId}/${unitId}: file not found: ${studyPath}`);
        continue;
      }

      const studyJson = readJson(studyPath);

      // Grab unitSteps (or days) — whichever the file uses
      const unitSteps = Array.isArray(studyJson?.unitSteps)
        ? studyJson.unitSteps
        : Array.isArray(studyJson?.days)
        ? studyJson.days
        : null;

      if (!unitSteps) {
        console.warn(`  SKIP ${chapterId}/${unitId}: no unitSteps/days array`);
        continue;
      }

      const sourceName = String(
        studyJson?.meta?.sourceName ?? manifestUnit.title ?? unitId
      );

      units.push({
        chapterId,
        unitId,
        sourceName,
        unitSteps,
      });

      console.log(`  + ${chapterId}/${unitId} (${unitSteps.length} steps)`);
    }
  }

  const combined = {
    format: "combined",
    meta: {
      level,
      title: String(manifest.title ?? ""),
    },
    units,
  };

  if (DRY_RUN) {
    console.log(`\n[dry-run] Would write ${OUTPUT_PATH}`);
    console.log(`  units: ${units.length}`);
    const total = units.reduce((s, u) => s + u.unitSteps.length, 0);
    console.log(`  total steps: ${total}`);
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(combined, null, 2) + "\n", "utf8");
  console.log(`\nWrote: ${OUTPUT_PATH}`);
  console.log(`  units: ${units.length}`);
  const total = units.reduce((s, u) => s + u.unitSteps.length, 0);
  console.log(`  total steps: ${total}`);
  console.log(
    "\nNext: delete individual study.json files under asset/jlpt-one-book-n1/"
  );
}

main();
