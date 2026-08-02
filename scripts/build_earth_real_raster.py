from __future__ import annotations

import gzip
import json
from io import BytesIO
from pathlib import Path
from typing import Callable
from zipfile import ZipFile

import numpy as np
import netCDF4 as nc
from PIL import Image


MONTHS = 12
INT16_NODATA = -32768


def _replace_nodata(data: np.ndarray, nodata: object) -> np.ndarray:
    if nodata is None:
        return data
    nodata_value = np.float32(nodata)
    data[data <= nodata_value * np.float32(0.99)] = np.nan
    return data


def load_month_array(path: Path) -> np.ndarray:
    with Image.open(path) as img:
        nodata = img.tag_v2.get(42113)
        data = np.array(img, dtype=np.float32, copy=True)
    return _replace_nodata(data, nodata)


def load_month_from_archive(archive_path: Path, filename: str) -> np.ndarray:
    with ZipFile(archive_path) as archive:
        with archive.open(filename) as source:
            with Image.open(BytesIO(source.read())) as image:
                nodata = image.tag_v2.get(42113)
                data = np.array(image, dtype=np.float32, copy=True)
    return _replace_nodata(data, nodata)


def load_ncep_monthly(path: Path, variable_name: str) -> np.ndarray:
    """Load and re-center a monthly NCEP Gaussian-grid field."""
    with nc.Dataset(path) as dataset:
        data = np.asarray(dataset.variables[variable_name][:], dtype=np.float32)
        longitude = np.asarray(dataset.variables["lon"][:], dtype=np.float64)

    shift = int(np.argmin(np.abs(longitude - 180.0)))
    monthly = np.roll(data, -shift, axis=2)
    monthly[monthly < -900] = np.nan
    return monthly


def fill_missing(primary: np.ndarray, fallback: np.ndarray) -> np.ndarray:
    return np.where(np.isfinite(primary), primary, fallback)


def resample_month(data: np.ndarray, width: int, height: int) -> np.ndarray:
    src_height, src_width = data.shape
    x = ((np.arange(width, dtype=np.float64) + 0.5) / width) * src_width - 0.5
    y = ((np.arange(height, dtype=np.float64) + 0.5) / height) * src_height - 0.5

    x0_floor = np.floor(x).astype(np.int32)
    y0_floor = np.floor(y).astype(np.int32)
    x1 = (x0_floor + 1) % src_width
    y1 = np.clip(y0_floor + 1, 0, src_height - 1)
    x0 = np.mod(x0_floor, src_width)
    y0 = np.clip(y0_floor, 0, src_height - 1)

    # Calculate fractions from the unwrapped source coordinates. Using the
    # wrapped/clipped array indices here causes extrapolation at the seams when
    # a target grid is finer than its source raster.
    fx = (x - x0_floor).astype(np.float32)
    fy = (y - y0_floor).astype(np.float32)

    top_left = data[np.ix_(y0, x0)]
    top_right = data[np.ix_(y0, x1)]
    bottom_left = data[np.ix_(y1, x0)]
    bottom_right = data[np.ix_(y1, x1)]

    fx2 = fx.reshape(1, width)
    fy2 = fy.reshape(height, 1)

    weights = [
        (1.0 - fx2) * (1.0 - fy2),
        fx2 * (1.0 - fy2),
        (1.0 - fx2) * fy2,
        fx2 * fy2,
    ]
    samples = [top_left, top_right, bottom_left, bottom_right]

    accum = np.zeros((height, width), dtype=np.float32)
    weight_sum = np.zeros((height, width), dtype=np.float32)
    for sample, weight in zip(samples, weights, strict=True):
        valid = np.isfinite(sample)
        accum += np.where(valid, sample * weight, 0.0).astype(np.float32, copy=False)
        weight_sum += np.where(valid, weight, 0.0).astype(np.float32, copy=False)

    out = np.full((height, width), np.nan, dtype=np.float32)
    np.divide(accum, weight_sum, out=out, where=weight_sum > 0)
    return out


def _repair_seam_column(monthly: np.ndarray) -> None:
    """Overwrite column 0 (the antimeridian) with the average of its cyclic
    neighbors, in place.

    Source grids re-centered from 0-360 to -180..180 via np.roll (see
    build_earth_real_wind.py) have shown a corrupt seam column exactly at the
    roll boundary -- e.g. NCEP/NCAR wind LTM data had column 0 spiking to
    30-60 m/s against neighbors around 4 m/s, in every month. resample_month's
    bilinear wrap is correct given a truly periodic source, so this guards
    against a bad source sample at the seam rather than trusting it blindly.
    """
    width = monthly.shape[2]
    left = monthly[:, :, width - 1]
    right = monthly[:, :, 1]
    with np.errstate(invalid="ignore"):
        avg = np.where(
            np.isfinite(left) & np.isfinite(right),
            (left + right) / 2.0,
            np.nan,
        )
    monthly[:, :, 0] = avg


def build_monthly_stack(
    width: int,
    height: int,
    month_loader: Callable[[int], np.ndarray],
) -> np.ndarray:
    monthly = np.empty((MONTHS, height, width), dtype=np.float32)
    for month in range(1, MONTHS + 1):
        monthly[month - 1] = resample_month(month_loader(month), width, height)
    _repair_seam_column(monthly)
    return monthly


def write_asset(
    monthly: np.ndarray,
    output_dir: Path,
    prefix: str,
    *,
    field: str,
    scale_factor: float,
    stored_scale: float,
    source: str,
) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    bin_path = output_dir / f"{prefix}.bin.gz"
    meta_path = output_dir / f"{prefix}.json"

    quantized = np.full(monthly.shape, INT16_NODATA, dtype=np.int16)
    finite = np.isfinite(monthly)
    quantized[finite] = np.clip(
        np.rint(monthly[finite] * scale_factor),
        np.iinfo(np.int16).min + 1,
        np.iinfo(np.int16).max,
    ).astype(np.int16)
    raw_bytes = quantized.astype("<i2", copy=False).tobytes()
    with gzip.open(bin_path, "wb", compresslevel=9) as f:
        f.write(raw_bytes)

    metadata = {
        "version": 1,
        "format": "int16-month-major",
        "compression": "gzip",
        "field": field,
        "width": int(monthly.shape[2]),
        "height": int(monthly.shape[1]),
        "months": int(monthly.shape[0]),
        "scale": stored_scale,
        "nodata": INT16_NODATA,
        "source": source,
        "bin": bin_path.name,
    }
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return meta_path, bin_path
