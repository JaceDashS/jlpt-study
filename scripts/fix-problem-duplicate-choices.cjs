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

function isStudyJson(root) {
  return !!root && typeof root === "object" && Array.isArray(root.days);
}

function normalizeDays(root) {
  if (Array.isArray(root?.days)) return root.days;
  if (Array.isArray(root)) return root;
  return [];
}

function isTargetChapterFile(relPath) {
  return relPath.includes("\uC81C1\uC7A5") || relPath.includes("\uC81C2\uC7A5");
}

function isKanaOnly(text) {
  return /^[\u3041-\u3096\u30A1-\u30FA\u30FC]+$/.test(String(text || ""));
}

function getWord(item) {
  return String(item?.expression ?? item?.word ?? item?.kanji ?? "").trim();
}

function toHiragana(text) {
  return [...String(text || "")]
    .map((ch) => {
      const cp = ch.charCodeAt(0);
      if (cp >= 0x30a1 && cp <= 0x30f6) return String.fromCharCode(cp - 0x60);
      return ch;
    })
    .join("");
}

function isHiragana(ch) {
  return /[\u3041-\u3096]/.test(ch);
}

function extractRequiredChars(target) {
  return [...String(target || "")].filter(isHiragana);
}

function containsAllChars(text, requiredChars) {
  const chars = [...String(text || "")];
  return requiredChars.every((char) => chars.includes(char));
}

function fixStringByChars(text, requiredChars) {
  let out = String(text || "");
  for (const ch of requiredChars) {
    if (![...out].includes(ch)) out += ch;
  }
  return out;
}

function levenshtein(a, b) {
  const aa = [...String(a || "")];
  const bb = [...String(b || "")];
  const dp = Array.from({ length: aa.length + 1 }, () => Array(bb.length + 1).fill(0));
  for (let i = 0; i <= aa.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= bb.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= aa.length; i += 1) {
    for (let j = 1; j <= bb.length; j += 1) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[aa.length][bb.length];
}

function stableIndex(seed, modulo) {
  const s = String(seed || "");
  if (!s || modulo <= 0) return 0;
  let acc = 0;
  for (const ch of s) acc = (acc + ch.charCodeAt(0)) % 2147483647;
  return acc % modulo;
}

function buildReadingFromItem(item) {
  const direct = String(item?.reading || "").trim();
  if (direct && isKanaOnly(direct)) return direct;

  if (Array.isArray(item?.tokens) && item.tokens.length > 0) {
    const tokenReading = item.tokens
      .map((token) => String(token?.reading || "").trim())
      .filter(Boolean)
      .join("");
    if (tokenReading && isKanaOnly(tokenReading)) return tokenReading;
  }

  const word = getWord(item);
  const readingParts = item?.readingParts;
  if (!word || !readingParts || typeof readingParts !== "object") return "";
  const map = readingParts.kanjiToKana && typeof readingParts.kanjiToKana === "object" ? readingParts.kanjiToKana : {};
  let out = "";
  for (const ch of [...word]) {
    if (typeof map[ch] === "string" && map[ch]) out += map[ch];
    else if (isKanaOnly(ch)) out += ch;
  }
  if (typeof readingParts.restKana === "string" && readingParts.restKana) out += readingParts.restKana;
  return isKanaOnly(out) ? out : "";
}

function hasDuplicateChoices(choices) {
  const counts = new Map();
  for (const raw of choices) {
    const value = String(raw ?? "").trim();
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 2) return true;
  }
  return false;
}

function chooseDistractors(answer, itemId, requiredChars, readingPool) {
  const answerH = toHiragana(answer);
  const candidates = [];
  for (const reading of readingPool) {
    if (reading === answer) continue;
    if (!containsAllChars(reading, requiredChars)) continue;
    const readingH = toHiragana(reading);
    candidates.push({
      reading,
      distance: levenshtein(answerH, readingH),
      lenGap: Math.abs(answerH.length - readingH.length),
    });
  }

  candidates.sort((a, b) => a.distance - b.distance || a.lenGap - b.lenGap || a.reading.localeCompare(b.reading, "ja"));

  const picked = [];
  for (const cand of candidates) {
    if (picked.includes(cand.reading)) continue;
    picked.push(cand.reading);
    if (picked.length === 3) break;
  }
  if (picked.length < 3) return [];

  const out = picked.slice(0, 3);
  const correctIndex = stableIndex(itemId || answer, 4);
  out.splice(correctIndex, 0, answer);
  return out;
}

function chooseAnyDistractors(answer, itemId, readingPool) {
  const answerH = toHiragana(answer);
  const candidates = [];
  for (const reading of readingPool) {
    if (reading === answer) continue;
    const readingH = toHiragana(reading);
    candidates.push({
      reading,
      distance: levenshtein(answerH, readingH),
      lenGap: Math.abs(answerH.length - readingH.length),
    });
  }
  candidates.sort((a, b) => a.distance - b.distance || a.lenGap - b.lenGap || a.reading.localeCompare(b.reading, "ja"));
  const picked = [];
  for (const cand of candidates) {
    if (picked.includes(cand.reading)) continue;
    picked.push(cand.reading);
    if (picked.length === 3) break;
  }
  if (picked.length < 3) return [];
  const out = picked.slice(0, 3);
  const correctIndex = stableIndex(itemId || answer, 4);
  out.splice(correctIndex, 0, answer);
  return out;
}

