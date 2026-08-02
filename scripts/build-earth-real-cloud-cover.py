from __future__ import annotations

import argparse
from pathlib import Path

import netCDF4 as nc
import numpy as np

from build_earth_real_raster import MONTHS, resample_month, write_asset


DEFAULT_SOURCE = Path(
    r"C:\Users\rayou\Downloads\37916b35b42184e1bb2e8719d677efd3\data_stream-moda_stepType-avgua.nc"
)
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_PREFIX = "earth-real-cloud-cover"
DEFAULT_WIDTH = 632
DEFAULT_HEIGHT = 316
FIRST_YEAR = 1991
LAST_YEAR = 2020
SCALE_FACTOR = 10_000.0
SOURCE = (
    "ERA5 monthly mean total cloud cover (1991-2020 climatology; "
    "ECMWF/Copernicus Climate Change Service)"
)


def build_monthly_climatology(source: Path) -> np.ndarray:
    with nc.Dataset(source) as dataset:
        time = dataset.variables["valid_time"]
        dates = nc.num2date(time[:], time.units, calendar=time.calendar)
        cloud_cover = dataset.variables["tcc"]
        height = len(dataset.dimensions["latitude"])
        width = len(dataset.dimensions["longitude"])
        sums = np.zeros((MONTHS, height, width), dtype=np.float64)
        counts = np.zeros(MONTHS, dtype=np.int32)

        for index, date in enumerate(dates):
            if not FIRST_YEAR <= date.year <= LAST_YEAR:
                continue
            month_index = date.month - 1
            values = np.asarray(cloud_cover[index], dtype=np.float32)
            sums[month_index] += values
            counts[month_index] += 1

    if not np.all(counts == LAST_YEAR - FIRST_YEAR + 1):
        raise ValueError(f"Incomplete monthly climatology: {counts.tolist()}")

    monthly = (sums / counts[:, None, None]).astype(np.float32)
    # ERA5 longitude starts at 0°; the app's equirectangular sampling starts
    # at -180°, so recenter the antimeridian in the same way as NCEP assets.
    return np.roll(monthly, -(width // 2), axis=2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a compact monthly ERA5 total-cloud-cover climatology."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.source.exists():
        raise FileNotFoundError(f"Missing source file: {args.source}")
    climatology = build_monthly_climatology(args.source)
    monthly = np.empty((MONTHS, args.height, args.width), dtype=np.float32)
    for month in range(MONTHS):
        monthly[month] = resample_month(climatology[month], args.width, args.height)
    meta_path, bin_path = write_asset(
        monthly,
        args.output_dir,
        args.prefix,
        field="era5_monthly_total_cloud_cover_fraction",
        scale_factor=SCALE_FACTOR,
        stored_scale=1.0 / SCALE_FACTOR,
        source=SOURCE,
    )
    print(meta_path)
    print(bin_path)


if __name__ == "__main__":
    main()
