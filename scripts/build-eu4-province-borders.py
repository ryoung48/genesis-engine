"""Extracts real EU4 province-boundary polylines (shared edges between
adjacent province polygons, plus coastline / wasteland-edge / dataset-edge
boundary) from geo-explorer's EU4 GeoJSON into a compact runtime asset, so
the browser can draw nation borders that trace the actual historical
province shapes instead of the procedural planet mesh's own Voronoi edges.
Offline conversion only -- see scripts/build-eu4-provinces.py for the
sibling raster used to map EU4 provinces onto the procedural mesh.

Classification is geometric, not topological: an exact edge-key-matching
approach was tried first (snap every polygon-edge endpoint to a coordinate
grid, treat two edges as "shared" iff both endpoints land on the same grid
cell) but the source data's adjacent provinces are independently digitized
with *different vertex density* along the same physical border -- they only
coincide exactly at occasional junction points, so most of a true shared
border never had a matching edge on both sides at any grid size (verified:
shared-edge count barely moved across an 80x grid-size sweep), and got
misclassified as isolated "coastline" fragments in the middle of a country.

Instead, for every edge of every province's boundary, probe a point just
outside the edge (offset perpendicular to it) and ask which *other*
province's polygon contains that point via a spatial index. This only
depends on geometric proximity of the two polygons, not on their vertex
sequences lining up, so it's robust to the mismatched-density source data.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from collections import defaultdict
from pathlib import Path

import shapely
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import shape
from shapely.strtree import STRtree

from eu4_province_id_swaps import rename_province_id as _rename_province_id
from eu4_province_id_swaps import split_province_part_geom
from eu4_province_id_swaps import swap_province_id as _swap_province_id

DEFAULT_GEOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4.json"
)
DEFAULT_OUTPUT_DIR = Path("public/earth-history/reference")
DEFAULT_PREFIX = "eu4-province-borders"
DEFAULT_SNAP_GRID_SIZE = 1e-5
DEFAULT_PROBE_OFFSET_DEG = 2e-4

# No-neighbor sentinel: written as provinceB for boundary edges that face
# open ocean, unmapped land (e.g. Antarctica), or the edge of the dataset --
# i.e. every edge of a province's own boundary whose outside-probe point
# doesn't land inside any other mapped province. realIdToNation.get(-1) is
# always undefined at runtime, which already resolves to "unowned" (-1) by
# the same `?? -1` fallback used for real unowned provinces, so no special-
# casing is needed on the TS side -- these segments just always count as a
# border.
NO_NEIGHBOR_PROVINCE_ID = -1

# The source GeoJSON has hundreds of degenerate sliver polygons scattered
# across province MultiPolygons -- digitization/tracing noise, not real
# terrain: near-zero area (a fraction of a km^2) but real perimeter length
# (up to tens of km), i.e. long and only a few meters wide. Since they don't
# touch the province's main landmass, every edge of a sliver would otherwise
# get emitted as its own tiny isolated "coastline" segment -- floating
# dashes in the middle of a country's interior, nowhere near any real
# border. Dropped by absolute area (a real island large enough to matter
# visually is always well above this).
MIN_PART_AREA_DEG2 = 5e-4

Point = tuple[float, float]


def _drop_sliver_parts(geom: "shapely.Geometry") -> "shapely.Geometry":
    if geom.geom_type != "MultiPolygon":
        return geom
    parts = [p for p in geom.geoms if p.area >= MIN_PART_AREA_DEG2]
    if not parts:
        # Never let a province vanish entirely -- keep its largest part even
        # if every part is technically under the threshold.
        parts = [max(geom.geoms, key=lambda p: p.area)]
    return parts[0] if len(parts) == 1 else shapely.MultiPolygon(parts)


def _load_province_polygons(
    geojson_path: Path, snap_grid_size: float
) -> dict[int, "shapely.Geometry"]:
    with geojson_path.open(encoding="utf-8") as f:
        data = json.load(f)

    by_id: dict[int, list] = defaultdict(list)
    for feat in data["features"]:
        province_id = _swap_province_id(
            _rename_province_id(int(feat["properties"]["id"]))
        )
        geom = shape(feat["geometry"])
        # buffer(0) repairs self-intersecting/invalid rings (a handful of
        # source features are invalid) by re-noding to a valid simple form.
        # set_precision snaps each geometry's own coordinates to a grid for
        # numerical stability in the union/buffer/contains calls below --
        # it's not relied on for cross-province edge matching any more.
        if not geom.is_valid:
            geom = geom.buffer(0)
        geom = shapely.set_precision(geom, snap_grid_size)
        for split_id, split_geom in split_province_part_geom(province_id, geom):
            by_id[split_id].append(split_geom)

    polygons: dict[int, "shapely.Geometry"] = {}
    for province_id, geoms in by_id.items():
        merged = geoms[0] if len(geoms) == 1 else shapely.unary_union(geoms)
        if not merged.is_valid:
            merged = merged.buffer(0)
        merged = _drop_sliver_parts(merged)
        polygons[province_id] = merged
    return polygons


def _iter_rings(geom: "shapely.Geometry"):
    if geom.geom_type == "Polygon":
        yield geom.exterior
        yield from geom.interiors
    elif geom.geom_type == "MultiPolygon":
        for poly in geom.geoms:
            yield from _iter_rings(poly)


def _classify_edges(
    polygons: dict[int, "shapely.Geometry"],
    probe_offset_deg: float,
) -> list[tuple[int, int, Point, Point]]:
    province_ids = list(polygons.keys())
    geoms = [polygons[pid] for pid in province_ids]
    tree = STRtree(geoms)

    edges: list[tuple[int, int, Point, Point]] = []
    for pid, geom in polygons.items():
        for ring in _iter_rings(geom):
            coords = list(ring.coords)
            for k in range(len(coords) - 1):
                a = coords[k]
                b = coords[k + 1]
                mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                dx, dy = b[0] - a[0], b[1] - a[1]
                length = math.hypot(dx, dy)
                if length < 1e-12:
                    continue
                # Perpendicular unit vector, offset a small distance to each
                # side of the edge midpoint -- whichever side isn't inside
                # this province's own polygon is the "outside" probe.
                nx, ny = -dy / length, dx / length
                probe_a = ShapelyPoint(
                    mx + nx * probe_offset_deg, my + ny * probe_offset_deg
                )
                probe_b = ShapelyPoint(
                    mx - nx * probe_offset_deg, my - ny * probe_offset_deg
                )
                outside_probe = probe_b if geom.contains(probe_a) else probe_a

                neighbor_id = NO_NEIGHBOR_PROVINCE_ID
                for idx in tree.query(outside_probe):
                    idx = int(idx)
                    other_pid = province_ids[idx]
                    if other_pid == pid:
                        continue
                    if geoms[idx].contains(outside_probe):
                        neighbor_id = other_pid
                        break

                edges.append((pid, neighbor_id, a, b))

    return edges


def build_assets(
    geojson_path: Path,
    output_dir: Path,
    prefix: str,
    snap_grid_size: float,
    probe_offset_deg: float,
) -> tuple[Path, Path]:
    if not geojson_path.exists():
        raise FileNotFoundError(f"Missing source GeoJSON: {geojson_path}")

    polygons = _load_province_polygons(geojson_path, snap_grid_size)
    edges = _classify_edges(polygons, probe_offset_deg)

    output_dir.mkdir(parents=True, exist_ok=True)
    bin_path = output_dir / f"{prefix}.bin"
    meta_path = output_dir / f"{prefix}.json"

    with bin_path.open("wb") as f:
        for province_a, province_b, a, b in edges:
            f.write(
                struct.pack(
                    "<iiffff",
                    province_a,
                    province_b,
                    a[0],
                    a[1],
                    b[0],
                    b[1],
                )
            )

    metadata = {
        "version": 1,
        "format": "eu4-province-border-segments-v1",
        "recordLayout": ["provinceA:i32", "provinceB:i32", "lon0:f32", "lat0:f32", "lon1:f32", "lat1:f32"],
        "recordBytes": 24,
        "segmentCount": len(edges),
        "units": "degrees",
        "source": str(geojson_path),
        "snapGridSize": snap_grid_size,
        "probeOffsetDeg": probe_offset_deg,
        "bin": bin_path.name,
    }
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    return meta_path, bin_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract EU4 province-boundary polylines into a compact "
        "runtime asset for drawing nation borders along real province shapes."
    )
    parser.add_argument("--geojson", type=Path, default=DEFAULT_GEOJSON)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prefix", type=str, default=DEFAULT_PREFIX)
    parser.add_argument("--snap-grid-size", type=float, default=DEFAULT_SNAP_GRID_SIZE)
    parser.add_argument(
        "--probe-offset-deg", type=float, default=DEFAULT_PROBE_OFFSET_DEG
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    meta_path, bin_path = build_assets(
        geojson_path=args.geojson,
        output_dir=args.output_dir,
        prefix=args.prefix,
        snap_grid_size=args.snap_grid_size,
        probe_offset_deg=args.probe_offset_deg,
    )
    print(meta_path)
    print(bin_path)


if __name__ == "__main__":
    main()
