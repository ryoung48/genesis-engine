"""Converts geo-explorer's area/region/superregion province groupings into a
flat per-province lookup JSON used by src/model/earth/history/data-source.ts.
One-time offline conversion, same pattern as build-eu4-reference-data.py.
Never parsed at runtime; output is checked into public/earth-history/reference/.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

DEFAULT_SOURCE = Path(r"C:\Users\rayou\projects\geo-explorer\public")
DEFAULT_OUTPUT = Path("public/earth-history/reference")

_SUFFIX_RE = re.compile(r"_(area|region|superregion)$")


def _display_name(raw_id: str) -> str:
    """geo-explorer's area/region/superregion keys are e.g. "brittany_area",
    "france_region", "europe_superregion" -- strip the tier suffix and
    title-case the rest."""
    return _SUFFIX_RE.sub("", raw_id).replace("_", " ").title()


def _load_tier(source: Path, filename: str) -> dict[str, dict]:
    path = source / filename
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def build_geography(source: Path) -> dict[str, dict]:
    areas = _load_tier(source, "area.json")
    regions = _load_tier(source, "region.json")
    superregions = _load_tier(source, "superregion.json")

    # Each province can appear in at most one area / region / superregion --
    # invert each tier into province -> containing-group-name.
    province_area: dict[int, str] = {}
    for area_id, entry in areas.items():
        name = _display_name(area_id)
        for province in entry.get("provinces", []):
            province_area[province] = name

    province_region: dict[int, str] = {}
    for region_id, entry in regions.items():
        name = _display_name(region_id)
        for province in entry.get("provinces", []):
            province_region[province] = name

    province_superregion: dict[int, str] = {}
    for sr_id, entry in superregions.items():
        name = _display_name(sr_id)
        for province in entry.get("provinces", []):
            province_superregion[province] = name

    all_provinces = (
        set(province_area) | set(province_region) | set(province_superregion)
    )

    result: dict[str, dict] = {}
    for province in sorted(all_provinces):
        entry = {}
        if province in province_area:
            entry["area"] = province_area[province]
        if province in province_region:
            entry["region"] = province_region[province]
        if province in province_superregion:
            entry["superregion"] = province_superregion[province]
        result[str(province)] = entry
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    geography = build_geography(args.source)
    (args.output_dir / "geography.json").write_text(
        json.dumps(geography) + "\n", encoding="utf-8"
    )
    print(f"geography.json: {len(geography)} provinces")


if __name__ == "__main__":
    main()
