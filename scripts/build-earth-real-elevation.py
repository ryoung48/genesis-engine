from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np

from build_earth_real_raster import INT16_NODATA, load_month_array, resample_month


DEFAULT_SOURCE = Path(r"C:\Users\rayou\projects\geo-explorer\public\wc2.1_10m_elev.tif")
DEFAULT_BATHY_SOURCE = Path(r"C:\Users\rayou\projects\geo-explorer\public\elev.tif")
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_PREFIX = "earth-real-elevation"
# Native WorldClim 10-arcmin resolution -- full precision, no need to
# downsample (the raw int16 is already compact: 2160*1080*2 bytes ~= 4.4MB).
DEFAULT_WIDTH = 2160
DEFAULT_HEIGHT = 1080
SCALE = 1.0


def build_asset(
    source: Path,
    bathy_source: Path | None,
    output_dir: Path,
    prefix: str,
    width: int,
    height: int,
) -> tuple[Path, Path]:
    if not source.exists():
        raise FileNotFoundError(f"Missing source raster: {source}")
    if bathy_source is not None and not bathy_source.exists():
        raise FileNotFoundError(f"Missing bathymetry raster: {bathy_source}")

    land_data = load_month_array(source)
    land_resampled = (
        land_data
        if (width, height) == (land_data.shape[1], land_data.shape[0])
        else resample_month(land_data, width, height)
    )
    resampled = land_resampled.copy()

    if bathy_source is not None:
        bathy_data = load_month_array(bathy_source)
        bathy_resampled = (
            bathy_data
            if (width, height) == (bathy_data.shape[1], bathy_data.shape[0])
            else resample_month(bathy_data, width, height)
        )
        # WorldClim provides land elevation with ocean as nodata. Fill only
        # those ocean gaps from the bathymetry raster, never with positive land.
        ocean_mask = ~np.isfinite(land_resampled)
        bathy_mask = ocean_mask & np.isfinite(bathy_resampled) & (bathy_resampled <= 0)
        resampled[bathy_mask] = bathy_resampled[bathy_mask]

    output_dir.mkdir(parents=True, exist_ok=True)
    bin_path = output_dir / f"{prefix}.bin.gz"
    meta_path = output_dir / f"{prefix}.json"

    quantized = np.full(resampled.shape, INT16_NODATA, dtype=np.int16)
    finite = np.isfinite(resampled)
    quantized[finite] = np.clip(
        np.rint(resampled[finite] * SCALE),
        np.iinfo(np.int16).min + 1,
        np.iinfo(np.int16).max,
    ).astype(np.int16)
    with gzip.open(bin_path, "wb", compresslevel=9) as f:
        f.write(quantized.astype("<i2", copy=False).tobytes())

    metadata = {
        "version": 1,
        "format": "int16-single-band",
        "compression": "gzip",
        "field": "worldclim_elevation_m",
        "width": width,
        "height": height,
        "scale": 1.0,
        "nodata": INT16_NODATA,
        "source": str(source),
        "bathySource": str(bathy_source) if bathy_source is not None else None,
        "bin": bin_path.name,
    }
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return meta_path, bin_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a compact Earth real-elevation asset from a WorldClim GeoTIFF."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--bathy-source", type=Path, default=DEFAULT_BATHY_SOURCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    meta_path, bin_path = build_asset(
        source=args.source,
        bathy_source=args.bathy_source,
        output_dir=args.output_dir,
        prefix=args.prefix,
        width=args.width,
        height=args.height,
    )
    print(meta_path)
    print(bin_path)


if __name__ == "__main__":
    main()
