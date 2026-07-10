from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


DEFAULT_SOURCE_DIR = Path(r"C:\Users\rayou\Downloads\wc2.1_10m_tavg")
DEFAULT_OUTPUT_DIR = Path("public/heightmap")
DEFAULT_PREFIX = "earth-real-temperature"
DEFAULT_WIDTH = 360
DEFAULT_HEIGHT = 180
MONTHS = 12
INT16_NODATA = -32768
SCALE = 10.0


def month_path(source_dir: Path, month: int) -> Path:
    return source_dir / f"wc2.1_10m_tavg_{month:02d}.tif"


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
        weighted = np.where(valid, sample * weight, 0.0)
        accum += weighted.astype(np.float32, copy=False)
        weight_sum += np.where(valid, weight, 0.0).astype(np.float32, copy=False)

    out = np.full((height, width), np.nan, dtype=np.float32)
    np.divide(accum, weight_sum, out=out, where=weight_sum > 0)
    return out


def build_asset(
    source_dir: Path,
    output_dir: Path,
    prefix: str,
    width: int,
    height: int,
) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    monthly = np.empty((MONTHS, height, width), dtype=np.float32)

    for month in range(1, MONTHS + 1):
        tif_path = month_path(source_dir, month)
        if not tif_path.exists():
            raise FileNotFoundError(f"Missing source raster: {tif_path}")
        monthly[month - 1] = resample_month(load_month_array(tif_path), width, height)

    bin_path = output_dir / f"{prefix}.bin"
    meta_path = output_dir / f"{prefix}.json"

    quantized = np.full(monthly.shape, INT16_NODATA, dtype=np.int16)
    finite = np.isfinite(monthly)
    quantized[finite] = np.clip(
        np.rint(monthly[finite] * SCALE),
        np.iinfo(np.int16).min + 1,
        np.iinfo(np.int16).max,
    ).astype(np.int16)
    quantized.astype("<i2", copy=False).tofile(bin_path)
    metadata = {
        "version": 1,
        "format": "int16-month-major",
        "field": "worldclim_monthly_tavg_celsius",
        "width": width,
        "height": height,
        "months": MONTHS,
        "scale": 0.1,
        "nodata": INT16_NODATA,
        "source": str(source_dir),
        "bin": bin_path.name,
    }
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return meta_path, bin_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build compact Earth monthly observed-temperature assets from WorldClim GeoTIFFs."
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
