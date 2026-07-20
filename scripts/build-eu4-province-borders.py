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

When the probe point falls in a sliver gap between two independently-traced
polygons and lands inside no polygon at all, a progressively-widening
nearest-polygon search (see `_find_nearest_neighbor`) is used as a fallback
before conceding "no neighbor" -- otherwise these gap edges default to the
no-neighbor sentinel and always render as a border, producing seams in the
middle of same-nation territory that don't correspond to any real boundary.
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
from shapely.ops import triangulate
from shapely.strtree import STRtree

DEFAULT_GEOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
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

# When the outside-probe point doesn't land inside any polygon at all (it
# fell in a sliver gap between two independently-digitized provinces -- the
# same vertex-density mismatch described above, just missing the probe
# entirely instead of only missing edge-matching), search progressively
# wider rings around the probe for the nearest other polygon before giving
# up. Radii are multiples of the probe offset; the cap keeps this from
# bridging a real coastline/dataset edge into some unrelated distant
# province -- true "no neighbor" edges (open ocean, unmapped land) are much
# farther than any digitization gap.
NEAREST_FALLBACK_RADII_MULT = (4, 16, 64)
NEAREST_FALLBACK_MAX_DEG = 5e-3

# Once a nearest-neighbor CANDIDATE is found (nearest to the outward PROBE
# POINT, which can be up to NEAREST_FALLBACK_MAX_DEG away), it's only
# accepted if the candidate's polygon boundary also comes this close to the
# ORIGINAL EDGE itself (not just the probe point). Without this check, a
# coastline edge with open sea on one side -- there is no sea polygon in this
# dataset, only land -- can have its probe's widened search ring sweep in
# some unrelated inland province that merely happens to be the closest LAND
# within NEAREST_FALLBACK_MAX_DEG, wrongly turning a real coastline into a
# fabricated "border" against that inland province. A genuine digitization
# gap between two adjacent land parcels leaves the neighbor's boundary
# running right along the edge itself, not just near one offset probe point,
# so this stays tight (a small multiple of the probe offset) while
# NEAREST_FALLBACK_MAX_DEG stays wide enough to actually find that neighbor.
NEAREST_FALLBACK_ACCEPT_EDGE_DIST_MULT = 6

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
) -> tuple[dict[int, "shapely.Geometry"], dict[int, "shapely.Geometry"]]:
    """Returns (full, sliver_dropped) -- two dicts over the same province ids.

    Border edge classification (_classify_edges) must run against `full`:
    every ring edge of every real polygon part has to produce a border
    segment (even a tiny disconnected islet's own coastline is a real
    coastline), so dropping "sliver" parts before classification silently
    deletes real border geometry -- exactly the kind of gap that's
    indistinguishable, on screen, from an actual data/classification bug.
    Sliver-dropping is still applied (via `sliver_dropped`) for the FILL
    geometry only, where its only job is decluttering visually-negligible
    digitization noise, not preserving every border segment.
    """
    with geojson_path.open(encoding="utf-8") as f:
        data = json.load(f)

    by_id: dict[int, list] = defaultdict(list)
    for feat in data["features"]:
        province_id = int(feat["properties"]["id"])
        geom = shape(feat["geometry"])
        # buffer(0) repairs self-intersecting/invalid rings (a handful of
        # source features are invalid) by re-noding to a valid simple form.
        # set_precision snaps each geometry's own coordinates to a grid for
        # numerical stability in the union/buffer/contains calls below --
        # it's not relied on for cross-province edge matching any more.
        if not geom.is_valid:
            geom = geom.buffer(0)
        geom = shapely.set_precision(geom, snap_grid_size)
        by_id[province_id].append(geom)

    full: dict[int, "shapely.Geometry"] = {}
    sliver_dropped: dict[int, "shapely.Geometry"] = {}
    for province_id, geoms in by_id.items():
        merged = geoms[0] if len(geoms) == 1 else shapely.unary_union(geoms)
        if not merged.is_valid:
            merged = merged.buffer(0)
        full[province_id] = merged
        sliver_dropped[province_id] = _drop_sliver_parts(merged)
    return full, sliver_dropped


def _iter_rings(geom: "shapely.Geometry"):
    if geom.geom_type == "Polygon":
        yield geom.exterior
        yield from geom.interiors
    elif geom.geom_type == "MultiPolygon":
        for poly in geom.geoms:
            yield from _iter_rings(poly)


def _find_nearest_neighbor(
    tree: STRtree,
    geoms: list,
    province_ids: list[int],
    pid: int,
    outside_probe: ShapelyPoint,
    edge_line: "shapely.LineString",
    probe_offset_deg: float,
) -> int:
    accept_edge_dist = probe_offset_deg * NEAREST_FALLBACK_ACCEPT_EDGE_DIST_MULT
    for mult in NEAREST_FALLBACK_RADII_MULT:
        radius = min(probe_offset_deg * mult, NEAREST_FALLBACK_MAX_DEG)
        best_idx = None
        best_dist = float("inf")
        for idx in tree.query(outside_probe.buffer(radius)):
            idx = int(idx)
            if province_ids[idx] == pid:
                continue
            dist = geoms[idx].distance(outside_probe)
            if dist < best_dist:
                best_dist = dist
                best_idx = idx
        if best_idx is not None:
            # The candidate closest to the offset PROBE isn't automatically
            # a real neighbor -- confirm its boundary actually runs near the
            # EDGE ITSELF too (see NEAREST_FALLBACK_ACCEPT_EDGE_DIST_MULT's
            # doc). A true digitization-gap neighbor passes this easily; an
            # unrelated inland province an open-sea probe happened to sweep
            # up along a wide search ring does not.
            if geoms[best_idx].distance(edge_line) <= accept_edge_dist:
                return province_ids[best_idx]
        if radius >= NEAREST_FALLBACK_MAX_DEG:
            break
    return NO_NEIGHBOR_PROVINCE_ID


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

                if neighbor_id == NO_NEIGHBOR_PROVINCE_ID:
                    neighbor_id = _find_nearest_neighbor(
                        tree,
                        geoms,
                        province_ids,
                        pid,
                        outside_probe,
                        shapely.LineString([a, b]),
                        probe_offset_deg,
                    )

                edges.append((pid, neighbor_id, a, b))

    return edges


