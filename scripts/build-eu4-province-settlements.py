"""Build one EU4-authoritative settlement record per province.

Province history determines the settlement identity and its dated city,
development, fort, and trade-center facts. GHSL contributes only the best
available coordinate and population carrier from the same EU4 province.
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import struct
import unicodedata
from collections import defaultdict
from pathlib import Path

from historical_settlement_overrides import (
    HISTORICAL_NAME_OVERRIDES,
    PROVINCE_CAPITAL_NAME_EXCLUSIONS,
    PROVINCE_GHSL_ENRICHMENT_EXCLUSIONS,
)

DEFAULT_PROVINCES = Path("public/earth-history/events/provinces.json")
DEFAULT_GHSL = Path("public/earth-data/eu4-ghsl-settlements.json")
DEFAULT_CITIES = Path(r"C:\Users\rayou\Downloads\cities.json")
DEFAULT_PROVINCE_GEOJSON = Path(
    r"C:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
DEFAULT_OUTPUT = Path("public/earth-data/eu4-province-settlements.json")
NEARBY_NAME_MATCH_MAX_DISTANCE_KM = 100.0
HISTORICAL_CITY_MATCH_MAX_DISTANCE_KM = 25.0
HISTORICAL_CITY_FUZZY_NAME_MATCH_MAX_DISTANCE_KM = 100.0
FUZZY_NAME_MATCH_MIN_SIMILARITY = 0.85
GHSL_FALLBACK_START_DAYS = -3_650_000
SETTLEMENT_EVENT_KINDS = {
    "capitalName",
    "citySize",
    "centerOfTrade",
    "isCity",
    "fort",
    "tradeGoods",
}


def normalize_name(name: str) -> str:
    """Match labels with Latin diacritics compiled away in the GHSL asset."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return " ".join(ascii_name.casefold().split())


def normalize_display_name(name: str) -> str:
    """Compile Latin diacritics to the ASCII display convention of the assets."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return ascii_name or name


def dice_similarity(names: tuple[str, str]) -> float:
    """Compare normalized labels by their shared character bigrams."""
    left, right = names
    if left == right:
        return 1.0
    if len(left) < 2 or len(right) < 2:
        return 0.0
    left_bigrams = {left[index : index + 2] for index in range(len(left) - 1)}
    right_bigrams = {right[index : index + 2] for index in range(len(right) - 1)}
    return 2 * len(left_bigrams & right_bigrams) / (len(left_bigrams) + len(right_bigrams))


def levenshtein_similarity(names: tuple[str, str]) -> float:
    """Compare normalized labels while allowing small spelling variations."""
    left, right = names
    if left == right:
        return 1.0
    if not left or not right:
        return 0.0
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1]
                    + (left_character != right_character),
                )
            )
        previous = current
    return 1 - previous[-1] / len(left)


def fuzzy_name_similarity(names: tuple[str, str]) -> float:
    """Use complementary edit and bigram comparisons for conservative aliases."""
    return max(levenshtein_similarity(names), dice_similarity(names))


def read_peak_populations(metadata: dict, metadata_path: Path) -> list[int]:
    """Return each GHSL point's maximum stored population without loading UI data."""
    binary_path = metadata_path.parent / metadata["bin"]
    raw = binary_path.read_bytes()
    if metadata.get("compression") == "gzip":
        raw = gzip.decompress(raw)
    settlement_count = metadata["settlementCount"]
    value_count = metadata["timeCount"] * settlement_count
    values = struct.unpack_from(f"<{value_count}h", raw)
    peaks = [0] * settlement_count
    nodata = metadata["nodata"]
    for time_index in range(metadata["timeCount"]):
        offset = time_index * settlement_count
        for settlement_index in range(settlement_count):
            value = values[offset + settlement_index]
            if value != nodata and value > peaks[settlement_index]:
                peaks[settlement_index] = value
    return peaks


