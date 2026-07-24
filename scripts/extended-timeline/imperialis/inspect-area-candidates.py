"""Inspect candidate IU areas for curating ET-area -> IU-area gates."""

from __future__ import annotations

import argparse
import json
import math
import re
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


def centroid(points: list[tuple[float, float]]) -> tuple[float, float] | None:
    if not points:
        return None
    arr = np.array(points, dtype=np.float64)
    return float(arr[:, 0].mean()), float(arr[:, 1].mean())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("et_region")
    parser.add_argument("--limit", type=int, default=16)
    parser.add_argument("--et-aligned", type=Path, default=DEFAULT_ET_ALIGNED)
    parser.add_argument("--iu-map", type=Path, default=DEFAULT_IU_MAP)
    parser.add_argument("--et-map", type=Path, default=DEFAULT_ET_MAP)
    parser.add_argument("--anchors", type=Path, default=DEFAULT_ANCHORS)
    parser.add_argument("--region-map", type=Path, default=DEFAULT_REGION_MAP)
    parser.add_argument("--area-map", type=Path, default=DEFAULT_AREA_MAP)
    args = parser.parse_args()

    et_areas = parse_area_provinces(args.et_map / "area.txt")
    et_regions = parse_region_areas(args.et_map / "region.txt")
    iu_areas = parse_area_provinces(args.iu_map / "area.txt")
    iu_regions = parse_region_areas(args.iu_map / "region.txt")
    region_map = json.loads(args.region_map.read_text(encoding="utf-8"))["mappings"]
    area_map = json.loads(args.area_map.read_text(encoding="utf-8"))["mappings"]

    et = json.loads(args.et_aligned.read_text(encoding="utf-8"))
    et_points: dict[int, tuple[float, float]] = {}
    et_names: dict[int, str] = {}
    for feature in et["features"]:
        if feature["properties"].get("type") not in ("land", "wasteland"):
            continue
        province_id = int(feature["properties"]["id"])
        point = shape(feature["geometry"]).representative_point()
        et_points[province_id] = (float(point.x), float(point.y))
        et_names[province_id] = feature["properties"].get("name", "")

    anchors = json.loads(args.anchors.read_text(encoding="utf-8"))["anchors"]
    iu_points = {
        province_id: tuple(anchor["lonlat"])
        for anchor in anchors
        if (province_id := anchor_id(anchor)) is not None
    }

    candidate_iu_regions = [
        iu_region
        for iu_region, mapped_et_regions in region_map.items()
        if args.et_region in mapped_et_regions
    ]
    candidate_iu_areas = sorted(
        {
            iu_area
            for iu_region in candidate_iu_regions
            for iu_area in iu_regions.get(iu_region, [])
            if iu_area in iu_areas
        }
    )

    print(f"ET region: {args.et_region}")
    print(f"Candidate IU regions: {len(candidate_iu_regions)}")
    print(", ".join(candidate_iu_regions))
    print()

    for et_area in et_regions.get(args.et_region, []):
        et_ids = [province_id for province_id in et_areas.get(et_area, []) if province_id in et_points]
        et_center = centroid([et_points[province_id] for province_id in et_ids])
        print(f"{et_area} ({len(et_ids)} ET provinces)")
        if et_ids:
            print(
                "  ET:",
                ", ".join(f"{province_id}:{et_names.get(province_id, '')}" for province_id in et_ids),
            )
        if et_area in area_map:
            print(f"  curated: {', '.join(area_map[et_area])}")
        if et_center is None:
            continue

        scored = []
        for iu_area in candidate_iu_areas:
            iu_ids = [province_id for province_id in iu_areas[iu_area] if province_id in iu_points]
            iu_center = centroid([iu_points[province_id] for province_id in iu_ids])
            if iu_center is None:
                continue
            score = haversine_km(et_center[0], et_center[1], iu_center[0], iu_center[1])
            scored.append((score, iu_area, len(iu_ids), iu_ids))
        for score, iu_area, count, iu_ids in sorted(scored)[: args.limit]:
            print(f"  {score:7.1f} km  {iu_area:<28} {count:>2}  {iu_ids[:8]}")
        print()


if __name__ == "__main__":
    main()
