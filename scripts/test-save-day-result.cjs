const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const { writeSourceDayResult } = await import("../server/src/asset-write-service.js");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jpc-save-day-result-test-"));
  const filePath = path.join(tempDir, "combined.json");
  const fixture = {
    format: "combined",
    days: [
      {
        day: [
          {
            stage: 1,
            stageCompleteDate: null,
            nextReviewDate: "2026-08-25",
            lastAttemptDate: "2026-08-24",
            items: [
              { lastResult: "NEUTRAL" },
              { lastResult: "NEUTRAL" },
            ],
          },
        ],
      },
    ],
  };

  fs.writeFileSync(filePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  try {
    await writeSourceDayResult(filePath, {
      unitPath: "0",
      dayIndex: 0,
      items: [
        { itemIndex: 0, lastResult: "PASS" },
        { itemIndex: 1, lastResult: "FAIL" },
      ],
      day: {
        stage: 2,
        stageCompleteDate: "2026-08-25",
        nextReviewDate: "2026-08-26",
        lastAttemptDate: "2026-08-25",
      },
    });

    const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const savedDay = saved.days[0].day[0];
    assert.equal(savedDay.stage, 2);
    assert.equal(savedDay.stageCompleteDate, "2026-08-25");
    assert.equal(savedDay.nextReviewDate, "2026-08-26");
    assert.equal(savedDay.lastAttemptDate, "2026-08-25");
    assert.equal(savedDay.items[0].lastResult, "PASS");
    assert.equal(savedDay.items[1].lastResult, "FAIL");

    const beforeFailedWrite = fs.readFileSync(filePath, "utf8");
    await assert.rejects(
      writeSourceDayResult(filePath, {
        unitPath: "0",
        dayIndex: 0,
        items: [
          { itemIndex: 0, lastResult: "FAIL" },
          { itemIndex: 99, lastResult: "PASS" },
        ],
        day: {
          stage: 3,
          stageCompleteDate: "2026-08-25",
          nextReviewDate: null,
          lastAttemptDate: "2026-08-25",
        },
      }),
      /Target item not found: 99/,
    );
    assert.equal(fs.readFileSync(filePath, "utf8"), beforeFailedWrite);

    console.log("save-day-result tests: PASS");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
