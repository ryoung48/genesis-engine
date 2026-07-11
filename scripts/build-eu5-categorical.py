from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

INT16_NODATA = -32768

DEFAULT_TIF = Path(r"c:\Users\rayou\Downloads\EU5toGIS\EU5toGIS\datasets\locations.tif")
DEFAULT_TIF_L = Path(r"c:\Users\rayou\Downloads\EU5toGIS\EU5toGIS\datasets\locations_L.tif")
DEFAULT_GPKG = Path(r"c:\Users\rayou\Downloads\EU5toGIS\EU5toGIS\datasets\locations.gpkg")
DEFAULT_OUTPUT_DIR = Path("public/heightmap")
DEFAULT_WIDTH = 360
DEFAULT_HEIGHT = 180

FIELDS = ["topography", "vegetation", "climate"]

# World_Gall_Stereographic (ESRI), standard parallel 45deg, sphere radius = WGS84 semi-major axis.
SPHERE_RADIUS = 6378137.0
STD_PARALLEL_COS = np.cos(np.radians(45.0))


def read_geotiff_geo(tif_path: Path) -> tuple[np.ndarray, float, float, float]:
    with Image.open(tif_path) as img:
        rgb = np.array(img.convert("RGB"), dtype=np.uint8)
        tags = img.tag_v2
        tiepoint = tags[33922]  # ModelTiepointTag: i,j,k, x,y,z
        scale = tags[33550]  # ModelPixelScaleTag: sx, sy, sz
    tp_x, tp_y = float(tiepoint[3]), float(tiepoint[4])
    px_scale = float(scale[0])
    return rgb, tp_x, tp_y, px_scale


def lonlat_to_pixel(
    lon_deg: np.ndarray,
    lat_deg: np.ndarray,
    tp_x: float,
    tp_y: float,
    px_scale: float,
) -> tuple[np.ndarray, np.ndarray]:
    lon = np.radians(lon_deg)
    lat = np.radians(lat_deg)
    x = SPHERE_RADIUS * lon * STD_PARALLEL_COS
    y = SPHERE_RADIUS * (1.0 + STD_PARALLEL_COS) * np.tan(lat / 2.0)
    col = (x - tp_x) / px_scale
    row = (tp_y - y) / px_scale
    return col, row


def load_color_lookup(gpkg_path: Path) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    con = sqlite3.connect(str(gpkg_path))
    cur = con.cursor()
    cur.execute("select hex_color, topography, vegetation, climate from locations")
    rows = cur.fetchall()
    con.close()

    categories = {field: sorted({r[i + 1] for r in rows if r[i + 1] is not None}) for i, field in enumerate(FIELDS)}
    code_maps = {field: {label: idx for idx, label in enumerate(categories[field])} for field in FIELDS}

    packed = np.empty(len(rows), dtype=np.uint32)
    codes = {field: np.full(len(rows), -1, dtype=np.int32) for field in FIELDS}
    for i, (hex_color, topo, veg, climate) in enumerate(rows):
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
        packed[i] = (r << 16) | (g << 8) | b
        values = {"topography": topo, "vegetation": veg, "climate": climate}
        for field in FIELDS:
            v = values[field]
            if v is not None:
                codes[field][i] = code_maps[field][v]

    order = np.argsort(packed)
    packed_sorted = packed[order]
    codes_sorted = {field: codes[field][order] for field in FIELDS}
    return packed_sorted, codes_sorted, categories


def sample_raster(
    lon_grid: np.ndarray,
    lat_grid: np.ndarray,
    rgb: np.ndarray,
    tp_x: float,
    tp_y: float,
    px_scale: float,
) -> tuple[np.ndarray, np.ndarray]:
    src_h, src_w = rgb.shape[0], rgb.shape[1]
    col, row = lonlat_to_pixel(lon_grid, lat_grid, tp_x, tp_y, px_scale)
    col_i = np.round(col).astype(np.int64)
    row_i = np.round(row).astype(np.int64)
    in_bounds = (col_i >= 0) & (col_i < src_w) & (row_i >= 0) & (row_i < src_h)

    col_c = np.clip(col_i, 0, src_w - 1)
    row_c = np.clip(row_i, 0, src_h - 1)
    sample = rgb[row_c, col_c]  # (height, width, 3)
    sample_packed = (
        (sample[..., 0].astype(np.uint32) << 16)
        | (sample[..., 1].astype(np.uint32) << 8)
        | sample[..., 2].astype(np.uint32)
    )
    return sample_packed, in_bounds


