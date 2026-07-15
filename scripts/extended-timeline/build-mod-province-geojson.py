"""Extracts province polygons from an EU4 mod's map/provinces.bmp and emits
them as a lat/lon GeoJSON, even though the EU4 world map has no analytic
projection (it's a hand-warped artist map -- Europe inflated, poles cropped,
regional distortions everywhere), so no proj4 string can ever invert it.

The projection is instead recovered empirically: the mod keeps vanilla EU4
province ids, and geo-explorer's eu4.json already has true lat/lon polygons
for those same ids. Matching each province's pixel centroid (from the bmp)
to its lat/lon centroid (from the reference) yields ~3k control points, and
a thin-plate-spline RBF fitted through them is the projection. The fit
targets 3D unit-sphere coordinates rather than raw lon/lat so the
antimeridian seam and high latitudes need no special casing.

Some control points are wrong by construction -- the mod relocates dozens of
vanilla ids to different places on Earth -- and they are pruned in two
stages, because each stage's blind spot is the other's strength (verified
empirically on this mod; neither stage alone produces a clean map):

1. *Local consistency*: great-circle distances from a control point to its
   pixel-space nearest neighbors, divided by the pixel distances, give an
   implied km-per-pixel; a grossly relocated province disagrees with all its
   pixel neighbors by thousands of km (ratio >> neighborhood consensus).
   This catches the worst offenders without collateral damage, but dilutes
   below detectability for moderate (~2-3k km) relocations in sparse areas
   where the nearest neighbors are hundreds of pixels away (e.g. id 2839,
   vanilla NW Argentina, redrawn as Selk'nam in Tierra del Fuego).
2. *Cross-validated residuals*: 10-fold CV, dropping points whose held-out
   prediction misses by max(8 x median, a 400 km floor). Run on the raw
   control set this mass-drops honest clusters -- every 9000-km poison point
   wrecks held-out predictions for its innocent pixel neighbors, which took
   out all of Greenland and the Alps and left the far north as unconstrained
   extrapolation (starburst artifacts) -- but after stage 1 has removed the
   poison, CV cleanly picks off the moderate relocations stage 1 missed.
   (Plain fitting residuals can't be used at all: a TPS interpolates its own
   control points exactly.)

   One carve-out: within the sparse top/bottom map-edge bands (the arctic
   and Patagonia), held-out prediction is extrapolation off the control
   hull, so an honest point there can miss by 1000+ km and CV's verdict is
   worthless. In those bands a point flagged by CV is kept anyway when its
   stage-1 local-consistency score is clean (< 1.4): every hand-checked
   honest arctic control scores 0.7-1.3 there while the genuinely relocated
   ones score 1.7+, and without the carve-out the whole arctic loses its
   anchors and drifts ~10 degrees off the reference geography.

Relocated provinces still get geometry extracted; they just don't constrain
the warp, and are tagged "relocated" in the output since their extracted
location is the mod's, not vanilla Earth's.

A centroid is one point; the reference GeoJSON has each kept id's *entire*
polygon. Throwing that shape away is the main source of interior
inaccuracy -- the fit only knew "this province is near here," not how big,
elongated, or oriented it is. A province boundary ICP pass fixes this before
the coastline pass: densify each kept id's mod-pixel edge and its reference
polygon boundary to ~40 points each, warp the mod points through the current
fit, nearest-match them against that *same id's* reference boundary, and
refit with the matches added as pseudo-controls. A province whose actual
shape doesn't line up (redrawn but not egregiously enough to be pruned as
relocated) mostly fails the per-point match-distance cap and contributes
little, so no separate per-province outlier pass is needed.

Centroid correspondences alone still leave coastlines rough everywhere, worst
at the poles where control points are sparse and the mod redrew the arctic
coastline outright, so a centroid can be right while the coast it belongs to
sits a degree or two off the reference. A final ICP pass fixes this: warp the
mod's coast pixels through the current fit, match each to the nearest point
on the reference coastline (Natural Earth's global land polygon, matched on
the unit sphere so the dateline is seamless), and refit with the matched
pairs added as pseudo-controls -- capped by match distance so
genuinely-different geography isn't glued together, and thinned so they
can't out-vote the centroids. Applied globally (not just the poles), every
continent's edge gets pulled onto the reference coast, not only the arctic
and Patagonia. Two iterations take the coast mismatch from ~0.36 deg median
to ~0.04.

Province shapes are traced exactly from the id raster (rasterio.features.
shapes), simplified as a coverage (shapely.coverage_simplify keeps shared
borders identical on both sides, so no slivers/gaps between neighbors), and
warped vertex-by-vertex. The TPS is evaluated on a coarse pixel grid and
bilinearly interpolated because scipy's neighbors-mode RBF does a local
solve per query point -- fine for thousands of points, hopeless for the
~million polygon vertices.

Typical fit quality against held-out provinces: median ~18 km, p90 ~78 km
(EU4 land provinces are usually 100+ km across).
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import rasterio.features
import shapely
from PIL import Image
from scipy.interpolate import RBFInterpolator, RegularGridInterpolator
from shapely.geometry import shape

Image.MAX_IMAGE_PIXELS = None

DEFAULT_MOD_MAP = Path(
    r"c:\Program Files (x86)\Steam\steamapps\workshop\content\236850\217416366\map"
)
DEFAULT_REF_GEOJSON = Path(r"c:\Users\rayou\projects\geo-explorer\public\eu4.json")
DEFAULT_COASTLINE_TOPOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\land-50m.json"
)
DEFAULT_OUTPUT = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline.json"
)

CV_FOLDS = 10
CV_SEED = 42
# Stage-1 local-consistency prune: k pixel-space neighbors examined per
# control point, and how far above the neighborhood-consensus km-per-pixel a
# point's own median implied scale may sit before it counts as relocated.
# Honest points score ~1.0 (p99 across the map is ~1.6); gross relocations
# score 3+.
PRUNE_NEIGHBORS = 14
PRUNE_SCORE = 2.5
# Stage-2 CV prune: drop when held-out residual exceeds max(8 x median,
# this floor). The floor keeps honest points in the heavily-distorted arctic
# (where held-out prediction is legitimately hard) from being eaten.
CV_PRUNE_FLOOR_KM = 400.0
# Map-edge bands (pixels from the top/bottom of the bitmap) where CV's
# verdict is extrapolation and a clean stage-1 score overrides it.
EDGE_BAND_TOP_PX = 400
EDGE_BAND_BOTTOM_PX = 210
EDGE_EXEMPT_SCORE = 1.4
# Coastline ICP: pseudo-control band, match-distance cap, coast-pixel
# subsampling, and the pixel cell size used to thin accepted matches. The
# band now spans the whole globe (not just the poles) so every continent's
# edge gets snapped to the reference coastline, not just the arctic/Patagonia.
ICP_LAT_NORTH = 90.0
ICP_LAT_SOUTH = -90.0
ICP_MATCH_CAP_DEG = 2.5
ICP_COAST_SUBSAMPLE = 12
ICP_THIN_CELL_PX = 24
ICP_ITERATIONS = 2
REF_COAST_DENSIFY_DEG = 0.05
EARTH_RADIUS_KM = 6371.0
# Per-province boundary ICP: each kept id's *entire* reference polygon is
# known (not just its centroid), so match many boundary points per province
# instead of one. Points per side to sample, the match-distance cap that
# rejects a province's points if its shape doesn't actually line up (looser
# than the coastline cap since a real match can still be locally noisy), and
# how many refinement iterations to run.
PROV_ICP_MOD_PTS = 40
PROV_ICP_REF_PTS = 40
PROV_ICP_CAP_DEG = 3.0
PROV_ICP_ITERATIONS = 3
PROV_BOUNDARY_DENSIFY_DEG = 0.02


def load_color_map(definition_csv: Path) -> tuple[dict[int, int], dict[int, str]]:
    color_to_id: dict[int, int] = {}
    id_to_name: dict[int, str] = {}
    with definition_csv.open(encoding="latin-1") as f:
        next(f)
        for line in f:
            parts = line.rstrip("\n").split(";")
            if len(parts) < 4 or not parts[0].isdigit():
                continue
            try:
                r, g, b = int(parts[1]), int(parts[2]), int(parts[3])
            except ValueError:
                continue
            pid = int(parts[0])
            color_to_id[(r << 16) | (g << 8) | b] = pid
            if len(parts) > 4:
                id_to_name[pid] = parts[4]
    return color_to_id, id_to_name


def load_id_raster(provinces_bmp: Path, color_to_id: dict[int, int]) -> np.ndarray:
    im = np.asarray(Image.open(provinces_bmp), dtype=np.uint32)
    packed = (im[:, :, 0] << 16) | (im[:, :, 1] << 8) | im[:, :, 2]
    del im
    uniq, inv = np.unique(packed.ravel(), return_inverse=True)
    lut = np.array([color_to_id.get(int(c), -1) for c in uniq], dtype=np.int32)
    unknown = int((lut == -1).sum())
    if unknown:
        print(f"note: {unknown} bmp colors not in definition.csv (mapped to id -1)")
    return lut[inv].reshape(packed.shape)


def parse_id_set(default_map: Path, key: str) -> set[int]:
    text = default_map.read_text(encoding="latin-1")
    m = re.search(rf"^{key}\s*=\s*{{(.*?)}}", text, re.S | re.M)
    if not m:
        return set()
    body = re.sub(r"#[^\n]*", "", m.group(1))
    return {int(tok) for tok in re.findall(r"\d+", body)}


def pixel_centroids(ids: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-id mean pixel index (x, y) and a wraps-the-seam flag (huge x
    stddev means the province has parts on both horizontal map edges, so its
    naive centroid is meaningless)."""
    w = ids.shape[1]
    flat = ids.ravel()
    valid = flat >= 0
    n = int(flat.max()) + 1
    yy, xx = np.divmod(np.arange(flat.size, dtype=np.int64), w)
    cnt = np.bincount(flat[valid], minlength=n).astype(np.float64)
    sx = np.bincount(flat[valid], weights=xx[valid], minlength=n)
    sy = np.bincount(flat[valid], weights=yy[valid], minlength=n)
    sx2 = np.bincount(
        flat[valid], weights=xx[valid].astype(np.float64) ** 2, minlength=n
    )
    present = cnt > 0
    cx = np.where(present, sx / np.maximum(cnt, 1), np.nan)
    cy = np.where(present, sy / np.maximum(cnt, 1), np.nan)
    var_x = sx2 / np.maximum(cnt, 1) - cx**2
    wraps = np.sqrt(np.maximum(var_x, 0)) > w / 6
    return cx, cy, wraps


