from __future__ import annotations

import argparse
from pathlib import Path

from build_earth_real_raster import build_monthly_stack, load_month_array, write_asset


DEFAULT_SOURCE_DIR = Path(r"C:\Users\rayou\Downloads\wc2.1_10m_prec")
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_PREFIX = "earth-real-precipitation"
DEFAULT_WIDTH = 360
DEFAULT_HEIGHT = 180
MONTHS = 12
SCALE = 1.0


def month_path(source_dir: Path, month: int) -> Path:
    return source_dir / f"wc2.1_10m_prec_{month:02d}.tif"


def build_asset(
    source_dir: Path,
    output_dir: Path,
    prefix: str,
    width: int,
    height: int,
) -> tuple[Path, Path]:
    def month_loader(month: int):
        tif_path = month_path(source_dir, month)
        if not tif_path.exists():
            raise FileNotFoundError(f"Missing source raster: {tif_path}")
        return load_month_array(tif_path)

    monthly = build_monthly_stack(width, height, month_loader)
    return write_asset(
        monthly,
        output_dir,
        prefix,
        field="worldclim_monthly_precipitation_mm",
        scale_factor=SCALE,
        stored_scale=1.0,
        source=str(source_dir),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build compact Earth monthly observed-precipitation assets from WorldClim GeoTIFFs."
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