def read_coordinates(metadata: dict, metadata_path: Path) -> list[tuple[float, float]]:
    """Return GHSL longitude/latitude pairs stored after the population grid."""
    binary_path = metadata_path.parent / metadata["bin"]
    raw = binary_path.read_bytes()
    if metadata.get("compression") == "gzip":
        raw = gzip.decompress(raw)
    settlement_count = metadata["settlementCount"]
    coordinate_offset = metadata["timeCount"] * settlement_count * 2
    return [
        (longitude, latitude)
        for latitude, longitude in (
            struct.unpack_from("<ff", raw, coordinate_offset + index * 8)
            for index in range(settlement_count)
        )
    ]


def distance_km(locations: tuple[tuple[float, float], tuple[float, float]]) -> float:
    """Return the great-circle distance between longitude/latitude pairs."""
    (from_lon, from_lat), (to_lon, to_lat) = locations
    radians = math.pi / 180.0
    latitude_delta = (to_lat - from_lat) * radians
    longitude_delta = (to_lon - from_lon) * radians
    a = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(from_lat * radians)
        * math.cos(to_lat * radians)
        * math.sin(longitude_delta / 2) ** 2
    )
    return 6371.0 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def is_american_longitude(longitude: float) -> bool:
    """Exclude the Americas from the requested historical-city pass."""
    return longitude < -25.0


def build_pre_eu4_city_histories(
    params: tuple[dict, dict, list[tuple[float, float]]]
) -> dict[str, list[dict]]:
    """Map pre-2 AD city intervals to their nearby GHSL carrier."""
    cities, ghsl, coordinates = params
    indices_by_static_name: dict[str, list[int]] = defaultdict(list)
    for index, name in enumerate(ghsl["names"]):
        indices_by_static_name[normalize_name(name)].append(index)

    histories: dict[str, list[dict]] = defaultdict(list)
    for feature in cities["features"]:
        longitude, latitude = feature["geometry"]["coordinates"]
        properties = feature["properties"]
        if properties["foundedYear"] >= 2:
            continue
        historical_name = properties["name"]
        override_target = HISTORICAL_NAME_OVERRIDES.get(historical_name)
        if override_target:
            matching_indices = indices_by_static_name[normalize_name(override_target)]
            if len(matching_indices) != 1:
                raise ValueError(
                    f"Historical target {override_target!r} for {historical_name!r} "
                    f"matched {len(matching_indices)} GHSL settlements"
                )
            nearest_index = matching_indices[0]
        else:
            normalized_historical_name = normalize_name(historical_name)
            nearby_name_matches = [
                index
                for index, candidate in enumerate(coordinates)
                if distance_km(((longitude, latitude), candidate))
                <= HISTORICAL_CITY_FUZZY_NAME_MATCH_MAX_DISTANCE_KM
                and fuzzy_name_similarity(
                    (normalized_historical_name, normalize_name(ghsl["names"][index]))
                )
                >= FUZZY_NAME_MATCH_MIN_SIMILARITY
            ]
            if nearby_name_matches:
                nearest_index = min(
                    nearby_name_matches,
                    key=lambda index: distance_km(((longitude, latitude), coordinates[index])),
                )
            else:
                nearest_index = min(
                    range(len(coordinates)),
                    key=lambda index: distance_km(((longitude, latitude), coordinates[index])),
                )
                if (
                    distance_km(((longitude, latitude), coordinates[nearest_index]))
                    > HISTORICAL_CITY_MATCH_MAX_DISTANCE_KM
                ):
                    continue
        province_id = ghsl["provinceIds"][nearest_index]
        if province_id < 0:
            continue
        histories[str(province_id)].append(
            {
                "name": normalize_display_name(historical_name),
                "foundedYear": properties["foundedYear"],
                "endYear": properties["endYear"],
                "importance": properties["importance"],
                "ghslSettlementIndex": nearest_index,
                "ghslPopulationCarrierIndices": [nearest_index],
            }
        )
    for intervals in histories.values():
        intervals.sort(
            key=lambda interval: (
                interval["foundedYear"],
                interval["endYear"] is None,
                interval["endYear"] if interval["endYear"] is not None else math.inf,
                interval["name"],
            )
        )
    return histories


