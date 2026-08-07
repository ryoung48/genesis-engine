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
import gzip
import json
import re
import struct
import unicodedata
from collections import defaultdict
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import shape
from shapely.strtree import STRtree

_LABEL_YEAR_RE = re.compile(r"^(-?\d+)-\d{2}-\d{2} ")
_INVERTED_ARABIC_ARTICLE_RE = re.compile(r"^(.+), Al-$", re.IGNORECASE)

DEFAULT_SOURCE = Path(
    r"C:\Users\rayou\Downloads\metro_adjusted_rasters_and_json\stadester_ghsl.json"
)
DEFAULT_POPULATION_ASSET = Path("public/earth-data/earth-real-population-eu4.json")
DEFAULT_PROVINCE_GEOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_PREFIX = "eu4-ghsl-settlements"
DEFAULT_SCALE = 2000.0
HOLD_FLAT_AFTER_YEAR = 1950
SINGAPORE_ESTIMATED_POPULATION = {
    "1300": 1_000,
    "1400": 2_000,
    "1500": 3_000,
    "1600": 5_000,
    "1700": 5_000,
    "1800": 1_000,
    "1819": 1_000,
    "1830": 20_000,
    "1840": 30_000,
    "1850": 50_000,
    "1860": 80_000,
    "1870": 100_000,
}
VIETNAM_NAME_FIXES = {
    "?i?n Bi�n Ph?": "Dien Bien Phu", "H?i D??ng": "Hai Duong",
    "H?i Ph�ng": "Hai Phong", "??ng H?i": "Dong Hoi",
    "?? N?ng": "Da Nang", "Hu?": "Hue", "C?n Th?": "Can Tho",
    "Thành Pho Ho' Chí Minh": "Ho Chi Minh City", "Ha noi": "Hanoi",
    "Ph� Y�n": "Phu Yen", "Th�i Nguy�n": "Thai Nguyen",
    "V?nh Y�n": "Vinh Yen", "Thanh Ho�": "Thanh Hoa",
}
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
        return normalize_settlement_name(filtered[0])
    fallback = str(entry.get("key") or "").strip()
    return "" if fallback == "0" else normalize_settlement_name(fallback)


def normalize_settlement_name(name: str) -> str:
    """Convert source-only inverted Arabic articles into display order."""
    match = _INVERTED_ARABIC_ARTICLE_RE.match(name)
    display_name = f"Al-{match.group(1)}" if match else name
    ascii_name = unicodedata.normalize("NFKD", display_name).encode("ascii", "ignore").decode()
    return ascii_name or display_name


def normalize_vietnamese_name(name: str) -> str:
    fixed = VIETNAM_NAME_FIXES.get(name, name)
    return unicodedata.normalize("NFKD", fixed).encode("ascii", "ignore").decode()


