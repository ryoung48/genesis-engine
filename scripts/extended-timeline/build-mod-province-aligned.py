"""Rebuilds the extended-timeline provinces so their borders are byte-for-byte
built from eu4.json's own vanilla geometry, instead of TPS-warped mod pixel
shapes -- trading the mod's exact hand-drawn coastlines for perfect alignment
with the vanilla map everywhere.

Method: nearest-seed flood fill on a fine lon/lat raster, not vector Voronoi
or a polygon-adjacency BFS, because it reuses the exact toolchain the main
script already relies on (rasterize -> distance-transform -> features.shapes
-> coverage_simplify) and sidesteps two headaches a vector approach would
hit: shapely's `voronoi_polygons` doesn't preserve seed-to-cell identity (a
separate containment-matching pass would be needed), and the dateline needs
antimeridian special-casing either way.

1. Rasterize eu4.json's land polygons onto a fine equirectangular grid --
   this raster *is* "the old borders" at the chosen resolution.
2. Each extended-timeline province's centroid (from the current best-fit
   warped output) becomes a seed at its raster cell. A centroid that lands
   outside the vanilla landmass (coastal mismatch) is snapped to the nearest
   land cell first, via one global distance-transform lookup -- this is the
   "move to the closest edge point" step, applied to every seed in a single
   vectorized call rather than a per-point search.
3. The label assignment is a marker-based watershed
   (`skimage.segmentation.watershed`), not a plain Euclidean nearest-seed
   lookup, so that crossing water costs more than crossing land -- this is
   what stops a peninsula across a narrow strait from being claimed by a
   seed on the opposite shore just because it's closer as the crow flies
   through water.
4. Critically, the fill is *contained per vanilla polygon*, in two phases,
   rather than one global nearest-seed race across the whole landmass:
     - Phase 1: each vanilla polygon is only ever split among the mod
       province(s) that actually seeded inside it (via find_objects'
       per-label bounding boxes, watershed run locally with `mask` set to
       that one polygon's cells). A polygon with one seed is a direct
       assign; a polygon with several is subdivided, but strictly within
       its own borders. This is the fix for the fill being "too loose": a
       mod province can no longer bleed into a neighboring vanilla polygon
       just because it's the globally nearest seed -- it only ever
       competes for cells inside the vanilla polygon it actually mapped to.
     - Phase 2: any vanilla polygon that got zero seeds (no mod province
       centroid landed in or near it) is filled in afterwards from its
       nearest already-assigned neighbor, water-penalized as before -- this
       is the one place cross-polygon spread is intentional, since an
       unseeded polygon has to come from somewhere.
5. Masking the result to land-only cells means no new coastline is ever
   invented -- every output polygon is built only from cells eu4.json
   already called land, so the union of all provinces exactly reproduces the
   vanilla landmass at this resolution, no matter how the mod redrew things.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio.features
from rasterio.transform import from_origin
from scipy import ndimage
from scipy.ndimage import distance_transform_edt
from skimage.segmentation import watershed
import shapely
from shapely.geometry import shape

DEFAULT_INPUT = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline.json"
)
DEFAULT_REF_GEOJSON = Path(r"c:\Users\rayou\projects\geo-explorer\public\eu4.json")
DEFAULT_OUTPUT = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
# Hand-placed seed positions (mod province id -> [lon, lat]), for provinces
# whose TPS-warped centroid lands in the wrong place badly enough that
# automatic snapping picks the wrong vanilla polygon. Two known cases so
# far: Hawaii (1240) and Oahu (4935, a mod-only id with no vanilla
# counterpart) both warp to nearly the same point off the Pacific Northwest
# coast and collide on one seed cell; and Greenland (1804) warps ~200km from
# its own reference centroid. Add entries here rather than special-casing
# them in code.
DEFAULT_OVERRIDES = Path(__file__).parent / "province-centroid-overrides.json"
# Provinces that don't belong in the flood fill at all (mod province id ->
# {lon, lat, radius_deg}): remote islands eu4.json has no land for (e.g.
# St. Helena, Tristan da Cunha), so nearest-land snapping pulls them onto
# the African mainland instead. These are excluded from seeding entirely and
# replaced with a small hand-placed square polygon at their real location.
DEFAULT_POLYGON_OVERRIDES = Path(__file__).parent / "province-polygon-overrides.json"
# High-resolution Natural Earth coastline used to give hand-placed islands
# (see DEFAULT_POLYGON_OVERRIDES) their real shape instead of a synthetic
# square, when the island is large enough to appear at 10m resolution.
DEFAULT_ISLAND_COASTLINE = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\land-10m.json"
)
# An island polygon is only used in place of the synthetic box if its nearest
# edge is within this many degrees of the override's (lon, lat) -- otherwise
# the override point is likely naming an atoll too small for even 10m
# resolution, and the box fallback is more honest than grabbing an unrelated
# nearby landmass.
ISLAND_MATCH_MAX_DIST_DEG = 0.3
# Real islands this small (e.g. Pukapuka, ~1.6km across) are sub-pixel at
# world-map zoom and effectively invisible/unhoverable, so their real
# coastline is buffered outward until its bounding box reaches at least this
# size -- the true shape stays as the core, just padded to stay visible.
MIN_ISLAND_SPAN_DEG = 0.6
DEFAULT_RESOLUTION_DEG = 0.04
DEFAULT_SIMPLIFY_CELLS = 1.5
# Cost of stepping into a water cell during the flood fill, relative to 1.0
# for a land cell. 0 reproduces a plain nearest-seed fill (water and land
# cost the same to cross); higher values make the fill route around water
# rather than through it, so a strait only gets crossed when the land detour
# would be even longer.
DEFAULT_WATER_PENALTY = 8.0


def _topojson_arcs(topo: dict) -> list[np.ndarray]:
    """Decode a TopoJSON's delta-encoded, quantized arcs into lon/lat point
    arrays."""
    scale = topo["transform"]["scale"]
    translate = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        d = np.array(arc, dtype=np.float64)
        xy = np.cumsum(d, axis=0)
        xy[:, 0] = xy[:, 0] * scale[0] + translate[0]
        xy[:, 1] = xy[:, 1] * scale[1] + translate[1]
        arcs.append(xy)
    return arcs


def _topojson_ring(arc_idx: int, arcs: list[np.ndarray]) -> np.ndarray:
    if arc_idx >= 0:
        return arcs[arc_idx]
    return arcs[~arc_idx][::-1]


def load_topojson_land_polygons(topo_path: Path) -> list[shapely.Geometry]:
    """Natural Earth's land TopoJSON as individual polygons (not unioned),
    so a single small island's own shape can be picked out by location."""
    with topo_path.open(encoding="utf-8") as f:
        topo = json.load(f)
    arcs = _topojson_arcs(topo)
    (obj,) = topo["objects"].values()
    (geom,) = obj["geometries"] if obj["type"] == "GeometryCollection" else [obj]
    polys = []
    for poly_arcs in geom["arcs"]:
        rings = []
        for ring_arcs in poly_arcs:
            pts = np.concatenate([_topojson_ring(i, arcs) for i in ring_arcs])
            rings.append(pts)
        poly = shapely.Polygon(rings[0], rings[1:])
        polys.append(poly if poly.is_valid else poly.buffer(0))
    return polys


