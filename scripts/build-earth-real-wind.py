from __future__ import annotations

import argparse
from pathlib import Path

import netCDF4 as nc
import numpy as np

from build_earth_real_raster import build_monthly_stack, write_asset


DEFAULT_SOURCE_DIR = Path(r"C:\Users\rayou\Downloads\ncep-wind")
DEFAULT_OUTPUT_DIR = Path("public/heightmap")
DEFAULT_WIDTH = 360
DEFAULT_HEIGHT = 180
MONTHS = 12
# NCEP/NCAR long-term-mean values are stored at 0.01 m/s precision.
SCALE = 100.0

# NCEP/NCAR Reanalysis 10 m wind long-term monthly climatology (1991-2020),
# T62 Gaussian grid, lon 0..360 (prime-meridian start), lat 88.5..-88.5 (north first).
SOURCE = (
    "NCEP/NCAR Reanalysis 1 — 10m u/v wind, long-term monthly mean "
    "(downloads.psl.noaa.gov/Datasets/ncep.reanalysis.derived/surface_gauss)"
)


def load_component(path: Path, var_name: str) -> np.ndarray:
    """Load a (month, lat, lon) NCEP LTM variable, re-centered to lon -180..180."""
    with nc.Dataset(path) as ds:
        data = np.asarray(ds.variables[var_name][:], dtype=np.float32)
        lon = np.asarray(ds.variables["lon"][:], dtype=np.float64)

    # Roll columns so index 0 corresponds to lon -180 instead of lon 0.
    shift = int(np.argmin(np.abs(lon - 180.0)))
    data = np.roll(data, -shift, axis=2)

    masked = np.ma.getmaskarray(data) if np.ma.isMaskedArray(data) else None
    out = np.array(data, dtype=np.float32, copy=True)
    if masked is not None:
        out[masked] = np.nan
    out[out < -900] = np.nan  # guard against the raw missing_value sentinel
    return out


def build_asset(
    source_dir: Path,
    output_dir: Path,
    width: int,
    height: int,
) -> list[tuple[Path, Path]]:
    u_path = source_dir / "uwnd.10m.mon.ltm.nc"
    v_path = source_dir / "vwnd.10m.mon.ltm.nc"
    if not u_path.exists():
        raise FileNotFoundError(f"Missing source file: {u_path}")
    if not v_path.exists():
        raise FileNotFoundError(f"Missing source file: {v_path}")

    u_stack = load_component(u_path, "uwnd")
    v_stack = load_component(v_path, "vwnd")

    results = []
    for prefix, field, stack in (
        ("earth-real-wind-u", "ncep_monthly_wind_u_ms", u_stack),
        ("earth-real-wind-v", "ncep_monthly_wind_v_ms", v_stack),
    ):
        monthly = build_monthly_stack(width, height, lambda m, s=stack: s[m - 1])
        results.append(
            write_asset(
                monthly,
                output_dir,
                prefix,
                field=field,
                scale_factor=SCALE,
                stored_scale=1.0 / SCALE,
                source=SOURCE,
            )
        )
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build compact Earth monthly observed-wind (u/v, m/s) assets from NCEP/NCAR reanalysis NetCDF."
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    for meta_path, bin_path in build_asset(
        source_dir=args.source_dir,
        output_dir=args.output_dir,
        width=args.width,
        height=args.height,
    ):
        print(meta_path)
        print(bin_path)


if __name__ == "__main__":
    main()
