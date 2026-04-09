#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require("child_process");

const checks = [
  "check:problem",
  "check:missing-meaning",
  "check:mojibake",
];

function runScript(name, forwardedArgs) {
  console.log(`\n=== ${name} ===`);
  const npmArgs = ["run", name];
  if (forwardedArgs.length > 0) {
    npmArgs.push("--", ...forwardedArgs);
  }
  const result = spawnSync("npm", npmArgs, {
    stdio: "inherit",
    shell: true,
  });
  return Number(result.status ?? 1);
}

function main() {
  const forwardedArgs = process.argv.slice(2);
  let failed = 0;
  for (const script of checks) {
    const code = runScript(script, forwardedArgs);
    if (code !== 0) {
      failed += 1;
      console.error(`[FAIL] ${script} (exit ${code})`);
    } else {
      console.log(`[PASS] ${script}`);
    }
  }

  console.log("\n=== check:quality summary ===");
  console.log(`total: ${checks.length}`);
  console.log(`failed: ${failed}`);
  console.log(`passed: ${checks.length - failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();

