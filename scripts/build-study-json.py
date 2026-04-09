#!/usr/bin/env python3
"""Unified study JSON builder.

This script builds one output JSON from one source src.json.
It supports mixed problem types and writes a detailed build report file.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

ITEMS_PER_DAY = 20
MATCH_THRESHOLD = 70


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def extract_source_days(src_data: Any) -> list[dict[str, Any]]:
    """Accept both list-root and object-root src format."""
    if isinstance(src_data, list):
        return src_data
    if isinstance(src_data, dict) and isinstance(src_data.get("unitSteps"), list):
        return src_data["unitSteps"]
    if isinstance(src_data, dict) and isinstance(src_data.get("days"), list):
        return src_data["days"]
    raise ValueError("src.json must be a list of unitStep objects or an object containing unitSteps[]")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_json_if_changed(path: Path, value: Any) -> bool:
    """Write JSON only when content changed. Returns True if file was updated."""
    next_text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path.exists():
        try:
            current_text = path.read_text(encoding="utf-8-sig")
            if current_text == next_text:
                return False
        except OSError:
            pass
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(next_text, encoding="utf-8", newline="\n")
    return True


def reorder_object(obj: dict[str, Any], preferred_keys: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in preferred_keys:
        if key in obj:
            out[key] = obj[key]
    for key, value in obj.items():
        if key not in out:
            out[key] = value
    return out


def reorder_problem(problem: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(problem, dict):
        return problem
    preferred = ["sentence", "target", "choices", "answer", "answerText", "problemType", "sourceSection"]
    return reorder_object(problem, preferred)


def reorder_item(item: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(item)
    normalized["problem"] = reorder_problem(normalized.get("problem"))
    preferred = [
        "index",
        "id",
        "expression",
        "meaningKo",
        "reading",
        "readingParts",
        "tokens",
        "problem",
        "lastResult",
        "memoDecomposition",
        "memoPersonal",
        "stage",
        "nextReviewDate",
        "lastAttemptDate",
        "stageCompleteDate",
        "sourceRef",
    ]
    return reorder_object(normalized, preferred)


def reorder_day(day: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(day)
    items = normalized.get("items")
    if isinstance(items, list):
        normalized["items"] = [reorder_item(item) if isinstance(item, dict) else item for item in items]
    preferred = ["unitStep", "stage", "stageCompleteDate", "nextReviewDate", "lastAttemptDate", "items"]
    return reorder_object(normalized, preferred)


def reorder_output(output: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(output)
    days = normalized.get("unitSteps")
    if not isinstance(days, list):
        days = normalized.get("days")
    if isinstance(days, list):
        normalized["unitSteps"] = [reorder_day(day) if isinstance(day, dict) else day for day in days]
        normalized.pop("days", None)
    preferred = ["formatVersion", "source", "section", "meta", "totalWords", "totalProblems", "unitSteps"]
    return reorder_object(normalized, preferred)


def normalize_text(text: Any) -> str:
    s = unicodedata.normalize("NFKC", str(text or ""))
    return "".join(ch for ch in s if ch.isalnum())


def try_fix_mojibake_text(text: Any) -> str:
    s = str(text or "")
    if not s:
        return s
    if any(ord(ch) > 255 for ch in s):
        return s
    try:
        repaired = s.encode("latin1").decode("utf-8")
        # keep repaired only when it likely recovers CJK text
        cjk_now = len(re.findall(r"[가-힣ぁ-ゖァ-ヺ一-龯]", s))
        cjk_repaired = len(re.findall(r"[가-힣ぁ-ゖァ-ヺ一-龯]", repaired))
        return repaired if cjk_repaired > cjk_now else s
    except UnicodeError:
        return s


def get_expression_strict(item: Any, context: str) -> str:
    if not isinstance(item, dict):
        raise ValueError(f"{context}: item must be an object")
    if "word" in item or "kanji" in item:
        raise ValueError(f'{context}: disallowed keys "word/kanji" are not allowed. Use "expression" only.')
    expression = str(item.get("expression", "")).strip()
    if not expression:
        raise ValueError(f"{context}: missing required expression")
    return expression


def is_kanji_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    if "word" in item or "kanji" in item:
        raise ValueError('disallowed keys "word/kanji" are not allowed in source index. Use "expression".')
    return "expression" in item


def is_problem_item(item: Any) -> bool:
    return (
        isinstance(item, dict)
        and "sentence" in item
        and isinstance(item.get("choices"), list)
        and "answer" in item
    )


def has_blank_marker(sentence: Any) -> bool:
    s = str(sentence or "")
    return bool(re.search(r"_{2,}|\(\s*\)|\[\s*\]|ï¼ˆ\s*ã€€+\s*ï¼‰|[â–¡â– â—¯â—‹â—]", s))


def is_kana_only(text: Any) -> bool:
    return bool(re.fullmatch(r"[\u3041-\u3096\u30A1-\u30FA\u30FC]+", str(text or "").strip()))


def is_likely_usage_problem(problem: dict[str, Any], normalized_answer: str) -> bool:
    sentence = str(problem.get("sentence", "")).strip()
    choices = problem.get("choices") if isinstance(problem.get("choices"), list) else []

    short_lemma_like = (
        0 < len(sentence) <= 12
        and not re.search(r"[ã€‚ï¼ï¼Ÿ.!?]", sentence)
        and not has_blank_marker(sentence)
    )

    def long_sentence_like(value: Any) -> bool:
        t = str(value or "").strip()
        return len(t) >= 12 and bool(re.search(r"[ã€‚ï¼ï¼Ÿ.!?]", t))

    long_choice_count = sum(1 for c in choices if long_sentence_like(c))
    mostly_long_choices = len(choices) > 0 and long_choice_count >= (len(choices) + 1) // 2
    answer_looks_sentence = long_sentence_like(normalized_answer)
    return short_lemma_like and mostly_long_choices and answer_looks_sentence


def normalize_problem_answer(problem: dict[str, Any]) -> str:
    choices = problem.get("choices") if isinstance(problem.get("choices"), list) else []
    raw = str(problem.get("answer", "")).strip()
    labeled = re.match(r"^([1-9][0-9]*)\s*[:ï¼š]\s*(.+)$", raw)
    if labeled:
        idx = int(labeled.group(1)) - 1
        if 0 <= idx < len(choices):
            return str(choices[idx] or "").strip()
        return str(labeled.group(2) or "").strip()
    if re.fullmatch(r"[1-9][0-9]*", raw):
        idx = int(raw) - 1
        if 0 <= idx < len(choices):
            return str(choices[idx] or "").strip()
    return raw


def classify_problem(problem: dict[str, Any]) -> str:
    sentence = str(problem.get("sentence", ""))
    choices = problem.get("choices") if isinstance(problem.get("choices"), list) else []
    answer = normalize_problem_answer(problem)
    if has_blank_marker(sentence):
        return "fill_blank"
    if len(choices) > 0 and all(is_kana_only(c) for c in choices) and is_kana_only(answer):
        return "hiragana"
    if is_likely_usage_problem(problem, answer):
        return "usage_problem"
    return "similar_expression"


def count_raw_items(index_data: list[dict[str, Any]]) -> tuple[int, int]:
    raw_kanji = 0
    raw_problem = 0
    for day in index_data:
        for item in day.get("items", []):
            if is_kanji_item(item):
                raw_kanji += 1
            elif is_problem_item(item):
                raw_problem += 1
    return raw_kanji, raw_problem


def dedupe_kanji_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        key = (
            normalize_text(get_expression_strict(item, "dedupe_kanji_items")),
            str(item.get("meaningKo", item.get("meaning", ""))).strip(),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def dedupe_problem_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        key = (
            normalize_text(item.get("targetKanji", item.get("target", item.get("answer", "")))),
            str(item.get("sentence", "")).strip(),
            str(item.get("answer", "")).strip(),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def split_index_items(index_data: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    kanji_items: list[dict[str, Any]] = []
    problem_items: list[dict[str, Any]] = []
    for day in index_data:
        for item in day.get("items", []):
            if is_kanji_item(item):
                kanji_items.append(item)
            elif is_problem_item(item):
                problem_items.append(item)
    return dedupe_kanji_items(kanji_items), dedupe_problem_items(problem_items)


def is_kana_char(ch: str) -> bool:
    return bool(re.match(r"[\u3041-\u3096\u30A1-\u30FA\u30FC]", ch))


def build_reading_from_item(item: dict[str, Any]) -> str:
    reading_parts = item.get("readingParts")
    if not isinstance(reading_parts, dict):
        return ""
    mapping = reading_parts.get("kanjiToKana")
    if not isinstance(mapping, dict):
        return ""

    kanji_text = get_expression_strict(item, "build_reading_from_item")
    out: list[str] = []
    for ch in kanji_text:
        if ch in mapping:
            out.append(str(mapping[ch]))
        elif is_kana_char(ch):
            out.append(ch)
    return "".join(out)


def to_problem_payload(problem: dict[str, Any]) -> dict[str, Any]:
    answer_text = normalize_problem_answer(problem)
    payload: dict[str, Any] = {
        "sentence": problem.get("sentence"),
        "target": problem.get("targetKanji", problem.get("target")),
        "choices": problem.get("choices"),
        "answer": problem.get("answer"),
        "answerText": answer_text,
        "problemType": classify_problem(problem),
    }
    if "sourceSection" in problem:
        payload["sourceSection"] = problem["sourceSection"]
    return payload


def score_problem_to_kanji(problem: dict[str, Any], kanji_item: dict[str, Any]) -> tuple[int, str]:
    payload = to_problem_payload(problem)
    key_candidates = [
        payload.get("target"),
        payload.get("answerText"),
        problem.get("answer"),
        problem.get("targetKanji"),
        problem.get("target"),
    ]

    normalized_keys = [normalize_text(v) for v in key_candidates if v]
    normalized_keys = [x for x in normalized_keys if x]
    if not normalized_keys:
        return 0, "no_key"

    kanji_norm = normalize_text(get_expression_strict(kanji_item, "score_problem_to_kanji"))
    reading_norm = normalize_text(build_reading_from_item(kanji_item))
    sentence_norm = normalize_text(payload.get("sentence", ""))

    best = 0
    reason = "no_match"
    for key in normalized_keys:
        if key == kanji_norm:
            return 100, "exact_kanji"
        if key == reading_norm:
            best = max(best, 95)
            reason = "exact_reading"
        if key and kanji_norm and (key in kanji_norm or kanji_norm in key):
            best = max(best, 85)
            reason = "contains_kanji"
        if key and reading_norm and (key in reading_norm or reading_norm in key):
            best = max(best, 75)
            reason = "contains_reading"
        if sentence_norm and kanji_norm and kanji_norm in sentence_norm:
            best = max(best, 72)
            reason = "sentence_contains_kanji"
    return best, reason


def build_synthetic_item_from_problem(problem: dict[str, Any]) -> dict[str, Any]:
    payload = to_problem_payload(problem)
    target = str(payload.get("target") or "").strip()
    answer_text = str(payload.get("answerText") or "").strip()
    expression = target or answer_text or str(problem.get("answer") or "").strip() or "(unmapped-problem)"
    return {
        "expression": expression,
        "meaningKo": None,
        "reading": None,
        "tokens": None,
        "readingParts": None,
        "problem": payload,
        "memoDecomposition": None,
        "memoPersonal": None,
        "stage": 1,
        "nextReviewDate": None,
        "lastResult": "NEUTRAL",
        "lastAttemptDate": None,
    }


def flatten_items(days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for day in days:
        out.extend(day.get("items", []))
    return out


def get_output_steps(root: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(root, dict):
        return []
    if isinstance(root.get("unitSteps"), list):
        return root["unitSteps"]
    if isinstance(root.get("days"), list):
        return root["days"]
    return []


def normalize_item(item: dict[str, Any], prev_item: dict[str, Any] | None) -> dict[str, Any]:
    merged = dict(item)
    merged["expression"] = get_expression_strict(merged, "normalize_item")

    # Canonicalize source aliases first so study null fields can be filled from src
    # even when rebuilding without --override.
    if (merged.get("meaningKo") is None or str(merged.get("meaningKo")).strip() == "") and str(
        merged.get("meaning", "")
    ).strip():
        merged["meaningKo"] = merged.get("meaning")

    if prev_item:
        for key in ("reading", "tokens", "problem"):
            prev_val = prev_item.get(key)
            cur_val = merged.get(key)
            cur_is_empty = key not in merged or cur_val is None or (isinstance(cur_val, str) and cur_val.strip() == "")
            if cur_is_empty and prev_val is not None:
                merged[key] = prev_item[key]
    raw_stage = prev_item.get("stage", 1) if prev_item else 1
    try:
        stage = int(raw_stage) if raw_stage is not None else 1
    except (TypeError, ValueError):
        stage = 1
    merged["stage"] = stage
    merged["nextReviewDate"] = None if stage == 1 else (prev_item.get("nextReviewDate") if prev_item else None)
    merged["lastResult"] = prev_item.get("lastResult", "NEUTRAL") if prev_item else "NEUTRAL"
    merged["lastAttemptDate"] = prev_item.get("lastAttemptDate", "") if prev_item else ""
    merged["memoDecomposition"] = prev_item.get("memoDecomposition", "") if prev_item else ""
    merged["memoPersonal"] = prev_item.get("memoPersonal", "") if prev_item else ""
    return merged


def force_null_fields_for_synthetic(item: dict[str, Any]) -> dict[str, Any]:
    """For synthetic-mapped problems, keep only expression/problem identity and null out other payload fields."""
    keep_keys = {"id", "index", "expression", "problem"}
    out: dict[str, Any] = {}

    for key in keep_keys:
        if key in item:
            out[key] = item[key]

    known_nullable_keys = [
        "meaningKo",
        "meaning",
        "reading",
        "tokens",
        "readingParts",
        "memoDecomposition",
        "memoPersonal",
        "stage",
        "nextReviewDate",
        "lastResult",
        "lastAttemptDate",
        "stageCompleteDate",
        "sourceRef",
    ]
    for key in known_nullable_keys:
        out[key] = None

    return out


def infer_start_day(prev_path: Path | None, explicit_start_day: int) -> int:
    if prev_path is None:
        return explicit_start_day
    if not prev_path.exists():
        return explicit_start_day
    try:
        prev_data = load_json(prev_path)
    except Exception:
        return explicit_start_day
    days = get_output_steps(prev_data) if isinstance(prev_data, dict) else None
    if not isinstance(days, list) or not days:
        return explicit_start_day
    try:
        return max(int(day.get("unitStep", day.get("day", 0))) for day in days) + 1
    except Exception:
        return explicit_start_day


def extract_build_context(src_path: Path, output_path: Path) -> dict[str, str]:
    parts = [p for p in src_path.resolve().parts]
    try:
        asset_idx = next(i for i, p in enumerate(parts) if p.lower() == "asset")
    except StopIteration as exc:
        raise ValueError(f"src path must be under asset/: {src_path}") from exc

    rel_parts = parts[asset_idx + 1 :]
    # expected: <level>/<chapter>/<unit>/src.json
    if len(rel_parts) < 4:
        raise ValueError(f"src path is too short for context extraction: {src_path}")
    level = rel_parts[0]
    chapter_id = rel_parts[1]
    unit_id = rel_parts[2]

    manifest_path = Path(*parts[: asset_idx + 2]) / "manifest.json"
    rel_source_path = f"{chapter_id}/{unit_id}/src.json"
    rel_output_path = f"{chapter_id}/{unit_id}/{output_path.name}"
    return {
        "level": level,
        "chapterId": chapter_id,
        "unitId": unit_id,
        "manifestPath": str(manifest_path),
        "sourcePath": rel_source_path,
        "outputPath": rel_output_path,
    }


def count_output_unit_steps(output_root: Any) -> int:
    if isinstance(output_root, dict):
        unit_steps = output_root.get("unitSteps")
        if isinstance(unit_steps, list):
            return len(unit_steps)
        days = output_root.get("days")
        if isinstance(days, list):
            return len(days)
        return 0
    if isinstance(output_root, list):
        return len(output_root)
    return 0


def apply_manifest_day_offsets(manifest_path: Path, manifest: dict[str, Any]) -> int:
    chapters = manifest.get("chapters")
    if not isinstance(chapters, list):
        return 0

    running_day = 0
    manifest_root = manifest_path.parent
    for chapter in chapters:
        if not isinstance(chapter, dict):
            continue
        units = chapter.get("units")
        if not isinstance(units, list):
            continue
        for unit in units:
            if not isinstance(unit, dict):
                continue
            unit["dayOffsetStart"] = running_day + 1
            output_rel = str(unit.get("outputPath", "")).strip()
            if not output_rel:
                continue
            output_file = manifest_root / output_rel
            if not output_file.exists():
                continue
            try:
                output_json = load_json(output_file)
            except Exception:
                continue

            running_day += count_output_unit_steps(output_json)
    return running_day


def chapter_title_from_id(chapter_id: str) -> str:
    m = re.search(r"chapter-(\d+)$", chapter_id)
    if not m:
        return chapter_id
    return f"제{int(m.group(1))}장"


def resolve_chapter_title(manifest_path: Path, chapter_id: str) -> str:
    default_title = chapter_title_from_id(chapter_id)
    chapter_index = manifest_path.parent / chapter_id / "index.json"
    if not chapter_index.exists():
        return default_title
    try:
        index_root = load_json(chapter_index)
    except Exception:
        return default_title
    if isinstance(index_root, dict):
        raw = str(index_root.get("title", "")).strip()
        if raw:
            return try_fix_mojibake_text(raw)
    return default_title


def build_manifest_entry_title(src_root: Any, output: dict[str, Any], fallback_unit_id: str) -> str:
    if isinstance(src_root, dict):
        meta = src_root.get("meta")
        if isinstance(meta, dict):
            value = str(meta.get("sourceName", "")).strip()
            if value:
                return try_fix_mojibake_text(value)
    section = str(output.get("section", "")).strip()
    if section:
        return try_fix_mojibake_text(section)
    return try_fix_mojibake_text(fallback_unit_id)


def upsert_manifest(manifest_path: Path, ctx: dict[str, str], src_root: Any, output: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    if manifest_path.exists():
        try:
            manifest = load_json(manifest_path)
        except Exception:
            manifest = {}
    else:
        manifest = {}

    if not isinstance(manifest, dict):
        manifest = {}

    level = ctx["level"]
    chapter_id = ctx["chapterId"]
    unit_id = ctx["unitId"]
    unit_title = build_manifest_entry_title(src_root, output, unit_id)

    if manifest.get("level") != level:
        manifest["level"] = level
    manifest.setdefault("title", level.upper().replace("-", " "))
    chapters = manifest.get("chapters")
    if not isinstance(chapters, list):
        chapters = []
        manifest["chapters"] = chapters

    chapter = next((c for c in chapters if isinstance(c, dict) and c.get("id") == chapter_id), None)
    chapter_title = resolve_chapter_title(manifest_path, chapter_id)
    if chapter is None:
        chapter = {"id": chapter_id, "title": chapter_title, "units": []}
        chapters.append(chapter)

    chapter["title"] = chapter_title
    units = chapter.get("units")
    if not isinstance(units, list):
        units = []
        chapter["units"] = units

    unit = next((u for u in units if isinstance(u, dict) and u.get("id") == unit_id), None)
    if unit is None:
        unit = {"id": unit_id}
        units.append(unit)

    # deterministic order for idempotent writes
    chapters.sort(key=lambda c: str(c.get("id", "")))
    for c in chapters:
        if isinstance(c, dict) and isinstance(c.get("units"), list):
            c["units"].sort(key=lambda u: str(u.get("id", "")))

    unit["title"] = unit_title
    unit["sourcePath"] = ctx["sourcePath"]
    unit["outputPath"] = ctx["outputPath"]
    manifest.pop("dayCompletionTotal", None)
    manifest["totalDay"] = apply_manifest_day_offsets(manifest_path, manifest)

    changed = write_json_if_changed(manifest_path, manifest)
    return manifest, changed


def validate_integrity(output: dict[str, Any], report: dict[str, Any], manifest: dict[str, Any], ctx: dict[str, str]) -> list[str]:
    errors: list[str] = []
    summary = report.get("summary") if isinstance(report, dict) else {}
    if not isinstance(summary, dict):
        errors.append("report.summary is missing")
        return errors

    if summary.get("noProblemLoss") is not True:
        errors.append(f"problem loss detected: missingProblems={summary.get('missingProblems')}")

    days = output.get("unitSteps")
    if not isinstance(days, list):
        days = output.get("days")
    if not isinstance(days, list) or len(days) == 0:
        errors.append("output.unitSteps is empty")
    else:
        for d_idx, day in enumerate(days, start=1):
            if not isinstance(day, dict):
                errors.append(f"output.unitSteps[{d_idx}] is not object")
                continue
            items = day.get("items")
            if not isinstance(items, list):
                errors.append(f"output.unitSteps[{d_idx}].items is not list")
                continue
            for i_idx, item in enumerate(items, start=1):
                if not isinstance(item, dict):
                    errors.append(f"day {d_idx} item {i_idx} is not object")
                    continue
                expression = str(item.get("expression", "")).strip()
                if not expression:
                    errors.append(f"day {d_idx} item {i_idx} missing expression")
                    continue
                problem = item.get("problem")
                if problem is None:
                    continue
                if not isinstance(problem, dict):
                    errors.append(f"day {d_idx} item {i_idx} problem is not object")
                    continue
                if not isinstance(problem.get("answer"), str):
                    errors.append(f"day {d_idx} item {i_idx} problem.answer is not string")
                if not isinstance(problem.get("choices"), list):
                    errors.append(f"day {d_idx} item {i_idx} problem.choices is not list")

    chapters = manifest.get("chapters") if isinstance(manifest, dict) else None
    if not isinstance(chapters, list):
        errors.append("manifest.chapters is missing")
        return errors
    chapter = next((c for c in chapters if isinstance(c, dict) and c.get("id") == ctx["chapterId"]), None)
    if chapter is None:
        errors.append(f"manifest missing chapter: {ctx['chapterId']}")
        return errors
    units = chapter.get("units")
    if not isinstance(units, list):
        errors.append(f"manifest chapter {ctx['chapterId']} has no units list")
        return errors
    unit = next((u for u in units if isinstance(u, dict) and u.get("id") == ctx["unitId"]), None)
    if unit is None:
        errors.append(f"manifest missing unit: {ctx['unitId']}")
        return errors
    if str(unit.get("sourcePath", "")) != ctx["sourcePath"]:
        errors.append(
            f"manifest sourcePath mismatch: expected={ctx['sourcePath']} actual={unit.get('sourcePath')}"
        )
    if str(unit.get("outputPath", "")) != ctx["outputPath"]:
        errors.append(
            f"manifest outputPath mismatch: expected={ctx['outputPath']} actual={unit.get('outputPath')}"
        )
    expected_total_day = apply_manifest_day_offsets(Path(ctx["manifestPath"]), manifest)
    actual_total_day = int(manifest.get("totalDay", 0)) if str(manifest.get("totalDay", "")).isdigit() else 0
    if actual_total_day != expected_total_day:
        errors.append(f"manifest totalDay mismatch: expected={expected_total_day} actual={actual_total_day}")
    recomputed_running_day = 0
    for c in chapters:
        if not isinstance(c, dict):
            continue
        chapter_units = c.get("units")
        if not isinstance(chapter_units, list):
            continue
        for u in chapter_units:
            if not isinstance(u, dict):
                continue
            expected_start = recomputed_running_day + 1
            output_rel = str(u.get("outputPath", "")).strip()
            if not output_rel:
                actual_start = int(u.get("dayOffsetStart", 0)) if str(u.get("dayOffsetStart", "")).isdigit() else 0
                if actual_start != expected_start:
                    errors.append(
                        f"manifest dayOffsetStart mismatch: unit={u.get('id')} expected={expected_start} actual={actual_start}"
                    )
                continue
            output_file = Path(ctx["manifestPath"]).parent / output_rel
            if not output_file.exists():
                actual_start = int(u.get("dayOffsetStart", 0)) if str(u.get("dayOffsetStart", "")).isdigit() else 0
                if actual_start != expected_start:
                    errors.append(
                        f"manifest dayOffsetStart mismatch: unit={u.get('id')} expected={expected_start} actual={actual_start}"
                    )
                continue
            try:
                output_json = load_json(output_file)
            except Exception:
                actual_start = int(u.get("dayOffsetStart", 0)) if str(u.get("dayOffsetStart", "")).isdigit() else 0
                if actual_start != expected_start:
                    errors.append(
                        f"manifest dayOffsetStart mismatch: unit={u.get('id')} expected={expected_start} actual={actual_start}"
                    )
                continue
            recomputed_running_day += count_output_unit_steps(output_json)
            actual_start = int(u.get("dayOffsetStart", 0)) if str(u.get("dayOffsetStart", "")).isdigit() else 0
            if actual_start != expected_start:
                errors.append(
                    f"manifest dayOffsetStart mismatch: unit={u.get('id')} expected={expected_start} actual={actual_start}"
                )
    return errors


def build_output(
    index_data: list[dict[str, Any]],
    prev_output: dict[str, Any] | None,
    original_output: dict[str, Any] | None,
    section_name: str,
    start_day: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    raw_kanji_count, raw_problem_count = count_raw_items(index_data)
    kanji_items, problem_items = split_index_items(index_data)
    prev_flat_items = flatten_items(get_output_steps(prev_output)) if prev_output else []

    used_kanji_indexes: set[int] = set()
    mapped_problem_by_kanji_idx: dict[int, dict[str, Any]] = {}
    synthetic_mapped_items: list[dict[str, Any]] = []
    low_score_items: list[dict[str, Any]] = []

    original_problem_keys: set[tuple[str, str]] = set()
    original_steps = get_output_steps(original_output) if isinstance(original_output, dict) else []
    if original_steps:
        for day in original_steps:
            for item in day.get("items", []):
                if not isinstance(item, dict):
                    continue
                problem = item.get("problem")
                if not isinstance(problem, dict):
                    continue
                key = (str(problem.get("sentence", "")).strip(), str(problem.get("answer", "")).strip())
                original_problem_keys.add(key)

    for p_idx, problem in enumerate(problem_items):
        best_idx = -1
        best_score = 0
        best_reason = "no_match"
        scored_preview: list[dict[str, Any]] = []
        for k_idx, kanji_item in enumerate(kanji_items):
            if k_idx in used_kanji_indexes:
                continue
            score, reason = score_problem_to_kanji(problem, kanji_item)
            if score > best_score:
                best_score = score
                best_idx = k_idx
                best_reason = reason
            if score > 0 and len(scored_preview) < 5:
                scored_preview.append(
                    {
                        "expression": str(
                            get_expression_strict(kanji_item, "build_output.topCandidates")
                        ),
                        "score": score,
                        "reason": reason,
                    }
                )

        if best_idx >= 0:
            mapped_problem_by_kanji_idx[best_idx] = problem
            used_kanji_indexes.add(best_idx)

            if best_score < MATCH_THRESHOLD:
                key = (str(problem.get("sentence", "")).strip(), str(problem.get("answer", "")).strip())
                accepted_by_original = key in original_problem_keys
                low_score_items.append(
                    {
                        "problemIndex": p_idx + 1,
                        "target": str(problem.get("targetKanji", problem.get("target", ""))),
                        "answer": str(problem.get("answer", "")),
                        "sentence": str(problem.get("sentence", "")),
                        "problemType": classify_problem(problem),
                        "bestScore": best_score,
                        "bestReason": best_reason,
                        "acceptedByOriginal": accepted_by_original,
                        "topCandidates": sorted(scored_preview, key=lambda x: x["score"], reverse=True),
                    }
                )
        else:
            synthetic_mapped_items.append(
                {
                    "problemIndex": p_idx + 1,
                    "target": str(problem.get("targetKanji", problem.get("target", ""))),
                    "answer": str(problem.get("answer", "")),
                    "sentence": str(problem.get("sentence", "")),
                    "problemType": classify_problem(problem),
                    "reason": "no_candidate_match",
                    "bestScore": best_score,
                    "bestReason": best_reason,
                    "topCandidates": sorted(scored_preview, key=lambda x: x["score"], reverse=True),
                }
            )

    matched_problem_ids = {id(v) for v in mapped_problem_by_kanji_idx.values()}
    unmatched_problems = [p for p in problem_items if id(p) not in matched_problem_ids]
    synthetic_items = [build_synthetic_item_from_problem(p) for p in unmatched_problems]

    unified_items = kanji_items + synthetic_items
    days_out: list[dict[str, Any]] = []

    for start in range(0, len(unified_items), ITEMS_PER_DAY):
        day_num = start_day + (start // ITEMS_PER_DAY)
        chunk = unified_items[start : start + ITEMS_PER_DAY]
        day_items: list[dict[str, Any]] = []

        for in_day_index, src_item in enumerate(chunk, start=1):
            absolute_index = start + in_day_index - 1
            prev_item = prev_flat_items[absolute_index] if absolute_index < len(prev_flat_items) else None
            normalized = normalize_item(src_item, prev_item)
            normalized["index"] = in_day_index

            if absolute_index < len(kanji_items):
                mapped = mapped_problem_by_kanji_idx.get(absolute_index)
                normalized["problem"] = to_problem_payload(mapped) if mapped is not None else None
            else:
                normalized["problem"] = src_item.get("problem")
                normalized = force_null_fields_for_synthetic(normalized)

            normalized["id"] = f"u{day_num}-i{in_day_index}"
            day_items.append(normalized)

        days_out.append({"unitStep": day_num, "items": day_items})

    total_output_items = len(unified_items)
    total_output_problems = sum(1 for day in days_out for item in day["items"] if item.get("problem") is not None)
    unmatched_count = len(problem_items) - len(mapped_problem_by_kanji_idx)
    missing_problem_count = max(0, len(problem_items) - total_output_problems)

    low_score_accepted = sum(1 for row in low_score_items if row["acceptedByOriginal"])
    low_score_new = len(low_score_items) - low_score_accepted

    report = {
        "summary": {
            "rawExpressionItems": raw_kanji_count,
            "rawProblemItems": raw_problem_count,
            "dedupExpressionItems": len(kanji_items),
            "dedupProblemItems": len(problem_items),
            "mappedToExistingExpressions": len(mapped_problem_by_kanji_idx),
            "unmatchedProblemCandidates": unmatched_count,
            "syntheticMapped": len(synthetic_items),
            "outputItems": total_output_items,
            "outputProblems": total_output_problems,
            "missingProblems": missing_problem_count,
            "noProblemLoss": missing_problem_count == 0,
            "matchThreshold": MATCH_THRESHOLD,
            "lowScoreMatched": len(low_score_items),
            "lowScoreAcceptedByOriginal": low_score_accepted,
            "lowScoreNew": low_score_new,
        },
        "lowScoreItems": low_score_items,
        "syntheticMappedItems": synthetic_mapped_items,
        "unresolvedErrors": [],
    }

    output = {
        "formatVersion": 2,
        "source": "src.json",
        "section": section_name,
        "meta": {},
        "totalWords": total_output_items,
        "totalProblems": total_output_problems,
        "unitSteps": days_out,
    }
    return reorder_output(output), report


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="backslashreplace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(errors="backslashreplace")

    parser = argparse.ArgumentParser()
    parser.add_argument("--src", type=Path, required=True, help="Path to source src.json")
    parser.add_argument("--output", type=Path, required=False, default=None, help="Path to output study json")
    parser.add_argument("--prev", type=Path, default=None, help="Optional previous file for day offset")
    parser.add_argument("--start-day", type=int, default=1, help="Start day when --prev is omitted")
    parser.add_argument("--allow-last-partial", action="store_true")
    parser.add_argument(
        "--override",
        action="store_true",
        help="Ignore existing output learning-state fields and rebuild from source only.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Optional report path. Default: <src-dir>/src.build-report.json",
    )
    args = parser.parse_args()

    index_path = args.src.resolve()
    output_path = args.output.resolve() if args.output else index_path.with_name("study.json")
    prev_path = args.prev.resolve() if args.prev else None
    report_path = args.report.resolve() if args.report else index_path.with_name(f"{index_path.stem}.build-report.json")

    if report_path.exists():
        try:
            os.chmod(report_path, 0o666)
        except OSError:
            pass
        try:
            report_path.unlink()
        except PermissionError:
            report_path.write_text("", encoding="utf-8")

    index_data = extract_source_days(load_json(index_path))

    kanji_items, _ = split_index_items(index_data)
    if not args.allow_last_partial and len(kanji_items) % ITEMS_PER_DAY != 0:
        raise ValueError(
            f"Total kanji item count ({len(kanji_items)}) is not divisible by {ITEMS_PER_DAY}. "
            "Use --allow-last-partial to keep a shorter last day."
        )

    prev_output = None
    original_output = None
    if output_path.exists():
        try:
            original_output = load_json(output_path)
        except Exception:
            original_output = None

    if output_path.exists() and not args.override:
        try:
            prev_output = load_json(output_path)
        except Exception:
            prev_output = None

    start_day = infer_start_day(prev_path, args.start_day)
    output, report = build_output(index_data, prev_output, original_output, output_path.stem, start_day)
    src_root = load_json(index_path)
    if isinstance(src_root, dict) and isinstance(src_root.get("meta"), dict):
        output["meta"] = src_root["meta"]

    write_json(output_path, output)
    write_json(report_path, report)

    ctx = extract_build_context(index_path, output_path)
    manifest_path = Path(ctx["manifestPath"])
    manifest, manifest_changed = upsert_manifest(manifest_path, ctx, src_root, output)
    integrity_errors = validate_integrity(output, report, manifest, ctx)
    if integrity_errors:
        print("integrity: FAILED")
        for i, err in enumerate(integrity_errors, start=1):
            print(f"  {i}. {err}")
        raise SystemExit(2)
    print("integrity: PASS")

    summary = report["summary"]
    print("written: output JSON generated successfully")
    print(f"output: {output_path}")
    print(f"report: {report_path}")
    print(f"manifest: {manifest_path} ({'updated' if manifest_changed else 'unchanged'})")
    print(f"items={summary['outputItems']}, problems={summary['outputProblems']}")
    print(
        "summary: "
        f"mapped={summary['mappedToExistingExpressions']}, "
        f"unmatchedCandidates={summary['unmatchedProblemCandidates']}, "
        f"syntheticMapped={summary['syntheticMapped']}, "
        f"missing={summary['missingProblems']}, "
        f"noProblemLoss={summary['noProblemLoss']}, "
        f"lowScore={summary['lowScoreMatched']}, "
        f"lowScoreAccepted={summary['lowScoreAcceptedByOriginal']}, "
        f"lowScoreNew={summary['lowScoreNew']}"
    )


if __name__ == "__main__":
    main()