def reference_centroids(ref_geojson: Path) -> dict[int, tuple[float, float]]:
    with ref_geojson.open(encoding="utf-8") as f:
        ref = json.load(f)
    out: dict[int, tuple[float, float]] = {}
    for feat in ref["features"]:
        pid = int(feat["properties"]["id"])
        geom = shape(feat["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        b = geom.bounds
        if b[2] - b[0] > 180:  # spans the antimeridian in lon space
            continue
        c = geom.centroid
        out[pid] = (c.x, c.y)
    return out


def reference_boundary_points(
    ref_geojson: Path, keep_pids: set[int], target_pts: int
) -> dict[int, np.ndarray]:
    """Per-id reference boundary points, densified along each province's
    exterior ring so a fixed target count is roughly evenly spaced -- the
    same-id correspondences used to match a mod province's *shape*, not just
    its centroid."""
    with ref_geojson.open(encoding="utf-8") as f:
        ref = json.load(f)
    out: dict[int, np.ndarray] = {}
    for feat in ref["features"]:
        pid = int(feat["properties"]["id"])
        if pid not in keep_pids:
            continue
        geom = shape(feat["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        b = geom.bounds
        if b[2] - b[0] > 180:
            continue
        polys = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
        pts = []
        for poly in polys:
            line = poly.exterior
            n = max(3, min(target_pts, int(line.length / PROV_BOUNDARY_DENSIFY_DEG) + 1))
            for t in np.linspace(0.0, 1.0, n, endpoint=False):
                p = line.interpolate(t, normalized=True)
                pts.append((p.x, p.y))
        if pts:
            out[pid] = np.array(pts, dtype=np.float64)
    return out


def mod_province_edge_points(
    ids: np.ndarray, keep_pids: set[int], max_pts: int, seed: int = 7
) -> dict[int, np.ndarray]:
    """Per-id mod-pixel boundary points: every pixel where this id borders a
    *different* id (any neighbor, not just water), subsampled to max_pts.
    Order doesn't matter -- these feed a nearest-point match, not a polyline."""
    edge = np.zeros(ids.shape, dtype=bool)
    edge[:, 1:] |= ids[:, 1:] != ids[:, :-1]
    edge[1:, :] |= ids[1:, :] != ids[:-1, :]
    edge &= ids >= 0
    ey, ex = np.nonzero(edge)
    eid = ids[ey, ex]
    order = np.argsort(eid, kind="stable")
    eid, ex, ey = eid[order], ex[order], ey[order]
    uniq_ids, starts = np.unique(eid, return_index=True)
    starts = np.append(starts, len(eid))
    rng = np.random.default_rng(seed)
    out: dict[int, np.ndarray] = {}
    for k, pid_val in enumerate(uniq_ids):
        pid_val = int(pid_val)
        if pid_val not in keep_pids:
            continue
        s, e = starts[k], starts[k + 1]
        n = e - s
        if n < 3:
            continue
        idx = rng.choice(n, size=max_pts, replace=False) if n > max_pts else np.arange(n)
        out[pid_val] = np.stack([ex[s:e][idx], ey[s:e][idx]], axis=1).astype(np.float64)
    return out


def province_icp(
    ctrl_px: np.ndarray,
    ctrl_ll: np.ndarray,
    mod_edges: dict[int, np.ndarray],
    ref_bounds: dict[int, np.ndarray],
    neighbors: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Refine the fit using dense per-province boundary correspondences: each
    kept id's full reference shape is known, so match many points along it
    instead of relying on a single centroid per province. A province whose
    mod shape doesn't actually line up with its reference (redrawn, but not
    egregiously enough to be pruned as relocated) mostly fails the match-cap
    and contributes few or no points, so it doesn't need its own outlier
    pass -- the cap does that per-point instead of per-province."""
    from scipy.spatial import cKDTree

    pids = [p for p in mod_edges if p in ref_bounds]
    if not pids:
        return ctrl_px, ctrl_ll
    trees = {p: cKDTree(to_xyz(ref_bounds[p])) for p in pids}
    all_px = np.concatenate([mod_edges[p] for p in pids])
    owner = np.concatenate(
        [np.full(len(mod_edges[p]), i, dtype=np.int64) for i, p in enumerate(pids)]
    )

    aug_px, aug_ll = ctrl_px, ctrl_ll
    for it in range(PROV_ICP_ITERATIONS):
        rbf = make_rbf(aug_px, aug_ll, neighbors)
        warped = rbf(all_px)
        warped /= np.linalg.norm(warped, axis=1, keepdims=True)

        keep_mask = np.zeros(len(all_px), bool)
        tgt = np.zeros((len(all_px), 2))
        gc_all = np.full(len(all_px), np.nan)
        for i, p in enumerate(pids):
            sel = np.flatnonzero(owner == i)
            dist, j = trees[p].query(warped[sel])
            gc_deg = np.degrees(2 * np.arcsin(np.clip(dist / 2, 0, 1)))
            gc_all[sel] = gc_deg
            ok = gc_deg < PROV_ICP_CAP_DEG
            tgt[sel[ok]] = ref_bounds[p][j[ok]]
            keep_mask[sel[ok]] = True

        src_px = all_px[keep_mask]
        tgt_ll = tgt[keep_mask]
        print(
            f"  province-icp iter {it}: provinces={len(pids)} points={len(all_px)} "
            f"matched={int(keep_mask.sum())} median={np.nanmedian(gc_all):.2f}deg"
        )
        aug_px = np.vstack([ctrl_px, src_px])
        aug_ll = np.vstack([ctrl_ll, tgt_ll])
    return aug_px, aug_ll


def to_xyz(ll: np.ndarray) -> np.ndarray:
    lon = np.radians(ll[:, 0])
    lat = np.radians(ll[:, 1])
    return np.stack(
        [np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=1
    )


def to_ll(xyz: np.ndarray) -> np.ndarray:
    xyz = xyz / np.linalg.norm(xyz, axis=1, keepdims=True)
    lat = np.degrees(np.arcsin(np.clip(xyz[:, 2], -1, 1)))
    lon = np.degrees(np.arctan2(xyz[:, 1], xyz[:, 0]))
    return np.stack([lon, lat], axis=1)


def residual_km(pred_ll: np.ndarray, true_ll: np.ndarray) -> np.ndarray:
    dlat = np.radians(pred_ll[:, 1] - true_ll[:, 1])
    dlon = np.radians(pred_ll[:, 0] - true_ll[:, 0])
    dlon = (dlon + np.pi) % (2 * np.pi) - np.pi
    return EARTH_RADIUS_KM * np.sqrt(
        dlat**2 + (dlon * np.cos(np.radians(true_ll[:, 1]))) ** 2
    )


def make_rbf(px: np.ndarray, ll: np.ndarray, neighbors: int) -> RBFInterpolator:
    return RBFInterpolator(
        px, to_xyz(ll), neighbors=neighbors, kernel="thin_plate_spline", smoothing=1e-6
    )


def cv_residuals(px: np.ndarray, ll: np.ndarray, neighbors: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    folds = np.array_split(rng.permutation(len(px)), CV_FOLDS)
    out = np.zeros(len(px))
    for fold in folds:
        mask = np.ones(len(px), bool)
        mask[fold] = False
        rbf = make_rbf(px[mask], ll[mask], neighbors)
        out[fold] = residual_km(to_ll(rbf(px[fold])), ll[fold])
    return out


def prune_controls(
    px: np.ndarray, ll: np.ndarray, pid: np.ndarray, neighbors: int, height: int
) -> np.ndarray:
    from scipy.spatial import cKDTree

    keep = np.ones(len(px), bool)
    last_score = np.ones(len(px))
    for it in range(4):
        idx_keep = np.where(keep)[0]
        sub_px = px[idx_keep]
        sub_xyz = to_xyz(ll[idx_keep])
        tree = cKDTree(sub_px)
        dist_px, nbr = tree.query(sub_px, k=PRUNE_NEIGHBORS + 1)
        dist_px, nbr = dist_px[:, 1:], nbr[:, 1:]
        chord = np.linalg.norm(sub_xyz[:, None, :] - sub_xyz[nbr], axis=2)
        dist_km = 2 * EARTH_RADIUS_KM * np.arcsin(np.clip(chord / 2, 0, 1))
        implied_scale = np.median(dist_km / np.maximum(dist_px, 1e-9), axis=1)
        consensus = np.median(implied_scale[nbr], axis=1)
        score = implied_scale / np.maximum(consensus, 1e-9)
        last_score[idx_keep] = score
        bad = score > PRUNE_SCORE
        print(
            f"  local-consistency iter {it}: n={len(sub_px)} score p50="
            f"{np.percentile(score, 50):.2f} p99={np.percentile(score, 99):.2f} "
            f"max={score.max():.1f} dropping={bad.sum()}"
        )
        if not bad.any():
            break
        keep[idx_keep[bad]] = False

    edge_exempt = (
        (px[:, 1] < EDGE_BAND_TOP_PX) | (px[:, 1] > height - EDGE_BAND_BOTTOM_PX)
    ) & (last_score < EDGE_EXEMPT_SCORE)

    for it in range(6):
        idx_keep = np.where(keep)[0]
        res = cv_residuals(px[idx_keep], ll[idx_keep], neighbors, CV_SEED + it)
        med = float(np.median(res))
        thresh = max(8 * med, CV_PRUNE_FLOOR_KM)
        bad = (res > thresh) & ~edge_exempt[idx_keep]
        exempted = int(((res > thresh) & edge_exempt[idx_keep]).sum())
        print(
            f"  cv iter {it}: n={len(idx_keep)} median={med:.1f}km "
            f"p90={np.percentile(res, 90):.1f}km max={res.max():.0f}km "
            f"dropping={bad.sum()} edge-exempted={exempted}"
        )
        if not bad.any():
            break
        keep[idx_keep[bad]] = False

    dropped = sorted(int(p) for p in pid[~keep])
    if dropped:
        print(f"  relocated ids excluded from fit ({len(dropped)}): {dropped}")
    return keep


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


def load_topojson_land(topo_path: Path) -> shapely.Geometry:
    """Natural Earth's land TopoJSON is a single global MultiPolygon; stitch
    its arcs back into a shapely geometry representing all land."""
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
    land = shapely.union_all(polys)
    return land if land.is_valid else land.buffer(0)


def reference_coastline_xyz(land_topojson: Path) -> np.ndarray:
    """Natural Earth's land coastline (not the mod's own province boundary,
    which is only as clean as the vanilla polygons feeding it), densified to
    evenly-spaced points on the unit sphere for nearest-neighbor matching. We
    only need the general land shape here, not per-province precision."""
    land = load_topojson_land(land_topojson)
    boundary = land.boundary
    lines = boundary.geoms if boundary.geom_type == "MultiLineString" else [boundary]
    pts = []
    for line in lines:
        n = max(2, int(line.length / REF_COAST_DENSIFY_DEG))
        for t in np.linspace(0.0, 1.0, n):
            p = line.interpolate(t, normalized=True)
            pts.append((p.x, p.y))
    return to_xyz(np.array(pts))


def mod_coast_pixels(ids: np.ndarray, sea_ids: set[int], lake_ids: set[int]) -> np.ndarray:
    water = sea_ids | lake_ids
    lut = np.zeros(int(ids.max()) + 1, bool)
    for u in np.unique(ids):
        if u >= 0 and int(u) not in water:
            lut[u] = True
    land = lut[np.maximum(ids, 0)] & (ids >= 0)
    edge = np.zeros_like(land)
    edge[:, 1:] |= land[:, 1:] != land[:, :-1]
    edge[1:, :] |= land[1:, :] != land[:-1, :]
    edge &= land
    ey, ex = np.nonzero(edge)
    sub = np.arange(0, len(ex), ICP_COAST_SUBSAMPLE)
    return np.stack([ex[sub], ey[sub]], axis=1).astype(np.float64)


def coastline_icp(
    ctrl_px: np.ndarray,
    ctrl_ll: np.ndarray,
    coast_px: np.ndarray,
    ref_coast_xyz: np.ndarray,
    neighbors: int,
) -> tuple[np.ndarray, np.ndarray]:
    from scipy.spatial import cKDTree

    ref_tree = cKDTree(ref_coast_xyz)
    aug_px, aug_ll = ctrl_px, ctrl_ll
    for it in range(ICP_ITERATIONS):
        rbf = make_rbf(aug_px, aug_ll, neighbors)
        warped = rbf(coast_px)
        warped /= np.linalg.norm(warped, axis=1, keepdims=True)
        wll = to_ll(warped)
        band = (wll[:, 1] <= ICP_LAT_NORTH) & (wll[:, 1] >= ICP_LAT_SOUTH)
        dist, j = ref_tree.query(warped[band])
        gc_deg = np.degrees(2 * np.arcsin(np.clip(dist / 2, 0, 1)))
        ok = gc_deg < ICP_MATCH_CAP_DEG
        src_px = coast_px[band][ok]
        tgt_ll = to_ll(ref_coast_xyz[j[ok]])
        # thin to one match per pixel cell so pseudo-controls stay a
        # minority against the centroid controls
        cell = (src_px // ICP_THIN_CELL_PX).astype(np.int64)
        _, first = np.unique(cell[:, 0] * 1_000_000 + cell[:, 1], return_index=True)
        src_px, tgt_ll = src_px[first], tgt_ll[first]
        print(
            f"  icp iter {it}: coast points={int(band.sum())} "
            f"matched={int(ok.sum())} median={np.median(gc_deg):.2f}deg "
            f"-> {len(src_px)} pseudo-controls"
        )
        aug_px = np.vstack([ctrl_px, src_px])
        aug_ll = np.vstack([ctrl_ll, tgt_ll])
    return aug_px, aug_ll


def build_warp_grid(
    rbf: RBFInterpolator, width: int, height: int, step: int
) -> RegularGridInterpolator:
    """Evaluate the TPS on a coarse pixel grid and wrap it in a bilinear
    interpolator over unit-sphere xyz (interpolating xyz, not lon/lat, keeps
    the antimeridian seamless; callers normalize + convert)."""
    gx = np.arange(-1.0, width + step, step, dtype=np.float64)
    gy = np.arange(-1.0, height + step, step, dtype=np.float64)
    mx, my = np.meshgrid(gx, gy, indexing="xy")
    pts = np.stack([mx.ravel(), my.ravel()], axis=1)
    xyz = rbf(pts).reshape(len(gy), len(gx), 3)
    return RegularGridInterpolator((gy, gx), xyz, method="linear")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract lat/lon province-polygon GeoJSON from an EU4 "
        "mod's provinces.bmp by empirically fitting the map's unknown "
        "projection against known vanilla province locations."
    )
    parser.add_argument("--mod-map", type=Path, default=DEFAULT_MOD_MAP)
    parser.add_argument("--ref-geojson", type=Path, default=DEFAULT_REF_GEOJSON)
    parser.add_argument(
        "--coastline-topojson",
        type=Path,
        default=DEFAULT_COASTLINE_TOPOJSON,
        help="Natural Earth land TopoJSON used as the ICP coastline target",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--simplify-px",
        type=float,
        default=1.5,
        help="coverage-simplify tolerance in map pixels (1 px is ~7 km at "
        "the equator); 0 disables",
    )
    parser.add_argument("--neighbors", type=int, default=64)
    parser.add_argument(
        "--no-coastline-icp",
        action="store_true",
        help="skip the coastline ICP refinement stage",
    )
    parser.add_argument(
        "--no-province-icp",
        action="store_true",
        help="skip the per-province boundary ICP refinement stage",
    )
    parser.add_argument(
        "--include-sea",
        action="store_true",
        help="also emit sea/lake province polygons (tagged type=sea/lake)",
    )
    args = parser.parse_args()

    print("loading definition.csv + provinces.bmp ...")
    color_to_id, id_to_name = load_color_map(args.mod_map / "definition.csv")
    ids = load_id_raster(args.mod_map / "provinces.bmp", color_to_id)
    height, width = ids.shape
    print(f"  raster {width}x{height}, {len(np.unique(ids)) - 1} province ids present")

    sea_ids = parse_id_set(args.mod_map / "default.map", "sea_starts")
    lake_ids = parse_id_set(args.mod_map / "default.map", "lakes")

    print("building control points ...")
    cx, cy, wraps = pixel_centroids(ids)
    ref_pts = reference_centroids(args.ref_geojson)
    ctrl = [
        (cx[pid], cy[pid], lon, lat, pid)
        for pid, (lon, lat) in ref_pts.items()
        if pid < len(cx) and np.isfinite(cx[pid]) and not wraps[pid]
    ]
    ctrl_arr = np.array(ctrl, dtype=np.float64)
    px = ctrl_arr[:, 0:2]
    ll = ctrl_arr[:, 2:4]
    pid = ctrl_arr[:, 4].astype(np.int64)
    print(f"  {len(px)} centroid correspondences")

    print("pruning relocated-province outliers (local consistency, then CV) ...")
    keep = prune_controls(px, ll, pid, args.neighbors, height)

    res = cv_residuals(px[keep], ll[keep], args.neighbors, CV_SEED)
    fit_median_km = float(np.median(res))
    fit_p90_km = float(np.percentile(res, 90))
    print(
        f"  fit quality (10-fold CV): median={fit_median_km:.1f}km "
        f"p90={fit_p90_km:.1f}km p99={np.percentile(res, 99):.1f}km"
    )

    fit_px, fit_ll = px[keep], ll[keep]
    if not args.no_province_icp:
        print("province boundary ICP (dense per-id shape matching) ...")
        keep_pids = set(int(p) for p in pid[keep])
        mod_edges = mod_province_edge_points(ids, keep_pids, PROV_ICP_MOD_PTS)
        ref_bounds = reference_boundary_points(args.ref_geojson, keep_pids, PROV_ICP_REF_PTS)
        fit_px, fit_ll = province_icp(fit_px, fit_ll, mod_edges, ref_bounds, args.neighbors)

    if not args.no_coastline_icp:
        print("coastline ICP refinement ...")
        ref_coast = reference_coastline_xyz(args.coastline_topojson)
        coast_px = mod_coast_pixels(ids, sea_ids, lake_ids)
        fit_px, fit_ll = coastline_icp(
            fit_px, fit_ll, coast_px, ref_coast, args.neighbors
        )

    print("fitting final thin-plate-spline warp + evaluation grid ...")
    rbf = make_rbf(fit_px, fit_ll, args.neighbors)
    grid = build_warp_grid(rbf, width, height, step=8)

    print("tracing province polygons from raster ...")
    include_id = np.zeros(int(ids.max()) + 1, bool)
    for p in np.unique(ids):
        if p < 0:
            continue
        if args.include_sea or (p not in sea_ids and p not in lake_ids):
            include_id[p] = True
    mask = include_id[np.maximum(ids, 0)] & (ids >= 0)
    parts: dict[int, list] = {}
    for geom, value in rasterio.features.shapes(ids, mask=mask, connectivity=4):
        parts.setdefault(int(value), []).append(shape(geom))
    print(f"  {sum(len(v) for v in parts.values())} polygon parts, "
          f"{len(parts)} provinces")

    all_ids = sorted(parts.keys())
    flat_polys = []
    poly_owner = []
    for p in all_ids:
        for g in parts[p]:
            flat_polys.append(g)
            poly_owner.append(p)

    if args.simplify_px > 0:
        print(f"coverage-simplifying (tolerance {args.simplify_px} px) ...")
        arr = shapely.coverage_simplify(
            np.array(flat_polys, dtype=object), args.simplify_px, simplify_boundary=True
        )
        flat_polys = list(arr)

    print("warping vertices to lat/lon ...")
    fit_ids = set(int(p) for p in pid[keep])
    control_ids = set(int(p) for p in pid)
    features = []
    grouped: dict[int, list] = {}
    for p, geom in zip(poly_owner, flat_polys):
        grouped.setdefault(p, []).append(geom)

    def warp_ring(coords: np.ndarray) -> np.ndarray:
        # rasterio vertices are pixel-*corner* coords; the fit was built on
        # pixel-*index* (center - 0.5) coords, hence the half-pixel shift.
        q = np.column_stack([coords[:, 0] - 0.5, coords[:, 1] - 0.5])
        return to_ll(grid(q[:, ::-1]))  # grid takes (y, x)

    def split_antimeridian(rings: list[np.ndarray]) -> list[list[list[list[float]]]]:
        """The lon = +-180 line runs through the middle of the EU4 map
        (Fiji, Chukotka), so a polygon contiguous in pixel space can span
        the seam in lon space. Unwrap such polygons into [0, 360), clip
        against each hemisphere, and emit the parts separately."""
        spans = any(r[:, 0].max() - r[:, 0].min() > 180 for r in rings)
        rounded = [
            [[round(float(x), 5), round(float(y), 5)] for x, y in r] for r in rings
        ]
        if not spans:
            return [rounded]
        unwrapped = [np.column_stack([np.where(r[:, 0] < 0, r[:, 0] + 360, r[:, 0]), r[:, 1]]) for r in rings]
        poly = shapely.Polygon(unwrapped[0], [r for r in unwrapped[1:]])
        if not poly.is_valid:
            poly = poly.buffer(0)
        out = []
        for lo, hi, shift in ((0.0, 180.0, 0.0), (180.0, 360.0, -360.0)):
            clipped = poly.intersection(shapely.box(lo, -90.0, hi, 90.0))
            for part in getattr(clipped, "geoms", [clipped]):
                if part.is_empty or part.geom_type != "Polygon":
                    continue
                out.append(
                    [
                        [
                            [round(float(x) + shift, 5), round(float(y), 5)]
                            for x, y in np.asarray(ring.coords)
                        ]
                        for ring in [part.exterior, *part.interiors]
                    ]
                )
        return out

    for p in sorted(grouped):
        polys_ll = []
        for geom in grouped[p]:
            if geom.is_empty or geom.geom_type != "Polygon":
                continue
            rings = [warp_ring(np.asarray(geom.exterior.coords))]
            rings += [warp_ring(np.asarray(r.coords)) for r in geom.interiors]
            polys_ll.extend(split_antimeridian(rings))
        if not polys_ll:
            continue
        if p in sea_ids:
            ptype = "sea"
        elif p in lake_ids:
            ptype = "lake"
        else:
            ptype = "land"
        props = {"id": p, "type": ptype}
        if p in id_to_name:
            props["name"] = id_to_name[p]
        if p in control_ids and p not in fit_ids:
            # geometry is where the *mod* puts this id, which is far from its
            # vanilla-Earth location -- flag so consumers can decide.
            props["relocated"] = True
        geometry = (
            {"type": "Polygon", "coordinates": polys_ll[0]}
            if len(polys_ll) == 1
            else {"type": "MultiPolygon", "coordinates": polys_ll}
        )
        features.append({"type": "Feature", "properties": props, "geometry": geometry})

    n_relocated = sum(1 for f in features if f["properties"].get("relocated"))
    meta = {
        "fit_median_km": round(fit_median_km, 1),
        "fit_p90_km": round(fit_p90_km, 1),
        "relocated_count": n_relocated,
        "raster_width": width,
        "raster_height": height,
    }
    out = {"type": "FeatureCollection", "features": features, "meta": meta}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {len(features)} features -> {args.output}")


if __name__ == "__main__":
    main()
