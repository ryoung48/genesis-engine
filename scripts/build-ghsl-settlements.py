"""Converts Stadester's GHSL per-settlement database (individual named
cities/towns with dated area/density/population, not just province
aggregates) into a compact runtime asset for rendering real settlement
markers during Earth-import playback -- distinct from the procedural
province-level settlement dots used for generated planets.

Resamples each settlement's own (irregular, settlement-specific) year keys
onto the exact same 128-year grid already used by
earth-real-population-eu4.json / earth-real-urban-population-eu4.json (read
from --population-asset), so the frontend can share time-bracket/
interpolation logic across both. Before a settlement's first known year its
population is 0 (not founded yet); after its last known year it's held flat
if that year is recent (>= HOLD_FLAT_AFTER_YEAR, i.e. plausibly still
inhabited today) or dropped to 0 otherwise (an ancient/historical site whose
tracked data simply stops, e.g. Uruk's last entry around 1400 BC -- treated
as abandoned rather than eternally populated).
"""

from __future__ import annotations

import argparse
import json
import re
import struct
from collections import defaultdict
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import shape
from shapely.strtree import STRtree

from eu4_province_id_swaps import (
    rename_province_id,
    split_province_part_geom,
    swap_province_id,
)

_LABEL_YEAR_RE = re.compile(r"^(-?\d+)-\d{2}-\d{2} ")

DEFAULT_SOURCE = Path(
    r"C:\Users\rayou\Downloads\metro_adjusted_rasters_and_json\stadester_ghsl.json"
)
DEFAULT_POPULATION_ASSET = Path("public/heightmap/earth-real-population-eu4.json")
DEFAULT_PROVINCE_GEOJSON = Path(r"c:\Users\rayou\projects\geo-explorer\public\eu4.json")
DEFAULT_OUTPUT_DIR = Path("public/heightmap")
DEFAULT_PREFIX = "eu4-ghsl-settlements"
DEFAULT_SCALE = 2000.0
HOLD_FLAT_AFTER_YEAR = 1950
INT16_NODATA = -32768
NO_PROVINCE_ID = -1


def clean_settlement_name(entry: dict) -> str:
    raw_name = entry.get("name") or entry.get("key") or ""
    parts = [part.strip() for part in str(raw_name).split(";")]
    filtered: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if not part or part == "0" or part in seen:
            continue
        filtered.append(part)
        seen.add(part)
    if filtered:
        return filtered[0]
    fallback = str(entry.get("key") or "").strip()
    return "" if fallback == "0" else fallback


def load_target_years(population_asset_path: Path) -> list[int]:
    with population_asset_path.open(encoding="utf-8") as f:
        meta = json.load(f)
    years = []
    for label in meta["times"]:
        match = _LABEL_YEAR_RE.match(label)
        if not match:
            raise ValueError(f"Unrecognized time label: {label}")
        years.append(int(match.group(1)))
    return years


def resample_settlement(
    population_by_year: dict[str, float], target_years: list[int]
) -> np.ndarray:
    if not population_by_year:
        return np.zeros(len(target_years), dtype=np.float64)

    known_years = np.array(sorted(int(y) for y in population_by_year.keys()), dtype=np.float64)
    known_values = np.array(
        [population_by_year[str(int(y))] for y in known_years], dtype=np.float64
    )

    result = np.interp(target_years, known_years, known_values)
    min_year = known_years[0]
    max_year = known_years[-1]
    target_arr = np.array(target_years, dtype=np.float64)

    result = np.where(target_arr < min_year, 0.0, result)
    if max_year < HOLD_FLAT_AFTER_YEAR:
        result = np.where(target_arr > max_year, 0.0, result)
    # else: np.interp already holds the boundary value flat past max_year

    return result


