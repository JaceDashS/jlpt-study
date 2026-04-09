#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ALLOWED_TYPES = new Set(["hiragana", "fill_blank", "usage_problem", "similar_expression"]);
const DEFAULT_ROOT = "asset";
const LAYER_SET = new Set(["structure", "consistency", "choices", "reading"]);
const SOURCE_FILE_BASENAMES = ["study.json"];

function parseArgs(argv) {
  const args = {
    layer: "structure",
    files: [],
    globs: [],
    maxDetails: 80,
    allowSrcBaseline: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--layer") {
      const next = argv[i + 1];
      if (next) {
        args.layer = next;
        i += 1;
      }
      continue;
    }
    if (arg === "--file") {
      const next = argv[i + 1];
      if (next) {
        args.files.push(next);
        i += 1;
      }
      continue;
    }
    if (arg === "--glob") {
      const next = argv[i + 1];
      if (next) {
        args.globs.push(next);
        i += 1;
      }
      continue;
    }
    if (arg === "--max-details") {
      const next = Number(argv[i + 1]);
      if (Number.isFinite(next) && next > 0) {
        args.maxDetails = Math.floor(next);
        i += 1;
      }
      continue;
    }
    if (arg === "--no-allow-src-baseline") {
      args.allowSrcBaseline = false;
      continue;
    }
  }
  return args;
}

function walkFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function globToRegExp(glob) {
  const normalized = String(glob || "").replaceAll("\\", "/");
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withStar = escaped.replace(/\\\*\\\*/g, "___DOUBLE_STAR___").replace(/\\\*/g, "[^/]*");
  const withDoubleStar = withStar.replace(/___DOUBLE_STAR___/g, ".*");
  return new RegExp(`^${withDoubleStar}$`);
}

function resolveTargetFiles({ file, glob, root }) {
  const cwd = process.cwd();
  const rootAbs = path.resolve(cwd, root || DEFAULT_ROOT);

  if (!fs.existsSync(rootAbs)) {
    throw new Error(`asset root not found: ${rootAbs}`);
  }

  const explicitFiles = Array.isArray(file) ? file : [];
  const explicitGlobs = Array.isArray(glob) ? glob : [];

  if (explicitFiles.length > 0) {
    const resolved = explicitFiles
      .map((v) => path.resolve(cwd, v))
      .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile())
      .filter((p) => path.basename(p).toLowerCase() === "study.json");
    return [...new Set(resolved)];
  }

  // Spec default: asset/**/study.json
  const byDir = new Map();
  walkFiles(rootAbs, [])
    .filter((p) => SOURCE_FILE_BASENAMES.includes(path.basename(p).toLowerCase()))
    .forEach((p) => {
      const dir = path.dirname(p);
      const existing = byDir.get(dir);
      if (!existing) {
        byDir.set(dir, p);
      }
    });
  const all = [...byDir.values()];
  if (explicitGlobs.length === 0) return all.sort();

  const patterns = explicitGlobs.map(globToRegExp);
  return all
    .filter((p) => {
      const rel = path.relative(cwd, p).replaceAll("\\", "/");
      return patterns.some((rx) => rx.test(rel));
    })
    .sort();
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(normalized);
}

function normalizeDays(root) {
  if (Array.isArray(root?.unitSteps)) return root.unitSteps;
  if (Array.isArray(root?.days)) return root.days;
  if (Array.isArray(root)) return root;
  return [];
}

function getDisplayDay(day, indexZeroBased) {
  const value = Number(day?.unitStep ?? day?.day);
  if (Number.isFinite(value)) return value;
  const idx = Number(day?.dayIndex);
  if (Number.isFinite(idx)) return idx;
  return indexZeroBased + 1;
}

function getExpression(item) {
  if (typeof item?.expression === "string" && item.expression.trim()) return item.expression.trim();
  if (typeof item?.kanji === "string" && item.kanji.trim()) return item.kanji.trim();
  if (typeof item?.word === "string" && item.word.trim()) return item.word.trim();
  return "";
}

