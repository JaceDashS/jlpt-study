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

function getDisplayDay(day, indexZeroBased) {
  const value = Number(day?.day);
  if (Number.isFinite(value)) return value;
  const idx = Number(day?.dayIndex);
  if (Number.isFinite(idx)) return idx;
  return indexZeroBased + 1;
}

function levenshtein(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  const m = s.length;
  const n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function isKana(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x3040 && code <= 0x309f) || // hiragana
    (code >= 0x30a0 && code <= 0x30ff) // katakana
  );
}

const KANA_ALT = {
  あ: "お", い: "え", う: "お", え: "い", お: "あ",
  か: "た", き: "ち", く: "つ", け: "て", こ: "と",
  さ: "た", し: "ち", す: "つ", せ: "て", そ: "と",
  た: "か", ち: "き", つ: "く", て: "け", と: "こ",
  な: "ま", に: "み", ぬ: "む", ね: "め", の: "も",
  は: "か", ひ: "き", ふ: "く", へ: "け", ほ: "こ",
  ま: "な", み: "に", む: "ぬ", め: "ね", も: "の",
  や: "ら", ゆ: "る", よ: "ろ",
  ら: "や", り: "ゆ", る: "ゆ", れ: "ね", ろ: "よ",
  わ: "ら", を: "よ", ん: "む",
  が: "だ", ぎ: "ぢ", ぐ: "づ", げ: "で", ご: "ど",
  ざ: "だ", じ: "ぢ", ず: "づ", ぜ: "で", ぞ: "ど",
  だ: "が", ぢ: "ぎ", づ: "ぐ", で: "げ", ど: "ご",
  ば: "が", び: "ぎ", ぶ: "ぐ", べ: "げ", ぼ: "ご",
  ぱ: "か", ぴ: "き", ぷ: "く", ぺ: "け", ぽ: "こ",
  ア: "オ", イ: "エ", ウ: "オ", エ: "イ", オ: "ア",
  カ: "タ", キ: "チ", ク: "ツ", ケ: "テ", コ: "ト",
  サ: "タ", シ: "チ", ス: "ツ", セ: "テ", ソ: "ト",
  タ: "カ", チ: "キ", ツ: "ク", テ: "ケ", ト: "コ",
  ナ: "マ", ニ: "ミ", ヌ: "ム", ネ: "メ", ノ: "モ",
  ハ: "カ", ヒ: "キ", フ: "ク", ヘ: "ケ", ホ: "コ",
  マ: "ナ", ミ: "ニ", ム: "ヌ", メ: "ネ", モ: "ノ",
  ヤ: "ラ", ユ: "ル", ヨ: "ロ",
  ラ: "ヤ", リ: "ユ", ル: "ユ", レ: "ネ", ロ: "ヨ",
  ワ: "ラ", ヲ: "ヨ", ン: "ム",
  ガ: "ダ", ギ: "ヂ", グ: "ヅ", ゲ: "デ", ゴ: "ド",
  ザ: "ダ", ジ: "ヂ", ズ: "ヅ", ゼ: "デ", ゾ: "ド",
  ダ: "ガ", ヂ: "ギ", ヅ: "グ", デ: "ゲ", ド: "ゴ",
  バ: "ガ", ビ: "ギ", ブ: "グ", ベ: "ゲ", ボ: "ゴ",
  パ: "カ", ピ: "キ", プ: "ク", ペ: "ケ", ポ: "コ",
};

function replaceAt(text, index, ch) {
  return `${text.slice(0, index)}${ch}${text.slice(index + 1)}`;
}

function findKanaIndexes(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    if (isKana(text[i])) out.push(i);
  }
  return out;
}

function sanitizeDuplicateTail(text) {
  if (!text) return text;
  if (text.length >= 2 && text[text.length - 1] === text[text.length - 2]) {
    return text.slice(0, -1);
  }
  return text;
}

function buildCandidate(answer, original, choices) {
  let candidate = sanitizeDuplicateTail(original.trim());
  if (!candidate) candidate = original;

  const taken = new Set(choices.map((c) => String(c ?? "").trim()));
  const tryList = [];
  const kanaIndexes = findKanaIndexes(candidate);
  const pivotIndexes = kanaIndexes.length > 0 ? kanaIndexes : [0];

  for (const idx of pivotIndexes.slice(0, 3)) {
    const from = candidate[idx];
    const alt = KANA_ALT[from];
    if (!alt || alt === from) continue;
    tryList.push(replaceAt(candidate, idx, alt));
  }

  if (candidate.length > 1) {
    tryList.push(candidate.slice(1));
  }
  tryList.push(`べつ${candidate}`);

  for (const next of tryList) {
    const v = String(next ?? "").trim();
    if (!v) continue;
    if (v === answer) continue;
    if (v.startsWith(answer)) continue;
    if (taken.has(v)) continue;
    return v;
  }

  let fallback = candidate;
  if (fallback.startsWith(answer) || fallback === answer || taken.has(fallback)) {
    fallback = `べつ${candidate}`;
  }
  return fallback;
}

function shouldFix(answer, choice) {
  if (!answer || !choice) return false;
  if (choice === answer) return false;
  if (!choice.startsWith(answer)) return false;
  const d = levenshtein(answer, choice);
  return d <= 2;
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
  const changes = [];
  let changedFiles = 0;

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

    const days = normalizeDays(parsed);
    let dirty = false;

    for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
      const day = days[dayIndex];
      const items = Array.isArray(day?.items) ? day.items : [];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const item = items[itemIndex];
        const problem = item?.problem;
        if (!problem || typeof problem !== "object") continue;
        if (!Array.isArray(problem.choices) || problem.choices.length === 0) continue;

        const answer = String(problem.answer ?? "").trim();
        if (!answer) continue;

        for (let c = 0; c < problem.choices.length; c += 1) {
          const original = String(problem.choices[c] ?? "").trim();
          if (!shouldFix(answer, original)) continue;

          const next = buildCandidate(answer, original, problem.choices);
          if (!next || next === original) continue;

          problem.choices[c] = next;
          dirty = true;
          changes.push({
            file: path.relative(cwd, filePath),
            day: getDisplayDay(day, dayIndex),
            id: item?.id ?? "(no-id)",
            index: Number.isFinite(item?.index) ? item.index : itemIndex + 1,
            choiceIndex: c + 1,
            before: original,
            after: next,
          });
        }
      }
    }

    if (dirty) {
      fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      changedFiles += 1;
    }
  }

  console.log("=== fix problem cheat pattern ===");
  console.log(`changedFiles: ${changedFiles}`);
  console.log(`fixedChoices: ${changes.length}`);
  if (changes.length > 0) {
    console.log("");
    console.log("[Changes]");
    for (const row of changes) {
      console.log(`- file: ${row.file}`);
      console.log(`  day: ${row.day}, index: ${row.index}, id: ${row.id}`);
      console.log(`  choiceIndex(1-based): ${row.choiceIndex}`);
      console.log(`  before: ${row.before}`);
      console.log(`  after: ${row.after}`);
      console.log("");
    }
  }
}

run();