def find_island_polygon(
    lon: float, lat: float, islands: list[shapely.Geometry], max_dist_deg: float
) -> shapely.Geometry | None:
    """Nearest individual land polygon to (lon, lat), or None if nothing is
    close enough to trust as "the same island" rather than an unrelated
    landmass."""
    point = shapely.geometry.Point(lon, lat)
    best = None
    best_dist = float("inf")
    for poly in islands:
        d = poly.distance(point)
        if d < best_dist:
            best_dist = d
            best = poly
        if best_dist == 0.0:
            break
    if best is None or best_dist > max_dist_deg:
        return None
    return best


def load_land_features(geojson_path: Path) -> list[dict]:
    with geojson_path.open(encoding="utf-8") as f:
        data = json.load(f)
    return [
        f
        for f in data["features"]
        if f["properties"].get("type", "land") == "land"
    ]


def dateline_safe_centroid(geom: shapely.Geometry) -> tuple[float, float]:
    """A MultiPolygon straddling the antimeridian (e.g. Chukotka, split into
    a +170s part and a -170s part) has a naive shapely centroid that's the
    area-weighted average of those two parts' raw longitudes -- averaging
    +178 with -178 lands near 0, not near +-180, so the "centroid" ends up
    nowhere close to the province at all. Unwrap any part west of the seam
    by +360 first so the whole shape is contiguous, then wrap the result
    back if it landed past +180."""
    b = geom.bounds
    if b[2] - b[0] <= 180:
        c = geom.centroid
        return c.x, c.y
    parts = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
    unwrapped = []
    for part in parts:
        ext = np.asarray(part.exterior.coords)
        ext = np.column_stack([np.where(ext[:, 0] < 0, ext[:, 0] + 360, ext[:, 0]), ext[:, 1]])
        interiors = []
        for ring in part.interiors:
            r = np.asarray(ring.coords)
            interiors.append(np.column_stack([np.where(r[:, 0] < 0, r[:, 0] + 360, r[:, 0]), r[:, 1]]))
        unwrapped.append(shapely.Polygon(ext, interiors))
    merged = shapely.MultiPolygon(unwrapped) if len(unwrapped) > 1 else unwrapped[0]
    c = merged.centroid
    lon = c.x - 360.0 if c.x > 180.0 else c.x
    return lon, c.y


