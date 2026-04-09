#!/usr/bin/env python3
"""Sync missing study items from src without touching manifest.

Behavior:
- Rebuilds canonical item sequence from src.json (in-memory only).
- Keeps existing study items when expression matches.
- Inserts missing items from rebuilt sequence.
- Reindexes ids/indexes and rewrites study.json.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


def load_builder_module() -> Any:
    script_path = Path(__file__).with_name("build-study-json.py")
    spec = importlib.util.spec_from_file_location("build_study_json_module", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load builder module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def get_steps(root: Any) -> list[dict[str, Any]]:
    if isinstance(root, dict):
        if isinstance(root.get("unitSteps"), list):
            return [step for step in root["unitSteps"] if isinstance(step, dict)]
        if isinstance(root.get("days"), list):
            return [step for step in root["days"] if isinstance(step, dict)]
    if isinstance(root, list):
        return [step for step in root if isinstance(step, dict)]
    return []


def flatten_items(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for step in steps:
        items = step.get("items")
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                out.append(item)
    return out


def to_expr(item: dict[str, Any]) -> str:
    return str(item.get("expression", "")).strip()


def to_day_num(step: dict[str, Any], fallback: int) -> int:
    value = int(step.get("unitStep", step.get("day", fallback)))
    return value if value > 0 else fallback


def build_expression_queues(items: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    queues: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        expr = to_expr(item)
        if not expr:
            continue
        queues.setdefault(expr, []).append(item)
    return queues


def clone_json(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def merge_study(study_root: dict[str, Any], rebuilt_root: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
    study_steps = get_steps(study_root)
    rebuilt_steps = get_steps(rebuilt_root)

    existing_items = flatten_items(study_steps)
    rebuilt_items = flatten_items(rebuilt_steps)
    existing_by_expr = build_expression_queues(existing_items)

    merged_sequence: list[dict[str, Any]] = []
    kept_existing = 0
    inserted_missing = 0
    for rebuilt_item in rebuilt_items:
        expr = to_expr(rebuilt_item)
        queue = existing_by_expr.get(expr) if expr else None
        if queue and len(queue) > 0:
            merged_sequence.append(clone_json(queue.pop(0)))
            kept_existing += 1
        else:
            merged_sequence.append(clone_json(rebuilt_item))
            inserted_missing += 1

    day_meta_by_num: dict[int, dict[str, Any]] = {}
    for idx, step in enumerate(study_steps, start=1):
        day_no = to_day_num(step, idx)
        day_meta_by_num[day_no] = {
            "stage": step.get("stage", 1),
            "stageCompleteDate": step.get("stageCompleteDate", None),
            "nextReviewDate": step.get("nextReviewDate", None),
            "lastAttemptDate": step.get("lastAttemptDate", ""),
            "lastCompletedDate": step.get("lastCompletedDate", ""),
        }

    merged_steps: list[dict[str, Any]] = []
    cursor = 0
    for idx, rebuilt_step in enumerate(rebuilt_steps, start=1):
        day_no = to_day_num(rebuilt_step, idx)
        rebuilt_step_items = rebuilt_step.get("items")
        count = len(rebuilt_step_items) if isinstance(rebuilt_step_items, list) else 0
        day_items = merged_sequence[cursor : cursor + count]
        cursor += count

        normalized_items = []
        for in_day_index, item in enumerate(day_items, start=1):
            next_item = clone_json(item)
            next_item["index"] = in_day_index
            next_item["id"] = f"u{day_no}-i{in_day_index}"
            normalized_items.append(next_item)

        base_meta = day_meta_by_num.get(
            day_no,
            {
                "stage": rebuilt_step.get("stage", 1),
                "stageCompleteDate": rebuilt_step.get("stageCompleteDate", None),
                "nextReviewDate": rebuilt_step.get("nextReviewDate", None),
                "lastAttemptDate": rebuilt_step.get("lastAttemptDate", ""),
                "lastCompletedDate": rebuilt_step.get("lastCompletedDate", ""),
            },
        )
        merged_steps.append(
            {
                "unitStep": day_no,
                "stage": base_meta.get("stage", 1),
                "stageCompleteDate": base_meta.get("stageCompleteDate", None),
                "nextReviewDate": base_meta.get("nextReviewDate", None),
                "lastAttemptDate": base_meta.get("lastAttemptDate", ""),
                "lastCompletedDate": base_meta.get("lastCompletedDate", ""),
                "items": normalized_items,
            }
        )

    merged_root = clone_json(study_root)
    merged_root["unitSteps"] = merged_steps
    merged_root.pop("days", None)
    merged_root["totalWords"] = sum(len(step.get("items", [])) for step in merged_steps)
    merged_root["totalProblems"] = sum(
        1 for step in merged_steps for item in step.get("items", []) if isinstance(item.get("problem"), dict)
    )

    return merged_root, {
        "beforeWords": len(existing_items),
        "afterWords": len(flatten_items(merged_steps)),
        "beforeDays": len(study_steps),
        "afterDays": len(merged_steps),
        "keptExisting": kept_existing,
        "insertedMissing": inserted_missing,
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="backslashreplace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(errors="backslashreplace")

    parser = argparse.ArgumentParser()
    parser.add_argument("--src", type=Path, required=True, help="Path to unit src.json")
    parser.add_argument("--study", type=Path, default=None, help="Path to unit study.json (default: sibling study.json)")
    parser.add_argument("--dry-run", action="store_true", help="Do not write file; print summary only")
    args = parser.parse_args()

    src_path = args.src.resolve()
    study_path = args.study.resolve() if args.study else src_path.with_name("study.json")
    if not src_path.exists():
        raise FileNotFoundError(f"src not found: {src_path}")
    if not study_path.exists():
        raise FileNotFoundError(f"study not found: {study_path}")

    builder = load_builder_module()
    src_root = builder.load_json(src_path)
    index_data = builder.extract_source_days(src_root)
    study_root = builder.load_json(study_path)

    rebuilt_root, _ = builder.build_output(index_data, None, study_root if isinstance(study_root, dict) else None, study_path.stem, 1)
    if isinstance(src_root, dict) and isinstance(src_root.get("meta"), dict):
        rebuilt_root["meta"] = src_root["meta"]
    rebuilt_root = builder.reorder_output(rebuilt_root)

    merged_root, summary = merge_study(study_root, rebuilt_root)
    merged_root = builder.reorder_output(merged_root)

    print("sync summary:")
    print(f"  study: {study_path}")
    print(f"  before: {summary['beforeWords']} words / {summary['beforeDays']} days")
    print(f"  after:  {summary['afterWords']} words / {summary['afterDays']} days")
    print(f"  kept existing: {summary['keptExisting']}")
    print(f"  inserted missing: {summary['insertedMissing']}")

    if args.dry_run:
        print("dry-run: no file written")
        return

    builder.write_json(study_path, merged_root)
    print("written")


if __name__ == "__main__":
    main()