def normalize_name(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return " ".join(ascii_value.casefold().split())


def population_with_interventions(entry: dict) -> dict[str, float]:
    """Apply narrow, documented estimates where the source has a known gap."""
    population = dict(entry["population"])
    if entry.get("sourceKey") == "stadester-Singapore-Singapore":
        population.update(SINGAPORE_ESTIMATED_POPULATION)
    return population


def agglomeration_group_key(entry: dict) -> str:
    """Return an identity shared only by alternate estimates of one metro.

    ``is_agglomeration_of`` is source metadata, unlike the display name: it
    explicitly tells us that borough- and city-labelled records are estimates
    of the same agglomeration. Country is included because agglomeration names
    such as London are not globally unique.
    """
    agglomeration = entry.get("is_agglomeration_of")
    if not agglomeration:
        return f"settlement:{entry.get('key', '')}"
    country = entry.get("country") or entry.get("country+") or ""
    return f"agglomeration:{normalize_name(str(agglomeration))}:{normalize_name(str(country))}"


def consolidate_agglomerations(
    entries: list[tuple[dict, str, float, float, np.ndarray]],
) -> list[tuple[str, float, float, np.ndarray]]:
    """Collapse competing agglomeration estimates without double counting.

    A source group can contain both a city-centre record and borough-labelled
    records that already estimate the whole metro. Summing them would count
    the same people multiple times. Instead, use the canonical city's location
    and name, and retain the largest available estimate at each time point.
    This also fills a stale or zeroed source series from another estimate in
    the same explicitly declared agglomeration.
    """
    explicit_agglomerations: list[tuple[str, str, str]] = []
    for entry, name, _, _, _ in entries:
        agglomeration = entry.get("is_agglomeration_of")
        if not agglomeration:
            continue
        country = str(entry.get("country") or entry.get("country+") or "")
        explicit_agglomerations.append(
            (
                normalize_name(str(agglomeration)),
                country,
                agglomeration_group_key(entry),
            )
        )

    grouped: dict[str, list[tuple[dict, str, float, float, np.ndarray]]] = defaultdict(list)
    for entry in entries:
        source, name, _, _, _ = entry
        group_key = agglomeration_group_key(source)
        source_key = str(source.get("sourceKey") or "")
        if not source.get("is_agglomeration_of"):
            matching_groups = {
                candidate_key
                for agglomeration, country, candidate_key in explicit_agglomerations
                if agglomeration == normalize_name(name)
                and source_key.endswith(f"-{country}")
            }
            if len(matching_groups) == 1:
                group_key = next(iter(matching_groups))
        grouped[group_key].append(entry)

    consolidated: list[tuple[str, float, float, np.ndarray]] = []
    for group in grouped.values():
        canonical = min(
            group,
            key=lambda item: (
                normalize_name(item[1])
                != normalize_name(str(item[0].get("is_agglomeration_of") or item[1])),
                not bool(item[0].get("is_agglomeration_of")),
                item[1],
            ),
        )
        population = np.maximum.reduce([item[4] for item in group])
        consolidated.append((canonical[1], canonical[2], canonical[3], population))
    return consolidated


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
    """Same load/repair pipeline as build-eu4-province-borders.py
    /build-eu4-provinces.py, so settlement->province assignment agrees with
    everything else keyed by EU4 province id."""
    with geojson_path.open(encoding="utf-8") as f:
        data = json.load(f)

    by_id: dict[int, list] = defaultdict(list)
    for feat in data["features"]:
        province_id = int(feat["properties"]["id"])
        geom = shape(feat["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        by_id[province_id].append(geom)

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

    entries: list[tuple[dict, str, float, float, np.ndarray]] = []

    skipped = 0
    for source_key, source_entry in data.items():
        entry = {**source_entry, "sourceKey": source_key}
        coords = entry.get("coords")
        population_by_year = entry.get("population")
        if not coords or len(coords) != 2 or not population_by_year:
            skipped += 1
            continue
        lat, lon = coords
        resampled = resample_settlement(
            population_with_interventions(entry), target_years
        )
        if not np.any(resampled > 0):
            skipped += 1
            continue
        name = clean_settlement_name(entry)
        if str(entry.get("sourceKey") or "").endswith("-Vietnam"):
            name = normalize_vietnamese_name(name)
        entries.append((entry, name, lat, lon, resampled))

    consolidated = consolidate_agglomerations(entries)
    names = [name for name, _, _, _ in consolidated]
    lats = [lat for _, lat, _, _ in consolidated]
    lons = [lon for _, _, lon, _ in consolidated]
    rows = [population for _, _, _, population in consolidated]

    settlement_count = len(names)
    print(
        f"kept {settlement_count} consolidated settlements from {len(entries)} "
        f"source records, skipped {skipped}"
    )

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
    bin_path = output_dir / f"{prefix}.bin.gz"
    meta_path = output_dir / f"{prefix}.json"

    raw = bytearray()
    raw += quantized.astype("<i2", copy=False).tobytes()
    for lat, lon in zip(lats, lons):
        raw += struct.pack("<ff", lat, lon)
    with gzip.open(bin_path, "wb", compresslevel=9) as f:
        f.write(raw)

    metadata = {
        "version": 1,
        "format": "eu4-ghsl-settlements-v1",
        "compression": "gzip",
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
        "agglomerationConsolidation": {
            "kind": "source_is_agglomeration_of_pointwise_max",
            "sourceRecordCount": len(entries),
            "settlementCount": settlement_count,
        },
		"populationInterventions": {
			"Singapore": "estimated 1819-1870; interpolates to source observations",
		},
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
