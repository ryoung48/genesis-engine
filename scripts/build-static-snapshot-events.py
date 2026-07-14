"""Merges a single-point-in-time historical borders GeoJSON (e.g. a "world
at year X" snapshot with named polygons but no per-feature dates) into the
earth-history event data, as an early anchor point before EU4's own
coverage begins (~year 2). Unlike build-eu4-history-events.py, this is not
a continuous history source -- each input file is one moment in time, so
this script can be re-run once per snapshot file to layer in more anchors
(e.g. a world_bc500.geojson, world_1000ad.geojson series).

For each EU4 province (via its representative point, from
public/heightmap/eu4-provinces-seeds.json), finds which named polygon (if
any) in the snapshot contains it, and:
  - reuses an existing EU4 nation's tag when its `name` in
    reference/nations.json matches the polygon's NAME (case-insensitive),
    so e.g. a "Roman Empire" snapshot polygon maps onto the real `ROM` tag
    instead of minting an unrelated synthetic one -- otherwise the same
    continuous polity would fracture into two disconnected identities
    (different tag, color, and metadata) the moment EU4's own coverage
    picks it up
  - otherwise mints a synthetic nation (slugified name as tag) for any
    polity not already in reference/nations.json, appending to that file
  - replaces the province's `base` owner/controller in events/provinces.json
    with that synthetic tag, POSTPONING what was previously the earliest
    known state into a new dated event at the snapshot's date -- i.e. the
    snapshot becomes the new "day zero" for that province, and whatever
    EU4 already knew about it (base fields, or its first event) still takes
    over at its own correct date afterward.
  - (--baseline snapshot only) also preserves the raw EU4 base owner it's
    discarding as a dated event at EU4's own coverage start (year 2), so a
    province that no later bc* snapshot happens to re-match (a coastline
    precision gap) still self-heals to its real EU4 owner instead of
    indefinitely keeping a stale synthetic tag from whichever snapshot last
    matched it -- see _reset_base's doc comment.

Only touches provinces whose representative point falls inside one of the
snapshot's *named* polygons -- unnamed regions (frontier/unclaimed in that
era, common in ancient-world snapshots) are left completely alone, so
"no owner" naturally renders the same light-gray as any other unclaimed
province.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

from shapely.geometry import Point, shape

from eu4_date import eu4_date_to_days

DEFAULT_EVENTS_DIR = Path("public/earth-history/events")
DEFAULT_REFERENCE_DIR = Path("public/earth-history/reference")
DEFAULT_SEEDS = Path("public/heightmap/eu4-provinces-seeds.json")


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", normalized.lower()).strip("_")
    return slug or "unknown"


def hash_color(key: str) -> list[int]:
    """Deterministic fallback color for synthetic nations the snapshot data
    has no color for -- mirrors src/model/earth/history/color.ts's
    hashColorForKey so a given tag's color is at least stable, even if it
    doesn't match anything in-game."""
    h = 0
    for ch in key:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    hue = (h % 360) / 360
    r, g, b = _hsl_to_rgb(hue, 0.55, 0.5)
    return [round(r * 255), round(g * 255), round(b * 255)]


def _hsl_to_rgb(h: float, s: float, l: float) -> tuple[float, float, float]:
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h * 6) % 2 - 1))
    m = l - c / 2
    seg = int(h * 6)
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][min(seg, 5)]
    return r + m, g + m, b + m


NON_NATION_TYPES = {
    "culture",
    "hunter-foragers",
    "hunter-gatherers",
    "taiga hunter-gatherers",
    "hunter-gatherers and maize farmers",
    "pastoral nomads",
    "simple farming society",
    "complex farming society / chiefdom",
}
"""Some of the historical-basemaps snapshots (123000 BC through 2000 BC
only -- the field is absent entirely from every later file) tag each named
polygon with a rough societal-organization `type`: actual polities
(kingdoms/state society/civilization -- or no type at all, the default for
every snapshot after 2000 BC once everything named is presumably a real
polity) vs. looser cultural/ethnic/subsistence groupings with no real
government to speak of (a "culture", "hunter-foragers", etc). Only the
former should ever become a nation with owner/controller events -- treating
e.g. "Neanderthal" or "Coastal and Woodland Mesolithic Hunter-Foragers" as
if it were a sovereign state with borders is misleading. For now the
latter are just skipped entirely (ignored, not even used for a culture
overlay) -- see conversation history."""

