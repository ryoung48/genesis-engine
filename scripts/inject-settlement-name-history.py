"""Inject historical city-name intervals into the GHSL settlement metadata.

The GHSL asset supplies settlement positions and population timelines but only
one static label.  ``cities.json`` supplies historical labels and date ranges.
This script assigns each historical city to its nearest GHSL point when it is
within the configured distance and stores the supplied intervals in the JSON
metadata.  It deliberately retains overlapping aliases: choosing a display
precedence is a UI policy, while this asset remains a faithful source overlay.
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import struct
import unicodedata
from pathlib import Path

from historical_settlement_overrides import HISTORICAL_NAME_OVERRIDES

DEFAULT_CITIES = Path(r"C:\Users\rayou\Downloads\cities.json")
DEFAULT_SETTLEMENTS = Path("public/earth-data/eu4-ghsl-settlements.json")
EARTH_RADIUS_KM = 6371.0
HISTORICAL_SITE_NAMES = {"Cahokia", "Chichen Itza", "Machu Picchu", "Monte Alban", "Tula"}
EXCLUDED_HISTORICAL_NAMES = {
	# Saqqara and Memphis are nearby but distinct ancient sites. The shared
	# nearest marker is used for Memphis, whose source interval is explicit.
	"Saqqara",
}


def great_circle_distance_km(locations: tuple[tuple[float, float], tuple[float, float]]) -> float:
    """Return an equirectangular short-distance approximation in kilometres.

    The matching radius is intentionally small (25 km), for which this is
    materially equivalent to a great-circle calculation and less costly while
    scanning the full settlement asset.
    """
    (from_lat, from_lon), (to_lat, to_lon) = locations
    radians_per_degree = math.pi / 180.0
    longitude_delta = (to_lon - from_lon) * radians_per_degree
    latitude_delta = (to_lat - from_lat) * radians_per_degree
    mean_latitude = (from_lat + to_lat) * radians_per_degree / 2.0
    return EARTH_RADIUS_KM * math.hypot(
        longitude_delta * math.cos(mean_latitude), latitude_delta
    )


def normalize_display_name(name: str) -> str:
    """Compile Latin diacritics into the ASCII labels used by the GHSL asset."""
    normalized_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return normalized_name or name


def normalize_lookup_name(name: str) -> str:
    """Return the compiled-label form used to resolve explicit target overrides."""
    return normalize_display_name(name).casefold()


def load_settlement_coordinates(params: tuple[dict, Path]) -> list[tuple[float, float]]:
    """Read lat/lon records stored after the time-major population values."""
    metadata, metadata_path = params
    binary_path = metadata_path.parent / metadata["bin"]
    compressed = binary_path.read_bytes()
    raw = gzip.decompress(compressed) if metadata.get("compression") == "gzip" else compressed
    settlement_count = metadata["settlementCount"]
    coordinate_offset = metadata["timeCount"] * settlement_count * 2
    expected_size = coordinate_offset + settlement_count * 8
    if len(raw) != expected_size:
        raise ValueError(
            f"Unexpected settlement binary size: expected {expected_size}, got {len(raw)}"
        )
    return [
        struct.unpack_from("<ff", raw, coordinate_offset + settlement_index * 8)
        for settlement_index in range(settlement_count)
    ]


def find_nearest_settlement(params: tuple[list[float], list[tuple[float, float]]]) -> tuple[int, float]:
    city_coordinates, settlements = params
    city_lon, city_lat = city_coordinates
    nearest_index = -1
    nearest_distance = math.inf
    for settlement_index, (settlement_lat, settlement_lon) in enumerate(settlements):
        distance = great_circle_distance_km(
            ((city_lat, city_lon), (settlement_lat, settlement_lon))
        )
        if distance < nearest_distance:
            nearest_index = settlement_index
            nearest_distance = distance
    return nearest_index, nearest_distance


def build_name_histories(params: tuple[dict, list[tuple[float, float]], list[str], float]) -> tuple[dict[str, list[dict]], int]:
    """Return historical intervals keyed by settlement index and match count."""
    cities, settlements, settlement_names, max_distance_km = params
    settlement_indices_by_name: dict[str, list[int]] = {}
    for settlement_index, settlement_name in enumerate(settlement_names):
        settlement_indices_by_name.setdefault(normalize_lookup_name(settlement_name), []).append(
            settlement_index
        )
    histories: dict[str, list[dict]] = {}
    matches = 0
    for feature in cities["features"]:
        properties = feature["properties"]
        if properties["name"] in EXCLUDED_HISTORICAL_NAMES:
            continue
        override_name = HISTORICAL_NAME_OVERRIDES.get(properties["name"])
        if override_name:
            override_indices = settlement_indices_by_name.get(normalize_lookup_name(override_name), [])
            if len(override_indices) != 1:
                raise ValueError(
                    f"Expected one settlement named {override_name!r}, found {len(override_indices)}"
                )
            settlement_index = override_indices[0]
        else:
            settlement_index, distance = find_nearest_settlement(
                (feature["geometry"]["coordinates"], settlements)
            )
            if distance > max_distance_km:
                continue
        histories.setdefault(str(settlement_index), []).append(
            {
                "name": normalize_display_name(properties["name"]),
                "foundedYear": properties["foundedYear"],
                "endYear": properties["endYear"],
                "importance": properties["importance"],
                "suppressFallbackAfterEnd": properties["name"] in HISTORICAL_SITE_NAMES,
            }
        )
        matches += 1

    for intervals in histories.values():
        intervals.sort(
            key=lambda interval: (
                interval["foundedYear"],
                interval["endYear"] is None,
                interval["endYear"] if interval["endYear"] is not None else math.inf,
                interval["name"],
            )
        )
    return histories, matches


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cities", type=Path, default=DEFAULT_CITIES)
    parser.add_argument("--settlements", type=Path, default=DEFAULT_SETTLEMENTS)
    parser.add_argument("--max-distance-km", type=float, default=25.0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    metadata = json.loads(args.settlements.read_text(encoding="utf-8"))
    cities = json.loads(args.cities.read_text(encoding="utf-8"))
    settlements = load_settlement_coordinates((metadata, args.settlements))
    histories, match_count = build_name_histories(
        (cities, settlements, metadata["names"], args.max_distance_km)
    )
    metadata["nameHistories"] = histories
    metadata["nameHistorySource"] = str(args.cities)
    metadata["nameHistoryMaxDistanceKm"] = args.max_distance_km
    metadata["nameHistoryMatchCount"] = match_count
    args.settlements.write_text(json.dumps(metadata, indent="\t") + "\n", encoding="utf-8")
    print(
        f"Injected {match_count} historical-name records for "
        f"{len(histories)} GHSL settlements into {args.settlements}"
    )


if __name__ == "__main__":
    main()
