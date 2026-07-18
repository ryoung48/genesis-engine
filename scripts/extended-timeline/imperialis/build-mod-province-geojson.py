"""Extracts province polygons from Imperium Universalis's map/provinces.bmp
and emits them as a lat/lon GeoJSON. Sibling of the extended-timeline script
one directory up, but the projection recovery works completely differently,
because every trick that script relies on is unavailable here:

* IU's hand-drawn 6400x2560 bitmap covers only the Old World (roughly
  Iberia-to-Japan, ~62N-to-~5S) in a projection unlike vanilla EU4's -- the
  top edge visibly curves and the map cuts off mid-continent on three sides.
* There are NO usable id correspondences. IU copied vanilla's definition.csv
  wholesale (id 1 is still labeled "Stockholm" there) but reassigned every id
  to a brand-new location -- id 1 is a small island near Sicily, id 236
  ("London") is on the north coast of Iberia. The stale names make the id/
  name matching that anchored the extended-timeline fit actively poisonous:
  a first attempt with that pipeline produced a 750 km median CV error, with
  spatially-coherent blocks of relocated ids that neither local-consistency
  pruning nor random K-fold CV can detect (a relocated *block* validates
  itself: held-out members are predicted from their block-mates).

The projection is instead recovered from geography alone:

1. ~68 hand-placed landmark anchors (anchor-landmarks.json): pixel positions
   of unambiguous features read off gridded terrain.bmp tiles -- straits
   (Gibraltar, Bosphorus, Hormuz, Malacca), river deltas (Nile, Ganges,
   Mekong), capes, islands, and inland lakes (Chad, Balkhash, Baikal) --
   paired with their real lon/lat. A thin-plate-spline RBF through these,
   fitted in 3D unit-sphere coordinates, is the bootstrap warp (already
   ~0.65 deg median coast error on its own).

2. Coarse-to-fine coastline ICP against Natural Earth's land polygons: warp
   the mod's coast pixels, match each to the nearest reference-coast point,
   keep matches under a shrinking cap (8 -> 1.2 deg), thin them to one per
   pixel cell, and refit with the matches as pseudo-controls. Anchors are
   duplicated (8x decaying to 2x) so early iterations can't drift away from
   the hand-placed truth while the cap is still loose. Two subtleties:

   * IU classifies navigable rivers (Nile, Danube, Tigris...) as sea
     provinces 1-3 px wide. Their banks would register as "coastline" and
     get glued to the nearest real coast (the Red Sea, for the Nile), so a
     water province only contributes coast pixels when its average width
     (2*area/perimeter) clears a threshold; this also silences ~150
     vestigial one-pixel water specks.
   * Map-border pixels grow no fake coast: coast detection only fires on
     land-next-to-wide-water, and a continent sliced by the bitmap edge has
     no out-of-image neighbor to compare against.

   Result: ~0.02 deg median / ~0.24 deg p90 coast error (~2 / ~27 km).
   Interior accuracy is whatever the TPS interpolates between coasts and
   inland-lake anchors -- there is no inland reference to do better with.

Province names come from IU's localisation (PROV<id> keys), not
definition.csv, whose names are vanilla vestiges. Ids without a PROV key
(mostly wasteland) are emitted unnamed.

Province shapes are traced exactly from the id raster (rasterio.features.
shapes), simplified as a coverage (shapely.coverage_simplify keeps shared
borders identical on both sides), and warped vertex-by-vertex through a
coarse-grid bilinear evaluation of the TPS. The meta fit numbers are
coast-match distances (median/p90), since held-out-province CV does not
exist without id correspondences.
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

HERE = Path(__file__).parent
DEFAULT_MOD_MAP = Path(
    r"c:\Program Files (x86)\Steam\steamapps\workshop\content\236850\679204773\map"
)
DEFAULT_ANCHORS = HERE / "anchor-landmarks.json"
DEFAULT_COASTLINE_TOPOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\land-50m.json"
)
DEFAULT_OUTPUT = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-imperialis.json"
)

# Coarse-to-fine coastline ICP: shrinking match caps, and the number of
# times the hand anchors are duplicated per iteration so they outvote noisy
# early matches (decays as the fit tightens; the final fit keeps 2x so a
# few hundred anchor copies still can't be steamrolled by ~2500 matches).
ICP_CAPS_DEG = (8.0, 5.0, 3.0, 2.0, 1.5, 1.2)
ICP_ANCHOR_DUP = (8, 6, 4, 3, 2, 2)
ICP_COAST_SUBSAMPLE = 12
ICP_THIN_CELL_PX = 24
REF_COAST_DENSIFY_DEG = 0.05
# Water provinces narrower than this (average width = 2*area/perimeter, in
# pixels) contribute no coast pixels: rivers-as-sea and vestigial specks.
COAST_MIN_WATER_WIDTH_PX = 5.0
EARTH_RADIUS_KM = 6371.0


def load_color_map(definition_csv: Path) -> dict[int, int]:
    color_to_id: dict[int, int] = {}
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
            color_to_id[(r << 16) | (g << 8) | b] = int(parts[0])
    return color_to_id


def load_localisation_names(mod_root: Path) -> dict[int, str]:
    """IU's real province names (definition.csv names are stale vanilla
    leftovers). Two sources, weakest first: history/provinces/<id>-<Name>.txt
    filenames cover nearly every id; PROV<id> localisation keys (including
    localisation/replace, where the main prov_names file lives) then override
    with proper display names."""
    out: dict[int, str] = {}
    hist_dir = mod_root / "history" / "provinces"
    if hist_dir.is_dir():
        fpat = re.compile(r"^(\d+)\s*-\s*(.+?)\.txt$", re.I)
        for f in hist_dir.iterdir():
            m = fpat.match(f.name)
            if m and m.group(2).strip():
                out[int(m.group(1))] = m.group(2).strip()
    pat = re.compile(r'^\s*PROV(\d+):\d*\s*"(.*)"', re.M)
    loc_dir = mod_root / "localisation"
    for f in sorted(loc_dir.glob("**/*_l_english.yml")) if loc_dir.is_dir() else []:
        try:
            text = f.read_text(encoding="utf-8-sig", errors="replace")
        except OSError:
            continue
        for m in pat.finditer(text):
            name = m.group(2).strip()
            if name:
                out[int(m.group(1))] = name
    return out


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


def parse_impassable(climate_txt: Path) -> set[int]:
    """climate.txt's impassable list covers both honest wasteland (Sahara,
    Altai) and the giant filler provinces IU paints over map-border oceans
    ('Indian Ocean #21', 'UnusedLand43'). Tagged type=wasteland so consumers
    can treat them differently from playable land."""
    text = climate_txt.read_text(encoding="latin-1")
    m = re.search(r"impassable\s*=\s*{(.*?)}", text, re.S)
    if not m:
        return set()
    body = re.sub(r"#[^\n]*", "", m.group(1))
    return {int(tok) for tok in re.findall(r"\d+", body)}


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


def make_rbf(px: np.ndarray, ll: np.ndarray, neighbors: int) -> RBFInterpolator:
    # a few hundred points or fewer -> exact global solve; larger -> local
    nb = None if len(px) <= 500 else min(neighbors, len(px))
    return RBFInterpolator(
        px, to_xyz(ll), neighbors=nb, kernel="thin_plate_spline", smoothing=1e-6
    )


def _topojson_arcs(topo: dict) -> list[np.ndarray]:
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
    """Natural Earth's land coastline, densified to evenly-spaced points on
    the unit sphere for nearest-neighbor matching."""
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


def wide_water_ids(ids: np.ndarray, water: set[int]) -> set[int]:
    """Water provinces wide enough to have a real coastline. IU marks
    navigable rivers as sea provinces 1-3 px wide; their banks must not feed
    the coastline ICP (the Nile would get glued to the Red Sea). Average
    width = 2 * area / perimeter, the strip-of-width-w limit."""
    n = int(ids.max()) + 1
    flat = ids.ravel()
    area = np.bincount(flat[flat >= 0], minlength=n)
    per = np.zeros(n, np.int64)
    for a, b in ((ids[:, 1:], ids[:, :-1]), (ids[1:, :], ids[:-1, :])):
        diff = a != b
        for side in (a[diff], b[diff]):
            s = side[side >= 0]
            per += np.bincount(s, minlength=n)
    out = set()
    dropped = 0
    for pid in water:
        if pid >= n or area[pid] == 0:
            continue
        if 2.0 * area[pid] / max(per[pid], 1) >= COAST_MIN_WATER_WIDTH_PX:
            out.add(pid)
        else:
            dropped += 1
    print(f"  {len(out)} wide water provinces keep their coast; {dropped} thin "
          "(rivers/specks) excluded")
    return out


def mod_coast_pixels(ids: np.ndarray, water: set[int]) -> np.ndarray:
    """Land pixels adjacent to *wide* water: real coastline, excluding river
    banks and map-border cutoffs (border pixels have no out-of-image
    neighbor, so a continent sliced by the bitmap edge grows no fake
    coast)."""
    wide = wide_water_ids(ids, water)
    lut_land = np.zeros(int(ids.max()) + 1, bool)
    lut_wide = np.zeros(int(ids.max()) + 1, bool)
    for u in np.unique(ids):
        if u < 0:
            continue
        if int(u) in water:
            lut_wide[u] = int(u) in wide
        else:
            lut_land[u] = True
    land = lut_land[np.maximum(ids, 0)] & (ids >= 0)
    widew = lut_wide[np.maximum(ids, 0)] & (ids >= 0)
    edge = np.zeros_like(land)
    edge[:, 1:] |= land[:, 1:] & widew[:, :-1]
    edge[:, :-1] |= land[:, :-1] & widew[:, 1:]
    edge[1:, :] |= land[1:, :] & widew[:-1, :]
    edge[:-1, :] |= land[:-1, :] & widew[1:, :]
    ey, ex = np.nonzero(edge)
    sub = np.arange(0, len(ex), ICP_COAST_SUBSAMPLE)
    return np.stack([ex[sub], ey[sub]], axis=1).astype(np.float64)


def coastline_icp(
    anchor_px: np.ndarray,
    anchor_ll: np.ndarray,
    coast_px: np.ndarray,
    ref_coast_xyz: np.ndarray,
    neighbors: int,
) -> tuple[np.ndarray, np.ndarray, float, float]:
    """Coarse-to-fine ICP from the anchor bootstrap. Returns the augmented
    control set and the final coast-match median/p90 in km."""
    from scipy.spatial import cKDTree

    ref_tree = cKDTree(ref_coast_xyz)
    aug_px = np.vstack([anchor_px] * ICP_ANCHOR_DUP[0])
    aug_ll = np.vstack([anchor_ll] * ICP_ANCHOR_DUP[0])
    for it, (cap, dup) in enumerate(zip(ICP_CAPS_DEG, ICP_ANCHOR_DUP)):
        rbf = make_rbf(aug_px, aug_ll, neighbors)
        warped = rbf(coast_px)
        warped /= np.linalg.norm(warped, axis=1, keepdims=True)
        dist, j = ref_tree.query(warped)
        gc_deg = np.degrees(2 * np.arcsin(np.clip(dist / 2, 0, 1)))
        ok = gc_deg < cap
        src_px = coast_px[ok]
        tgt_ll = to_ll(ref_coast_xyz[j[ok]])
        # thin to one match per pixel cell so no stretch of coast dominates
        cell = (src_px // ICP_THIN_CELL_PX).astype(np.int64)
        _, first = np.unique(cell[:, 0] * 1_000_000 + cell[:, 1], return_index=True)
        src_px, tgt_ll = src_px[first], tgt_ll[first]
        print(
            f"  icp iter {it} cap={cap}deg: matched={int(ok.sum())}/{len(coast_px)} "
            f"median={np.median(gc_deg):.2f}deg -> {len(src_px)} pseudo-controls"
        )
        aug_px = np.vstack([anchor_px] * dup + [src_px])
        aug_ll = np.vstack([anchor_ll] * dup + [tgt_ll])

    # final quality: coast match distances through the final fit
    rbf = make_rbf(aug_px, aug_ll, neighbors)
    warped = rbf(coast_px)
    warped /= np.linalg.norm(warped, axis=1, keepdims=True)
    dist, _ = ref_tree.query(warped)
    gc_km = EARTH_RADIUS_KM * 2 * np.arcsin(np.clip(dist / 2, 0, 1))
    med, p90 = float(np.median(gc_km)), float(np.percentile(gc_km, 90))
    print(f"  coast fit: median={med:.1f}km p90={p90:.1f}km")
    return aug_px, aug_ll, med, p90


def build_warp_grid(
    rbf: RBFInterpolator, width: int, height: int, step: int
) -> RegularGridInterpolator:
    """Evaluate the TPS on a coarse pixel grid and wrap it in a bilinear
    interpolator over unit-sphere xyz."""
    gx = np.arange(-1.0, width + step, step, dtype=np.float64)
    gy = np.arange(-1.0, height + step, step, dtype=np.float64)
    mx, my = np.meshgrid(gx, gy, indexing="xy")
    pts = np.stack([mx.ravel(), my.ravel()], axis=1)
    xyz = rbf(pts).reshape(len(gy), len(gx), 3)
    return RegularGridInterpolator((gy, gx), xyz, method="linear")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract lat/lon province-polygon GeoJSON from Imperium "
        "Universalis's provinces.bmp by fitting the map's unknown regional "
        "projection from hand-placed landmark anchors plus coastline ICP."
    )
    parser.add_argument("--mod-map", type=Path, default=DEFAULT_MOD_MAP)
    parser.add_argument("--anchors", type=Path, default=DEFAULT_ANCHORS)
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
        help="coverage-simplify tolerance in map pixels; 0 disables",
    )
    parser.add_argument("--neighbors", type=int, default=64)
    parser.add_argument(
        "--include-sea",
        action="store_true",
        help="also emit sea/lake province polygons (tagged type=sea/lake)",
    )
    args = parser.parse_args()

    print("loading definition.csv + provinces.bmp ...")
    color_to_id = load_color_map(args.mod_map / "definition.csv")
    ids = load_id_raster(args.mod_map / "provinces.bmp", color_to_id)
    height, width = ids.shape
    print(f"  raster {width}x{height}, {len(np.unique(ids)) - 1} province ids present")

    sea_ids = parse_id_set(args.mod_map / "default.map", "sea_starts")
    lake_ids = parse_id_set(args.mod_map / "default.map", "lakes")
    impassable_ids = parse_impassable(args.mod_map / "climate.txt")

    id_to_name = load_localisation_names(args.mod_map.parent)
    print(f"  {len(id_to_name)} province names from localisation")

    print("loading landmark anchors ...")
    anchors = json.loads(args.anchors.read_text(encoding="utf-8"))["anchors"]
    anchor_px = np.array([a["px"] for a in anchors], dtype=np.float64)
    anchor_ll = np.array([a["lonlat"] for a in anchors], dtype=np.float64)
    print(f"  {len(anchor_px)} anchors")

    print("coastline ICP (coarse-to-fine from anchor bootstrap) ...")
    ref_coast = reference_coastline_xyz(args.coastline_topojson)
    coast_px = mod_coast_pixels(ids, sea_ids | lake_ids)
    fit_px, fit_ll, fit_median_km, fit_p90_km = coastline_icp(
        anchor_px, anchor_ll, coast_px, ref_coast, args.neighbors
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
    features = []
    grouped: dict[int, list] = {}
    for p, geom in zip(poly_owner, flat_polys):
        grouped.setdefault(p, []).append(geom)

    def warp_ring(coords: np.ndarray) -> np.ndarray:
        # rasterio vertices are pixel-*corner* coords; the fit was built on
        # pixel-*index* (center - 0.5) coords, hence the half-pixel shift.
        q = np.column_stack([coords[:, 0] - 0.5, coords[:, 1] - 0.5])
        return to_ll(grid(q[:, ::-1]))  # grid takes (y, x)

    for p in sorted(grouped):
        polys_ll = []
        for geom in grouped[p]:
            if geom.is_empty or geom.geom_type != "Polygon":
                continue
            rings = [warp_ring(np.asarray(geom.exterior.coords))]
            rings += [warp_ring(np.asarray(r.coords)) for r in geom.interiors]
            polys_ll.append(
                [[[round(float(x), 5), round(float(y), 5)] for x, y in r] for r in rings]
            )
        if not polys_ll:
            continue
        if p in sea_ids:
            ptype = "sea"
        elif p in lake_ids:
            ptype = "lake"
        elif p in impassable_ids:
            ptype = "wasteland"
        else:
            ptype = "land"
        props = {"id": p, "type": ptype}
        if p in id_to_name:
            props["name"] = id_to_name[p]
        geometry = (
            {"type": "Polygon", "coordinates": polys_ll[0]}
            if len(polys_ll) == 1
            else {"type": "MultiPolygon", "coordinates": polys_ll}
        )
        features.append({"type": "Feature", "properties": props, "geometry": geometry})

    meta = {
        "fit_median_km": round(fit_median_km, 1),
        "fit_p90_km": round(fit_p90_km, 1),
        "anchor_count": len(anchor_px),
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