def _normalize_ascii(text: str) -> str:
    """Strips diacritics before comparing against NON_NATION_TYPES -- e.g.
    the source data's "hunter-gatherers and maïze farmers" type string
    needs to match the plain-ASCII "maize" entry below."""
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", normalized).strip().lower()


NON_NATION_NAME_KEYWORDS = (
    "hunter-gatherer",
    "hunter gatherer",
    "hunters-gatherer",
    "hunters gatherer",
    "hunter",
    "forager",
    "pastoral",
    "pastoralist",
    "nomad",
    "cereal farmer",
)
"""Fallback for snapshots from 1500 BC onward, which carry no `type` field
at all -- groups like "Arabian pastoral nomads" or "West African cereal
farmers" persisted as named polygons that far into the series (real
foraging/pastoral populations that genuinely still existed then, unlike
the deeper-time culture-blob entries NON_NATION_TYPES catches), with no
metadata signal to exclude them by type. Matched as a substring against the
lowercased name instead."""


def load_snapshot_polygons(path: Path) -> list[tuple[str, object]]:
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    polygons = []
    skipped_non_nation = 0
    for feature in data["features"]:
        name = feature["properties"].get("NAME")
        if not name:
            continue
        feature_type = feature["properties"].get("type")
        if isinstance(feature_type, str) and _normalize_ascii(feature_type) in NON_NATION_TYPES:
            skipped_non_nation += 1
            continue
        name_lower = name.lower()
        if feature_type is None and any(kw in name_lower for kw in NON_NATION_NAME_KEYWORDS):
            skipped_non_nation += 1
            continue
        polygons.append((name, shape(feature["geometry"])))
    if skipped_non_nation:
        print(f"skipped {skipped_non_nation} non-nation (culture/subsistence) polygons")
    return polygons


def match_provinces(seeds: list[dict], polygons: list[tuple[str, object]]) -> dict[str, str]:
    """Returns {province_id: polity_name}. O(provinces * polygons) point-in-
    polygon tests -- fine at this scale (a few thousand provinces, a few
    hundred polygons per snapshot)."""
    matches: dict[str, str] = {}
    for seed in seeds:
        point = Point(seed["lon"], seed["lat"])
        for name, polygon in polygons:
            if polygon.contains(point):
                matches[str(seed["id"])] = name
                break
    return matches


EU4_COVERAGE_START_DATE = eu4_date_to_days("2.1.1")
"""Anchor date for restoring a province's real (pre-overwrite) EU4 base
owner -- see _reset_base. Matches EARTH_HISTORY_START_YEAR (year 2) used
elsewhere as "where EU4's own coverage begins"."""


def _reset_base(entry: dict, new_owner: str | None) -> None:
    """Only used for the --baseline (chronologically OLDEST) snapshot:
    overwrites `base` (what fold.ts treats as true since the beginning of
    time) with `new_owner` (a tag, or None for "unclaimed"), discarding
    whatever raw EU4 `base` owner/controller was there before.

    Before being discarded, that raw value is preserved as a dated event at
    EU4_COVERAGE_START_DATE -- it was never a real dated fact from 123000 BC
    (inventing a date for it back then was itself a bug: it gave a tag like
    ROM a false claim starting in deep prehistory), but it IS a real fact as
    of EU4's own coverage start, since it's what EU4 itself recorded as that
    province's earliest known owner. Restoring it there self-heals any gap
    where a snapshot in the bc* series happens not to cover a given
    province (e.g. a coastline point falling just outside every later
    polygon) -- without it, the province would keep whatever synthetic tag
    it last matched, indefinitely, until real EU4 events (if any exist for
    it) eventually fire. Any real EU4 owner change already exists as a
    normal dated event in `entry["events"]` (untouched by this script) and
    still fires at its own correct, later date regardless of what happens
    here. Only the very first snapshot in a chronological series should
    ever touch `base` -- see apply_to_provinces's doc comment for why later
    snapshots must NOT use this (that was the *first* version of this bug:
    it let a much later snapshot's match retroactively overwrite "since
    forever")."""
    raw_owner = entry["base"].get("owner")
    if raw_owner is not None:
        entry["events"].append(
            {"date": EU4_COVERAGE_START_DATE, "kind": "owner", "payload": {"tag": raw_owner}}
        )
        entry["events"].append(
            {
                "date": EU4_COVERAGE_START_DATE,
                "kind": "controller",
                "payload": {"tag": entry["base"].get("controller") or raw_owner},
            }
        )
        entry["events"].sort(key=lambda e: e["date"])
    entry["base"]["owner"] = new_owner
    entry["base"]["controller"] = new_owner