def _iter_fill_rings(geom: "shapely.Geometry"):
    """Yields (polygon_index, is_hole, ring) for every ring of every Polygon
    part of geom, so a MultiPolygon's islands stay grouped by polygon_index
    (a hole must only be cut out of its own exterior, not a sibling
    island's)."""
    if geom.geom_type == "Polygon":
        yield 0, False, geom.exterior
        for interior in geom.interiors:
            yield 0, True, interior
    elif geom.geom_type == "MultiPolygon":
        for poly_idx, poly in enumerate(geom.geoms):
            yield poly_idx, False, poly.exterior
            for interior in poly.interiors:
                yield poly_idx, True, interior


def _write_fill_geometry(
    polygons: dict[int, "shapely.Geometry"],
    output_dir: Path,
    prefix: str,
    geojson_path: Path,
    snap_grid_size: float,
) -> tuple[Path, Path]:
    rings_bin_path = output_dir / f"{prefix}-fills-rings.bin"
    triangles_bin_path = output_dir / f"{prefix}-fills-triangles.bin"
    meta_path = output_dir / f"{prefix}-fills.json"

    ring_count = 0
    with rings_bin_path.open("wb") as f:
        for province_id, geom in polygons.items():
            for poly_idx, is_hole, ring in _iter_fill_rings(geom):
                coords = list(ring.coords)
                # Rings are closed (first point == last); drop the repeated
                # closing point since the renderer treats each ring as an
                # implicitly-closed loop.
                if len(coords) > 1 and coords[0] == coords[-1]:
                    coords = coords[:-1]
                if len(coords) < 3:
                    continue
                f.write(
                    struct.pack(
                        "<iiii",
                        province_id,
                        poly_idx,
                        1 if is_hole else 0,
                        len(coords),
                    )
                )
                for lon, lat in coords:
                    f.write(struct.pack("<ff", lon, lat))
                ring_count += 1

    triangle_group_count = 0
    triangle_vertex_total = 0
    with triangles_bin_path.open("wb") as f:
        for province_id, geom in polygons.items():
            triangle_vertices: list[tuple[float, float]] = []
            for tri in triangulate(geom):
                if tri.area <= 0:
                    continue
                overlap = tri.intersection(geom)
                if overlap.is_empty:
                    continue
                # shapely.ops.triangulate is unconstrained Delaunay over the
                # polygon's vertices, so it may emit triangles outside the
                # polygon or across hole mouths/concavities. Keep only
                # triangles whose full area survives intersection.
                if abs(overlap.area - tri.area) > max(1e-9, tri.area * 1e-6):
                    continue
                coords = list(tri.exterior.coords)
                if len(coords) != 4:
                    continue
                triangle_vertices.extend(
                    [(coords[0][0], coords[0][1]), (coords[1][0], coords[1][1]), (coords[2][0], coords[2][1])]
                )
            if not triangle_vertices:
                continue
            f.write(struct.pack("<ii", province_id, len(triangle_vertices)))
            for lon, lat in triangle_vertices:
                f.write(struct.pack("<ff", lon, lat))
            triangle_group_count += 1
            triangle_vertex_total += len(triangle_vertices)

    metadata = {
        "version": 2,
        "format": "eu4-province-fill-geometry-v2",
        "ringRecordLayout": [
            "provinceId:i32",
            "polygonIndex:i32",
            "ringType:i32 (0=exterior,1=hole)",
            "pointCount:i32",
            "points:pointCount*(lon:f32,lat:f32)",
        ],
        "triangleRecordLayout": [
            "provinceId:i32",
            "vertexCount:i32 (multiple of 3)",
            "vertices:vertexCount*(lon:f32,lat:f32)",
        ],
        "ringCount": ring_count,
        "triangleGroupCount": triangle_group_count,
        "triangleVertexCount": triangle_vertex_total,
        "units": "degrees",
        "source": str(geojson_path),
        "snapGridSize": snap_grid_size,
        "ringsBin": rings_bin_path.name,
        "trianglesBin": triangles_bin_path.name,
    }
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    return meta_path, triangles_bin_path


def build_assets(
    geojson_path: Path,
    output_dir: Path,
    prefix: str,
    snap_grid_size: float,
    probe_offset_deg: float,
) -> tuple[Path, Path]:
    if not geojson_path.exists():
        raise FileNotFoundError(f"Missing source GeoJSON: {geojson_path}")

    full_polygons, fill_polygons = _load_province_polygons(geojson_path, snap_grid_size)
    edges = _classify_edges(full_polygons, probe_offset_deg)

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

    _write_fill_geometry(fill_polygons, output_dir, prefix, geojson_path, snap_grid_size)

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
