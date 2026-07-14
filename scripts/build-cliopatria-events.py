"""Layers Cliopatria's per-polity dated polygon history into earth-history's
province events, replacing the coarser world_bc*.geojson single-point-in-
time snapshot approach (build-static-snapshot-events.py) for pre-2AD
coverage.

Unlike the snapshot series, this source gives each polity's territory as a
sequence of dated polygon slices (FromYear/ToYear per feature) -- e.g. Rome
alone has ~15 slices through the Republic, vs. the old approach's 13 fixed
whole-timeline snapshot dates. This lets province ownership be
reconstructed as a real chronological sequence of dated events, the same
as EU4's own province history, instead of "baseline + postponed event"
snapshot gymnastics -- and the source is already split into Type=POLITY
vs Type=RELATION, so no more culture/hunter-gatherer filtering is needed
either.

Year convention: FromYear/ToYear use plain BC-year labels (magnitude ==
the BC year cited in sources, e.g. -323 means "323 BC"), not astronomical
year numbering. Verified against two precise, single-day, universally-
cited historical anchors: Laomedon's Syrian satrapy begins at
FromYear=-323, matching the Partition of Babylon (323 BC, immediately
after Alexander's death); the Roman Republic's -44..-43 slice matches
Caesar's assassination (44 BC, Ides of March). (One softer anchor --
Carthage's last slice ending at -145 -- would suggest 146 BC under the
opposite convention, but that's a coarse period boundary rather than a
single-day event, so it's weighted less than the two precise matches.)
See cliopatria_year_to_astro.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

from eu4_date import eu4_date_to_days
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

DEFAULT_SOURCE = Path(
    r"C:\Users\rayou\Downloads\cliopatria.geojson\cliopatria_polities_only.geojson"
)
DEFAULT_EVENTS_DIR = Path("public/earth-history/events")
DEFAULT_REFERENCE_DIR = Path("public/earth-history/reference")
DEFAULT_SEEDS = Path("public/heightmap/eu4-provinces-seeds.json")

EU4_COVERAGE_START_YEAR = 2
EU4_COVERAGE_START_DATE = eu4_date_to_days("2.1.1")


def cliopatria_year_to_astro(raw_year: int) -> int:
    """raw_year < 0 is a plain BC-year label (magnitude == the BC year), so
    it needs +1 to become astronomical (1 BC = year 0); raw_year >= 0 is
    already a literal AD year (and raw_year == 0 conveniently also lands on
    astronomical year 0 = 1 BC via the same +1 shift, consistent with how
    the source uses 0 as the last BC slice immediately before its year-1
    AD slices)."""
    return raw_year + 1 if raw_year < 0 else raw_year


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", normalized.lower()).strip("_")
    return slug or "unknown"


def hash_color(key: str) -> list[int]:
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


def load_polities(source: Path) -> list[dict]:
    """Returns polity slices {name, from, to, geom, area} with astro years,
    clipped to slices that start before EU4_COVERAGE_START_YEAR (later
    slices are irrelevant -- EU4's own data covers from there)."""
    with source.open(encoding="utf-8") as f:
        data = json.load(f)
    out = []
    for feature in data["features"]:
        props = feature["properties"]
        if props.get("Type") != "POLITY":
            continue
        name = props.get("Name")
        if not name:
            continue
        astro_from = cliopatria_year_to_astro(int(props["FromYear"]))
        if astro_from >= EU4_COVERAGE_START_YEAR:
            continue
        astro_to = cliopatria_year_to_astro(int(props["ToYear"]))
        out.append(
            {
                "name": name,
                "from": astro_from,
                "to": astro_to,
                "geom": shape(feature["geometry"]),
                "area": props.get("Area") or 0,
            }
        )
    return out


def _clean_polity_name(name: str) -> str:
    """A handful of Cliopatria polity names are fully wrapped in parens
    (e.g. "(Macedonian Empire)", "(Phoenician Empire)") -- these appear to
    be Cliopatria's own convention for loose/informal aggregate groupings
    rather than a single formal state, but they're still real POLITY
    features with their own geometry here, so they're minted as nations
    same as any other; just strip the enclosing parens for display."""
    if name.startswith("(") and name.endswith(")"):
        return name[1:-1].strip()
    return name


POLITY_NAME_ALIASES = {
    "han dynasty": "han",
    "parthian empire": "parthia",
}
"""Cliopatria's name for a polity sometimes doesn't literally match the
existing reference/nations.json entry it should reuse (e.g. Cliopatria's
"Han Dynasty" vs. vanilla EU4's "Han", tag HND) -- the exact-match lookup
in resolve_tags misses these, minting an unnecessary separate synthetic
tag. Maps lowercased Cliopatria name -> lowercased target name to look up
instead."""


def resolve_tags(polity_names: set[str], nations: list[dict]) -> tuple[dict[str, str], int, int]:
    name_to_existing_tag = {n["name"].strip().lower(): n["tag"] for n in nations if n.get("name")}
    existing_tags = {n["tag"] for n in nations}

    resolve: dict[str, str] = {}
    reused = 0
    minted = 0
    for name in sorted(polity_names):
        lookup_name = POLITY_NAME_ALIASES.get(name.strip().lower(), name.strip().lower())
        existing_tag = name_to_existing_tag.get(lookup_name)
        if existing_tag is not None:
            resolve[name] = existing_tag
            reused += 1
            continue
        tag = f"cp_{slugify(name)}"
        resolve[name] = tag
        if tag not in existing_tags:
            nations.append(
                {
                    "tag": tag,
                    "name": _clean_polity_name(name),
                    "color": hash_color(tag),
                    "graphicalCulture": "westerngfx",
                    "initialGovernmentType": None,
                    "primaryCulture": None,
                    "religion": None,
                }
            )
            existing_tags.add(tag)
            minted += 1
    return resolve, reused, minted


def extract_2ad_culture_religion(
    existing_provinces: dict,
) -> dict[str, tuple[str | None, str | None]]:
    """Each province's culture/religion as of EU4_COVERAGE_START_DATE (year
    2) -- the earliest "culture"/"religion" event in its existing events
    list, since nothing dated earlier than that can exist from EU4's own
    source data. Used as the sole culture/religion value applied across a
    province's entire Cliopatria-covered history (see build_province_events)
    -- no per-era guessing, no minting: whatever the province is in 2 AD is
    assumed to hold all the way back to wherever Cliopatria's own coverage
    for that specific province begins, and no further."""
    result: dict[str, tuple[str | None, str | None]] = {}
    for province_id, entry in existing_provinces.items():
        culture = None
        religion = None
        for e in sorted(entry.get("events", []), key=lambda e: e["date"]):
            if e["kind"] == "culture" and culture is None:
                culture = e["payload"].get("cultureId")
            elif e["kind"] == "religion" and religion is None:
                religion = e["payload"].get("religionId")
            if culture is not None and religion is not None:
                break
        result[province_id] = (culture, religion)
    return result


def build_province_events(
    seeds: list[dict],
    polities: list[dict],
    tag_resolve: dict[str, str],
    culture_religion_2ad: dict[str, tuple[str | None, str | None]],
    blocked_province_ids: set[str],
) -> tuple[dict[str, list[dict]], int]:
    """For every distinct boundary year across all polity slices, builds an
    STRtree of whichever slices are active that year and resolves each
    province seed's owner via point-in-polygon (ties broken by smallest
    polity area, i.e. the most specific/local claim wins over a broader
    overlapping one). Emits a dated owner/controller event per province
    only when the resolved owner actually changes from the previous
    boundary year, so provinces with a long-unchanged owner don't get
    redundant repeated events. Also anchors a single culture and religion
    event per touched province, at that province's earliest Cliopatria-
    covered boundary year, carrying its known 2AD value backward across its
    whole Cliopatria-covered span (see extract_2ad_culture_religion)."""
    boundary_years = sorted({p["from"] for p in polities})

    events_by_province: dict[str, list[dict]] = {str(s["id"]): [] for s in seeds}
    last_owner: dict[str, str | None] = {str(s["id"]): None for s in seeds}
    first_event_date: dict[str, int] = {}
    points = {str(s["id"]): Point(s["lon"], s["lat"]) for s in seeds}

    matched_total = 0
    for year in boundary_years:
        active = [p for p in polities if p["from"] <= year <= p["to"]]
        if not active:
            continue
        tree = STRtree([p["geom"] for p in active])
        date_days = eu4_date_to_days(f"{year}.1.1")

        for province_id, point in points.items():
            if province_id in blocked_province_ids:
                continue
            candidates = tree.query(point, predicate="within")
            if len(candidates) == 0:
                continue
            if len(candidates) > 1:
                best_idx = min(candidates, key=lambda i: active[i]["area"])
            else:
                best_idx = candidates[0]
            owner_name = active[best_idx]["name"]
            tag = tag_resolve[owner_name]
            first_event_date.setdefault(province_id, date_days)
            if last_owner[province_id] == tag:
                continue
            events_by_province[province_id].append(
                {"date": date_days, "kind": "owner", "payload": {"tag": tag}}
            )
            events_by_province[province_id].append(
                {"date": date_days, "kind": "controller", "payload": {"tag": tag}}
            )
            last_owner[province_id] = tag
            matched_total += 1

    for province_id, date_days in first_event_date.items():
        culture, religion = culture_religion_2ad.get(province_id, (None, None))
        if culture is not None:
            events_by_province[province_id].append(
                {"date": date_days, "kind": "culture", "payload": {"cultureId": culture}}
            )
        if religion is not None:
            events_by_province[province_id].append(
                {"date": date_days, "kind": "religion", "payload": {"religionId": religion}}
            )

    return events_by_province, matched_total


def merge_provinces(existing: dict, new_events: dict[str, list[dict]]) -> int:
    touched = 0
    for province_id, events in new_events.items():
        if not events:
            continue
        target = existing.get(province_id)
        if target is None:
            continue
        target["events"] = events + target["events"]
        target["events"].sort(key=lambda e: e["date"])
        touched += 1
    return touched


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--events-dir", type=Path, default=DEFAULT_EVENTS_DIR)
    parser.add_argument("--reference-dir", type=Path, default=DEFAULT_REFERENCE_DIR)
    parser.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS)
    args = parser.parse_args()

    with args.seeds.open(encoding="utf-8") as f:
        seeds = json.load(f)

    polities = load_polities(args.source)
    print(f"loaded {len(polities)} polity slices (pre-year-{EU4_COVERAGE_START_YEAR})")
    polity_names = {p["name"] for p in polities}

    nations_path = args.reference_dir / "nations.json"
    with nations_path.open(encoding="utf-8") as f:
        nations = json.load(f)
    tag_resolve, reused, minted = resolve_tags(polity_names, nations)
    print(f"countries: reused {reused} existing tags by name, minted {minted} new cp_ tags")
    nations_path.write_text(json.dumps(nations, indent=2) + "\n", encoding="utf-8")

    provinces_path = args.events_dir / "provinces.json"
    with provinces_path.open(encoding="utf-8") as f:
        provinces = json.load(f)
    culture_religion_2ad = extract_2ad_culture_religion(provinces)
    wasteland_province_ids = {
        province_id
        for province_id, entry in provinces.items()
        if entry.get("base", {}).get("wasteland")
    }

    new_events, matched_total = build_province_events(
        seeds,
        polities,
        tag_resolve,
        culture_religion_2ad,
        wasteland_province_ids,
    )
    touched_provinces = sum(1 for v in new_events.values() if v)
    print(f"resolved {matched_total} owner transitions across {touched_provinces} provinces")

    merged = merge_provinces(provinces, new_events)
    provinces_path.write_text(json.dumps(provinces), encoding="utf-8")
    print(f"provinces.json: merged Cliopatria history into {merged} provinces")


if __name__ == "__main__":
    main()
