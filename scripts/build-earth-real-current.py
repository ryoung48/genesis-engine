from __future__ import annotations

import argparse
from pathlib import Path

import netCDF4 as nc
import numpy as np

from build_earth_real_raster import write_asset


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


def resample_coordinates(params: dict) -> np.ndarray:
    data = params["data"]
    lat = params["lat"]
    lon = (params["lon"] + 180) % 360 - 180
    lat_order = np.argsort(lat)
    lon_order = np.argsort(lon)
    lat = lat[lat_order]
    lon = lon[lon_order]
    data = data[:, lat_order][:, :, lon_order]
    width, height = params["width"], params["height"]
    target_lon = -180 + (np.arange(width) + 0.5) * 360 / width
    target_lat = 90 - (np.arange(height) + 0.5) * 180 / height
    extended_lon = np.concatenate(([lon[-1] - 360], lon, [lon[0] + 360]))
    extended = np.concatenate((data[:, :, -1:], data, data[:, :, :1]), axis=2)
    x0 = np.clip(np.searchsorted(extended_lon, target_lon) - 1, 0, len(extended_lon)-2)
    y0 = np.clip(np.searchsorted(lat, target_lat) - 1, 0, len(lat)-2)
    fx = (target_lon-extended_lon[x0])/(extended_lon[x0+1]-extended_lon[x0])
    fy = np.clip((target_lat-lat[y0])/(lat[y0+1]-lat[y0]), 0, 1)
    total = np.zeros((12, height, width), dtype=np.float64)
    weights = np.zeros_like(total)
    for dy in range(2):
        for dx in range(2):
            sample = extended[:, y0[:, None]+dy, x0[None, :]+dx]
            weight = (fy if dy else 1-fy)[:, None] * (fx if dx else 1-fx)[None, :]
            valid = np.isfinite(sample)
            total += np.where(valid, sample, 0) * weight
            weights += valid * weight
    out = np.full_like(total, np.nan, dtype=np.float32)
    np.divide(total, weights, out=out, where=weights > 0)
    out[:, (target_lat < lat[0]) | (target_lat > lat[-1]), :] = np.nan
    return out


def load_godas_component(params: dict) -> np.ndarray:
    path, name = params["path"], params["name"]
    with nc.Dataset(path) as ds:
        data = np.ma.filled(ds.variables[name][:, 0, :, :], np.nan).astype(np.float32)
        return resample_coordinates({"data": data, "lat": ds.variables["lat"][:], "lon": ds.variables["lon"][:], "width": params["width"], "height": params["height"]})


def load_oisst_sst(params: dict) -> np.ndarray:
    with nc.Dataset(params["path"]) as ds:
        data = np.ma.filled(ds.variables["sst"][:], np.nan).astype(np.float32)
        if data.ndim == 4:
            data = data[:, 0, :, :]
        return resample_coordinates({"data": data, "lat": ds.variables["lat"][:], "lon": ds.variables["lon"][:], "width": params["width"], "height": params["height"]})


def download_climatology(params: dict) -> None:
    name, directory = params["name"], params["directory"]
    directory.mkdir(parents=True, exist_ok=True)
    output = directory / f"{name}.mon.ltm.1991-2020.nc"
    if output.exists():
        return
    total = None
    counts = None
    for year in range(1991, 2021):
        url = f"https://psl.noaa.gov/thredds/dodsC/Datasets/godas/{name}.{year}.nc"
        with nc.Dataset(url) as ds:
            data = np.ma.filled(ds.variables[name][:, 0, :, :], np.nan).astype(np.float64)
            lat, lon = ds.variables["lat"][:], ds.variables["lon"][:]
        if total is None:
            total = np.zeros_like(data)
            counts = np.zeros_like(data, dtype=np.int32)
        valid = np.isfinite(data)
        total += np.where(valid, data, 0)
        counts += valid
        print(f"{name}: {year}", flush=True)
    mean = np.full_like(total, np.nan)
    np.divide(total, counts, out=mean, where=counts > 0)
    with nc.Dataset(output, "w") as ds:
        for axis, size in (("time", 12), ("level", 1), ("lat", len(lat)), ("lon", len(lon))):
            ds.createDimension(axis, size)
        ds.createVariable("lat", "f4", ("lat",))[:] = lat
        ds.createVariable("lon", "f4", ("lon",))[:] = lon
        ds.createVariable("level", "f4", ("level",))[:] = [5]
        ds.createVariable(name, "f4", ("time", "level", "lat", "lon"), zlib=True, fill_value=-9999)[:, 0, :, :] = np.ma.masked_invalid(mean)


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

    u_stack = load_godas_component({"path": u_path, "name": "ucur", "width": width, "height": height})
    v_stack = load_godas_component({"path": v_path, "name": "vcur", "width": width, "height": height})
    sst_stack = load_oisst_sst({"path": sst_path, "width": width, "height": height})
    sst_anomaly_stack = sst_stack - np.nanmean(sst_stack, axis=2, keepdims=True)

    results = []
    for prefix, field, stack, scale, source in (
        (
            "earth-real-sst",
            "oisst_monthly_sst_c",
            sst_stack,
            SST_SCALE,
            "NOAA OISST v2 — monthly mean sea-surface temperature (1991-2020), Celsius",
        ),
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
        monthly = stack
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
    parser.add_argument("--download-godas", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.download_godas:
        for name in ("ucur", "vcur"):
            download_climatology({"name": name, "directory": args.godas_dir})
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
