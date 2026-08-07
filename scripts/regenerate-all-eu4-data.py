"""Canonical entry point for regenerating every EU4-derived asset in one
pass: reference data (nations/cultures/religions), history events
(provinces/nations/wars/diplomacy), the province raster + seeds used to map
EU4 provinces onto the procedural mesh, Cliopatria's pre-2AD dated-polygon
history layer, the vector province-border asset, and total/urban population
(including the population province-swap postprocessing step). Run this
instead of calling the individual scripts by hand so nothing gets forgotten
or run out of order.

    python scripts/regenerate-all-eu4-data.py

Remember to re-run "Load Earth" in the app afterward -- the province raster
and reference data are baked into world generation, not fetched live for an
already-generated world.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
DEFAULT_GEOJSON = Path(
    r"C:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
DEFAULT_PROVINCE_NAMES_TOPOJSON = Path(
    r"C:\Users\rayou\projects\geo-explorer\public\provinces.topojson"
)
DEFAULT_GHSL_SOURCE = Path(
    r"C:\Users\rayou\Downloads\metro_adjusted_rasters_and_json\stadester_ghsl.json"
)
DEFAULT_CLIOPATRIA_SOURCE = Path(
    r"C:\Users\rayou\Downloads\cliopatria.geojson\cliopatria_polities_only.geojson"
)

STEPS: list[tuple[str, str, list[str]]] = [
    ("Reference data (nations/cultures/religions)", "build-eu4-reference-data.py", []),
    (
        "History events (provinces/nations/wars/diplomacy)",
        "build-eu4-history-events.py",
        ["--province-names-topojson", "{province_names_topojson}"],
    ),
    (
        "Province raster + seeds (procedural mesh mapping)",
        "build-eu4-provinces.py",
        ["--geojson", "{geojson}"],
    ),
    (
        "Cliopatria pre-2AD history layer",
        "build-cliopatria-events.py",
        ["--source", "{cliopatria_source}"],
    ),
    (
        "Province border vectors",
        "build-eu4-province-borders.py",
        ["--geojson", "{geojson}"],
    ),
    (
        "Population (total + urban, with province swaps)",
        "regenerate-earth-population.py",
        ["--province-geojson", "{geojson}"],
    ),
    (
        "GHSL settlements",
        "build-ghsl-settlements.py",
        [
            "--source",
            "{ghsl_source}",
            "--population-asset",
            "public/earth-data/earth-real-population-eu4.json",
            "--province-geojson",
            "{geojson}",
        ],
    ),
    ("GHSL historical names", "inject-settlement-name-history.py", []),
    (
        "EU4 province settlements",
        "build-eu4-province-settlements.py",
        ["--province-geojson", "{geojson}"],
    ),
]


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geojson", type=Path, default=DEFAULT_GEOJSON)
    parser.add_argument(
        "--province-names-topojson",
        type=Path,
        default=DEFAULT_PROVINCE_NAMES_TOPOJSON,
    )
    parser.add_argument("--ghsl-source", type=Path, default=DEFAULT_GHSL_SOURCE)
    parser.add_argument("--cliopatria-source", type=Path, default=DEFAULT_CLIOPATRIA_SOURCE)
    args = parser.parse_args()

    replacements = {
        "{geojson}": str(args.geojson),
        "{province_names_topojson}": str(args.province_names_topojson),
        "{ghsl_source}": str(args.ghsl_source),
        "{cliopatria_source}": str(args.cliopatria_source),
    }

    for label, script_name, extra_args in STEPS:
        print(f"\n=== {label} ({script_name}) ===")
        resolved_args = [replacements.get(arg, arg) for arg in extra_args]
        result = subprocess.run([sys.executable, str(SCRIPTS_DIR / script_name), *resolved_args])
        if result.returncode != 0:
            print(f"\nFailed at: {label} ({script_name})", file=sys.stderr)
            sys.exit(result.returncode)

    print("\nAll EU4 data regenerated. Re-run \"Load Earth\" in the app to pick up the changes.")


if __name__ == "__main__":
    main()
