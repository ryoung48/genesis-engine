from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import shape

Image.MAX_IMAGE_PIXELS = None

INT16_NODATA = -32768

DEFAULT_GEOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_WIDTH = 4096
DEFAULT_HEIGHT = 2048
DEFAULT_PREFIX = "eu4-provinces"


def lonlat_to_px(lon: float, lat: float, width: int, height: int) -> tuple[float, float]:
    x = (lon + 180.0) / 360.0 * width
    y = (90.0 - lat) / 180.0 * height
    return x, y


def rasterize(geojson_path: Path, width: int, height: int) -> np.ndarray:
    with geojson_path.open(encoding="utf-8") as f:
        data = json.load(f)

    # int32 during drawing so 0 can mean "unset" without colliding with a
    # real province id; converted to int16 (with -32768 nodata) at the end.
    canvas = Image.new("I", (width, height), 0)
    draw = ImageDraw.Draw(canvas)

    features = data["features"]
    for feat in features:
        province_id = feat["properties"]["id"]
        geom = feat["geometry"]
        polygons = (
            [geom["coordinates"]]
            if geom["type"] == "Polygon"
            else geom["coordinates"]
        )
        for rings in polygons:
            if not rings:
                continue
            exterior = [lonlat_to_px(lon, lat, width, height) for lon, lat in rings[0]]
            draw.polygon(exterior, fill=province_id)
            for hole in rings[1:]:
                hole_px = [lonlat_to_px(lon, lat, width, height) for lon, lat in hole]
                draw.polygon(hole_px, fill=0)

    return np.array(canvas, dtype=np.int32)


def compute_seed_points(geojson_path: Path) -> list[dict]:
    """A guaranteed-inside-the-polygon point per province id (shapely's
    representative_point, not centroid -- centroids of concave/multi-part
    shapes can fall outside the polygon, e.g. into the sea for a crescent
    coastline). Used as a fallback seed so every source province can be
    force-placed onto the mesh even if rasterization/mesh-resolution missed
    it entirely."""
    with geojson_path.open(encoding="utf-8") as f:
        data = json.load(f)

    seeds = []
    for feat in data["features"]:
        province_id = feat["properties"]["id"]
        geom = shape(feat["geometry"])
        point = geom.representative_point()
        seeds.append({"id": province_id, "lon": point.x, "lat": point.y})
    return seeds


def fill_nearby_gaps(raster: np.ndarray, max_radius: int) -> np.ndarray:
    """Nearest-neighbor fill for small unset gaps (seams between polygons,
    slivers from rasterization) via iterative dilation. Leaves larger unset
    regions (ocean, unmapped land like Antarctica) untouched."""
    from scipy.ndimage import grey_dilation, binary_dilation

    filled = raster.copy()
    for _ in range(max_radius):
        missing = filled == 0
        if not missing.any():
            break
        dilated = grey_dilation(np.where(filled == 0, -1, filled), size=3)
        filled = np.where(missing & (dilated > 0), dilated, filled)
    return filled


def build_assets(
    geojson_path: Path,
    output_dir: Path,
    width: int,
    height: int,
    prefix: str,
    gap_fill_radius: int,
) -> tuple[Path, Path, Path]:
    if not geojson_path.exists():
        raise FileNotFoundError(f"Missing source GeoJSON: {geojson_path}")

    raster = rasterize(geojson_path, width, height)

    if gap_fill_radius > 0:
        try:
            raster = fill_nearby_gaps(raster, gap_fill_radius)
        except ImportError:
            print("scipy not available, skipping gap fill")

    quantized = np.where(raster > 0, raster, INT16_NODATA).astype(np.int16)

    output_dir.mkdir(parents=True, exist_ok=True)
    bin_path = output_dir / f"{prefix}.bin.gz"
    meta_path = output_dir / f"{prefix}.json"
    raw_bytes = quantized.astype("<i2", copy=False).tobytes()
    with gzip.open(bin_path, "wb", compresslevel=9) as f:
        f.write(raw_bytes)

    num_ids = len(np.unique(quantized[quantized != INT16_NODATA]))
    metadata = {
        "version": 2,
        "format": "int16-single-band-ids",
        "compression": "gzip",
        "field": "eu4_province_id",
        "width": width,
        "height": height,
        "nodata": INT16_NODATA,
        "numProvinces": int(num_ids),
        "source": str(geojson_path),
        "bin": bin_path.name,
    }
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    seeds = compute_seed_points(geojson_path)
    seeds_path = output_dir / f"{prefix}-seeds.json"
    seeds_path.write_text(json.dumps(seeds) + "\n", encoding="utf-8")

    return meta_path, bin_path, seeds_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rasterize the EU4 province GeoJSON into a compact int16 id raster for the earth-import pipeline."
    )
    parser.add_argument("--geojson", type=Path, default=DEFAULT_GEOJSON)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    parser.add_argument("--prefix", type=str, default=DEFAULT_PREFIX)
    parser.add_argument("--gap-fill-radius", type=int, default=2)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    meta_path, bin_path, seeds_path = build_assets(
        geojson_path=args.geojson,
        output_dir=args.output_dir,
        width=args.width,
        height=args.height,
        prefix=args.prefix,
        gap_fill_radius=args.gap_fill_radius,
    )
    print(meta_path)
    print(bin_path)
    print(seeds_path)


if __name__ == "__main__":
    main()