def apply_to_provinces(
    provinces: dict,
    matches: dict[str, str],
    date_days: int,
    name_to_tag: dict[str, str],
    baseline: bool,
) -> tuple[int, int]:
    """Returns (matched_applied, baseline_cleared).

    For the --baseline (oldest) snapshot, a match becomes the province's
    `base` state (see _reset_base) -- true from the beginning of time until
    superseded. For every LATER snapshot, a match must NOT touch `base`;
    it's a normal historical transition, so it's appended as a dated
    owner/controller event just like any real EU4 event, only ever taking
    effect starting at its own date and overridden by whatever comes next
    chronologically (a later snapshot's event, or real EU4 data).

    When `baseline` is set, provinces NOT matched by this snapshot also get
    cleared to unclaimed at this date -- otherwise their `base` owner is
    whatever raw EU4 data says, which is often a much LATER tag (e.g. Rome)
    that EU4 happened to record as the earliest *it* knew about, which would
    otherwise leak backward into every date before it."""
    applied = 0
    for province_id, polity_name in matches.items():
        entry = provinces.get(province_id)
        if entry is None:
            continue
        tag = name_to_tag[polity_name]
        if baseline:
            _reset_base(entry, tag)
        else:
            entry["events"].append({"date": date_days, "kind": "owner", "payload": {"tag": tag}})
            entry["events"].append(
                {"date": date_days, "kind": "controller", "payload": {"tag": tag}}
            )
            entry["events"].sort(key=lambda e: e["date"])
        applied += 1

    cleared = 0
    if baseline:
        for province_id, entry in provinces.items():
            if province_id in matches:
                continue
            if entry["base"].get("owner") is None:
                continue
            _reset_base(entry, None)
            cleared += 1
    return applied, cleared


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geojson", type=Path, help="Path to the snapshot GeoJSON")
    parser.add_argument("--date", required=True, help='Snapshot date, e.g. "-1.1.1" for 1 BC (astronomical year 0)')
    parser.add_argument("--events-dir", type=Path, default=DEFAULT_EVENTS_DIR)
    parser.add_argument("--reference-dir", type=Path, default=DEFAULT_REFERENCE_DIR)
    parser.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS)
    parser.add_argument(
        "--baseline",
        action="store_true",
        help="Also clear unmatched provinces to unclaimed at this date -- pass this "
        "only for the chronologically OLDEST snapshot in a series (see "
        "apply_to_provinces's doc comment).",
    )
    args = parser.parse_args()

    date_days = eu4_date_to_days(args.date)

    with args.seeds.open(encoding="utf-8") as f:
        seeds = json.load(f)
    polygons = load_snapshot_polygons(args.geojson)
    matches = match_provinces(seeds, polygons)
    print(f"matched {len(matches)} of {len(seeds)} provinces to {len(polygons)} named polygons")

    provinces_path = args.events_dir / "provinces.json"
    with provinces_path.open(encoding="utf-8") as f:
        provinces = json.load(f)

    nations_path = args.reference_dir / "nations.json"
    with nations_path.open(encoding="utf-8") as f:
        nations = json.load(f)
    existing_tags = {n["tag"] for n in nations}
    name_to_existing_tag = {n["name"].strip().lower(): n["tag"] for n in nations if n.get("name")}

    polity_names = sorted({name for name in matches.values()})
    name_to_tag: dict[str, str] = {}
    reused = 0
    for name in polity_names:
        existing_tag = name_to_existing_tag.get(name.strip().lower())
        if existing_tag is not None:
            name_to_tag[name] = existing_tag
            reused += 1
        else:
            name_to_tag[name] = slugify(name)
    print(f"reused {reused} existing EU4 tags by name match")

    minted = 0
    for name in polity_names:
        tag = name_to_tag[name]
        if tag in existing_tags:
            continue
        nations.append(
            {
                "tag": tag,
                "name": name,
                "color": hash_color(tag),
                "graphicalCulture": "westerngfx",
                "initialGovernmentType": None,
                "primaryCulture": None,
                "religion": None,
            }
        )
        existing_tags.add(tag)
        minted += 1
    print(f"minted {minted} new synthetic nations")

    applied, cleared = apply_to_provinces(
        provinces, matches, date_days, name_to_tag, args.baseline
    )
    print(f"applied to {applied} provinces at date {args.date} ({date_days} days)")
    if args.baseline:
        print(f"baseline: cleared {cleared} unmatched provinces to unclaimed")

    provinces_path.write_text(json.dumps(provinces), encoding="utf-8")
    nations_path.write_text(json.dumps(nations, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