def name_score(params: tuple[set[str], str, list[dict]]) -> int:
    """Score a GHSL point by agreement with any EU4 name of its province."""
    province_names, static_name, name_history = params
    if normalize_name(static_name) in province_names:
        return 2
    if any(normalize_name(entry["name"]) in province_names for entry in name_history):
        return 1
    candidate_names = [normalize_name(static_name)] + [
        normalize_name(entry["name"]) for entry in name_history
    ]
    if any(
        fuzzy_name_similarity((province_name, candidate_name))
        >= FUZZY_NAME_MATCH_MIN_SIMILARITY
        for province_name in province_names
        for candidate_name in candidate_names
    ):
        return 1
    return 0


def collect_coordinate_pairs(coordinates: object) -> list[tuple[float, float]]:
    """Flatten a GeoJSON coordinate tree into its longitude/latitude points."""
    if not isinstance(coordinates, list):
        return []
    if len(coordinates) >= 2 and all(isinstance(value, (int, float)) for value in coordinates[:2]):
        return [(float(coordinates[0]), float(coordinates[1]))]
    return [point for child in coordinates for point in collect_coordinate_pairs(child)]


def load_province_centers(path: Path) -> dict[str, tuple[float, float]]:
    """Return geographic bounding-box centers for EU4 province fallback markers."""
    geojson = json.loads(path.read_text(encoding="utf-8"))
    centers: dict[str, tuple[float, float]] = {}
    for feature in geojson["features"]:
        province_id = feature.get("properties", {}).get("id")
        points = collect_coordinate_pairs(feature.get("geometry", {}).get("coordinates"))
        if province_id is None or not points:
            continue
        longitudes, latitudes = zip(*points, strict=True)
        centers[str(province_id)] = (
            (min(longitudes) + max(longitudes)) / 2,
            (min(latitudes) + max(latitudes)) / 2,
        )
    return centers