function extractProblem(item) {
  if (item && typeof item === "object" && item.problem && typeof item.problem === "object") {
    return item.problem;
  }
  if (
    item &&
    typeof item === "object" &&
    Object.prototype.hasOwnProperty.call(item, "sentence") &&
    Object.prototype.hasOwnProperty.call(item, "choices") &&
    Object.prototype.hasOwnProperty.call(item, "answer")
  ) {
    return item;
  }
  return null;
}

function isKanaOnly(text) {
  return /^[\u3041-\u3096\u30A1-\u30FA\u30FC]+$/.test(String(text || "").trim());
}

function isHiragana(char) {
  return /[\u3041-\u3096]/.test(char);
}

function getLastChar(text) {
  const chars = [...String(text || "").trim()];
  return chars.length > 0 ? chars[chars.length - 1] : "";
}

function hasBlankMarker(sentence) {
  const s = String(sentence || "");
  return /_{2,}|\(\s*\)|\[\s*\]|［\s*］|（\s*）|[□■◯〇●]/.test(s);
}

function normalizeProblemAnswer(problem) {
  const choices = Array.isArray(problem?.choices) ? problem.choices.map((c) => String(c ?? "").trim()) : [];
  const raw = String(problem?.answer ?? "").trim();
  const labeled = raw.match(/^([1-9][0-9]*)\s*[:：]\s*(.+)$/);
  if (labeled) {
    const idx = Number(labeled[1]) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx];
    return String(labeled[2] || "").trim();
  }
  if (/^[1-9][0-9]*$/.test(raw)) {
    const idx = Number(raw) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx];
  }
  return raw;
}

function isLikelyUsageProblem(problem, normalizedAnswer) {
  const sentence = String(problem?.sentence ?? "").trim();
  const choices = Array.isArray(problem?.choices) ? problem.choices : [];
  const shortLemmaLike = sentence.length > 0 && sentence.length <= 12 && !/[。！？.!?]/.test(sentence) && !hasBlankMarker(sentence);
  const longSentenceLike = (value) => {
    const t = String(value || "").trim();
    return t.length >= 12 && /[。！？.!?]/.test(t);
  };
  const longChoiceCount = choices.filter((c) => longSentenceLike(c)).length;
  const mostlyLongChoices = choices.length > 0 && longChoiceCount >= Math.ceil(choices.length / 2);
  return shortLemmaLike && mostlyLongChoices && longSentenceLike(normalizedAnswer);
}

function classifyProblem(problem) {
  const explicit = String(problem?.problemType ?? "").trim();
  if (explicit) {
    if (ALLOWED_TYPES.has(explicit)) return explicit;
    return "unknown";
  }

  const hasCore = typeof problem?.sentence === "string" && Array.isArray(problem?.choices) && typeof problem?.answer === "string";
  if (!hasCore) return "unknown";

  const sentence = String(problem.sentence);
  const choices = problem.choices.map((v) => String(v ?? "").trim());
  const answerText = normalizeProblemAnswer(problem);

  if (hasBlankMarker(sentence)) return "fill_blank";
  if (choices.length > 0 && choices.every(isKanaOnly) && isKanaOnly(answerText)) return "hiragana";
  if (isLikelyUsageProblem(problem, answerText)) return "usage_problem";
  if (choices.length > 0) return "similar_expression";
  return "unknown";
}