def build_assets(
    tif_path: Path,
    tif_l_path: Path | None,
    gpkg_path: Path,
    output_dir: Path,
    width: int,
    height: int,
) -> list[tuple[Path, Path]]:
    if not tif_path.exists():
        raise FileNotFoundError(f"Missing source raster: {tif_path}")
    if not gpkg_path.exists():
        raise FileNotFoundError(f"Missing source geopackage: {gpkg_path}")

    rgb, tp_x, tp_y, px_scale = read_geotiff_geo(tif_path)

    packed_sorted, codes_sorted, categories = load_color_lookup(gpkg_path)

    lon = (np.arange(width, dtype=np.float64) + 0.5) / width * 360.0 - 180.0
    lat = 90.0 - (np.arange(height, dtype=np.float64) + 0.5) / height * 180.0
    lon_grid, lat_grid = np.meshgrid(lon, lat)

    sample_packed, in_bounds = sample_raster(lon_grid, lat_grid, rgb, tp_x, tp_y, px_scale)

    # locations.tif starts/ends at ~-170deg (see README sec. 2); the -180..-170
    # sliver is only covered by locations_L.tif, an identical raster shifted
    # one full world-width west. Fall back to it for out-of-bounds cells.
    if tif_l_path is not None and tif_l_path.exists():
        rgb_l, tp_x_l, tp_y_l, px_scale_l = read_geotiff_geo(tif_l_path)
        sample_packed_l, in_bounds_l = sample_raster(lon_grid, lat_grid, rgb_l, tp_x_l, tp_y_l, px_scale_l)
        use_l = (~in_bounds) & in_bounds_l
        sample_packed = np.where(use_l, sample_packed_l, sample_packed)
        in_bounds = in_bounds | in_bounds_l

    lookup_idx = np.searchsorted(packed_sorted, sample_packed)
    lookup_idx_c = np.clip(lookup_idx, 0, len(packed_sorted) - 1)
    matched = in_bounds & (packed_sorted[lookup_idx_c] == sample_packed)

    output_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for field in FIELDS:
        field_codes = codes_sorted[field][lookup_idx_c]
        quantized = np.full((height, width), INT16_NODATA, dtype=np.int16)
        valid = matched & (field_codes >= 0)
        quantized[valid] = field_codes[valid].astype(np.int16)

        prefix = f"eu5-{field}"
        bin_path = output_dir / f"{prefix}.bin"
        meta_path = output_dir / f"{prefix}.json"
        quantized.astype("<i2", copy=False).tofile(bin_path)

        metadata = {
            "version": 1,
            "format": "int16-single-band-categorical",
            "field": f"eu5_{field}",
            "width": width,
            "height": height,
            "nodata": INT16_NODATA,
            "categories": categories[field],
            "source": f"{tif_path} + {tif_l_path} + {gpkg_path}",
            "bin": bin_path.name,
        }
        meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        results.append((meta_path, bin_path))
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build compact EU5 topography/vegetation/climate assets from the EU5toGIS locations dataset."
    )
    parser.add_argument("--tif", type=Path, default=DEFAULT_TIF)
    parser.add_argument("--tif-l", type=Path, default=DEFAULT_TIF_L)
    parser.add_argument("--gpkg", type=Path, default=DEFAULT_GPKG)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    results = build_assets(
        tif_path=args.tif,
        tif_l_path=args.tif_l,
        gpkg_path=args.gpkg,
        output_dir=args.output_dir,
        width=args.width,
        height=args.height,
    )
    for meta_path, bin_path in results:
        print(meta_path)
        print(bin_path)


if __name__ == "__main__":
    main()