def load_province_polygons(geojson_path: Path) -> dict[int, "shapely.Geometry"]:
    """Same load/repair/id-correction pipeline as build-eu4-province-borders.py
    /build-eu4-provinces.py, so settlement->province assignment agrees with
    everything else keyed by EU4 province id."""
    with geojson_path.open(encoding="utf-8") as f:
        data = json.load(f)

    by_id: dict[int, list] = defaultdict(list)
    for feat in data["features"]:
        province_id = swap_province_id(rename_province_id(int(feat["properties"]["id"])))
        geom = shape(feat["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        for split_id, split_geom in split_province_part_geom(province_id, geom):
            by_id[split_id].append(split_geom)

    polygons: dict[int, "shapely.Geometry"] = {}
    for province_id, geoms in by_id.items():
        merged = geoms[0] if len(geoms) == 1 else shapely.unary_union(geoms)
        if not merged.is_valid:
            merged = merged.buffer(0)
        polygons[province_id] = merged
    return polygons


def assign_provinces(
    lats: list[float], lons: list[float], province_geojson: Path
) -> list[int]:
    """Every settlement gets a province -- first by strict point-in-polygon
    containment, falling back unconditionally to whichever province's
    polygon is geometrically nearest for any point that doesn't land inside
    one at all (settlement coordinates are independently sourced from the
    EU4 province polygons, so even a real, well-inland city can miss strict
    containment by a small margin, e.g. Istanbul's GHSL point landed ~55m
    outside the Constantinople province's boundary -- and remote points far
    from any polygon, e.g. small Pacific islands, still get their closest
    real province rather than being dropped as unassigned)."""
    polygons = load_province_polygons(province_geojson)
    province_ids = list(polygons.keys())
    geoms = [polygons[pid] for pid in province_ids]
    tree = STRtree(geoms)

    result = []
    fallback_count = 0
    for lat, lon in zip(lats, lons):
        point = ShapelyPoint(lon, lat)
        assigned = NO_PROVINCE_ID
        for idx in tree.query(point):
            idx = int(idx)
            if geoms[idx].contains(point):
                assigned = province_ids[idx]
                break
        if assigned == NO_PROVINCE_ID:
            nearest_idx = tree.nearest(point)
            if nearest_idx is not None:
                assigned = province_ids[int(nearest_idx)]
                fallback_count += 1
        result.append(assigned)
    print(f"  {fallback_count} settlements assigned via nearest-province fallback")
    return result


def build_assets(
    source_path: Path,
    population_asset_path: Path,
    province_geojson: Path,
    output_dir: Path,
    prefix: str,
    scale: float,
) -> tuple[Path, Path]:
    if not source_path.exists():
        raise FileNotFoundError(f"Missing source: {source_path}")
    if not population_asset_path.exists():
        raise FileNotFoundError(f"Missing population asset: {population_asset_path}")
    if not province_geojson.exists():
        raise FileNotFoundError(f"Missing province GeoJSON: {province_geojson}")

    target_years = load_target_years(population_asset_path)
    time_count = len(target_years)

    with population_asset_path.open(encoding="utf-8") as f:
        time_labels = json.load(f)["times"]

    print(f"loading {source_path} ...")
    with source_path.open(encoding="utf-8") as f:
        data = json.load(f)
    print(f"loaded {len(data)} settlements")

    names: list[str] = []
    lats: list[float] = []
    lons: list[float] = []
    rows: list[np.ndarray] = []

    skipped = 0
    for entry in data.values():
        coords = entry.get("coords")
        population_by_year = entry.get("population")
        if not coords or len(coords) != 2 or not population_by_year:
            skipped += 1
            continue
        lat, lon = coords
        resampled = resample_settlement(population_by_year, target_years)
        if not np.any(resampled > 0):
            skipped += 1
            continue
        names.append(clean_settlement_name(entry))
        lats.append(lat)
        lons.append(lon)
        rows.append(resampled)

    settlement_count = len(names)
    print(f"kept {settlement_count} settlements, skipped {skipped}")

    print("assigning settlements to provinces ...")
    province_ids = assign_provinces(lats, lons, province_geojson)
    print(f"assigned {sum(1 for p in province_ids if p != NO_PROVINCE_ID)} of "
          f"{settlement_count} settlements to a province")

    # int16-time-major, same convention as the province population assets
    quantized = np.full((time_count, settlement_count), INT16_NODATA, dtype=np.int16)
    global_max_population = 0.0
    clipped_values = 0
    for i, row in enumerate(rows):
        if row.size:
            global_max_population = max(global_max_population, float(row.max()))
        scaled = np.rint(row / scale)
        clipped_mask = scaled > np.iinfo(np.int16).max
        clipped_values += int(np.count_nonzero(clipped_mask))
        scaled = np.clip(scaled, 0, np.iinfo(np.int16).max)
        quantized[:, i] = scaled.astype(np.int16)

    output_dir.mkdir(parents=True, exist_ok=True)
    bin_path = output_dir / f"{prefix}.bin"
    meta_path = output_dir / f"{prefix}.json"

    with bin_path.open("wb") as f:
        f.write(quantized.astype("<i2", copy=False).tobytes())
        for lat, lon in zip(lats, lons):
            f.write(struct.pack("<ff", lat, lon))

    metadata = {
        "version": 1,
        "format": "eu4-ghsl-settlements-v1",
        "field": "ghsl_settlement_population_people",
        "encoding": {
            "kind": "linear",
            "scale": scale,
            "units": "people",
            "decode": f"population = stored_value * {scale}",
        },
        "timeCount": time_count,
        "settlementCount": settlement_count,
        "times": time_labels,
        "names": names,
        "provinceIds": province_ids,
        "nodata": INT16_NODATA,
        "maxRepresentablePopulation": int(np.iinfo(np.int16).max * scale),
        "maxObservedPopulation": global_max_population,
        "clippedValues": clipped_values,
        "source": str(source_path),
        "populationAsset": str(population_asset_path),
        "recordLayout": "population: int16[timeCount][settlementCount] time-major, "
        "followed by settlementCount * (lat:f32, lon:f32)",
        "bin": bin_path.name,
    }
    meta_path.write_text(json.dumps(metadata) + "\n", encoding="utf-8")

    return meta_path, bin_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a compact runtime asset of real GHSL settlements with "
        "dated population, for Earth-import settlement markers."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--population-asset", type=Path, default=DEFAULT_POPULATION_ASSET)
    parser.add_argument("--province-geojson", type=Path, default=DEFAULT_PROVINCE_GEOJSON)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--scale", type=float, default=DEFAULT_SCALE)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    meta_path, bin_path = build_assets(
        source_path=args.source,
        population_asset_path=args.population_asset,
        province_geojson=args.province_geojson,
        output_dir=args.output_dir,
        prefix=args.prefix,
        scale=args.scale,
    )
    print(meta_path)
    print(bin_path)


if __name__ == "__main__":
    main()
