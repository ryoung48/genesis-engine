from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np
import xarray as xr
from PIL import Image, ImageDraw


INT16_NODATA = -32768
DEFAULT_SOURCE_NETCDF = Path(r"C:\Users\rayou\Downloads\population.nc")
DEFAULT_PROVINCE_META = Path("public/heightmap/eu4-provinces.json")
DEFAULT_PROVINCE_GEOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4.json"
)
DEFAULT_OUTPUT_DIR = Path("public/heightmap")
DEFAULT_PREFIX = "earth-real-population-eu4"
DEFAULT_SCALE = 2000.0
DEFAULT_FIELD_NAME = "population"
EARTH_RADIUS_KM = 6371.0
Image.MAX_IMAGE_PIXELS = None


def lonlat_to_px(
    lon: float,
    lat: float,
    width: int,
    height: int,
) -> tuple[float, float]:
    x = (lon + 180.0) / 360.0 * width
    y = (90.0 - lat) / 180.0 * height
    return x, y


def load_eu4_raster(meta_path: Path) -> tuple[np.ndarray, dict]:
    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    raster_path = meta_path.parent / metadata["bin"]
    compression = metadata.get("compression")
    dtype = np.dtype("<i2")

    if compression == "gzip":
        with gzip.open(raster_path, "rb") as f:
            raw = f.read()
    else:
        raw = raster_path.read_bytes()

    raster = np.frombuffer(raw, dtype=dtype).reshape(
        metadata["height"],
        metadata["width"],
    )
    return raster, metadata


def rasterize_eu4_geojson(
    geojson_path: Path,
    width: int,
    height: int,
) -> np.ndarray:
    with geojson_path.open(encoding="utf-8") as f:
        data = json.load(f)

    canvas = Image.new("I", (width, height), 0)
    draw = ImageDraw.Draw(canvas)

    for feat in data["features"]:
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


def compute_hyde_cell_areas_km2(
    lat_count: int,
    lon_count: int,
    radius_km: float = EARTH_RADIUS_KM,
) -> np.ndarray:
    lat_edges_deg = np.linspace(90.0, -90.0, lat_count + 1, dtype=np.float64)
    lon_width_rad = (2.0 * np.pi) / lon_count
    lat_north = np.deg2rad(lat_edges_deg[:-1])
    lat_south = np.deg2rad(lat_edges_deg[1:])
    row_areas = (
        radius_km * radius_km * lon_width_rad * np.abs(np.sin(lat_north) - np.sin(lat_south))
    )
    return np.repeat(row_areas[:, np.newaxis], lon_count, axis=1)


def build_assets(
    source_netcdf: Path,
    province_meta: Path,
    province_geojson: Path | None,
    output_dir: Path,
    prefix: str,
    scale: float,
    field_name: str,
) -> tuple[Path, Path]:
    if scale <= 0:
        raise ValueError("Scale must be positive")
    if not source_netcdf.exists():
        raise FileNotFoundError(f"Missing source NetCDF: {source_netcdf}")
    if province_geojson is None and not province_meta.exists():
        raise FileNotFoundError(f"Missing province metadata: {province_meta}")
    if province_geojson is not None and not province_geojson.exists():
        raise FileNotFoundError(f"Missing province GeoJSON: {province_geojson}")

    output_dir.mkdir(parents=True, exist_ok=True)

    ds = xr.open_dataset(source_netcdf)
    if field_name not in ds.data_vars:
        raise KeyError(f"Missing variable '{field_name}' in {source_netcdf}")
    population = ds[field_name]

    time_count = int(population.sizes["time"])
    lat_count = int(population.sizes["lat"])
    lon_count = int(population.sizes["lon"])

    eu4_meta: dict | None = None
    if province_geojson is not None:
        province_ids = rasterize_eu4_geojson(province_geojson, lon_count, lat_count)
        valid_mask = province_ids > 0
    else:
        eu4_raster, eu4_meta = load_eu4_raster(province_meta)
        src_height, src_width = eu4_raster.shape
        x = ((np.arange(lon_count, dtype=np.float64) + 0.5) / lon_count) * src_width - 0.5
        y = ((np.arange(lat_count, dtype=np.float64) + 0.5) / lat_count) * src_height - 0.5
        xi = np.mod(np.rint(x).astype(np.int32), src_width)
        yi = np.clip(np.rint(y).astype(np.int32), 0, src_height - 1)
        province_ids = eu4_raster[np.ix_(yi, xi)]
        nodata = int(eu4_meta["nodata"])
        valid_mask = province_ids != nodata
    valid_ids = np.unique(province_ids[valid_mask]).astype(np.int32, copy=False)
    valid_ids.sort()
    max_raw_id = int(valid_ids[-1]) if valid_ids.size else 0
    cell_areas_km2 = compute_hyde_cell_areas_km2(lat_count, lon_count)
    province_areas_km2 = np.bincount(
        province_ids[valid_mask].astype(np.int32, copy=False),
        weights=cell_areas_km2[valid_mask],
        minlength=max_raw_id + 1,
    )[valid_ids]

    quantized = np.full((time_count, valid_ids.size), INT16_NODATA, dtype=np.int16)
    clipped_values = 0
    global_max_population = 0.0

    masked_ids = province_ids[valid_mask].astype(np.int32, copy=False)
    time_labels = [str(value) for value in population["time"].values]

    for time_index in range(time_count):
        values = population.isel(time=time_index).values.astype(np.float64, copy=False)
        masked_values = np.nan_to_num(values[valid_mask], nan=0.0, posinf=0.0, neginf=0.0)
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

    bin_path = output_dir / f"{prefix}.bin"
    meta_path = output_dir / f"{prefix}.json"
    quantized.astype("<i2", copy=False).tofile(bin_path)

    metadata = {
        "version": 1,
        "format": "int16-time-major",
        "field": f"hyde_eu4_province_{field_name}_people",
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
        "source": str(source_netcdf),
        **(
            {
                "provinceGeojson": str(province_geojson),
                "provinceRasterization": {
                    "width": lon_count,
                    "height": lat_count,
                },
            }
            if province_geojson is not None
            else {
                "provinceRaster": {
                    "meta": str(province_meta),
                    "bin": eu4_meta["bin"],
                    "width": eu4_meta["width"],
                    "height": eu4_meta["height"],
                    "numProvinces": eu4_meta["numProvinces"],
                }
            }
        ),
        "bin": bin_path.name,
    }
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    ds.close()
    return meta_path, bin_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Aggregate HYDE population into EU4 provinces and store it as a compact int16 timeline asset."
    )
    parser.add_argument("--source-netcdf", type=Path, default=DEFAULT_SOURCE_NETCDF)
    parser.add_argument("--province-meta", type=Path, default=DEFAULT_PROVINCE_META)
    parser.add_argument("--province-geojson", type=Path, default=DEFAULT_PROVINCE_GEOJSON)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--scale", type=float, default=DEFAULT_SCALE)
    parser.add_argument("--field-name", default=DEFAULT_FIELD_NAME)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    meta_path, bin_path = build_assets(
        source_netcdf=args.source_netcdf,
        province_meta=args.province_meta,
        province_geojson=args.province_geojson,
        output_dir=args.output_dir,
        prefix=args.prefix,
        scale=args.scale,
        field_name=args.field_name,
    )
    print(meta_path)
    print(bin_path)


if __name__ == "__main__":
    main()
