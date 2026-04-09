#!/usr/bin/env python3
"""Compare field paths between JSON collections.

Examples:
  python asset/compare_json_fields.py
  python asset/compare_json_fields.py --path-a "days[].day[].items[]" --path-b "days[].items[]"
  python asset/compare_json_fields.py --match-key id --limit 5
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


DEFAULT_FILE_A = "asset/jlpt-one-book-n1.json"
DEFAULT_FILE_B = "asset/tmp.json"
DEFAULT_PATH_A = "days[].day[].items[]"
DEFAULT_PATH_B = "days[].items[]"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def split_path(path_expr: str) -> list[str]:
    return [part.strip() for part in path_expr.split(".") if part.strip()]


def walk_path(root: Any, path_expr: str) -> list[Any]:
    nodes = [root]
    for segment in split_path(path_expr):
        next_nodes: list[Any] = []
        is_list_segment = segment.endswith("[]")
        key = segment[:-2] if is_list_segment else segment

        for node in nodes:
            current = node
            if key:
                if not isinstance(current, dict) or key not in current:
                    continue
                current = current[key]

            if is_list_segment:
                if isinstance(current, list):
                    next_nodes.extend(current)
            else:
                next_nodes.append(current)

        nodes = next_nodes
    return nodes


def flatten_fields(value: Any, prefix: str = "") -> set[str]:
    fields: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            child_prefix = f"{prefix}.{key}" if prefix else key
            fields.add(child_prefix)
            fields.update(flatten_fields(child, child_prefix))
    elif isinstance(value, list):
        list_prefix = f"{prefix}[]" if prefix else "[]"
        fields.add(list_prefix)
        for child in value:
            fields.update(flatten_fields(child, list_prefix))
    return fields


def collect_field_map(records: list[Any], match_key: str) -> dict[str, set[str]]:
    field_map: dict[str, set[str]] = {}
    seen_keys: dict[str, int] = {}
    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            field_map[f"#{index}"] = flatten_fields(record)
            continue

        raw_key = record.get(match_key)
        if raw_key is None:
            key = f"#{index}"
        else:
            key = str(raw_key)
        occurrence = seen_keys.get(key, 0) + 1
        seen_keys[key] = occurrence
        if occurrence > 1:
            key = f"{key}#{occurrence}"
        field_map[key] = flatten_fields(record)
    return field_map


def print_section(title: str, values: list[str]) -> None:
    print(title)
    if not values:
        print("  (none)")
        return
    for value in values:
        print(f"  - {value}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Compare JSON field paths between two collections.")
    parser.add_argument("positional_file_a", nargs="?", help="optional positional alias for --file-a")
    parser.add_argument("positional_file_b", nargs="?", help="optional positional alias for --file-b")
    parser.add_argument("--file-a", default=DEFAULT_FILE_A, help=f"default: {DEFAULT_FILE_A}")
    parser.add_argument("--file-b", default=DEFAULT_FILE_B, help=f"default: {DEFAULT_FILE_B}")
    parser.add_argument("--path-a", default=DEFAULT_PATH_A, help=f"default: {DEFAULT_PATH_A}")
    parser.add_argument("--path-b", default=DEFAULT_PATH_B, help=f"default: {DEFAULT_PATH_B}")
    parser.add_argument("--match-key", default="id", help="field used to align records between A and B")
    parser.add_argument("--limit", type=int, default=20, help="max per-record mismatches to print")
    parser.add_argument("--show-common", action="store_true", help="also print common field paths")
    args = parser.parse_args(argv)

    file_a = Path(args.positional_file_a or args.file_a)
    file_b = Path(args.positional_file_b or args.file_b)

    root_a = load_json(file_a)
    root_b = load_json(file_b)
    records_a = walk_path(root_a, args.path_a)
    records_b = walk_path(root_b, args.path_b)

    if not records_a:
        print(f"no records found in A with path: {args.path_a}", file=sys.stderr)
        return 1
    if not records_b:
        print(f"no records found in B with path: {args.path_b}", file=sys.stderr)
        return 1

    fields_a = collect_field_map(records_a, args.match_key)
    fields_b = collect_field_map(records_b, args.match_key)

    all_keys = sorted(set(fields_a) | set(fields_b))
    only_in_a_keys = sorted(set(fields_a) - set(fields_b))
    only_in_b_keys = sorted(set(fields_b) - set(fields_a))
    aggregate_a = set().union(*fields_a.values())
    aggregate_b = set().union(*fields_b.values())

    print(f"A file: {file_a}")
    print(f"B file: {file_b}")
    print(f"A path: {args.path_a} -> {len(records_a)} records")
    print(f"B path: {args.path_b} -> {len(records_b)} records")
    print(f"match key: {args.match_key}")
    print()

    print_section("Record keys only in A", only_in_a_keys)
    print_section("Record keys only in B", only_in_b_keys)
    print()
    print_section("Aggregate fields only in A", sorted(aggregate_a - aggregate_b))
    print_section("Aggregate fields only in B", sorted(aggregate_b - aggregate_a))
    if args.show_common:
        print_section("Aggregate common fields", sorted(aggregate_a & aggregate_b))
    print()

    mismatch_count = 0
    for key in all_keys:
        if key not in fields_a or key not in fields_b:
            continue
        only_in_a = sorted(fields_a[key] - fields_b[key])
        only_in_b = sorted(fields_b[key] - fields_a[key])
        common = sorted(fields_a[key] & fields_b[key])
        if not only_in_a and not only_in_b and not args.show_common:
            continue

        mismatch_count += 1
        print(f"[{key}]")
        print_section("  fields only in A", only_in_a)
        print_section("  fields only in B", only_in_b)
        if args.show_common:
            print_section("  common fields", common)
        print()
        if mismatch_count >= args.limit:
            remaining = len(all_keys) - mismatch_count
            if remaining > 0:
                print(f"... truncated after {args.limit} matched records")
            break

    if mismatch_count == 0:
        print("No field differences found for matched records.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
