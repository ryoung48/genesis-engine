from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from build_earth_real_raster import (
    build_monthly_stack,
    fill_missing,
    load_month_from_archive,
    load_ncep_monthly,
    write_asset,
)


DEFAULT_SOURCE_DIR = Path(r"C:\Users\rayou\Downloads")
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_PREFIX = "earth-real-temperature"
# ~200k evenly spaced global cells (632 * 316 = 199,712).
DEFAULT_WIDTH = 632
DEFAULT_HEIGHT = 316
MONTHS = 12
SCALE = 10.0
KELVIN_TO_CELSIUS = 273.15
WORLDCLIM_ARCHIVE = "wc2.1_5m_tavg.zip"

# NCEP/NCAR Reanalysis 1 — 2m air temperature long-term monthly climatology
# (1991-2020), T62 Gaussian grid, lon 0..360 (prime-meridian start), lat
# 88.5..-88.5 (north first) -- same lineage/grid as the wind and ocean-current
# LTM data already used elsewhere, and unlike WorldClim (land-only station
# interpolation) this covers the whole globe including ocean, so ocean cells
# no longer fall back to a land-only gap.
SOURCE = (
    "WorldClim 2.1 — 5 arc-minute monthly mean temperature (1970-2000) over "
    "land; NCEP/NCAR Reanalysis 1 — 2m air temperature long-term monthly mean "
    "(1991-2020) used where WorldClim is missing, including ocean "
    "(worldclim.org/data/worldclim21.html; "
    "downloads.psl.noaa.gov/Datasets/ncep.reanalysis.derived/surface_gauss)"
)


def load_worldclim_air_temp(archive_path: Path, month: int) -> np.ndarray:
    """Load one WorldClim 5 arc-minute monthly mean-temperature raster in °C."""
    filename = f"wc2.1_5m_tavg_{month:02d}.tif"
    return load_month_from_archive(archive_path, filename)


def build_asset(
    source_dir: Path,
    output_dir: Path,
    prefix: str,
    width: int,
    height: int,
) -> tuple[Path, Path]:
    source_path = source_dir / "air.2m.mon.ltm.1991-2020.nc"
    worldclim_path = source_dir / WORLDCLIM_ARCHIVE
    if not source_path.exists():
        raise FileNotFoundError(f"Missing source file: {source_path}")
    if not worldclim_path.exists():
        raise FileNotFoundError(f"Missing WorldClim archive: {worldclim_path}")

    ncep_stack = load_ncep_monthly(source_path, "air") - KELVIN_TO_CELSIUS
    ncep_monthly = build_monthly_stack(
        width,
        height,
        lambda month: ncep_stack[month - 1],
    )
    worldclim_monthly = build_monthly_stack(
        width,
        height,
        lambda month: load_worldclim_air_temp(worldclim_path, month),
    )
    monthly = fill_missing(worldclim_monthly, ncep_monthly)
    return write_asset(
        monthly,
        output_dir,
        prefix,
        field="worldclim_ncep_monthly_air_temp_celsius",
        scale_factor=SCALE,
        stored_scale=1.0 / SCALE,
        source=SOURCE,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build compact Earth monthly observed-temperature (2m air temp, "
            "WorldClim over land and NCEP/NCAR fallback elsewhere) assets."
        )
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    meta_path, bin_path = build_asset(
        source_dir=args.source_dir,
        output_dir=args.output_dir,
        prefix=args.prefix,
        width=args.width,
        height=args.height,
    )
    print(meta_path)
    print(bin_path)


if __name__ == "__main__":
    main()
