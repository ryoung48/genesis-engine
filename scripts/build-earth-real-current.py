from __future__ import annotations

import argparse
from pathlib import Path

import netCDF4 as nc
import numpy as np

from build_earth_real_raster import build_monthly_stack, write_asset


DEFAULT_GODAS_DIR = Path(r"C:\Users\rayou\Downloads\godas-current")
DEFAULT_OISST_DIR = Path(r"C:\Users\rayou\Downloads\oisst-sst")
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_WIDTH = 360
DEFAULT_HEIGHT = 180
# GODAS current components are stored at 0.001 m/s precision in the source.
CURRENT_SCALE = 1000.0
# SST anomaly is a derived °C value; keep 0.01 °C precision.
SST_SCALE = 100.0

CURRENT_SOURCE = (
    "NOAA GODAS — surface ocean current (ucur/vcur), long-term monthly mean "
    "(1991-2020) (downloads.psl.noaa.gov/Datasets/godas)"
)
SST_SOURCE = (
    "NOAA OISST v2 — long-term monthly mean SST (1991-2020), anomaly vs "
    "monthly zonal (same-latitude) mean "
    "(downloads.psl.noaa.gov/Datasets/noaa.oisst.v2)"
)


def load_godas_component(path: Path, var_name: str) -> np.ndarray:
    """Load the GODAS long-term-mean surface current climatology (already a
    12-month (time, level, lat, lon) LTM, e.g. ucur.mon.ltm.1991-2020.nc --
    same 1991-2020 baseline as the OISST SST LTM and the NCEP wind LTM, and
    likewise no year-averaging needed), re-centered to lon -180..180."""
    with nc.Dataset(path) as ds:
        # GODAS variables are (time, level, lat, lon); level 0 is the surface.
        climatology = np.asarray(ds.variables[var_name][:, 0, :, :], dtype=np.float32)
        lon = np.asarray(ds.variables["lon"][:], dtype=np.float64)

    shift = int(np.argmin(np.abs(lon - 180.0)))
    climatology = np.roll(climatology, -shift, axis=2)

    out = np.array(climatology, dtype=np.float32, copy=True)
    out[out < -900] = np.nan
    return out


def load_oisst_sst_anomaly(path: Path) -> np.ndarray:
    """Load the OISST long-term-mean SST climatology (already a 12-month
    (month, lat, lon) LTM, e.g. sst.ltm.1991-2020.nc -- not a raw multi-year
    time series, so no year-averaging needed here, unlike GODAS below) and
    convert to a zonal-mean anomaly per month: for each row (latitude),
    subtract that row's mean SST so the result reads directly as warm
    current (+) / cold current (-) relative to the surrounding latitude
    band, rather than raw temperature."""
    with nc.Dataset(path) as ds:
        climatology = np.asarray(ds.variables["sst"][:], dtype=np.float32)
        lon = np.asarray(ds.variables["lon"][:], dtype=np.float64)
        if climatology.ndim == 4:
            climatology = climatology[:, 0, :, :]

    shift = int(np.argmin(np.abs(lon - 180.0)))
    climatology = np.roll(climatology, -shift, axis=2)

    out = np.array(climatology, dtype=np.float32, copy=True)
    out[out < -900] = np.nan

    zonal_mean = np.nanmean(out, axis=2, keepdims=True)
    anomaly = out - zonal_mean
    return anomaly.astype(np.float32)


def build_asset(
    godas_dir: Path,
    oisst_dir: Path,
    output_dir: Path,
    width: int,
    height: int,
) -> list[tuple[Path, Path]]:
    u_path = godas_dir / "ucur.mon.ltm.1991-2020.nc"
    v_path = godas_dir / "vcur.mon.ltm.1991-2020.nc"
    sst_path = oisst_dir / "sst.ltm.1991-2020.nc"
    for p in (u_path, v_path, sst_path):
        if not p.exists():
            raise FileNotFoundError(f"Missing source file: {p}")

    u_stack = load_godas_component(u_path, "ucur")
    v_stack = load_godas_component(v_path, "vcur")
    sst_anomaly_stack = load_oisst_sst_anomaly(sst_path)

    results = []
    for prefix, field, stack, scale, source in (
        (
            "earth-real-current-u",
            "godas_monthly_current_u_ms",
            u_stack,
            CURRENT_SCALE,
            CURRENT_SOURCE,
        ),
        (
            "earth-real-current-v",
            "godas_monthly_current_v_ms",
            v_stack,
            CURRENT_SCALE,
            CURRENT_SOURCE,
        ),
        (
            "earth-real-sst-anomaly",
            "oisst_monthly_sst_anomaly_c",
            sst_anomaly_stack,
            SST_SCALE,
            SST_SOURCE,
        ),
    ):
        monthly = build_monthly_stack(width, height, lambda m, s=stack: s[m - 1])
        results.append(
            write_asset(
                monthly,
                output_dir,
                prefix,
                field=field,
                scale_factor=scale,
                stored_scale=1.0 / scale,
                source=source,
            )
        )
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build compact Earth monthly observed ocean-current (u/v, m/s) and "
            "SST-anomaly (°C vs zonal mean) assets from GODAS and OISST NetCDF."
        )
    )
    parser.add_argument("--godas-dir", type=Path, default=DEFAULT_GODAS_DIR)
    parser.add_argument("--oisst-dir", type=Path, default=DEFAULT_OISST_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    for meta_path, bin_path in build_asset(
        godas_dir=args.godas_dir,
        oisst_dir=args.oisst_dir,
        output_dir=args.output_dir,
        width=args.width,
        height=args.height,
    ):
        print(meta_path)
        print(bin_path)


if __name__ == "__main__":
    main()
