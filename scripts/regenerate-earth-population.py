"""Canonical way to regenerate the observed-population assets.

- Total population comes from the HYDE NetCDF aggregation
  (public/heightmap/earth-real-population-eu4.*).
- Urban population comes from the Stadester urban raster set
  (public/heightmap/earth-real-urban-population-eu4.*).
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

from eu4_population_swaps import apply_population_swaps_to_prefix

# build-*.py scripts have hyphens in their filenames, so they can't
# be imported with a normal `import` statement -- load it by file path.
_stadester_spec = importlib.util.spec_from_file_location(
    "build_stadester_population_eu4",
    Path(__file__).parent / "build-stadester-population-eu4.py",
)
assert _stadester_spec and _stadester_spec.loader
_build_stadester_population_eu4 = importlib.util.module_from_spec(_stadester_spec)
sys.modules["build_stadester_population_eu4"] = _build_stadester_population_eu4
_stadester_spec.loader.exec_module(_build_stadester_population_eu4)
build_stadester_assets = _build_stadester_population_eu4.build_assets

_hyde_spec = importlib.util.spec_from_file_location(
    "build_earth_real_population_eu4",
    Path(__file__).parent / "build-earth-real-population-eu4.py",
)
assert _hyde_spec and _hyde_spec.loader
_build_earth_real_population_eu4 = importlib.util.module_from_spec(_hyde_spec)
sys.modules["build_earth_real_population_eu4"] = _build_earth_real_population_eu4
_hyde_spec.loader.exec_module(_build_earth_real_population_eu4)
build_hyde_assets = _build_earth_real_population_eu4.build_assets

DEFAULT_TOTAL_SOURCE_NETCDF = Path(r"C:\Users\rayou\Downloads\population.nc")
DEFAULT_URBAN_SOURCE_DIR = Path(
    r"C:\Users\rayou\Downloads\stadester_urban_rasters\stadester_urban_rasters"
)
DEFAULT_PROVINCE_GEOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
DEFAULT_PROVINCE_META = Path("public/heightmap/eu4-provinces.json")
DEFAULT_OUTPUT_DIR = Path("public/heightmap")
DEFAULT_URBAN_PREFIX = "earth-real-urban-population-eu4"
DEFAULT_TOTAL_PREFIX = "earth-real-population-eu4"
DEFAULT_SCALE = 2000.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Regenerate total population from HYDE and urban "
        "population from Stadester rasters."
    )
    parser.add_argument(
        "--total-source-netcdf",
        type=Path,
        default=DEFAULT_TOTAL_SOURCE_NETCDF,
    )
    parser.add_argument("--urban-source-dir", type=Path, default=DEFAULT_URBAN_SOURCE_DIR)
    parser.add_argument("--province-geojson", type=Path, default=DEFAULT_PROVINCE_GEOJSON)
    parser.add_argument("--province-meta", type=Path, default=DEFAULT_PROVINCE_META)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--urban-prefix", default=DEFAULT_URBAN_PREFIX)
    parser.add_argument("--total-prefix", default=DEFAULT_TOTAL_PREFIX)
    parser.add_argument("--scale", type=float, default=DEFAULT_SCALE)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print("Building total population from HYDE...")
    build_hyde_assets(
        source_netcdf=args.total_source_netcdf,
        province_meta=args.province_meta,
        province_geojson=args.province_geojson,
        output_dir=args.output_dir,
        prefix=args.total_prefix,
        scale=args.scale,
        field_name="population",
    )

    print("Building urban population from Stadester urban rasters...")
    build_stadester_assets(
        source_dir=args.urban_source_dir,
        province_geojson=args.province_geojson,
        output_dir=args.output_dir,
        prefix=args.urban_prefix,
        scale=args.scale,
        filename_prefix="stadester_urban",
        field_label="urban_population",
    )

    print("Applying population province swaps to urban population...")
    apply_population_swaps_to_prefix(args.output_dir, args.urban_prefix)

    print("Done.")


if __name__ == "__main__":
    main()
