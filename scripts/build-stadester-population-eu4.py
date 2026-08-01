from __future__ import annotations

import argparse
import gzip
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

INT16_NODATA = -32768
DEFAULT_SOURCE_DIR = Path(
    r"C:\Users\rayou\Downloads\stadester_urban_rasters\stadester_urban_rasters"
)
DEFAULT_PROVINCE_GEOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
DEFAULT_OUTPUT_DIR = Path("public/earth-data")
DEFAULT_PREFIX = "earth-real-urban-population-eu4"
DEFAULT_FILENAME_PREFIX = "stadester_urban"
DEFAULT_FIELD_LABEL = "urban_population"
DEFAULT_SCALE = 2000.0
EARTH_RADIUS_KM = 6371.0
Image.MAX_IMAGE_PIXELS = None


def lonlat_to_px(lon: float, lat: float, width: int, height: int) -> tuple[float, float]:
    x = (lon + 180.0) / 360.0 * width
    y = (90.0 - lat) / 180.0 * height
    return x, y


def rasterize_eu4_geojson(geojson_path: Path, width: int, height: int) -> np.ndarray:
    with geojson_path.open(encoding="utf-8") as f:
        data = json.load(f)

    canvas = Image.new("I", (width, height), 0)
    draw = ImageDraw.Draw(canvas)

    for feat in data["features"]:
        province_id = feat["properties"]["id"]
        geom = feat["geometry"]
        polygons = (
            [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
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


def compute_cell_areas_km2(
    lat_count: int, lon_count: int, radius_km: float = EARTH_RADIUS_KM
) -> np.ndarray:
    lat_edges_deg = np.linspace(90.0, -90.0, lat_count + 1, dtype=np.float64)
    lon_width_rad = (2.0 * np.pi) / lon_count
    lat_north = np.deg2rad(lat_edges_deg[:-1])
    lat_south = np.deg2rad(lat_edges_deg[1:])
    row_areas = (
        radius_km * radius_km * lon_width_rad * np.abs(np.sin(lat_north) - np.sin(lat_south))
    )
    return np.repeat(row_areas[:, np.newaxis], lon_count, axis=1)


def discover_years(source_dir: Path, filename_prefix: str) -> list[int]:
    filename_re = re.compile(rf"^{re.escape(filename_prefix)}_(-?\d+)\.png$")
    years = []
    for path in source_dir.glob(f"{filename_prefix}_*.png"):
        match = filename_re.match(path.name)
        if match:
            years.append(int(match.group(1)))
    years.sort()
    return years


def decode_population(png_path: Path) -> np.ndarray:
    im = Image.open(png_path).convert("RGBA")
    arr = np.array(im).astype(np.uint64)
    g, b, a = arr[..., 1], arr[..., 2], arr[..., 3]
    return ((g << 16) | (b << 8) | a).astype(np.float64)


def build_assets(
    source_dir: Path,
    province_geojson: Path,
    output_dir: Path,
    prefix: str,
    scale: float,
    filename_prefix: str,
    field_label: str,
) -> tuple[Path, Path]:
    if scale <= 0:
        raise ValueError("Scale must be positive")
    if not source_dir.exists():
        raise FileNotFoundError(f"Missing source directory: {source_dir}")
    if not province_geojson.exists():
        raise FileNotFoundError(f"Missing province GeoJSON: {province_geojson}")

    years = discover_years(source_dir, filename_prefix)
    if not years:
        raise FileNotFoundError(
            f"No {filename_prefix}_<year>.png files found in {source_dir}"
        )

    output_dir.mkdir(parents=True, exist_ok=True)

    first_im = Image.open(source_dir / f"{filename_prefix}_{years[0]}.png")
    lon_count, lat_count = first_im.size

    province_ids = rasterize_eu4_geojson(province_geojson, lon_count, lat_count)
    valid_mask = province_ids > 0
    valid_ids = np.unique(province_ids[valid_mask]).astype(np.int32, copy=False)
    valid_ids.sort()
    max_raw_id = int(valid_ids[-1]) if valid_ids.size else 0
    cell_areas_km2 = compute_cell_areas_km2(lat_count, lon_count)
    province_areas_km2 = np.bincount(
        province_ids[valid_mask].astype(np.int32, copy=False),
        weights=cell_areas_km2[valid_mask],
        minlength=max_raw_id + 1,
    )[valid_ids]

    masked_ids = province_ids[valid_mask].astype(np.int32, copy=False)
    time_count = len(years)
    quantized = np.full((time_count, valid_ids.size), INT16_NODATA, dtype=np.int16)
    clipped_values = 0
    global_max_population = 0.0
    time_labels = [f"{year}-05-01 00:00:00" for year in years]

    for time_index, year in enumerate(years):
        png_path = source_dir / f"{filename_prefix}_{year}.png"
        values = decode_population(png_path)
        masked_values = values[valid_mask]
        aggregated = np.bincount(
            masked_ids,
            weights=masked_values,
            minlength=max_raw_id + 1,
        )[valid_ids]

        if aggregated.size:
            global_max_population = max(global_max_population, float(aggregated.max()))

        scaled = np.rint(aggregated / scale)
        clipped_mask = scaled > np.iinfo(np.int16).max
        clipped_values += int(np.count_nonzero(clipped_mask))
        scaled = np.clip(scaled, 0, np.iinfo(np.int16).max)
        quantized[time_index] = scaled.astype(np.int16)

    bin_path = output_dir / f"{prefix}.bin.gz"
    meta_path = output_dir / f"{prefix}.json"
    with gzip.open(bin_path, "wb", compresslevel=9) as f:
        f.write(quantized.astype("<i2", copy=False).tobytes())

    metadata = {
        "version": 1,
        "format": "int16-time-major",
        "compression": "gzip",
        "field": f"stadester_eu4_province_{field_label}_people",
        "encoding": {
            "kind": "linear",
            "scale": scale,
            "units": "people",
            "decode": f"population = stored_value * {scale}",
        },
        "timeCount": time_count,
        "provinceCount": int(valid_ids.size),
        "rawProvinceIds": valid_ids.tolist(),
        "provinceAreasKm2": province_areas_km2.tolist(),
        "times": time_labels,
        "nodata": INT16_NODATA,
        "maxRepresentablePopulation": int(np.iinfo(np.int16).max * scale),
        "maxObservedPopulation": global_max_population,
        "clippedValues": clipped_values,
        "source": str(source_dir),
        "provinceGeojson": str(province_geojson),
        "provinceRasterization": {"width": lon_count, "height": lat_count},
        "bin": bin_path.name,
    }
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    return meta_path, bin_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Aggregate Stadester population rasters into EU4 provinces "
        "and store them as a compact int16 timeline asset."
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--province-geojson", type=Path, default=DEFAULT_PROVINCE_GEOJSON)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--scale", type=float, default=DEFAULT_SCALE)
    parser.add_argument("--filename-prefix", default=DEFAULT_FILENAME_PREFIX)
    parser.add_argument("--field-label", default=DEFAULT_FIELD_LABEL)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    meta_path, bin_path = build_assets(
        source_dir=args.source_dir,
        province_geojson=args.province_geojson,
        output_dir=args.output_dir,
        prefix=args.prefix,
        scale=args.scale,
        filename_prefix=args.filename_prefix,
        field_label=args.field_label,
    )
    print(meta_path)
    print(bin_path)


if __name__ == "__main__":
    main()
