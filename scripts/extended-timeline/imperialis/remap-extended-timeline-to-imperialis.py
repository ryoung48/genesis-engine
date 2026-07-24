"""Build a region-gated Extended Timeline <-> Imperialis province-id mapping.

The mapping uses no Imperialis warped polygons. Imperialis contributes only:

* province anchor lon/lat points from province-relaxed-anchors.json
* province -> area -> region membership from map/area.txt and map/region.txt
* a curated Imperialis-region -> Extended-Timeline-region gate from region-map.json

Extended Timeline contributes province representative points from the aligned
GeoJSON plus province -> area -> region membership from its map files.

Within each permitted region pair, provinces are matched by local spatial
distance. The output is mapping metadata only; no province vectors are copied.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import shape

from map_parsing import parse_area_provinces, province_areas, province_regions

DEFAULT_ET_ALIGNED = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
DEFAULT_IMPERIALIS_GEOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-imperialis.json"
)
DEFAULT_IU_MAP = Path(
    r"c:\Program Files (x86)\Steam\steamapps\workshop\content\236850\679204773\map"
)
DEFAULT_ET_MAP = Path(
    r"c:\Program Files (x86)\Steam\steamapps\workshop\content\236850\217416366\map"
)
DEFAULT_RELAXED_ANCHORS = Path(
    r"C:\Users\rayou\AppData\Local\Temp\claude\C--Users-rayou-projects-nexus-chaos-machine\38017778-d828-4c48-9563-a5c95c9e7710\scratchpad\province-relaxed-anchors.json"
)
DEFAULT_REGION_MAP = Path(__file__).parent / "region-map.json"
DEFAULT_AREA_MAP = Path(__file__).parent / "area-map.json"
DEFAULT_OUTPUT = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-imperialis-et-mapping.json"
)

EARTH_RADIUS_KM = 6371.0
DEFAULT_MAX_MATCH_KM = 400.0
DEFAULT_NEAREST_PER_IMPERIALIS = 3
DEFAULT_NEAREST_PER_ET = 6
DEFAULT_AREA_NEAREST_PER_ET = 2
DEFAULT_MANUAL_AREA_MAX_MATCH_KM = 900.0


def anchor_id(anchor: dict) -> int | None:
    match = re.fullmatch(r"prov(\d+)", anchor.get("name", ""))
    return int(match.group(1)) if match else None


def feature_point(feature: dict) -> tuple[float, float]:
    geom = shape(feature["geometry"])
    point = geom.representative_point() if not geom.is_empty else geom.centroid
    return float(point.x), float(point.y)


def to_xyz(points: np.ndarray) -> np.ndarray:
    lon = np.radians(points[:, 0])
    lat = np.radians(points[:, 1])
    return np.stack(
        [np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)],
        axis=1,
    )


def chord_to_km(distance: np.ndarray | float) -> np.ndarray | float:
    return EARTH_RADIUS_KM * 2.0 * np.arcsin(np.clip(np.asarray(distance) / 2.0, 0.0, 1.0))


def normalize_points(points: np.ndarray) -> np.ndarray:
    mins = points.min(axis=0)
    spans = np.maximum(points.max(axis=0) - mins, 1e-9)
    return (points - mins) / spans


def merge_match(
    mapping_by_et_id: dict[int, dict[int, dict]],
    et_id: int,
    imperialis_id: int,
    distance_km: float,
    source: str,
    iu_regions: set[str],
    et_regions: set[str],
    layout_distance: float | None = None,
) -> bool:
    existing = mapping_by_et_id[et_id].get(imperialis_id)
    if existing is None:
        mapping_by_et_id[et_id][imperialis_id] = {
            "id": imperialis_id,
            "distanceKm": round(distance_km, 1),
            "source": source,
            "iuRegions": sorted(iu_regions),
            "etRegions": sorted(et_regions),
        }
        if layout_distance is not None:
            mapping_by_et_id[et_id][imperialis_id]["layoutDistance"] = round(layout_distance, 3)
        return True

    if distance_km < existing["distanceKm"]:
        existing["distanceKm"] = round(distance_km, 1)
    sources = set(existing.get("sources", [existing["source"]]))
    sources.add(source)
    existing["source"] = "+".join(sorted(sources))
    existing["sources"] = sorted(sources)
    existing["iuRegions"] = sorted(set(existing["iuRegions"]) | iu_regions)
    existing["etRegions"] = sorted(set(existing["etRegions"]) | et_regions)
    if layout_distance is not None:
        old_layout = existing.get("layoutDistance")
        existing["layoutDistance"] = (
            round(layout_distance, 3)
            if old_layout is None
            else min(old_layout, round(layout_distance, 3))
        )
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--et-aligned", type=Path, default=DEFAULT_ET_ALIGNED)
    parser.add_argument("--imperialis", type=Path, default=DEFAULT_IMPERIALIS_GEOJSON)
    parser.add_argument("--iu-map", type=Path, default=DEFAULT_IU_MAP)
    parser.add_argument("--et-map", type=Path, default=DEFAULT_ET_MAP)
    parser.add_argument("--anchors", type=Path, default=DEFAULT_RELAXED_ANCHORS)
    parser.add_argument("--region-map", type=Path, default=DEFAULT_REGION_MAP)
    parser.add_argument("--area-map", type=Path, default=DEFAULT_AREA_MAP)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--max-match-km", type=float, default=DEFAULT_MAX_MATCH_KM)
    parser.add_argument(
        "--nearest-per-imperialis",
        type=int,
        default=DEFAULT_NEAREST_PER_IMPERIALIS,
        help="nearest ET provinces to keep for each IU province inside the region gate",
    )
    parser.add_argument(
        "--nearest-per-et",
        type=int,
        default=DEFAULT_NEAREST_PER_ET,
        help="nearest IU provinces to keep for each ET province inside the region gate",
    )
    parser.add_argument(
        "--area-nearest-per-et",
        type=int,
        default=DEFAULT_AREA_NEAREST_PER_ET,
        help="nearest IU provinces to keep for each ET province inside a curated area layout gate",
    )
    parser.add_argument(
        "--manual-area-max-match-km",
        type=float,
        default=DEFAULT_MANUAL_AREA_MAX_MATCH_KM,
        help="maximum area-layout distance for hand-curated area gates",
    )
    args = parser.parse_args()

    et = json.loads(args.et_aligned.read_text(encoding="utf-8"))
    imperialis = json.loads(args.imperialis.read_text(encoding="utf-8"))
    anchors = json.loads(args.anchors.read_text(encoding="utf-8"))["anchors"]
    region_map = json.loads(args.region_map.read_text(encoding="utf-8"))["mappings"]
    area_map_doc = json.loads(args.area_map.read_text(encoding="utf-8"))
    area_map = area_map_doc["mappings"]
    manual_area_gates = set(area_map_doc.get("manualOverrides", []))

    et_features = [
        feature
        for feature in et["features"]
        if feature["properties"].get("type") in ("land", "wasteland")
    ]
    et_ids = [int(feature["properties"]["id"]) for feature in et_features]
    et_points = np.array([feature_point(feature) for feature in et_features], dtype=np.float64)
    et_regions_by_province = province_regions(args.et_map / "area.txt", args.et_map / "region.txt")
    et_areas_by_province = province_areas(args.et_map / "area.txt")
    et_area_provinces = parse_area_provinces(args.et_map / "area.txt")
    et_index_by_id = {province_id: index for index, province_id in enumerate(et_ids)}
    et_provinces_missing_region = sum(
        1 for province_id in et_ids if not et_regions_by_province.get(province_id)
    )

    imperialis_properties_by_id = {
        int(feature["properties"]["id"]): feature["properties"]
        for feature in imperialis["features"]
        if feature["properties"].get("type") in ("land", "wasteland")
    }
    anchors_by_id = {
        province_id: anchor
        for anchor in anchors
        if (province_id := anchor_id(anchor)) is not None
        and province_id in imperialis_properties_by_id
    }
    iu_regions_by_province = province_regions(args.iu_map / "area.txt", args.iu_map / "region.txt")
    iu_areas_by_province = province_areas(args.iu_map / "area.txt")
    iu_area_provinces = parse_area_provinces(args.iu_map / "area.txt")

    iu_ids: list[int] = []
    iu_points: list[list[float]] = []
    missing_anchors = 0
    missing_regions = 0
    for province_id in sorted(imperialis_properties_by_id):
        anchor = anchors_by_id.get(province_id)
        if anchor is None:
            missing_anchors += 1
            continue
        if province_id not in iu_regions_by_province:
            missing_regions += 1
            continue
        iu_ids.append(province_id)
        iu_points.append(anchor["lonlat"])
    iu_points_array = np.array(iu_points, dtype=np.float64)

    allowed_et_regions_by_iu_id: dict[int, set[str]] = {}
    for province_id in iu_ids:
        allowed: set[str] = set()
        for iu_region in iu_regions_by_province[province_id]:
            allowed.update(region_map.get(iu_region, []))
        allowed_et_regions_by_iu_id[province_id] = allowed

    et_indices_by_region: dict[str, list[int]] = {}
    for et_id in et_ids:
        for region in et_regions_by_province.get(et_id, set()):
            et_indices_by_region.setdefault(region, []).append(et_index_by_id[et_id])

    iu_indices_by_allowed_et_region: dict[str, list[int]] = {}
    for iu_index, province_id in enumerate(iu_ids):
        for et_region in allowed_et_regions_by_iu_id[province_id]:
            iu_indices_by_allowed_et_region.setdefault(et_region, []).append(iu_index)

    mapping_by_et_id: dict[int, dict[int, dict]] = {et_id: {} for et_id in et_ids}
    distances_kept: list[float] = []
    skipped_no_region_gate = 0
    skipped_no_et_candidates = 0
    skipped_too_far = 0
    iu_seed_edges = 0

    for iu_index, province_id in enumerate(iu_ids):
        allowed_regions = allowed_et_regions_by_iu_id[province_id]
        if not allowed_regions:
            skipped_no_region_gate += 1
            continue
        candidate_indices = sorted(
            {
                et_index
                for region in allowed_regions
                for et_index in et_indices_by_region.get(region, [])
            }
        )
        if not candidate_indices:
            skipped_no_et_candidates += 1
            continue

        candidate_points = et_points[candidate_indices]
        query = to_xyz(np.array([iu_points_array[iu_index]], dtype=np.float64))[0]
        tree = cKDTree(to_xyz(candidate_points))
        k = min(len(candidate_indices), max(1, args.nearest_per_imperialis))
        distances, local_indices = tree.query(query, k=k)
        for distance, local_index in zip(np.atleast_1d(distances), np.atleast_1d(local_indices)):
            distance_km = float(chord_to_km(float(distance)))
            if distance_km > args.max_match_km:
                continue
            et_index = candidate_indices[int(local_index)]
            et_id = et_ids[et_index]
            if merge_match(
                mapping_by_et_id,
                et_id,
                province_id,
                distance_km,
                "iu-region-gated-nearest",
                iu_regions_by_province[province_id],
                et_regions_by_province.get(et_id, set()),
            ):
                iu_seed_edges += 1
                distances_kept.append(distance_km)
        if all(float(chord_to_km(float(distance))) > args.max_match_km for distance in np.atleast_1d(distances)):
            skipped_too_far += 1

    et_coverage_edges = 0
    covered_et_ids: set[int] = set()
    out_of_coverage_et_ids: list[int] = []
    for et_index, et_id in enumerate(et_ids):
        et_regions = et_regions_by_province.get(et_id, set())
        candidate_indices = sorted(
            {
                iu_index
                for et_region in et_regions
                for iu_index in iu_indices_by_allowed_et_region.get(et_region, [])
            }
        )
        if not candidate_indices:
            out_of_coverage_et_ids.append(et_id)
            continue

        candidate_points = iu_points_array[candidate_indices]
        query = to_xyz(np.array([et_points[et_index]], dtype=np.float64))[0]
        tree = cKDTree(to_xyz(candidate_points))
        k = min(len(candidate_indices), max(1, args.nearest_per_et))
        distances, local_indices = tree.query(query, k=k)
        kept_for_et = False
        for distance, local_index in zip(np.atleast_1d(distances), np.atleast_1d(local_indices)):
            distance_km = float(chord_to_km(float(distance)))
            if distance_km > args.max_match_km:
                continue
            iu_index = candidate_indices[int(local_index)]
            province_id = iu_ids[iu_index]
            if merge_match(
                mapping_by_et_id,
                et_id,
                province_id,
                distance_km,
                "et-region-gated-coverage",
                iu_regions_by_province[province_id],
                et_regions,
            ):
                et_coverage_edges += 1
                distances_kept.append(distance_km)
            kept_for_et = True
        if kept_for_et:
            covered_et_ids.add(et_id)
        else:
            out_of_coverage_et_ids.append(et_id)

    area_layout_edges = 0
    area_layout_distances: list[float] = []
    for et_area, iu_areas in area_map.items():
        area_et_ids = [
            province_id
            for province_id in et_area_provinces.get(et_area, set())
            if province_id in et_index_by_id
        ]
        area_iu_ids = [
            province_id
            for iu_area in iu_areas
            for province_id in iu_area_provinces.get(iu_area, set())
            if province_id in iu_ids
        ]
        if not area_et_ids or not area_iu_ids:
            continue

        allowed_area_iu_ids = set(area_iu_ids)
        for et_id in area_et_ids:
            mapping_by_et_id[et_id] = {
                province_id: match
                for province_id, match in mapping_by_et_id[et_id].items()
                if province_id in allowed_area_iu_ids
            }

        area_et_points = np.array([et_points[et_index_by_id[province_id]] for province_id in area_et_ids])
        iu_index_by_id = {province_id: index for index, province_id in enumerate(iu_ids)}
        area_iu_points = np.array([iu_points_array[iu_index_by_id[province_id]] for province_id in area_iu_ids])
        normalized_et = normalize_points(area_et_points)
        normalized_iu = normalize_points(area_iu_points)
        layout_tree = cKDTree(normalized_iu)
        k = min(len(area_iu_ids), max(1, args.area_nearest_per_et))
        for et_local_index, et_id in enumerate(area_et_ids):
            distances, local_indices = layout_tree.query(normalized_et[et_local_index], k=k)
            for layout_distance, iu_local_index in zip(
                np.atleast_1d(distances), np.atleast_1d(local_indices)
            ):
                province_id = area_iu_ids[int(iu_local_index)]
                distance_km = float(
                    chord_to_km(
                        np.linalg.norm(
                            to_xyz(np.array([et_points[et_index_by_id[et_id]]]))[0]
                            - to_xyz(np.array([iu_points_array[iu_index_by_id[province_id]]]))[0]
                        )
                    )
                )
                max_area_distance_km = (
                    args.manual_area_max_match_km
                    if et_area in manual_area_gates
                    else args.max_match_km
                )
                if distance_km > max_area_distance_km:
                    continue
                if merge_match(
                    mapping_by_et_id,
                    et_id,
                    province_id,
                    distance_km,
                    "curated-area-layout",
                    iu_regions_by_province[province_id],
                    et_regions_by_province.get(et_id, set()),
                    layout_distance=float(layout_distance),
                ):
                    area_layout_edges += 1
                    area_layout_distances.append(distance_km)

    mappings = []
    imperialis_to_et: dict[int, list[dict]] = {}
    for et_id in et_ids:
        matches = sorted(
            mapping_by_et_id[et_id].values(),
            key=lambda match: (match["distanceKm"], match["id"]),
        )
        if not matches:
            continue
        mappings.append(
            {
                "etProvinceId": et_id,
                "etRegions": sorted(et_regions_by_province.get(et_id, set())),
                "imperialisProvinceIds": [match["id"] for match in matches],
                "imperialisMatches": matches,
            }
        )
        for match in matches:
            imperialis_to_et.setdefault(match["id"], []).append(
                {
                    "etProvinceId": et_id,
                    "distanceKm": match["distanceKm"],
                    "source": match["source"],
                    "etRegions": sorted(et_regions_by_province.get(et_id, set())),
                }
            )

    imperialis_mappings = [
        {
            "imperialisProvinceId": province_id,
            "iuRegions": sorted(iu_regions_by_province.get(province_id, set())),
            "allowedEtRegions": sorted(allowed_et_regions_by_iu_id.get(province_id, set())),
            "etProvinceIds": [
                match["etProvinceId"]
                for match in sorted(matches, key=lambda match: (match["distanceKm"], match["etProvinceId"]))
            ],
            "etMatches": sorted(matches, key=lambda match: (match["distanceKm"], match["etProvinceId"])),
        }
        for province_id, matches in sorted(imperialis_to_et.items())
    ]

    edge_count = sum(len(mapping) for mapping in mapping_by_et_id.values())
    meta = {
        "source": "region-gated point mapping: Imperialis anchors to Extended Timeline representative points",
        "imperialis_regions_in_gate": len(region_map),
        "target_et_regions_in_gate": len({region for regions in region_map.values() for region in regions}),
        "source_et_provinces": len(et_ids),
        "candidate_imperialis_provinces": len(imperialis_properties_by_id),
        "imperialis_provinces_with_anchor_and_region": len(iu_ids),
        "mapped_et_provinces": len(mappings),
        "covered_et_provinces": len(covered_et_ids),
        "mapped_imperialis_provinces": len(imperialis_to_et),
        "mapping_edges": edge_count,
        "iu_seed_edges": iu_seed_edges,
        "et_coverage_edges": et_coverage_edges,
        "curated_area_layout_edges": area_layout_edges,
        "curated_area_gates": len(area_map),
        "et_provinces_with_multiple_imperialis": sum(
            1 for mapping in mapping_by_et_id.values() if len(mapping) > 1
        ),
        "imperialis_provinces_with_multiple_et": sum(
            1 for matches in imperialis_to_et.values() if len(matches) > 1
        ),
        "out_of_coverage_et_provinces": len(out_of_coverage_et_ids),
        "missing_relaxed_anchors": missing_anchors,
        "imperialis_provinces_missing_region": missing_regions,
        "skipped_no_region_gate": skipped_no_region_gate,
        "skipped_no_et_candidates": skipped_no_et_candidates,
        "skipped_too_far": skipped_too_far,
        "max_match_km": args.max_match_km,
        "manual_area_max_match_km": args.manual_area_max_match_km,
        "et_provinces_missing_region": et_provinces_missing_region,
        "nearest_per_imperialis": args.nearest_per_imperialis,
        "nearest_per_et": args.nearest_per_et,
        "area_nearest_per_et": args.area_nearest_per_et,
        "match_median_km": round(float(np.median(distances_kept)), 1) if distances_kept else None,
        "match_p90_km": round(float(np.percentile(distances_kept, 90)), 1) if distances_kept else None,
        "curated_area_layout_median_km": (
            round(float(np.median(area_layout_distances)), 1)
            if area_layout_distances
            else None
        ),
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {"meta": meta, "mappings": mappings, "imperialisMappings": imperialis_mappings},
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(json.dumps(meta, indent=2))
    print(f"wrote {edge_count} region-gated mapping edges -> {args.output}")


if __name__ == "__main__":
    main()
