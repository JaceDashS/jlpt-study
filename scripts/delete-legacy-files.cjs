const fs = require("fs");
const path = require("path");

const files = [
  "src/App.jsx",
  "src/components/EditorControls.jsx",
  "src/components/HomePage.jsx",
  "src/components/session/ProblemEditorPane.jsx",
  "src/components/session/QuizPane.jsx",
  "src/components/SessionPanel.jsx",
  "src/components/UnitsPage.jsx",
  "src/data/initialState.js",
  "src/data/storage.js",
  "src/domain/constants.js",
  "src/domain/curriculumSource.js",
  "src/domain/date.js",
  "src/domain/dayClipboard.js",
  "src/domain/markdown.js",
  "src/domain/problem.js",
  "src/domain/progressActions.js",
  "src/domain/renderers.jsx",
  "src/domain/sessionController.js",
  "src/domain/sourcePersistence.js",
  "src/domain/srs.js",
  "src/domain/studyHelpers.js",
  "src/main.jsx",
];

let hasError = false;
const failedFiles = [];

for (const relativeFile of files) {
  const filePath = path.resolve(process.cwd(), relativeFile);

  if (!fs.existsSync(filePath)) {
    console.log(`MISSING  ${relativeFile}`);
    continue;
  }

  try {
    fs.rmSync(filePath, { force: true });
    console.log(`DELETED  ${relativeFile}`);
  } catch (error) {
    hasError = true;
    failedFiles.push(relativeFile);
    const message = error && error.message ? error.message : String(error);
    console.error(`FAILED   ${relativeFile}`);
    console.error(`         ${message}`);
  }
}

if (hasError) {
  console.error("");
  console.error("Some files could not be deleted due to permission limits.");
  console.error("Please run cleanup manually from your own terminal session with sufficient permissions.");
  console.error("Manual cleanup targets:");
  failedFiles.forEach((file) => console.error(`- ${file}`));
  process.exitCode = 1;
}
