#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function walkJsonFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsonFiles(full, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) out.push(full);
  }
  return out;
}

function isTargetStudyJson(root) {
  return !!root && typeof root === "object" && Array.isArray(root.days);
}

function normalizeDays(root) {
  if (Array.isArray(root?.days)) return root.days;
  if (Array.isArray(root)) return root;
  return [];
}

function isKanaOnly(text) {
  return /^[\u3041-\u3096\u30A1-\u30FA\u30FC]+$/.test(String(text || ""));
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

function stableIndex(seed, modulo) {
  const s = String(seed || "");
  if (!s || modulo <= 0) return 0;
  let acc = 0;
  for (const ch of s) acc = (acc + ch.charCodeAt(0)) % 2147483647;
  return acc % modulo;
}

function getWord(item) {
  return String(item?.expression ?? item?.word ?? item?.kanji ?? "").trim();
}

function buildReading(item) {
  const direct = stripDigits(toHiragana(tryFixMojibake(String(item?.reading || "").trim())));
  if (direct && isKanaOnly(direct)) return direct;

  if (Array.isArray(item?.tokens)) {
    const fromTokens = item.tokens
      .map((t) => stripDigits(toHiragana(tryFixMojibake(String(t?.reading || "").trim()))))
      .filter(Boolean)
      .join("");
    if (fromTokens && isKanaOnly(fromTokens)) return fromTokens;
  }

  return "";
}

function buildMeaning(item) {
  return stripDigits(tryFixMojibake(String(item?.meaningKo || "").trim()));
}

function run() {
  const cwd = process.cwd();
  const assetRoot = path.join(cwd, "asset");
  const files = walkJsonFiles(assetRoot, []);

  const readingPool = new Set();
  const meaningPool = new Set();

  for (const file of files) {
    let json;
    try {
      const raw = fs.readFileSync(file, "utf8");
      const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      json = JSON.parse(normalized);
    } catch {
      continue;
    }
    if (!isTargetStudyJson(json)) continue;
    for (const day of normalizeDays(json)) {
      for (const item of day.items ?? []) {
        const reading = buildReading(item);
        if (reading) readingPool.add(reading);
        const meaning = buildMeaning(item);
        if (meaning && /[ê°€-íž£]/.test(meaning)) meaningPool.add(meaning);
      }
    }
  }

  const readingList = [...readingPool];
  const meaningList = [...meaningPool];
  let generated = 0;
  let unresolved = 0;

  for (const file of files) {
    let json;
    try {
      const raw = fs.readFileSync(file, "utf8");
      const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      json = JSON.parse(normalized);
    } catch {
      continue;
    }
    if (!isTargetStudyJson(json)) continue;

    let dirty = false;
    for (const day of normalizeDays(json)) {
      for (const item of day.items ?? []) {
        if (item?.problem && typeof item.problem === "object") continue;

        const reading = buildReading(item);
        if (reading) {
          const distractors = readingList.filter((r) => r !== reading).slice(0, 3);
          if (distractors.length === 3) {
            const choices = distractors.slice(0, 3);
            choices.splice(stableIndex(item?.id || reading, 4), 0, reading);
            const target = tryFixMojibake(getWord(item)) || reading;
            item.problem = {
              sentence: `${target}ì˜ ì½ëŠ” ë²•ìœ¼ë¡œ ê°€ìž¥ ì ì ˆí•œ ê²ƒì„ ê³ ë¥´ì„¸ìš”.`,
              target,
              choices,
              answer: reading,
            };
            generated += 1;
            dirty = true;
            continue;
          }
        }

        const meaning = buildMeaning(item);
        if (meaning && /[ê°€-íž£]/.test(meaning)) {
          const distractors = meaningList.filter((m) => m !== meaning).slice(0, 3);
          while (distractors.length < 3) {
            const fallback = ["ë¬¸ë§¥ìƒ ë§žì§€ ì•ŠëŠ” ì˜ë¯¸", "ë°˜ëŒ€ ì˜ë¯¸", "ê´€ë ¨ ì—†ëŠ” ì˜ë¯¸"][distractors.length];
            if (!distractors.includes(fallback) && fallback !== meaning) distractors.push(fallback);
          }
          if (distractors.length === 3) {
            const choices = distractors.slice(0, 3);
            choices.splice(stableIndex(item?.id || meaning, 4), 0, meaning);
            const target = tryFixMojibake(String(getWord(item) || item?.reading || "ì´ í‘œí˜„").trim());
            item.problem = {
              sentence: `${target}ì˜ ì˜ë¯¸ë¡œ ê°€ìž¥ ì ì ˆí•œ ê²ƒì„ ê³ ë¥´ì„¸ìš”.`,
              target,
              choices,
              answer: meaning,
            };
            generated += 1;
            dirty = true;
            continue;
          }
        }

        const fallbackTarget = String(getWord(item) || item?.id || "ì´ í‘œí˜„").trim() || "ì´ í‘œí˜„";
        item.problem = {
          sentence: `${fallbackTarget}ì— ëŒ€í•œ ì„¤ëª…ìœ¼ë¡œ ê°€ìž¥ ì ì ˆí•œ ê²ƒì„ ê³ ë¥´ì„¸ìš”.`,
          target: fallbackTarget,
          choices: ["ë¬¸ë§¥ì— ê°€ìž¥ ìž˜ ë§žëŠ” í‘œí˜„", "ë¬¸ë§¥ìƒ ì–´ìƒ‰í•œ í‘œí˜„", "ì˜ë¯¸ê°€ ë°˜ëŒ€ì¸ í‘œí˜„", "ì£¼ì œì™€ ë¬´ê´€í•œ í‘œí˜„"],
          answer: "ë¬¸ë§¥ì— ê°€ìž¥ ìž˜ ë§žëŠ” í‘œí˜„",
        };
        generated += 1;
        dirty = true;
      }
    }

    if (dirty) {
      fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    }
  }

  console.log("=== fix missing problems report ===");
  console.log(`generated: ${generated}`);
  console.log(`unresolved: ${unresolved}`);
}

run();