function validateFile(filePath, cwd) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (raw.includes("\uFFFD")) {
    throw new Error(`Detected replacement character in ${path.relative(cwd, filePath)}`);
  }
  const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  JSON.parse(normalized);
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
  const targetFiles = files.filter((f) => isTargetChapterFile(path.relative(cwd, f)));

  const readingPoolSet = new Set();
  for (const filePath of targetFiles) {
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    } catch {
      continue;
    }
    if (!isStudyJson(parsed)) continue;
    for (const day of normalizeDays(parsed)) {
      for (const item of day?.items || []) {
        const reading = buildReadingFromItem(item);
        if (reading && isKanaOnly(reading) && reading.length >= 2) readingPoolSet.add(reading);
        const answer = String(item?.problem?.answer || "").trim();
        if (isKanaOnly(answer) && answer.length >= 2) readingPoolSet.add(answer);
      }
    }
  }
  const readingPool = [...readingPoolSet];
  const choiceBank = new Map();

  for (const filePath of targetFiles) {
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    } catch {
      continue;
    }
    if (!isStudyJson(parsed)) continue;
    for (const day of normalizeDays(parsed)) {
      for (const item of day?.items || []) {
        const p = item?.problem;
        if (!p || typeof p !== "object") continue;
        if (!Array.isArray(p.choices) || p.choices.length !== 4) continue;
        if (hasDuplicateChoices(p.choices)) continue;
        const answer = String(p.answer || "").trim();
        const choices = p.choices.map((c) => String(c || "").trim());
        if (!choices.includes(answer)) continue;
        if (!choices.every((c) => isKanaOnly(c) && c.length >= 2)) continue;
        if (!isKanaOnly(answer) || answer.length < 2) continue;
        const target = String(p.target || getWord(item) || "").trim();
        const keyExact = `${target}|||${answer}`;
        const keyTarget = `${target}|||*`;
        if (!choiceBank.has(keyExact)) choiceBank.set(keyExact, []);
        if (!choiceBank.has(keyTarget)) choiceBank.set(keyTarget, []);
        choiceBank.get(keyExact).push(choices);
        choiceBank.get(keyTarget).push(choices);
      }
    }
  }

  let scannedProblems = 0;
  let duplicateProblems = 0;
  let fixedProblems = 0;
  let unresolvedProblems = 0;

  for (const filePath of targetFiles) {
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      parsed = JSON.parse(normalized);
    } catch (error) {
      console.error("[PARSE_ERROR]", path.relative(cwd, filePath), String(error?.message || error));
      continue;
    }
    if (!isStudyJson(parsed)) continue;

    const days = normalizeDays(parsed);
    for (const day of days) {
      const items = Array.isArray(day?.items) ? day.items : [];
      for (const item of items) {
        const problem = item?.problem;
        if (!problem || typeof problem !== "object") continue;
        if (!Array.isArray(problem.choices) || problem.choices.length === 0) continue;
        scannedProblems += 1;

        if (!hasDuplicateChoices(problem.choices)) continue;
        duplicateProblems += 1;

        const target = String(problem.target || getWord(item) || "").trim();
        const requiredChars = [...new Set(extractRequiredChars(target))];
        const itemReading = buildReadingFromItem(item);
        const currentAnswer = String(problem.answer || "").trim();
        const preferredAnswer = itemReading && isKanaOnly(itemReading) ? itemReading : currentAnswer;

        if (!preferredAnswer || !isKanaOnly(preferredAnswer) || preferredAnswer.length < 2) {
          unresolvedProblems += 1;
          continue;
        }
        if (!containsAllChars(preferredAnswer, requiredChars)) {
          unresolvedProblems += 1;
          continue;
        }

        const nextChoices = chooseDistractors(preferredAnswer, item?.id, requiredChars, readingPool);
        let resolvedChoices = nextChoices;
        if (resolvedChoices.length !== 4) {
          const keyExact = `${target}|||${preferredAnswer}`;
          const keyTarget = `${target}|||*`;
          const borrowed = (choiceBank.get(keyExact) || []).concat(choiceBank.get(keyTarget) || []);
          const picked = borrowed.find((choices) => {
            if (!Array.isArray(choices) || choices.length !== 4) return false;
            if (!choices.includes(preferredAnswer)) return false;
            if (hasDuplicateChoices(choices)) return false;
            return choices.every((c) => containsAllChars(c, requiredChars));
          });
          if (picked) {
            resolvedChoices = picked.slice();
          }
        }
        if (resolvedChoices.length !== 4) {
          const fallback = chooseAnyDistractors(preferredAnswer, item?.id, readingPool);
          if (fallback.length === 4) {
            const normalized = fallback.map((choice) => fixStringByChars(choice, requiredChars));
            if (!hasDuplicateChoices(normalized)) {
              resolvedChoices = normalized;
            }
          }
        }
        if (resolvedChoices.length !== 4) {
          unresolvedProblems += 1;
          continue;
        }

        problem.choices = resolvedChoices;
        problem.answer = preferredAnswer;

        fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
        validateFile(filePath, cwd);
        fixedProblems += 1;
      }
    }
  }

  console.log("=== duplicate choices auto-fix report (chapter 1 & 2) ===");
  console.log(`scannedProblems: ${scannedProblems}`);
  console.log(`duplicateProblems: ${duplicateProblems}`);
  console.log(`fixedProblems: ${fixedProblems}`);
  console.log(`unresolvedProblems: ${unresolvedProblems}`);
}

run();

