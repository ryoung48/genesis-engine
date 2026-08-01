from __future__ import annotations

import argparse
from pathlib import Path

import netCDF4 as nc
import numpy as np

from build_earth_real_raster import build_monthly_stack, write_asset


DEFAULT_SOURCE_DIR = Path(r"C:\Users\rayou\Downloads")
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_PREFIX = "earth-real-temperature"
DEFAULT_WIDTH = 360
DEFAULT_HEIGHT = 180
MONTHS = 12
SCALE = 10.0
KELVIN_TO_CELSIUS = 273.15

# NCEP/NCAR Reanalysis 1 — 2m air temperature long-term monthly climatology
# (1991-2020), T62 Gaussian grid, lon 0..360 (prime-meridian start), lat
# 88.5..-88.5 (north first) -- same lineage/grid as the wind and ocean-current
# LTM data already used elsewhere, and unlike WorldClim (land-only station
# interpolation) this covers the whole globe including ocean, so ocean cells
# no longer fall back to a land-only gap.
SOURCE = (
    "NCEP/NCAR Reanalysis 1 — 2m air temperature, long-term monthly mean "
    "(1991-2020) (downloads.psl.noaa.gov/Datasets/ncep.reanalysis.derived/surface_gauss)"
)


def load_air_temp(path: Path) -> np.ndarray:
    """Load the NCEP/NCAR 2m air temp LTM (already a 12-month (month, lat,
    lon) climatology), re-centered to lon -180..180 and converted Kelvin ->
    Celsius."""
    with nc.Dataset(path) as ds:
        climatology = np.asarray(ds.variables["air"][:], dtype=np.float32)
        lon = np.asarray(ds.variables["lon"][:], dtype=np.float64)

    shift = int(np.argmin(np.abs(lon - 180.0)))
    climatology = np.roll(climatology, -shift, axis=2)

    out = np.array(climatology, dtype=np.float32, copy=True)
    out[out < -900] = np.nan
    out -= KELVIN_TO_CELSIUS
    return out


def build_asset(
    source_dir: Path,
    output_dir: Path,
    prefix: str,
    width: int,
    height: int,
) -> tuple[Path, Path]:
    source_path = source_dir / "air.2m.mon.ltm.1991-2020.nc"
    if not source_path.exists():
        raise FileNotFoundError(f"Missing source file: {source_path}")

    stack = load_air_temp(source_path)
    monthly = build_monthly_stack(width, height, lambda m: stack[m - 1])
    return write_asset(
        monthly,
        output_dir,
        prefix,
        field="ncep_monthly_air_temp_2m_celsius",
        scale_factor=SCALE,
        stored_scale=1.0 / SCALE,
        source=SOURCE,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build compact Earth monthly observed-temperature (2m air temp, "
            "full globe incl. ocean) assets from NCEP/NCAR reanalysis NetCDF."
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
