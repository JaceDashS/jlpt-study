#!/usr/bin/env python3
"""
Append line-delimited serialized JSON data into a target JSON file.

Usage:
    python scripts/append-json-from-clipboard.py path/to/output.json

Behavior:
- If the target file does not exist, initialize it following asset/jlpt-one-book-n1.json shape.
- Each input line must be a complete serialized JSON object or array.
- Press Enter to process that line immediately.
- Type EXIT to stop the program.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ITEMS_PER_DAY = 20


def print_usage() -> None:
    print("Usage: python scripts/append-json-from-clipboard.py <target-json-path>")


def load_or_initialize_target(target_path: Path):
    if not target_path.exists():
        return build_empty_root(target_path)

    raw = target_path.read_text(encoding="utf-8-sig").strip()
    if not raw:
        return build_empty_root(target_path)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Target file is not valid JSON: {target_path} ({exc})") from exc


def parse_pasted_json(raw_text: str):
    if not raw_text:
        raise SystemExit("No input received. Nothing was appended.")

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Pasted input is not valid JSON: {exc}") from exc

    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        return [parsed]

    raise SystemExit("Pasted JSON must be either an object or an array.")


def build_empty_root(target_path: Path):
    return {
        "format": "combined",
        "meta": {
            "level": "jlpt-n1",
            "title": target_path.stem,
        },
        "days": [],
    }


def normalize_item(item):
    if not isinstance(item, dict):
        raise SystemExit("Each appended item must be a JSON object.")

    normalized = dict(item)

    if "meaningKo" not in normalized and "meaning" in normalized:
        normalized["meaningKo"] = normalized.get("meaning")

    if "memoPersonal" not in normalized and "memo" in normalized:
        normalized["memoPersonal"] = normalized.get("memo")

    if "readingParts" not in normalized:
        normalized["readingParts"] = None

    if "problem" not in normalized:
        normalized["problem"] = None

    if "lastResult" not in normalized:
        normalized["lastResult"] = "NEUTRAL"

    if "memoDecomposition" not in normalized:
        normalized["memoDecomposition"] = ""

    if "memoPersonal" not in normalized:
        normalized["memoPersonal"] = ""

    if "stage" not in normalized:
        normalized["stage"] = 1

    if "nextReviewDate" not in normalized:
        normalized["nextReviewDate"] = None

    if "lastAttemptDate" not in normalized:
        normalized["lastAttemptDate"] = ""

    preferred_order = [
        "id",
        "index",
        "expression",
        "meaningKo",
        "readingParts",
        "problem",
        "lastResult",
        "memoDecomposition",
        "memoPersonal",
        "stage",
        "nextReviewDate",
        "lastAttemptDate",
    ]

    ordered = {}
    for key in preferred_order:
        if key in normalized:
            ordered[key] = normalized[key]
    for key, value in normalized.items():
        if key not in ordered:
            ordered[key] = value
    return ordered


def normalize_items(items):
    return [normalize_item(item) for item in items]


def extract_existing_items(target_data):
    if isinstance(target_data, list):
        return list(target_data), "root array"

    if isinstance(target_data, dict):
        if isinstance(target_data.get("items"), list):
            return list(target_data["items"]), "items array"

        days = target_data.get("days")
        if isinstance(days, list):
            items = []
            for day_group in days:
                if not isinstance(day_group, dict):
                    continue
                nested_days = day_group.get("day")
                if isinstance(nested_days, list):
                    for day_entry in nested_days:
                        if isinstance(day_entry, dict) and isinstance(day_entry.get("items"), list):
                            items.extend(day_entry["items"])
                elif isinstance(day_group.get("items"), list):
                    items.extend(day_group["items"])
            return items, "days"

        unit_steps = target_data.get("unitSteps")
        if isinstance(unit_steps, list):
            items = []
            for step in unit_steps:
                if isinstance(step, dict) and isinstance(step.get("items"), list):
                    items.extend(step["items"])
            return items, "unitSteps"

    raise SystemExit(
        'Target JSON must be a top-level array, an object containing an "items" array, or an object containing "days"/"unitSteps".'
    )


def build_days(items):
    days = []
    for start in range(0, len(items), ITEMS_PER_DAY):
        chunk = items[start : start + ITEMS_PER_DAY]
        day_number = (start // ITEMS_PER_DAY) + 1
        items_in_day = []

        for index_in_day, item in enumerate(chunk, start=1):
            normalized = dict(item)
            normalized["index"] = index_in_day
            normalized["id"] = f"d{day_number}-i{index_in_day}"
            items_in_day.append(normalized)

        days.append(
            {
                "day": [
                    {
                        "items": items_in_day,
                        "stage": 1,
                        "stageCompleteDate": None,
                        "nextReviewDate": None,
                        "lastAttemptDate": "",
                    }
                ]
            }
        )

    return days


def append_items(target_path: Path, target_data, new_items):
    existing_items, previous_shape = extract_existing_items(target_data)
    all_items = existing_items + new_items

    if isinstance(target_data, dict):
        updated = dict(target_data)
    else:
        updated = build_empty_root(target_path)

    if "format" not in updated:
        updated["format"] = "combined"
    if not isinstance(updated.get("meta"), dict):
        updated["meta"] = {}
    if not updated["meta"].get("level"):
        updated["meta"]["level"] = "jlpt-n1"
    if not updated["meta"].get("title"):
        updated["meta"]["title"] = target_path.stem
    updated["days"] = build_days(all_items)

    updated.pop("formatVersion", None)
    updated.pop("source", None)
    updated.pop("section", None)
    updated.pop("totalWords", None)
    updated.pop("totalProblems", None)
    updated.pop("units", None)
    updated.pop("unitSteps", None)
    updated.pop("items", None)

    return updated, len(all_items), previous_shape


def write_target(target_path: Path, updated_data) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(
        json.dumps(updated_data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    if len(sys.argv) != 2:
        print_usage()
        raise SystemExit(1)

    target_path = Path(sys.argv[1]).expanduser()
    if not target_path.is_absolute():
        target_path = Path.cwd() / target_path

    print(f"Target file: {target_path}")
    print("Enter one serialized JSON object or array per line.")
    print('Press Enter to append immediately. Type EXIT to quit.')

    while True:
        try:
            raw_line = input("> ").strip()
        except EOFError:
            print("\nInput closed.")
            break

        if not raw_line:
            continue

        if raw_line.upper() == "EXIT":
            print("Stopped.")
            break

        try:
            new_items = normalize_items(parse_pasted_json(raw_line))
            target_data = load_or_initialize_target(target_path)
            updated_data, total_count, append_target = append_items(target_path, target_data, new_items)
            batch_count = len(new_items)
            write_target(target_path, updated_data)
        except SystemExit as exc:
            print(exc)
            continue

        print(f"Input item count: {batch_count}")
        print(f"Appended {batch_count} item(s) to {target_path}")
        print(f"Append target: {append_target}")
        print(f"Total items now: {total_count}")


if __name__ == "__main__":
    main()
