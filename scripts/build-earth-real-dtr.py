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
DEFAULT_PREFIX = "earth-real-dtr"
DEFAULT_WIDTH = 632
DEFAULT_HEIGHT = 316
SCALE = 10.0


def month_filename(stem: str, month: int) -> str:
    return f"wc2.1_5m_{stem}_{month:02d}.tif"


def build_asset(
    source_dir: Path,
    output_dir: Path,
    prefix: str,
    width: int,
    height: int,
) -> tuple[Path, Path]:
    tmax_archive = source_dir / "wc2.1_5m_tmax.zip"
    tmin_archive = source_dir / "wc2.1_5m_tmin.zip"
    ncep_tmax_path = source_dir / "tmax.2m.mon.ltm.nc"
    ncep_tmin_path = source_dir / "tmin.2m.mon.ltm.nc"
    for source_path in (tmax_archive, tmin_archive, ncep_tmax_path, ncep_tmin_path):
        if not source_path.exists():
            raise FileNotFoundError(f"Missing source file: {source_path}")

    def month_loader(month: int):
        return load_month_from_archive(
            tmax_archive,
            month_filename("tmax", month),
        ) - load_month_from_archive(tmin_archive, month_filename("tmin", month))

    worldclim_monthly = build_monthly_stack(width, height, month_loader)
    ncep_dtr = load_ncep_monthly(ncep_tmax_path, "tmax") - load_ncep_monthly(
        ncep_tmin_path,
        "tmin",
    )
    ncep_monthly = build_monthly_stack(
        width,
        height,
        lambda month: ncep_dtr[month - 1],
    )
    monthly = fill_missing(worldclim_monthly, ncep_monthly)
    return write_asset(
        monthly,
        output_dir,
        prefix,
        field="worldclim_ncep_monthly_dtr_celsius",
        scale_factor=SCALE,
        stored_scale=0.1,
        source=(
            "WorldClim 2.1 — 5 arc-minute monthly maximum minus minimum "
            "temperature (1970-2000) over land; NCEP/NCAR Reanalysis 1 — 2m "
            "maximum minus minimum temperature long-term monthly mean (1991-2020) "
            "where WorldClim is missing, including ocean"
        ),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build compact Earth monthly observed-DTR assets from WorldClim tmax/tmin GeoTIFFs."
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
