"""Generate a broad ET-area -> IU-area gate draft from region gates.

Existing entries in area-map.json are treated as hand overrides and preserved.
For every ET area inside a region targeted by region-map.json, this script
selects nearby IU areas from IU regions that map to that ET region.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
from shapely.geometry import shape

from map_parsing import parse_area_provinces, parse_region_areas

DEFAULT_ET_ALIGNED = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
DEFAULT_IU_MAP = Path(
    r"c:\Program Files (x86)\Steam\steamapps\workshop\content\236850\679204773\map"
)
DEFAULT_ET_MAP = Path(
    r"c:\Program Files (x86)\Steam\steamapps\workshop\content\236850\217416366\map"
)
DEFAULT_ANCHORS = Path(
    r"C:\Users\rayou\AppData\Local\Temp\claude\C--Users-rayou-projects-nexus-chaos-machine\38017778-d828-4c48-9563-a5c95c9e7710\scratchpad\province-relaxed-anchors.json"
)
DEFAULT_REGION_MAP = Path(__file__).parent / "region-map.json"
DEFAULT_AREA_MAP = Path(__file__).parent / "area-map.json"
EARTH_RADIUS_KM = 6371.0


def anchor_id(anchor: dict) -> int | None:
    match = re.fullmatch(r"prov(\d+)", anchor.get("name", ""))
    return int(match.group(1)) if match else None


def centroid(points: list[tuple[float, float]]) -> tuple[float, float] | None:
    if not points:
        return None
    arr = np.array(points, dtype=np.float64)
    return float(arr[:, 0].mean()), float(arr[:, 1].mean())


def haversine_km(a_lon: float, a_lat: float, b_lon: float, b_lat: float) -> float:
    a_lon_rad = math.radians(a_lon)
    a_lat_rad = math.radians(a_lat)
    b_lon_rad = math.radians(b_lon)
    b_lat_rad = math.radians(b_lat)
    d_lon = b_lon_rad - a_lon_rad
    d_lat = b_lat_rad - a_lat_rad
    h = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(a_lat_rad) * math.cos(b_lat_rad) * math.sin(d_lon / 2.0) ** 2
    )
    return EARTH_RADIUS_KM * 2.0 * math.asin(min(1.0, math.sqrt(h)))


def name_score(et_area: str, iu_area: str) -> float:
    def normalize(value: str) -> str:
        value = re.sub(r"_area$|_region$", "", value)
        value = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
        return value

    et_norm = normalize(et_area)
    iu_norm = normalize(iu_area)
    if et_norm and et_norm == iu_norm:
        return 1.0
    if et_norm and (et_norm in iu_norm or iu_norm in et_norm):
        return 0.75
    return SequenceMatcher(None, et_norm, iu_norm).ratio()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--et-aligned", type=Path, default=DEFAULT_ET_ALIGNED)
    parser.add_argument("--iu-map", type=Path, default=DEFAULT_IU_MAP)
    parser.add_argument("--et-map", type=Path, default=DEFAULT_ET_MAP)
    parser.add_argument("--anchors", type=Path, default=DEFAULT_ANCHORS)
    parser.add_argument("--region-map", type=Path, default=DEFAULT_REGION_MAP)
    parser.add_argument("--area-map", type=Path, default=DEFAULT_AREA_MAP)
    parser.add_argument("--nearest", type=int, default=3)
    parser.add_argument("--max-areas", type=int, default=6)
    args = parser.parse_args()

    iu_areas = parse_area_provinces(args.iu_map / "area.txt")
    iu_regions = parse_region_areas(args.iu_map / "region.txt")
    et_areas = parse_area_provinces(args.et_map / "area.txt")
    et_regions = parse_region_areas(args.et_map / "region.txt")
    region_map = json.loads(args.region_map.read_text(encoding="utf-8"))["mappings"]
    area_doc = json.loads(args.area_map.read_text(encoding="utf-8"))
    manual = dict(area_doc["mappings"])

    anchors = json.loads(args.anchors.read_text(encoding="utf-8"))["anchors"]
    iu_points = {
        province_id: tuple(anchor["lonlat"])
        for anchor in anchors
        if (province_id := anchor_id(anchor)) is not None
    }
    iu_area_centers = {
        area: center
        for area, ids in iu_areas.items()
        if (center := centroid([iu_points[province_id] for province_id in ids if province_id in iu_points]))
        is not None
    }

    et = json.loads(args.et_aligned.read_text(encoding="utf-8"))
    et_points: dict[int, tuple[float, float]] = {}
    for feature in et["features"]:
        if feature["properties"].get("type") not in ("land", "wasteland"):
            continue
        province_id = int(feature["properties"]["id"])
        point = shape(feature["geometry"]).representative_point()
        et_points[province_id] = (float(point.x), float(point.y))
    et_area_centers = {
        area: center
        for area, ids in et_areas.items()
        if (center := centroid([et_points[province_id] for province_id in ids if province_id in et_points]))
        is not None
    }

    iu_regions_by_et_region: dict[str, list[str]] = {}
    for iu_region, et_region_names in region_map.items():
        for et_region in et_region_names:
            iu_regions_by_et_region.setdefault(et_region, []).append(iu_region)

    generated = dict(manual)
    generated_count = 0
    skipped_no_candidates = 0
    for et_region, area_names in et_regions.items():
        if et_region not in iu_regions_by_et_region:
            continue
        candidate_iu_areas = sorted(
            {
                iu_area
                for iu_region in iu_regions_by_et_region[et_region]
                for iu_area in iu_regions.get(iu_region, [])
                if iu_area in iu_area_centers
            }
        )
        for et_area in area_names:
            if et_area in manual or et_area not in et_area_centers:
                continue
            et_center = et_area_centers[et_area]
            scored = []
            for iu_area in candidate_iu_areas:
                iu_center = iu_area_centers[iu_area]
                distance = haversine_km(et_center[0], et_center[1], iu_center[0], iu_center[1])
                score = distance - 250.0 * name_score(et_area, iu_area)
                scored.append((score, distance, iu_area))
            if not scored:
                skipped_no_candidates += 1
                continue
            selected = [iu_area for _, _, iu_area in sorted(scored)[: args.nearest]]
            generated[et_area] = selected[: args.max_areas]
            generated_count += 1

    out = {
        "comment": area_doc["comment"]
        + " Entries not originally hand-curated may be generated from region-gated area centroid/name candidates.",
        "mappings": {key: generated[key] for key in sorted(generated)},
        "manualOverrides": sorted(manual),
    }
    args.area_map.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "manual_preserved": len(manual),
                "generated_added": generated_count,
                "total_area_gates": len(generated),
                "skipped_no_candidates": skipped_no_candidates,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