function levenshtein(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  const m = s.length;
  const n = t.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
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

function toIssue(layer, severity, code, base, message) {
  return { layer, severity, code, ...base, message };
}

function hasMojibakeString(text) {
  const s = String(text || "");
  // Typical UTF-8 mojibake artifacts decoded as Latin-1/cp1252.
  return /[ìëïãâåœžƒ]/.test(s);
}

function scanStringValues(value, onString, currentPath = "$") {
  if (typeof value === "string") {
    onString(value, currentPath);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanStringValues(v, onString, `${currentPath}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([k, v]) => scanStringValues(v, onString, `${currentPath}.${k}`));
  }
}

function buildReadingFromParts(expression, readingParts) {
  if (!readingParts || typeof readingParts !== "object") return "";
  const map = readingParts.kanjiToKana;
  const restKana = String(readingParts.restKana || "");
  if (!map || typeof map !== "object") return restKana.trim();

  let built = "";
  for (const ch of [...expression]) {
    if (Object.prototype.hasOwnProperty.call(map, ch)) {
      built += String(map[ch] || "");
      continue;
    }
    if (isKanaOnly(ch)) built += ch;
  }
  if (restKana && !built.endsWith(restKana)) built += restKana;
  return built.trim();
}

function validateStructure(ctx, item, problem, base) {
  const { issues } = ctx;

  const hasExpressionLikeField =
    item &&
    typeof item === "object" &&
    (Object.prototype.hasOwnProperty.call(item, "expression") ||
      Object.prototype.hasOwnProperty.call(item, "word") ||
      Object.prototype.hasOwnProperty.call(item, "kanji"));

  // Integrated from previous check:expression
  if (hasExpressionLikeField) {
    if (Object.prototype.hasOwnProperty.call(item, "word") || Object.prototype.hasOwnProperty.call(item, "kanji")) {
      issues.push(toIssue("structure", "ERROR", "DISALLOWED_KEY_PRESENT", base, 'disallowed key "word/kanji" is not allowed.'));
    }
    const expression = typeof item?.expression === "string" ? item.expression.trim() : "";
    if (!expression) {
      issues.push(toIssue("structure", "ERROR", "MISSING_EXPRESSION", base, "missing required expression."));
    }
  }

  scanStringValues(item, (value, pathText) => {
    if (hasMojibakeString(value)) {
      issues.push(toIssue("structure", "ERROR", "MOJIBAKE_DETECTED", base, `mojibake-like string detected at ${pathText}`));
    }
  });

  if (!problem || typeof problem !== "object") return;

  if (typeof problem?.sentence !== "string") {
    issues.push(toIssue("structure", "ERROR", "INVALID_SENTENCE_TYPE", base, "problem.sentence must be string."));
  }
  if (!Array.isArray(problem?.choices)) {
    issues.push(toIssue("structure", "ERROR", "INVALID_CHOICES_TYPE", base, "problem.choices must be array."));
  }
  if (typeof problem?.answer !== "string") {
    issues.push(toIssue("structure", "ERROR", "INVALID_ANSWER_TYPE", base, "problem.answer must be string."));
  }
  if (Array.isArray(problem?.choices) && problem.choices.some((c) => typeof c !== "string")) {
    issues.push(toIssue("structure", "ERROR", "INVALID_CHOICE_ITEM_TYPE", base, "problem.choices items must be string."));
  }

  const type = classifyProblem(problem);
  if (type === "unknown") {
    issues.push(toIssue("structure", "ERROR", "UNKNOWN_PROBLEM_TYPE", base, "problem type could not be classified or is not allowed."));
  }

  if (type === "hiragana") {
    const readingParts = item?.readingParts;
    if (!readingParts || typeof readingParts !== "object" || Array.isArray(readingParts)) {
      issues.push(
        toIssue(
          "structure",
          "ERROR",
          "MISSING_READING_PARTS",
          base,
          "hiragana type requires item.readingParts object (null/invalid not allowed).",
        ),
      );
    }
  }
}

function validateConsistency(ctx, item, problem, base) {
  const { issues } = ctx;
  if (!problem || typeof problem !== "object") return;
  if (!(typeof problem.sentence === "string" && Array.isArray(problem.choices) && typeof problem.answer === "string")) return;

  const problemType = classifyProblem(problem);
  if (problemType === "unknown") return;

  const expression = getExpression(item);
  const target = String(problem.target ?? "").trim();
  const answerText = normalizeProblemAnswer(problem);
  const choices = problem.choices.map((c) => String(c ?? "").trim());

  if (problemType === "hiragana" && target && expression && expression !== target) {
    issues.push(toIssue("consistency", "ERROR", "EXPRESSION_TARGET_MISMATCH", base, "hiragana type requires expression === problem.target."));
  }

  if (answerText && !choices.includes(answerText)) {
    issues.push(toIssue("consistency", "ERROR", "ANSWER_NOT_IN_CHOICES", base, "normalized answer is not present in choices."));
  }

  if (problemType === "hiragana" && expression) {
    const built = buildReadingFromParts(expression, item?.readingParts);
    if (built && answerText && built !== answerText) {
      issues.push(toIssue("consistency", "ERROR", "READINGPARTS_ANSWER_MISMATCH", base, "readingParts-derived reading does not match answer."));
    }

    const targetLast = getLastChar(target);
    if (isHiragana(targetLast)) {
      const badIndexes = [];
      choices.forEach((choice, idx) => {
        const ending = getLastChar(choice);
        if (!isHiragana(ending) || ending !== targetLast) badIndexes.push(idx + 1);
      });
      if (badIndexes.length > 0) {
        issues.push(
          toIssue(
            "consistency",
            "ERROR",
            "ENDING_HIRAGANA_MISMATCH",
            base,
            `choices ending-hiragana mismatch at indexes: ${badIndexes.join(", ")}`,
          ),
        );
      }
    }

    const targetForLength = isKanaOnly(target) ? target : answerText;
    if (targetForLength) {
      const targetLength = [...targetForLength].length;
      const gaps = [];
      choices.forEach((choice, idx) => {
        const gap = Math.abs([...choice].length - targetLength);
        if (gap >= 2) gaps.push(`${idx + 1}(gap=${gap})`);
      });
      if (gaps.length > 0) {
        issues.push(toIssue("consistency", "WARN", "TARGET_LENGTH_GAP", base, `choice length gap >=2 at: ${gaps.join(", ")}`));
      }
    }
  }
}

function validateChoices(ctx, item, problem, base) {
  const { issues } = ctx;
  if (!problem || typeof problem !== "object") return;
  if (!(typeof problem.sentence === "string" && Array.isArray(problem.choices) && typeof problem.answer === "string")) return;

  const choices = problem.choices.map((c) => String(c ?? "").trim());
  const answerText = normalizeProblemAnswer(problem);

  const countMap = new Map();
  choices.forEach((c) => countMap.set(c, (countMap.get(c) || 0) + 1));
  const dup = [...countMap.entries()].filter(([, count]) => count >= 2);
  if (dup.length > 0) {
    issues.push(toIssue("choices", "WARN", "DUPLICATE_CHOICES", base, `duplicate choices: ${dup.map(([c, n]) => `${c}(x${n})`).join(", ")}`));
  }

  const numericPattern = /[0-9\uFF10-\uFF19]|^[1-9][0-9]*\s*[:：]/;
  const numericBad = choices.map((c, i) => ({ c, i: i + 1 })).filter((row) => numericPattern.test(row.c));
  if (numericBad.length > 0) {
    issues.push(
      toIssue(
        "choices",
        "ERROR",
        "RULE_UNNATURAL_NUMBER_IN_CHOICE",
        base,
        `numeric marker in choices: ${numericBad.map((x) => x.i).join(", ")}`,
      ),
    );
  }

  if (answerText) {
    const answerCount = choices.filter((c) => c === answerText).length;
    if (answerCount > 1) {
      issues.push(
        toIssue(
          "choices",
          "ERROR",
          "RULE_EXACT_ANSWER_IN_CHOICES",
          base,
          `answer appears ${answerCount} times in choices.`,
        ),
      );
    }
  }

  const repeatTail = /(.)\1$/;
  const repeatRun = /(.)\1{1,}/;
  const kanaChar = /[\u3041-\u3096\u30A1-\u30FA\u30FC]/;

  choices.forEach((choice, idx) => {
    if (!choice) return;
    if (repeatTail.test(choice) || (repeatRun.test(choice) && kanaChar.test(choice))) {
      issues.push(
        toIssue(
          "choices",
          "ERROR",
          "RULE_UNNATURAL_REPEAT_PATTERN",
          base,
          `unnatural repeat pattern at choice ${idx + 1}: ${choice}`,
        ),
      );
    }
  });

  if (answerText) {
    choices.forEach((choice, idx) => {
      if (choice === answerText) return;
      const d = levenshtein(answerText, choice);
      if (d >= 2) {
        issues.push(
          toIssue(
            "choices",
            "WARN",
            "RULE_TOO_FAR_FROM_ANSWER",
            base,
            `choice ${idx + 1} distance from answer is ${d} (>=2).`,
          ),
        );
      }
    });
  }
}

function validateReading(ctx, item, problem, base) {
  const { issues } = ctx;
  if (!problem || typeof problem !== "object") return;
  if (!(typeof problem.sentence === "string" && Array.isArray(problem.choices) && typeof problem.answer === "string")) return;

  const type = classifyProblem(problem);
  if (type !== "hiragana") return;

  const answerText = normalizeProblemAnswer(problem);
  const target = String(problem.target ?? "");
  const required = [...target].filter(isHiragana);
  if (required.length === 0) return;

  const uniqRequired = [...new Set(required)];
  const containsAll = (text) => uniqRequired.every((ch) => String(text || "").includes(ch));

  const bad = [];
  problem.choices.forEach((choice, idx) => {
    if (!containsAll(choice)) bad.push(idx + 1);
  });
  const answerBad = !containsAll(answerText);

  if (bad.length > 0 || answerBad) {
    issues.push(
      toIssue(
        "reading",
        "ERROR",
        "HIRAGANA_COVERAGE_MISMATCH",
        base,
        `missing required hiragana (${uniqRequired.join("")}) in choices ${bad.join(", ")}${answerBad ? " and answer" : ""}.`,
      ),
    );
  }
}

function runLayer(layer, ctx, item, problem, base) {
  if (layer === "structure") return validateStructure(ctx, item, problem, base);
  if (layer === "consistency") return validateConsistency(ctx, item, problem, base);
  if (layer === "choices") return validateChoices(ctx, item, problem, base);
  if (layer === "reading") return validateReading(ctx, item, problem, base);
}

function issueSignature(row) {
  const id = String(row?.id || "").trim();
  const expression = String(row?.expression || "").trim();
  const sentence = String(row?.sentence || "").trim();
  const anchor = id && id !== "(no-id)" ? `id:${id}` : expression ? `expr:${expression}` : sentence ? `sent:${sentence}` : `pos:${row.day}:${row.index}`;
  return `${row.layer}|${row.code}|${anchor}|${row.message}`;
}

function collectLayerIssuesForRoot(root, rel, layer) {
  const issues = [];
  let scannedItems = 0;
  let scannedProblems = 0;
  const days = normalizeDays(root);
  days.forEach((day, dayIndex) => {
    const items = Array.isArray(day?.items) ? day.items : [];
    items.forEach((item, itemIndex) => {
      scannedItems += 1;
      const problem = extractProblem(item);
      if (problem && typeof problem === "object") scannedProblems += 1;
      const base = {
        file: rel,
        day: getDisplayDay(day, dayIndex),
        index: Number.isFinite(item?.index) ? item.index : itemIndex + 1,
        id: item?.id ?? "(no-id)",
        expression: getExpression(item),
        sentence: typeof problem?.sentence === "string" ? problem.sentence : "",
      };
      runLayer(layer, { issues }, item, problem, base);
    });
  });
  return { issues, scannedItems, scannedProblems };
}

function main() {
  const args = parseArgs(process.argv);
  if (!LAYER_SET.has(args.layer)) {
    console.error(`[ERROR] invalid --layer: ${args.layer}`);
    process.exitCode = 1;
    return;
  }

  let targetFiles = [];
  try {
    targetFiles = resolveTargetFiles({
      file: args.files,
      glob: args.globs,
      root: DEFAULT_ROOT,
    });
  } catch (error) {
    console.error(`[ERROR] ${String(error?.message || error)}`);
    process.exitCode = 1;
    return;
  }

  if (args.files.length > 0 && targetFiles.length === 0) {
    console.error("[ERROR] no study.json files matched. check:problem only validates study.json.");
    process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  const parseErrors = [];
  const baselineParseErrors = [];
  const issues = [];
  const acceptedBySrc = [];
  let scannedItems = 0;
  let scannedProblems = 0;

  for (const filePath of targetFiles) {
    let root;
    try {
      root = readJson(filePath);
    } catch (error) {
      parseErrors.push({ file: path.relative(cwd, filePath), error: String(error?.message || error) });
      continue;
    }

    const rel = path.relative(cwd, filePath);
    const current = collectLayerIssuesForRoot(root, rel, args.layer);
    scannedItems += current.scannedItems;
    scannedProblems += current.scannedProblems;

    let srcSignatureSet = null;
    const baseName = path.basename(filePath).toLowerCase();
    const isStudyFile = baseName === "study.json";
    if (args.allowSrcBaseline && isStudyFile) {
      const srcPath = path.join(path.dirname(filePath), "src.json");
      if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
        try {
          const srcRoot = readJson(srcPath);
          const srcRel = path.relative(cwd, srcPath);
          const srcCollected = collectLayerIssuesForRoot(srcRoot, srcRel, args.layer);
          srcSignatureSet = new Set(srcCollected.issues.map(issueSignature));
        } catch (error) {
          baselineParseErrors.push({ file: path.relative(cwd, srcPath), error: String(error?.message || error) });
        }
      }
    }

    current.issues.forEach((row) => {
      if (srcSignatureSet && srcSignatureSet.has(issueSignature(row))) {
        acceptedBySrc.push(row);
      } else {
        issues.push(row);
      }
    });
  }

  const bySeverity = issues.reduce((acc, row) => {
    acc[row.severity] = (acc[row.severity] || 0) + 1;
    return acc;
  }, {});
  const byCode = issues.reduce((acc, row) => {
    acc[row.code] = (acc[row.code] || 0) + 1;
    return acc;
  }, {});

  console.log(`=== validate:${args.layer} ===`);
  console.log(`scannedFiles: ${targetFiles.length}`);
  console.log(`scannedItems: ${scannedItems}`);
  console.log(`scannedProblems: ${scannedProblems}`);
  console.log(`issueCount: ${issues.length}`);
  console.log(`acceptedBySrcCount: ${acceptedBySrc.length}`);
  console.log(`parseErrorCount: ${parseErrors.length}`);
  console.log(`baselineParseErrorCount: ${baselineParseErrors.length}`);
  console.log(`severity: ERROR=${bySeverity.ERROR || 0}, WARN=${bySeverity.WARN || 0}, INFO=${bySeverity.INFO || 0}`);
  console.log("");

  if (issues.length > 0) {
    console.log("[Issue Counts]");
    Object.entries(byCode)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .forEach(([code, count]) => {
        console.log(`- ${code}: ${count}`);
      });
    console.log("");

    console.log("[Details]");
    for (const row of issues.slice(0, args.maxDetails)) {
      console.log(`- ${row.severity} ${row.code}`);
      console.log(`  file: ${row.file}`);
      console.log(`  day: ${row.day}, index: ${row.index}, id: ${row.id}`);
      console.log(`  message: ${row.message}`);
      console.log("");
    }
    if (issues.length > args.maxDetails) {
      console.log(`... ${issues.length - args.maxDetails} more`);
      console.log("");
    }
  } else {
    console.log("No issues found.");
    console.log("");
  }

  if (parseErrors.length > 0) {
    console.log("[Parse Errors]");
    parseErrors.forEach((row) => {
      console.log(`- ${row.file}`);
      console.log(`  error: ${row.error}`);
    });
    process.exitCode = 2;
    return;
  }

  if (baselineParseErrors.length > 0) {
    console.log("[Baseline Parse Errors]");
    baselineParseErrors.forEach((row) => {
      console.log(`- ${row.file}`);
      console.log(`  error: ${row.error}`);
    });
  }

  if ((bySeverity.ERROR || 0) > 0) {
    process.exitCode = 1;
  }
}

main();
