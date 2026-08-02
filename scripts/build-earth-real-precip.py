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
DEFAULT_PREFIX = "earth-real-precipitation"
DEFAULT_WIDTH = 632
DEFAULT_HEIGHT = 316
MONTHS = 12
SCALE = 1.0
SECONDS_PER_DAY = 24 * 60 * 60
MONTH_LENGTHS_1991_2020 = np.array(
    [31.0, 28.26666667, 31.0, 30.0, 31.0, 30.0, 31.0, 31.0, 30.0, 31.0, 30.0, 31.0],
    dtype=np.float32,
)


def month_filename(month: int) -> str:
    return f"wc2.1_5m_prec_{month:02d}.tif"


def build_asset(
    source_dir: Path,
    output_dir: Path,
    prefix: str,
    width: int,
    height: int,
) -> tuple[Path, Path]:
    archive_path = source_dir / "wc2.1_5m_prec.zip"
    ncep_path = source_dir / "prate.sfc.mon.ltm.nc"
    if not archive_path.exists():
        raise FileNotFoundError(f"Missing source archive: {archive_path}")
    if not ncep_path.exists():
        raise FileNotFoundError(f"Missing source file: {ncep_path}")

    def month_loader(month: int):
        return load_month_from_archive(archive_path, month_filename(month))

    worldclim_monthly = build_monthly_stack(width, height, month_loader)
    ncep_rate = load_ncep_monthly(ncep_path, "prate")
    ncep_monthly_mm = ncep_rate * (MONTH_LENGTHS_1991_2020 * SECONDS_PER_DAY).reshape(
        12,
        1,
        1,
    )
    ncep_monthly = build_monthly_stack(
        width,
        height,
        lambda month: ncep_monthly_mm[month - 1],
    )
    monthly = fill_missing(worldclim_monthly, ncep_monthly)
    return write_asset(
        monthly,
        output_dir,
        prefix,
        field="worldclim_ncep_monthly_precipitation_mm",
        scale_factor=SCALE,
        stored_scale=1.0,
        source=(
            "WorldClim 2.1 — 5 arc-minute monthly precipitation (1970-2000) "
            "over land; NCEP/NCAR Reanalysis 1 — surface precipitation rate "
            "long-term monthly mean (1991-2020), converted to monthly mm where "
            "WorldClim is missing, including ocean"
        ),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build compact Earth monthly observed-precipitation assets from WorldClim GeoTIFFs."
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
