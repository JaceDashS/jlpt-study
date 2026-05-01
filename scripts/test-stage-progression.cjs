#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const ts = require("typescript");

const TEMP_DIR_REL = ".tmp-stage-test";
const TEMP_DIR = path.join(process.cwd(), TEMP_DIR_REL);

function compileSrsForTest() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const files = ["constants.ts", "date.ts", "srs.ts"];
  for (const name of files) {
    const srcPath = path.join(process.cwd(), "client", "src", "domain", name);
    const raw = fs.readFileSync(srcPath, "utf8");
    const out = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
      },
      fileName: srcPath,
    });
    fs.writeFileSync(path.join(TEMP_DIR, name.replace(/\.ts$/, ".js")), out.outputText, "utf8");
  }
  fs.writeFileSync(path.join(TEMP_DIR, "package.json"), '{"type":"commonjs"}\n', "utf8");
}

function createDay(stage = 2) {
  return {
    stage,
    nextReviewDate: "2026-02-18",
    lastAttemptDate: "",
    items: [
      {
        id: "d1-i1",
        problem: { sentence: "x", choices: ["a", "b", "c", "d"] },
        lastResult: "NEUTRAL",
      },
      {
        id: "d1-i2",
        problem: { sentence: "y", choices: ["a", "b", "c", "d"] },
        lastResult: "NEUTRAL",
      },
    ],
  };
}

function runCases() {
  const { applyQuizResultForDay, applyReviewResultForDay } = require(path.join(TEMP_DIR, "srs.js"));
  const today = "2026-02-18";
  const results = [];

  {
    const day = createDay(2);
    const out = applyQuizResultForDay(day, today, { "d1-i1": "PASS", "d1-i2": "PASS" });
    assert.equal(out.allPass, true);
    assert.equal(out.day.stage, 3);
    assert.equal(out.day.nextReviewDate, "2026-02-21");
    results.push({ name: "quiz_all_pass_promotes_stage", status: "PASS" });
  }

  {
    const day = createDay(2);
    const out = applyQuizResultForDay(day, today, { "d1-i1": "PASS", "d1-i2": "FAIL" });
    assert.equal(out.allPass, false);
    assert.equal(out.day.stage, 2);
    assert.equal(out.day.nextReviewDate, "2026-02-18");
    results.push({ name: "quiz_fail_keeps_stage", status: "PASS" });
  }

  {
    const day = createDay(2);
    const out = applyQuizResultForDay(day, today, {});
    assert.equal(out.allPass, false);
    assert.equal(out.day.stage, 2);
    assert.equal(out.day.nextReviewDate, "2026-02-18");
    results.push({ name: "quiz_without_graded_does_not_promote", status: "PASS" });
  }

  {
    const day = createDay(2);
    const out = applyReviewResultForDay(day, today, { "d1-i1": "PASS", "d1-i2": "PASS" });
    assert.equal(out.day.stage, 3);
    assert.equal(out.day.nextReviewDate, "2026-02-21");
    results.push({ name: "review_all_pass_promotes_stage", status: "PASS" });
  }

  {
    const day = createDay(2);
    const out = applyReviewResultForDay(day, today, { "d1-i1": "PASS", "d1-i2": "FAIL" });
    assert.equal(out.day.stage, 2);
    assert.equal(out.day.nextReviewDate, "2026-02-18");
    results.push({ name: "review_fail_keeps_stage_and_due_today", status: "PASS" });
  }

  {
    const day = createDay(2);
    const out = applyReviewResultForDay(day, today, {});
    assert.equal(out.day.stage, 2);
    assert.equal(out.day.nextReviewDate, "2026-02-18");
    results.push({ name: "review_without_graded_does_not_promote", status: "PASS" });
  }

  return results;
}

function main() {
  compileSrsForTest();
  const results = runCases();
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.length - passCount;

  console.log("=== stage progression tester ===");
  results.forEach((row) => console.log(`- ${row.status} ${row.name}`));
  console.log(`summary: total=${results.length}, pass=${passCount}, fail=${failCount}`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main();