def build_settlements(params: tuple[dict, dict, list[int], list[tuple[float, float]], dict[str, tuple[float, float]], dict[str, list[dict]]]) -> tuple[dict[str, dict], dict[str, int]]:
    """Pair each named EU4 province with one best GHSL enrichment point."""
    provinces, ghsl, peaks, coordinates, province_centers, pre_eu4_histories = params
    indices_by_province: dict[int, list[int]] = defaultdict(list)
    indices_by_name: dict[str, set[int]] = defaultdict(set)
    for settlement_index, province_id in enumerate(ghsl["provinceIds"]):
        if province_id >= 0:
            indices_by_province[province_id].append(settlement_index)
        indices_by_name[normalize_name(ghsl["names"][settlement_index])].add(settlement_index)
        for history in ghsl.get("nameHistories", {}).get(str(settlement_index), []):
            indices_by_name[normalize_name(history["name"])].add(settlement_index)

    settlements: dict[str, dict] = {}
    matched_by_name = 0
    matched_by_nearby_name = 0
    matched_by_population = 0
    unmatched = 0
    for province_id, province in provinces.items():
        events = [
            event
            for event in province["events"]
            if event["kind"] in SETTLEMENT_EVENT_KINDS
            and (
                event["kind"] != "capitalName"
                or (province_id, event["payload"]["name"])
                not in PROVINCE_CAPITAL_NAME_EXCLUSIONS
            )
        ]
        name_events = [event for event in events if event["kind"] == "capitalName"]
        if not name_events:
            continue
        province_names = {normalize_name(event["payload"]["name"]) for event in name_events}
        candidates = (
            []
            if province_id in PROVINCE_GHSL_ENRICHMENT_EXCLUSIONS
            else indices_by_province.get(int(province_id), [])
        )
        local_name_candidates = [
            index
            for index in candidates
            if name_score(
                (province_names, ghsl["names"][index], ghsl.get("nameHistories", {}).get(str(index), []))
            )
        ]
        population_carriers: set[int] = set()
        if local_name_candidates:
            ghsl_settlement_index = max(
                local_name_candidates,
                key=lambda index: (
                    name_score(
                        (province_names, ghsl["names"][index], ghsl.get("nameHistories", {}).get(str(index), []))
                    ),
                    peaks[index],
                ),
            )
            population_carriers.update(local_name_candidates)
            matched_by_name += 1
        else:
            named_candidates = set().union(*(indices_by_name[name] for name in province_names))
            nearby_name_candidates = [
                index
                for index in named_candidates
                if distance_km((province_centers[province_id], coordinates[index]))
                <= NEARBY_NAME_MATCH_MAX_DISTANCE_KM
            ]
            if nearby_name_candidates:
                ghsl_settlement_index = min(
                    nearby_name_candidates,
                    key=lambda index: (
                        distance_km((province_centers[province_id], coordinates[index])),
                        -name_score(
                            (province_names, ghsl["names"][index], ghsl.get("nameHistories", {}).get(str(index), []))
                        ),
                        -peaks[index],
                    ),
                )
                population_carriers.add(ghsl_settlement_index)
                matched_by_nearby_name += 1
            elif candidates:
                ghsl_settlement_index = max(candidates, key=lambda index: peaks[index])
                population_carriers.add(ghsl_settlement_index)
                matched_by_population += 1
            else:
                unmatched += 1
                ghsl_settlement_index = None
        settlements[province_id] = {
            "ghslSettlementIndex": ghsl_settlement_index,
            "ghslPopulationCarrierIndices": sorted(population_carriers),
            "longitude": province_centers[province_id][0],
            "latitude": province_centers[province_id][1],
            "events": events,
            "preEu4NameHistory": pre_eu4_histories.get(province_id, []),
        }

    ghsl_fallbacks = 0
    for province_id, candidates in indices_by_province.items():
        province_key = str(province_id)
        if province_key in settlements or province_key not in province_centers:
            continue
        longitude, latitude = province_centers[province_key]
        if is_american_longitude(longitude):
            continue
        ghsl_settlement_index = max(candidates, key=lambda index: peaks[index])
        settlements[province_key] = {
            "ghslSettlementIndex": ghsl_settlement_index,
            "ghslPopulationCarrierIndices": [ghsl_settlement_index],
            "longitude": longitude,
            "latitude": latitude,
            "events": [
                {
                    "date": GHSL_FALLBACK_START_DAYS,
                    "kind": "capitalName",
                    "payload": {"name": ghsl["names"][ghsl_settlement_index]},
                }
            ],
            "preEu4NameHistory": pre_eu4_histories.get(province_key, []),
        }
        ghsl_fallbacks += 1
    return settlements, {
        "matchedByName": matched_by_name,
        "matchedByNearbyName": matched_by_nearby_name,
        "matchedByPopulation": matched_by_population,
        "unmatched": unmatched,
        "ghslFallbacks": ghsl_fallbacks,
        "preEu4Cities": sum(len(intervals) for intervals in pre_eu4_histories.values()),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provinces", type=Path, default=DEFAULT_PROVINCES)
    parser.add_argument("--ghsl", type=Path, default=DEFAULT_GHSL)
    parser.add_argument("--cities", type=Path, default=DEFAULT_CITIES)
    parser.add_argument("--province-geojson", type=Path, default=DEFAULT_PROVINCE_GEOJSON)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    provinces = json.loads(args.provinces.read_text(encoding="utf-8"))
    ghsl = json.loads(args.ghsl.read_text(encoding="utf-8"))
    cities = json.loads(args.cities.read_text(encoding="utf-8"))
    coordinates = read_coordinates(ghsl, args.ghsl)
    settlements, summary = build_settlements(
        (
            provinces,
            ghsl,
            read_peak_populations(ghsl, args.ghsl),
            coordinates,
            load_province_centers(args.province_geojson),
            build_pre_eu4_city_histories((cities, ghsl, coordinates)),
        )
    )
    output = {
        "format": "eu4-province-settlements-v1",
        "description": (
            "One EU4-authoritative settlement per province. Events retain the "
            "EU4 name and city history; ghslSettlementIndex is an optional "
            "coordinate and population enrichment into eu4-ghsl-settlements."
        ),
        "settlements": settlements,
        "summary": summary,
    }
    args.output.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")
    print(
        f"Built {len(settlements)} province settlements: "
        f"{summary['matchedByName']} name matches, "
		f"{summary['matchedByNearbyName']} nearby-name matches, "
        f"{summary['matchedByPopulation']} population fallbacks, "
        f"{summary['unmatched']} without GHSL enrichment, "
        f"{summary['preEu4Cities']} pre-2 AD city intervals, "
        f"{summary['ghslFallbacks']} GHSL-only province fallbacks"
    )


if __name__ == "__main__":
    main()
