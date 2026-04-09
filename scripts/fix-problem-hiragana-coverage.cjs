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

function isHiragana(char) {
  return /[\u3041-\u3096]/.test(char);
}

function extractRequiredChars(target) {
  return [...String(target || "")].filter(isHiragana);
}

function extractRequiredSeqs(target) {
  return String(target || "").match(/[\u3041-\u3096]+/g) || [];
}

function containsAllChars(text, requiredChars) {
  const chars = [...String(text || "")];
  return requiredChars.every((char) => chars.includes(char));
}

function uniqueInOrder(chars) {
  const seen = new Set();
  const out = [];
  for (const ch of chars) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}

function isKanaOnly(text) {
  return /^[\u3041-\u3096\u30A1-\u30FA\u30FC]+$/.test(String(text || ""));
}

function hasNonHiragana(text) {
  return /[^\u3041-\u3096]/.test(String(text || ""));
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

function getWord(item) {
  return String(item?.expression ?? item?.word ?? item?.kanji ?? "").trim();
}

function tryFixMojibake(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  const allSingleByte = [...text].every((char) => char.charCodeAt(0) <= 255);
  if (!allSingleByte) return text;
  try {
    const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
    const repaired = new TextDecoder("utf-8").decode(bytes);
    return /[ê°€-íž£ã-ã‚–ã‚¡-ãƒºä¸€-é¾¯]/.test(repaired) ? repaired : text;
  } catch {
    return text;
  }
}

function stripDigits(text) {
  return String(text ?? "").replace(/[0-9ï¼-ï¼™]+/g, "").trim();
}

function isMeaningfulKorean(text) {
  return /[ê°€-íž£]/.test(String(text ?? ""));
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

function fixString(text, target) {
  let fixed = String(text || "");
  const requiredChars = extractRequiredChars(target);
  if (requiredChars.length === 0) return fixed;

  const requiredSeqs = extractRequiredSeqs(target);
  const trailingSeq = requiredSeqs.length > 0 ? requiredSeqs[requiredSeqs.length - 1] : "";

  if (trailingSeq && target.endsWith(trailingSeq) && !fixed.includes(trailingSeq) && /[\u3041-\u3096]+$/.test(fixed)) {
    fixed = fixed.replace(/[\u3041-\u3096]+$/, trailingSeq);
  }

  for (const seq of requiredSeqs) {
    if (!seq) continue;
    if (!fixed.includes(seq)) fixed += seq;
  }

  const requiredUnique = uniqueInOrder(requiredChars);
  for (const ch of requiredUnique) {
    if (![...fixed].includes(ch)) fixed += ch;
  }

  return fixed;
}

function buildReadingFromItem(item) {
  const direct = stripDigits(toHiragana(tryFixMojibake(String(item?.reading || "").trim())));
  if (direct && isKanaOnly(direct)) return direct;

  if (Array.isArray(item?.tokens) && item.tokens.length > 0) {
    const tokenReading = item.tokens
      .map((token) => stripDigits(toHiragana(tryFixMojibake(String(token?.reading || "").trim()))))
      .filter(Boolean)
      .join("");
    if (tokenReading && isKanaOnly(tokenReading)) return tokenReading;
  }

  const word = tryFixMojibake(getWord(item));
  const readingParts = item?.readingParts;
  if (!word || !readingParts || typeof readingParts !== "object") return "";
  const map = readingParts.kanjiToKana && typeof readingParts.kanjiToKana === "object" ? readingParts.kanjiToKana : {};
  let out = "";
  for (const ch of [...word]) {
    if (typeof map[ch] === "string" && map[ch]) {
      out += map[ch];
    } else if (isKanaOnly(ch)) {
      out += ch;
    }
  }
  if (typeof readingParts.restKana === "string" && readingParts.restKana) {
    out += stripDigits(toHiragana(tryFixMojibake(readingParts.restKana)));
  }
  return isKanaOnly(out) ? out : "";
}

function validateFileUtf8(filePath, cwd) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (raw.includes("\uFFFD")) {
    throw new Error(`Detected replacement character in file: ${path.relative(cwd, filePath)}`);
  }
  const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  JSON.parse(normalized);
}

function isMeaningfulItem(item) {
  if (!item || typeof item !== "object") return false;
  const kanji = getWord(item);
  const reading = String(item.reading || "").trim();
  const meaningKo = String(item.meaningKo || "").trim();
  const tokens = Array.isArray(item.tokens) ? item.tokens : [];
  return !!(kanji || reading || meaningKo || tokens.length > 0);
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
  let touchedItems = 0;
  let touchedChoices = 0;
  let touchedAnswers = 0;
  let generatedProblems = 0;
  let unresolvedMissing = 0;
  let parseErrorCount = 0;

  const readingPoolSet = new Set();
  for (const filePath of files) {
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    } catch {
      continue;
    }
    if (!isTargetStudyJson(parsed)) continue;
    for (const day of normalizeDays(parsed)) {
      const items = Array.isArray(day?.items) ? day.items : [];
      for (const item of items) {
        const reading = buildReadingFromItem(item);
        if (reading) readingPoolSet.add(reading);
        const answer = String(item?.problem?.answer || "");
        if (answer && isKanaOnly(answer)) readingPoolSet.add(answer);
      }
    }
  }
  const readingPool = [...readingPoolSet];
  const meaningPoolSet = new Set();
  for (const filePath of files) {
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    } catch {
      continue;
    }
    if (!isTargetStudyJson(parsed)) continue;
    for (const day of normalizeDays(parsed)) {
      const items = Array.isArray(day?.items) ? day.items : [];
      for (const item of items) {
        const meaning = stripDigits(tryFixMojibake(String(item?.meaningKo || "").trim()));
        if (meaning && isMeaningfulKorean(meaning)) meaningPoolSet.add(meaning);
      }
    }
  }
  const meaningPool = [...meaningPoolSet];

  function chooseDistractors(answer, itemId) {
    const ansH = toHiragana(answer);
    const candidates = [];
    for (const reading of readingPool) {
      if (reading === answer) continue;
      const readingH = toHiragana(reading);
      candidates.push({
        reading,
        distance: levenshtein(ansH, readingH),
        lenGap: Math.abs(ansH.length - readingH.length),
      });
    }

    candidates.sort((a, b) => a.distance - b.distance || a.lenGap - b.lenGap || a.reading.localeCompare(b.reading, "ja"));

    const chosen = [];
    for (const cand of candidates) {
      if (chosen.includes(cand.reading)) continue;
      chosen.push(cand.reading);
      if (chosen.length === 3) break;
    }

    if (chosen.length < 3) return [];

    const result = chosen.slice(0, 3);
    const correctIndex = stableIndex(itemId || answer, 4);
    result.splice(correctIndex, 0, answer);
    return result;
  }

  function chooseMeaningChoices(answerMeaning, itemId) {
    const cleanAnswer = stripDigits(tryFixMojibake(String(answerMeaning || "").trim()));
    if (!cleanAnswer) return [];
    const candidates = meaningPool.filter((m) => m !== cleanAnswer && !/[0-9ï¼-ï¼™]/.test(m));
    candidates.sort((a, b) => a.length - b.length || a.localeCompare(b, "ko"));
    const picked = candidates.slice(0, 3);
    const fallback = ["ë¬¸ë§¥ìƒ ë§žì§€ ì•ŠëŠ” ì˜ë¯¸", "ë°˜ëŒ€ ì˜ë¯¸", "ê´€ë ¨ ì—†ëŠ” ì˜ë¯¸"];
    for (const row of fallback) {
      if (picked.length >= 3) break;
      if (row !== cleanAnswer && !picked.includes(row)) picked.push(row);
    }
    if (picked.length < 3) return [];

    const choices = picked.slice(0, 3);
    const correctIndex = stableIndex(itemId || cleanAnswer, 4);
    choices.splice(correctIndex, 0, cleanAnswer);
    return choices;
  }

  for (const filePath of files) {
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      parsed = JSON.parse(normalized);
    } catch (error) {
      parseErrorCount += 1;
      console.error("[PARSE_ERROR]", path.relative(cwd, filePath), String(error?.message || error));
      continue;
    }
    if (!isTargetStudyJson(parsed)) continue;

    const days = normalizeDays(parsed);
    for (const day of days) {
      const items = Array.isArray(day?.items) ? day.items : [];
      for (const item of items) {
        let itemChanged = false;

        if (!item?.problem || typeof item.problem !== "object") {
          const reading = buildReadingFromItem(item);
          const choices = reading ? chooseDistractors(reading, item?.id) : [];
          if (reading && choices.length === 4) {
            const target = getWord(item);
            item.problem = {
              sentence: `${target || "ã“ã®èªž"}ã®èª­ã¿æ–¹ã¨ã—ã¦æœ€ã‚‚é©åˆ‡ãªã‚‚ã®ã‚’é¸ã³ãªã•ã„ã€‚`,
              target: target || String(item?.reading || "").trim(),
              choices,
              answer: reading,
            };
            generatedProblems += 1;
            touchedItems += 1;
            itemChanged = true;
          } else if (isMeaningfulItem(item)) {
            unresolvedMissing += 1;
          }
        }

        const problem = item?.problem;
        if (!problem || typeof problem !== "object") {
          if (itemChanged) {
            fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
            validateFileUtf8(filePath, cwd);
          }
          continue;
        }

        if (Array.isArray(problem.choices) && problem.choices.length > 0 && problem.choices.every(isKanaOnly) && isKanaOnly(problem.answer) && hasNonHiragana(problem.target)) {
          const requiredChars = extractRequiredChars(problem.target);
          if (requiredChars.length > 0) {
            for (let i = 0; i < problem.choices.length; i += 1) {
              const choice = String(problem.choices[i] ?? "");
              if (containsAllChars(choice, requiredChars)) continue;
              const next = fixString(choice, String(problem.target || ""));
              if (next !== choice) {
                problem.choices[i] = next;
                touchedChoices += 1;
                itemChanged = true;
              }
            }

            const answer = String(problem.answer ?? "");
            if (!containsAllChars(answer, requiredChars)) {
              const nextAnswer = fixString(answer, String(problem.target || ""));
              if (nextAnswer !== answer) {
                problem.answer = nextAnswer;
                touchedAnswers += 1;
                itemChanged = true;
              }
            }
          }
        }

        if (itemChanged) {
          fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
          validateFileUtf8(filePath, cwd);
        }
      }
    }
  }

  console.log("=== problem hiragana auto-fix report ===");
  console.log(`touchedItems: ${touchedItems}`);
  console.log(`touchedChoices: ${touchedChoices}`);
  console.log(`touchedAnswers: ${touchedAnswers}`);
  console.log(`generatedProblems: ${generatedProblems}`);
  console.log(`unresolvedMissing: ${unresolvedMissing}`);
  console.log(`parseErrorCount: ${parseErrorCount}`);

  if (parseErrorCount > 0) {
    process.exitCode = 2;
  }
}

run();

