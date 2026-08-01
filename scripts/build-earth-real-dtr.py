from __future__ import annotations

import argparse
from pathlib import Path

from build_earth_real_raster import build_monthly_stack, load_month_array, write_asset


DEFAULT_TMAX_SOURCE_DIR = Path(r"C:\Users\rayou\Downloads\wc2.1_10m_tmax")
DEFAULT_TMIN_SOURCE_DIR = Path(r"C:\Users\rayou\Downloads\wc2.1_10m_tmin")
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_PREFIX = "earth-real-dtr"
DEFAULT_WIDTH = 360
DEFAULT_HEIGHT = 180
SCALE = 10.0


def month_path(source_dir: Path, stem: str, month: int) -> Path:
    return source_dir / f"wc2.1_10m_{stem}_{month:02d}.tif"


def build_asset(
    tmax_source_dir: Path,
    tmin_source_dir: Path,
    output_dir: Path,
    prefix: str,
    width: int,
    height: int,
) -> tuple[Path, Path]:
    def month_loader(month: int):
        tmax_path = month_path(tmax_source_dir, "tmax", month)
        tmin_path = month_path(tmin_source_dir, "tmin", month)
        if not tmax_path.exists():
            raise FileNotFoundError(f"Missing source raster: {tmax_path}")
        if not tmin_path.exists():
            raise FileNotFoundError(f"Missing source raster: {tmin_path}")
        return load_month_array(tmax_path) - load_month_array(tmin_path)

    monthly = build_monthly_stack(width, height, month_loader)
    return write_asset(
        monthly,
        output_dir,
        prefix,
        field="worldclim_monthly_dtr_celsius",
        scale_factor=SCALE,
        stored_scale=0.1,
        source=f"{tmax_source_dir} - {tmin_source_dir}",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build compact Earth monthly observed-DTR assets from WorldClim tmax/tmin GeoTIFFs."
    )
    parser.add_argument("--tmax-source-dir", type=Path, default=DEFAULT_TMAX_SOURCE_DIR)
    parser.add_argument("--tmin-source-dir", type=Path, default=DEFAULT_TMIN_SOURCE_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    meta_path, bin_path = build_asset(
        tmax_source_dir=args.tmax_source_dir,
        tmin_source_dir=args.tmin_source_dir,
        output_dir=args.output_dir,
        prefix=args.prefix,
        width=args.width,
        height=args.height,
    )
    print(meta_path)
    print(bin_path)


if __name__ == "__main__":
    main()
