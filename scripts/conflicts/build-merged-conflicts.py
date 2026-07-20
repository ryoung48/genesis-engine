"""Build the canonical historical conflicts runtime file.

This merges the project-native EU4 war events with the broader conflicts.json
source. The output is intentionally client-facing: it contains resolved nation
tags and display data, while match diagnostics stay in the console summary.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any


DEFAULT_WARS = Path("public/earth-history/events/wars.json")
DEFAULT_CONFLICTS = Path(r"C:\Users\rayou\Downloads\conflicts.json")
DEFAULT_ALIASES = Path("public/earth-history/reference/conflict-country-aliases.json")
DEFAULT_WAR_ALIASES = Path("public/earth-history/reference/conflict-war-aliases.json")
DEFAULT_NATIONS = Path("public/earth-history/reference/nations.json")
DEFAULT_OUTPUT = Path("public/earth-history/events/conflicts.json")
START_YEAR = 2


def normalize_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    ascii_value = ascii_value.casefold().replace("&", " and ")
    ascii_value = re.sub(r"[^a-z0-9]+", " ", ascii_value)
    ascii_value = re.sub(r"\bthe\b", " ", ascii_value)
    return re.sub(r"\s+", " ", ascii_value).strip()


def days_to_year(days: int) -> int:
    return START_YEAR + days // 365


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_optional_json(path: Path) -> Any:
    if not path.exists():
        return []
    return load_json(path)


def alias_tags(alias: dict[str, Any], year: int) -> list[str]:
    if "tag" in alias:
        return [alias["tag"]]
    if "tags" in alias:
        return list(alias["tags"])

    tags: list[str] = []
    for rule in alias.get("rules", []):
        if "startYear" in rule and year < rule["startYear"]:
            continue
        if "endYear" in rule and year >= rule["endYear"]:
            continue
        if "tag" in rule:
            tags.append(rule["tag"])
        tags.extend(rule.get("tags", []))
    return tags


def normalize_coordinates(value: Any) -> list[float] | None:
    if not isinstance(value, list) or len(value) != 2:
        return None
    lon, lat = value
    if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
        return None
    return [float(lon), float(lat)]


def normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]


def normalize_casualty_range(value: Any) -> dict[str, int] | None:
    if not isinstance(value, dict):
        return None
    low = value.get("low")
    high = value.get("high")
    if not isinstance(low, int) or not isinstance(high, int):
        return None
    return {"min": low, "max": high}


def merge_participants(
    existing: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    # Keyed on the full span (not just tags+side) so that a nation with
    # multiple distinct join/leave spans in the same war -- e.g. it made a
    # separate peace and later rejoined -- keeps each span as its own entry
    # instead of collapsing to one min/max range.
    by_key: dict[tuple[tuple[str, ...], str | None, int | None, int | None], dict[str, Any]] = {}
    for participant in [*existing, *incoming]:
        tags = sorted(set(participant["nationTags"]))
        if not tags:
            continue
        side = participant.get("side")
        key = (tuple(tags), side, participant.get("joinedDate"), participant.get("leftDate"))
        by_key[key] = {
            "nationTags": tags,
            "side": side,
            "joinedDate": participant.get("joinedDate"),
            "leftDate": participant.get("leftDate"),
        }

    # A dateless entry (from the external conflicts source, which has no
    # per-nation timing) adds no information once a dated span for the same
    # tags+side already exists, so drop it to avoid a redundant duplicate.
    dated_tags_sides = {
        (tuple(item["nationTags"]), item["side"])
        for item in by_key.values()
        if item["joinedDate"] is not None or item["leftDate"] is not None
    }
    results = [
        item
        for item in by_key.values()
        if item["joinedDate"] is not None
        or item["leftDate"] is not None
        or (tuple(item["nationTags"]), item["side"]) not in dated_tags_sides
    ]
    return sorted(
        results,
        key=lambda item: (
            item["side"] or "participant",
            ",".join(item["nationTags"]),
            item["joinedDate"] or 0,
        ),
    )


def build_war_record(war: dict[str, Any]) -> dict[str, Any]:
    events = war.get("events", [])
    dates = [event["date"] for event in events if isinstance(event.get("date"), int)]
    starts = [event["date"] for event in events if event.get("kind") == "warStart"]
    ends = [event["date"] for event in events if event.get("kind") == "warEnd"]

    # Per-nation join/leave dates can differ from the war's overall span (a
    # nation may join a multi-stage war late, make a separate early peace, or
    # even rejoin later). Pair each nation's own warStart/warEnd events into
    # discrete spans -- rather than only tracking the war-wide min/max or a
    # single collapsed span per nation -- so that per-participant timing,
    # including any rejoin spans, survives into the merged record.
    events_by_tag: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        if event.get("kind") in ("warStart", "warEnd") and isinstance(event.get("nationTag"), str):
            events_by_tag.setdefault(event["nationTag"], []).append(event)

    participants: list[dict[str, Any]] = []
    for tag, tag_events in events_by_tag.items():
        tag_events.sort(key=lambda event: event["date"])
        open_span: dict[str, Any] | None = None
        for event in tag_events:
            if event["kind"] == "warStart":
                if open_span is not None:
                    participants.append(open_span)
                open_span = {
                    "nationTags": [tag],
                    "side": event.get("side") or "participant",
                    "joinedDate": event["date"],
                    "leftDate": None,
                }
            elif open_span is not None:
                open_span["leftDate"] = event["date"]
                participants.append(open_span)
                open_span = None
        if open_span is not None:
            participants.append(open_span)

    start_date = min(starts or dates)
    end_date = max(ends or dates)
    return {
        "id": war["warId"],
        "name": war["name"],
        "startYear": days_to_year(start_date),
        "endYear": days_to_year(end_date),
        "startDate": start_date,
        "endDate": end_date,
        "coordinates": None,
        "locations": [],
        "participants": merge_participants([], participants),
        "importance": None,
        "casualties": None,
        "casualtyRange": None,
        "partOf": [],
        "description": None,
        "wikipediaUrl": None,
        "sources": [],
        "sourceRecords": [f"wars:{war['warId']}"],
        "casusBelli": war.get("casusBelli"),
        "isRebel": bool(war.get("isRebel")),
    }


def build_conflict_record(
    conflict: dict[str, Any],
    aliases: dict[str, dict[str, Any]],
    nation_names: dict[str, list[str]],
    nation_tags: set[str],
    unmatched: Counter[str],
) -> dict[str, Any]:
    year = conflict["startYear"]
    participants: list[dict[str, Any]] = []
    for country in normalize_string_list(conflict.get("countries")):
        normalized = normalize_name(country)
        tags: list[str] = []
        if normalized in aliases:
            tags = alias_tags(aliases[normalized], year)
        elif normalized in nation_names:
            tags = nation_names[normalized]

        valid_tags = sorted({tag for tag in tags if tag in nation_tags})
        if valid_tags:
            participants.append(
                {
                    "nationTags": valid_tags,
                    "side": "participant",
                    "joinedDate": None,
                    "leftDate": None,
                }
            )
        else:
            unmatched[country] += 1

    casualties = conflict.get("casualties")
    if not isinstance(casualties, int):
        casualties = None

    return {
        "id": conflict["id"],
        "name": conflict["name"],
        "startYear": year,
        "endYear": conflict.get("endYear") if isinstance(conflict.get("endYear"), int) else None,
        "startDate": None,
        "endDate": None,
        "coordinates": normalize_coordinates(conflict.get("coordinates")),
        "locations": normalize_string_list(conflict.get("locations")),
        "participants": merge_participants([], participants),
        "importance": conflict.get("importance") if isinstance(conflict.get("importance"), int) else None,
        "casualties": casualties,
        "casualtyRange": normalize_casualty_range(conflict.get("casualtyRange")),
        "partOf": normalize_string_list(conflict.get("partOf")),
        "description": conflict.get("description") if isinstance(conflict.get("description"), str) else None,
        "wikipediaUrl": conflict.get("wikipediaUrl") if isinstance(conflict.get("wikipediaUrl"), str) else None,
        "sources": normalize_string_list(conflict.get("sources")),
        "sourceRecords": [f"conflicts:{conflict['id']}"],
        "casusBelli": None,
        "isRebel": False,
    }


def merge_record(base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": base["id"],
        "name": base["name"],
        "startYear": min(base["startYear"], incoming["startYear"]),
        "endYear": max(
            year for year in [base.get("endYear"), incoming.get("endYear")] if year is not None
        )
        if base.get("endYear") is not None or incoming.get("endYear") is not None
        else None,
        "startDate": min(
            (date for date in [base.get("startDate"), incoming.get("startDate")] if date is not None),
            default=None,
        ),
        "endDate": max(
            (date for date in [base.get("endDate"), incoming.get("endDate")] if date is not None),
            default=None,
        ),
        "coordinates": base["coordinates"] or incoming["coordinates"],
        "locations": sorted(set(base["locations"]) | set(incoming["locations"])),
        "participants": merge_participants(base["participants"], incoming["participants"]),
        "importance": incoming["importance"] if incoming["importance"] is not None else base["importance"],
        "casualties": incoming["casualties"] if incoming["casualties"] is not None else base["casualties"],
        "casualtyRange": incoming["casualtyRange"] or base["casualtyRange"],
        "partOf": sorted(set(base["partOf"]) | set(incoming["partOf"])),
        "description": incoming["description"] or base["description"],
        "wikipediaUrl": incoming["wikipediaUrl"] or base["wikipediaUrl"],
        "sources": sorted(set(base["sources"]) | set(incoming["sources"])),
        "sourceRecords": sorted(set(base["sourceRecords"]) | set(incoming["sourceRecords"])),
        "casusBelli": base["casusBelli"] or incoming["casusBelli"],
        "isRebel": bool(base["isRebel"] or incoming["isRebel"]),
    }


def link_battles_to_wars(
    records_by_id: dict[str, dict[str, Any]],
    records_by_name: dict[str, str],
) -> int:
    """Resolves each record's `partOf` (raw parent-conflict name strings from
    the external source) to the actual parent conflict's `id` -- by exact id
    or normalized-name match only, the same matching this file already uses
    elsewhere -- and populates each parent's `childIds` with the ids of every
    record that resolved to it (e.g. a battle's `partOf` resolving to its
    war, and the war showing that battle back in `childIds`). A partOf entry
    that names a parent with no record of its own in this file (many of the
    external source's named sub-campaigns, like coalition-numbered
    Napoleonic Wars phases, were never given their own record -- and no
    amount of name matching invents a record that doesn't exist) is left as
    the original display-only text rather than dropped, since it's still
    informative even though it can't be a link. Returns the resolved count.
    """
    resolved_count = 0
    children_by_parent_id: dict[str, list[str]] = {}
    for record in records_by_id.values():
        resolved_part_of: list[str] = []
        for name in record["partOf"]:
            if name in records_by_id:
                resolved_part_of.append(name)
            else:
                target_id = records_by_name.get(normalize_name(name))
                resolved_part_of.append(
                    target_id if target_id and target_id in records_by_id else name
                )
        record["partOf"] = resolved_part_of
        for parent_id in resolved_part_of:
            if parent_id in records_by_id:
                resolved_count += 1
                children_by_parent_id.setdefault(parent_id, []).append(record["id"])
    for record in records_by_id.values():
        record["childIds"] = sorted(children_by_parent_id.get(record["id"], []))
    return resolved_count


def build_merged_conflicts(
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], Counter[str], dict[str, Any]]:
    wars = load_json(args.wars)
    source_conflicts = load_json(args.conflicts)
    aliases = {normalize_name(alias["sourceName"]): alias for alias in load_json(args.aliases)}
    war_aliases = {alias["warId"]: alias["conflictId"] for alias in load_optional_json(args.war_aliases)}
    nations = load_json(args.nations)
    nation_tags = {nation["tag"] for nation in nations}
    nation_names: dict[str, list[str]] = {}
    for nation in nations:
        nation_names.setdefault(normalize_name(nation["name"]), []).append(nation["tag"])

    records_by_id: dict[str, dict[str, Any]] = {}
    records_by_name: dict[str, str] = {}
    unmatched: Counter[str] = Counter()
    for conflict in source_conflicts:
        record = build_conflict_record(conflict, aliases, nation_names, nation_tags, unmatched)
        normalized_name = normalize_name(record["name"])
        existing_id = records_by_name.get(normalized_name)
        if existing_id:
            records_by_id[existing_id] = merge_record(records_by_id[existing_id], record)
        else:
            records_by_id[record["id"]] = record
            records_by_name[normalized_name] = record["id"]

    report: dict[str, Any] = {
        "warCount": len(wars),
        "conflictSourceCount": len(source_conflicts),
        "warAliasMatches": [],
        "normalizedNameMatches": [],
        "unmatchedWars": [],
    }

    for war in wars:
        record = build_war_record(war)
        alias_conflict_id = war_aliases.get(war["warId"])
        if alias_conflict_id and alias_conflict_id in records_by_id:
            records_by_id[alias_conflict_id] = merge_record(records_by_id[alias_conflict_id], record)
            report["warAliasMatches"].append(
                {"warId": war["warId"], "warName": war["name"], "conflictId": alias_conflict_id}
            )
            continue

        normalized_name = normalize_name(record["name"])
        if normalized_name in records_by_name:
            conflict_id = records_by_name[normalized_name]
            records_by_id[conflict_id] = merge_record(records_by_id[conflict_id], record)
            report["normalizedNameMatches"].append(
                {"warId": war["warId"], "warName": war["name"], "conflictId": conflict_id}
            )
        else:
            records_by_id[record["id"]] = record
            records_by_name[normalized_name] = record["id"]
            report["unmatchedWars"].append({"warId": war["warId"], "warName": war["name"]})

    report["partOfResolvedCount"] = link_battles_to_wars(records_by_id, records_by_name)
    records = sorted(records_by_id.values(), key=lambda item: (item["startYear"], item["name"], item["id"]))
    report["mergedCount"] = len(records)
    report["conflictOnlyCount"] = len(
        [record for record in records if not any(src.startswith("wars:") for src in record["sourceRecords"])]
    )
    report["eu4EraConflictOnlyCount"] = len(
        [
            record
            for record in records
            if not any(src.startswith("wars:") for src in record["sourceRecords"])
            and isinstance(record.get("startYear"), int)
            and 1350 <= record["startYear"] <= 1821
        ]
    )
    return records, unmatched, report


def print_report(report: dict[str, Any]) -> None:
    print(f"war source records: {report['warCount']}")
    print(f"external conflict source records: {report['conflictSourceCount']}")
    print(f"merged conflicts if written: {report['mergedCount']}")
    print(f"war alias matches: {len(report['warAliasMatches'])}")
    print(f"normalized-name war matches: {len(report['normalizedNameMatches'])}")
    print(f"unmatched wars added as war-only conflicts: {len(report['unmatchedWars'])}")
    print(f"conflict-only records after merge: {report['conflictOnlyCount']}")
    print(f"EU4-era conflict-only records after merge: {report['eu4EraConflictOnlyCount']}")
    print(f"partOf (battle -> war) links resolved: {report['partOfResolvedCount']}")
    if report["warAliasMatches"]:
        print("war alias matches:")
        for match in report["warAliasMatches"][:25]:
            print(f"  {match['warId']}\t{match['conflictId']}\t{match['warName']}")
    if report["unmatchedWars"]:
        print("sample unmatched wars:")
        for match in report["unmatchedWars"][:25]:
            print(f"  {match['warId']}\t{match['warName']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wars", type=Path, default=DEFAULT_WARS)
    parser.add_argument("--conflicts", type=Path, default=DEFAULT_CONFLICTS)
    parser.add_argument("--aliases", type=Path, default=DEFAULT_ALIASES)
    parser.add_argument("--war-aliases", type=Path, default=DEFAULT_WAR_ALIASES)
    parser.add_argument("--nations", type=Path, default=DEFAULT_NATIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()

    records, unmatched, report = build_merged_conflicts(args)
    if args.report_only:
        print_report(report)
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(records, ensure_ascii=False, indent="\t") + "\n", encoding="utf-8")

    print(f"merged conflicts: {len(records)}")
    if not args.report_only:
        print(f"output: {args.output}")
    print(f"unmatched participant mentions: {sum(unmatched.values())}")
    print(f"unique unmatched participant names: {len(unmatched)}")
    if unmatched:
        print("top unmatched participants:")
        for name, count in unmatched.most_common(25):
            print(f"  {count}\t{name}")


if __name__ == "__main__":
    main()
