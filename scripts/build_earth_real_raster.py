from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image


MONTHS = 12
INT16_NODATA = -32768


def load_month_array(path: Path) -> np.ndarray:
    with Image.open(path) as img:
        nodata = img.tag_v2.get(42113)
        data = np.array(img, dtype=np.float32, copy=True)
    if nodata is not None:
        nodata_value = np.float32(nodata)
        data[data <= nodata_value * np.float32(0.99)] = np.nan
    return data


def resample_month(data: np.ndarray, width: int, height: int) -> np.ndarray:
    src_height, src_width = data.shape
    x = ((np.arange(width, dtype=np.float64) + 0.5) / width) * src_width - 0.5
    y = ((np.arange(height, dtype=np.float64) + 0.5) / height) * src_height - 0.5

    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = (x0 + 1) % src_width
    y1 = np.clip(y0 + 1, 0, src_height - 1)
    x0 = np.mod(x0, src_width)
    y0 = np.clip(y0, 0, src_height - 1)

    fx = (x - x0).astype(np.float32)
    fy = (y - y0).astype(np.float32)

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
    bin_path = output_dir / f"{prefix}.bin"
    meta_path = output_dir / f"{prefix}.json"

    quantized = np.full(monthly.shape, INT16_NODATA, dtype=np.int16)
    finite = np.isfinite(monthly)
    quantized[finite] = np.clip(
        np.rint(monthly[finite] * scale_factor),
        np.iinfo(np.int16).min + 1,
        np.iinfo(np.int16).max,
    ).astype(np.int16)
    quantized.astype("<i2", copy=False).tofile(bin_path)

    metadata = {
        "version": 1,
        "format": "int16-month-major",
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