def lonlat_to_rowcol(lon: np.ndarray, lat: np.ndarray, res: float, height: int) -> tuple[np.ndarray, np.ndarray]:
    col = np.floor((lon + 180.0) / res).astype(np.int64)
    row = np.floor((90.0 - lat) / res).astype(np.int64)
    np.clip(row, 0, height - 1, out=row)
    np.clip(col, 0, int(360.0 / res) - 1, out=col)
    return row, col


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--ref-geojson", type=Path, default=DEFAULT_REF_GEOJSON)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--resolution-deg", type=float, default=DEFAULT_RESOLUTION_DEG)
    parser.add_argument("--simplify-cells", type=float, default=DEFAULT_SIMPLIFY_CELLS)
    parser.add_argument("--water-penalty", type=float, default=DEFAULT_WATER_PENALTY)
    parser.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES)
    parser.add_argument("--polygon-overrides", type=Path, default=DEFAULT_POLYGON_OVERRIDES)
    parser.add_argument("--island-coastline", type=Path, default=DEFAULT_ISLAND_COASTLINE)
    args = parser.parse_args()

    res = args.resolution_deg
    width = int(round(360.0 / res))
    height = int(round(180.0 / res))
    transform = from_origin(-180.0, 90.0, res, res)
    print(f"grid: {width}x{height} cells at {res} deg/cell")

    print("rasterizing vanilla eu4.json landmass (one label per polygon) ...")
    ref_land = load_land_features(args.ref_geojson)
    ref_geoms = []
    for f in ref_land:
        g = shape(f["geometry"])
        if not g.is_valid:
            g = g.buffer(0)
        ref_geoms.append(g)
    # -1 = water/no polygon; otherwise the index into ref_geoms, so every
    # land cell remembers exactly which vanilla polygon it belongs to.
    vanilla_id = rasterio.features.rasterize(
        [(g, i) for i, g in enumerate(ref_geoms)],
        out_shape=(height, width),
        transform=transform,
        fill=-1,
        dtype=np.int32,
    )
    land_mask = vanilla_id >= 0
    print(f"  {land_mask.sum()} land cells ({land_mask.mean() * 100:.1f}% of grid), "
          f"{len(ref_geoms)} vanilla polygons")

    overrides: dict[str, list[float]] = {}
    if args.overrides.exists():
        overrides = json.loads(args.overrides.read_text(encoding="utf-8"))

    polygon_overrides: dict[str, dict] = {}
    if args.polygon_overrides.exists():
        polygon_overrides = json.loads(args.polygon_overrides.read_text(encoding="utf-8"))
    excluded_ids = {int(k) for k in polygon_overrides}

    print("snapping mod-province centroids onto the vanilla landmass ...")
    mod_land_all = load_land_features(args.input)
    mod_land = [f for f in mod_land_all if f["properties"]["id"] not in excluded_ids]
    if excluded_ids:
        print(f"  {len(excluded_ids)} provinces excluded from the flood fill "
              f"(hand-placed instead): {sorted(excluded_ids)}")
    centroids = []
    n_overridden = 0
    for f in mod_land:
        pid = str(f["properties"]["id"])
        if pid in overrides:
            centroids.append(tuple(overrides[pid]))
            n_overridden += 1
            continue
        g = shape(f["geometry"])
        if not g.is_valid:
            g = g.buffer(0)
        centroids.append(dateline_safe_centroid(g))
    if n_overridden:
        print(f"  {n_overridden} centroids replaced from {args.overrides.name}")
    lon = np.array([c[0] for c in centroids])
    lat = np.array([c[1] for c in centroids])
    row, col = lonlat_to_rowcol(lon, lat, res, height)

    # one global lookup: for every cell, the nearest land cell's (row, col) --
    # used to snap any off-land seed onto the landmass in a single gather.
    _, (nn_row, nn_col) = distance_transform_edt(
        ~land_mask, return_distances=True, return_indices=True
    )
    orig_row, orig_col = row, col
    on_land = land_mask[orig_row, orig_col]
    n_snapped = int((~on_land).sum())
    row = np.where(on_land, orig_row, nn_row[orig_row, orig_col])
    col = np.where(on_land, orig_col, nn_col[orig_row, orig_col])
    print(f"  {n_snapped}/{len(centroids)} centroids snapped onto land")

    vanilla_owner = vanilla_id[row, col]  # which vanilla polygon each seed landed in
    cost = np.where(land_mask, 1.0, 1.0 + args.water_penalty).astype(np.float32)

    print("phase 1: splitting each vanilla polygon only among its own seeded mod provinces ...")
    mod_by_vanilla: dict[int, list[int]] = {}
    for mod_idx, vid in enumerate(vanilla_owner.tolist()):
        assert vid >= 0, f"seed {mod_idx} snapped onto a non-land cell (vanilla_id={vid})"
        mod_by_vanilla.setdefault(vid, []).append(mod_idx)

    # find_objects(labels)[k] is the bounding-box slice for label k+1, so
    # shifting by +1 (water -> 0, polygon i -> i+1) lines index i up with
    # ref_geoms[i] directly.
    bboxes = ndimage.find_objects(vanilla_id + 1)

    label = np.full((height, width), -1, dtype=np.int32)
    n_direct = n_split = n_dupes = 0
    for vid, mod_idxs in mod_by_vanilla.items():
        bbox = bboxes[vid]
        if bbox is None:
            continue
        poly_mask = vanilla_id[bbox] == vid
        if len(mod_idxs) == 1:
            label[bbox][poly_mask] = mod_idxs[0]
            n_direct += 1
            continue
        n_split += 1
        local_markers = np.zeros(poly_mask.shape, dtype=np.int32)
        for mod_idx in mod_idxs:
            r0 = row[mod_idx] - bbox[0].start
            c0 = col[mod_idx] - bbox[1].start
            if local_markers[r0, c0] != 0:
                n_dupes += 1
            local_markers[r0, c0] = mod_idx + 1
        local_label = watershed(
            np.ones(poly_mask.shape, dtype=np.float32), markers=local_markers,
            mask=poly_mask, connectivity=2,
        )
        sub = label[bbox]
        sub[poly_mask] = local_label[poly_mask] - 1
        label[bbox] = sub
    n_unseeded = len(ref_geoms) - len(mod_by_vanilla)
    print(f"  {n_direct} vanilla polygons assigned directly, {n_split} split among "
          f"multiple seeds, {n_unseeded} unseeded")
    if n_dupes:
        print(f"  note: {n_dupes} provinces shared a seed cell within the same polygon (last one wins it)")

    print(f"phase 2: filling unseeded vanilla polygons from their nearest assigned "
          f"neighbor (water penalty {args.water_penalty}) ...")
    unresolved = land_mask & (label < 0)
    fill_markers = np.where(label >= 0, label + 1, 0).astype(np.int32)
    filled = watershed(cost, markers=fill_markers, mask=land_mask, connectivity=2)
    label = np.where(unresolved, filled - 1, label)

    still_unresolved = land_mask & (label < 0)
    if still_unresolved.any():
        n_isolated = int(still_unresolved.sum())
        fill_markers2 = np.where(label >= 0, label + 1, 0).astype(np.int32)
        filled2 = watershed(cost, markers=fill_markers2, mask=None, connectivity=2)
        label = np.where(still_unresolved, filled2 - 1, label)
        print(f"  {n_isolated} isolated land cells (no land route to any seed) filled "
              "via water-penalized nearest neighbor")

    print("tracing per-province polygons from the labeled grid ...")
    parts: dict[int, list] = {}
    for geom, value in rasterio.features.shapes(
        label.astype(np.int32), mask=land_mask, connectivity=4, transform=transform
    ):
        v = int(value)
        if v < 0:
            continue
        parts.setdefault(v, []).append(shape(geom))
    print(f"  {sum(len(v) for v in parts.values())} polygon parts, {len(parts)} provinces")

    all_idx = sorted(parts.keys())
    flat_polys, poly_owner = [], []
    for i in all_idx:
        for g in parts[i]:
            flat_polys.append(g)
            poly_owner.append(i)

    if args.simplify_cells > 0:
        print(f"coverage-simplifying (tolerance {args.simplify_cells} cells = "
              f"{args.simplify_cells * res:.3f} deg) ...")
        arr = shapely.coverage_simplify(
            np.array(flat_polys, dtype=object), args.simplify_cells * res, simplify_boundary=True
        )
        flat_polys = list(arr)

    grouped: dict[int, list] = {}
    for i, geom in zip(poly_owner, flat_polys):
        grouped.setdefault(i, []).append(geom)

    features = []
    for i in sorted(grouped):
        polys = [g for g in grouped[i] if not g.is_empty and g.geom_type == "Polygon"]
        if not polys:
            continue
        props = dict(mod_land[i]["properties"])
        geom = shapely.MultiPolygon(polys) if len(polys) > 1 else polys[0]
        features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": json.loads(shapely.to_geojson(geom)),
            }
        )

    n_missing = len(mod_land) - len(features)
    if n_missing:
        print(f"  note: {n_missing} mod provinces got no land cells (fully lost the race)")

    if polygon_overrides:
        props_by_id = {f["properties"]["id"]: f["properties"] for f in mod_land_all}
        islands = (
            load_topojson_land_polygons(args.island_coastline)
            if args.island_coastline.exists()
            else []
        )
        n_realistic = 0
        for pid_str, spec in polygon_overrides.items():
            pid = int(pid_str)
            r = spec.get("radius_deg", 0.15)
            island = find_island_polygon(
                spec["lon"], spec["lat"], islands, ISLAND_MATCH_MAX_DIST_DEG
            )
            if island is not None:
                minx, miny, maxx, maxy = island.bounds
                span = max(maxx - minx, maxy - miny)
                if span < MIN_ISLAND_SPAN_DEG:
                    poly = island.buffer((MIN_ISLAND_SPAN_DEG - span) / 2)
                else:
                    poly = island
                n_realistic += 1
            else:
                poly = shapely.box(
                    spec["lon"] - r, spec["lat"] - r, spec["lon"] + r, spec["lat"] + r
                )
            features.append(
                {
                    "type": "Feature",
                    "properties": dict(props_by_id[pid]),
                    "geometry": json.loads(shapely.to_geojson(poly)),
                }
            )
        print(
            f"  added {len(polygon_overrides)} hand-placed polygons "
            f"({n_realistic} using real 10m coastline, "
            f"{len(polygon_overrides) - n_realistic} synthetic boxes)"
        )

    out = {"type": "FeatureCollection", "features": features}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {len(features)} features -> {args.output}")


if __name__ == "__main__":
    main()
