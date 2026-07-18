"""Builds the standalone HTML artifact that visualizes eu4-imperialis.json
(the anchor-bootstrapped, coastline-ICP-warped Imperium Universalis
extraction) by filling eu4-map-artifact-warped.template.html with the
province data, the Natural Earth coastline it was fitted against, the
hand-placed landmark anchors, and the coast-fit stats from a
build-mod-province-geojson.py run.

Sibling of ../build-mod-province-warped-artifact.py (extended timeline),
which overlays vanilla EU4 outlines instead -- meaningless here since IU
shares no province ids with vanilla; the honest reference to show is the
coastline the ICP actually snapped to.
"""

from __future__ import annotations

import argparse
import html
import importlib
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
DEFAULT_INPUT = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-imperialis.json"
)
DEFAULT_TEMPLATE = HERE / "eu4-map-artifact-warped.template.html"
DEFAULT_COASTLINE_TOPOJSON = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\land-50m.json"
)
DEFAULT_ANCHORS = HERE / "anchor-landmarks.json"
DEFAULT_OUTPUT = HERE / "eu4-imperialis-warped-artifact.html"

# the artifact only shows the Old World; clip the global coastline to the
# data's neighborhood so the refdata payload stays small
COAST_BBOX = (-40.0, -20.0, 175.0, 85.0)  # lon0, lat0, lon1, lat1
SAMPLE_PREFERRED_NAMES = ("Roma", "Athenai", "Alexandreia", "Babylon", "Karthago", "Aquileia")


def ring_to_flat(ring: list[list[float]]) -> list[int]:
    flat = []
    for x, y in ring:
        flat.append(round(x * 100))
        flat.append(round(y * 100))
    return flat


def build_feats(geojson: dict, topo_path: Path) -> tuple[list[dict], int, int]:
    """Land + wasteland features in the template's compact format. Wasteland
    (type from climate.txt's impassable list) is included muted when it is
    real terrain (Sahara, Altai) but skipped when its centroid falls in the
    ocean -- IU paints giant impassable filler provinces over the map-border
    oceans, and those warp into extrapolated smears."""
    import shapely
    from shapely.prepared import prep

    sys.path.insert(0, str(HERE))
    bmg = importlib.import_module("build-mod-province-geojson")
    land = prep(bmg.load_topojson_land(topo_path).buffer(0.3))

    feats = []
    waste_feats = []
    vertex_count = 0
    skipped_ocean_waste = 0
    for f in geojson["features"]:
        p = f["properties"]
        ptype = p.get("type")
        if ptype not in ("land", "wasteland"):
            continue
        geom = f["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        if ptype == "wasteland":
            # Keep only wasteland whose *interior* is mostly on real land.
            # Centroids and boundary vertices both mislead here: IU's ocean
            # fillers hug coastlines at their edges and can center onshore
            # (the Atlantic band crosses Iberia), while the Sahara and the
            # Siberia band are honest terrain. Grid-sample inside the shape.
            shp = shapely.union_all(
                [shapely.Polygon(poly[0]).buffer(0) for poly in polys]
            )
            x0, y0, x1, y1 = shp.bounds
            gx, gy = np.meshgrid(np.linspace(x0, x1, 14), np.linspace(y0, y1, 14))
            pts = shapely.points(gx.ravel(), gy.ravel())
            inside = pts[shapely.contains(shp, pts)]
            if len(inside) == 0:
                inside = [shp.representative_point()]
            on_land = sum(land.contains(pt) for pt in inside)
            if on_land < 0.45 * len(inside):
                skipped_ocean_waste += 1
                continue
        pj = []
        for poly in polys:
            rings = []
            for ring in poly:
                vertex_count += len(ring)
                rings.append(ring_to_flat(ring))
            pj.append(rings)
        entry = {"i": p["id"], "p": pj}
        if "name" in p:
            entry["n"] = p["name"]
        if ptype == "wasteland":
            entry["w"] = 1
            waste_feats.append(entry)
        else:
            feats.append(entry)
    # wasteland first so land always paints over it -- the surviving
    # wasteland giants (Sahara, the Siberia band) warp into smears that
    # would otherwise cover half a continent's provinces
    return waste_feats + feats, vertex_count, skipped_ocean_waste


def coastline_rings(topo_path: Path) -> list[list[int]]:
    """Natural Earth land rings clipped to the Old World bbox, as the flat
    int format the template renders (lon*100, lat*100 pairs)."""
    with topo_path.open(encoding="utf-8") as f:
        topo = json.load(f)
    scale = topo["transform"]["scale"]
    translate = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        d = np.array(arc, dtype=np.float64)
        xy = np.cumsum(d, axis=0)
        xy[:, 0] = xy[:, 0] * scale[0] + translate[0]
        xy[:, 1] = xy[:, 1] * scale[1] + translate[1]
        arcs.append(xy)
    (obj,) = topo["objects"].values()
    (geom,) = obj["geometries"] if obj["type"] == "GeometryCollection" else [obj]
    lon0, lat0, lon1, lat1 = COAST_BBOX
    rings = []
    for poly_arcs in geom["arcs"]:
        for ring_arcs in poly_arcs:
            pts = np.concatenate(
                [arcs[i] if i >= 0 else arcs[~i][::-1] for i in ring_arcs]
            )
            if (
                pts[:, 0].max() < lon0 or pts[:, 0].min() > lon1
                or pts[:, 1].max() < lat0 or pts[:, 1].min() > lat1
            ):
                continue
            rings.append(ring_to_flat(pts))
    return rings


def pick_sample(geojson: dict) -> dict | None:
    """A real land feature for the notes column, preferring a famous name."""
    land = [
        f for f in geojson["features"]
        if f["properties"].get("type") == "land" and "name" in f["properties"]
    ]
    for want in SAMPLE_PREFERRED_NAMES:
        for f in land:
            if f["properties"]["name"] == want:
                return f
    return land[0] if land else None


def sample_record_html(feat: dict) -> str:
    """The highlighted <pre> body: real properties, first three coordinates,
    an ellipsis for the rest."""
    p = feat["properties"]
    geom = feat["geometry"]
    ring = geom["coordinates"][0]
    if geom["type"] == "MultiPolygon":
        ring = ring[0]
    coords = "\n".join(f"      [{x:.5f}, {y:.5f}]," for x, y in ring[:3])
    name = html.escape(json.dumps(p["name"], ensure_ascii=False))
    open_b = "[[[" if geom["type"] == "MultiPolygon" else "[["
    close_b = "]]]" if geom["type"] == "MultiPolygon" else "]]"
    return f"""<span class="k">{{</span>
  <span class="k">"type"</span>: <span class="s">"Feature"</span>,
  <span class="k">"properties"</span>: <span class="k">{{</span>
    <span class="k">"id"</span>: {p["id"]},
    <span class="k">"type"</span>: <span class="s">"land"</span>,
    <span class="k">"name"</span>: <span class="s">{name}</span>
  <span class="k">}}</span>,
  <span class="k">"geometry"</span>: <span class="k">{{</span>
    <span class="k">"type"</span>: <span class="s">"{geom["type"]}"</span>,
    <span class="k">"coordinates"</span>: <span class="k">{open_b}</span>
{coords}
      …
    <span class="k">{close_b}</span>
  <span class="k">}}</span>
<span class="k">}}</span>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--template", type=Path, default=DEFAULT_TEMPLATE)
    parser.add_argument("--coastline-topojson", type=Path, default=DEFAULT_COASTLINE_TOPOJSON)
    parser.add_argument("--anchors", type=Path, default=DEFAULT_ANCHORS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    geojson = json.loads(args.input.read_text(encoding="utf-8"))
    meta = geojson.get("meta", {})

    feats, vertex_count, skipped = build_feats(geojson, args.coastline_topojson)
    if skipped:
        print(f"skipped {skipped} ocean-centroid wasteland fillers")
    refdata = coastline_rings(args.coastline_topojson)

    anchors = json.loads(args.anchors.read_text(encoding="utf-8"))["anchors"]
    anchors_flat = [
        [a["name"], round(a["lonlat"][0] * 100), round(a["lonlat"][1] * 100)]
        for a in anchors
    ]

    sample = pick_sample(geojson)
    sample_html = sample_record_html(sample) if sample else "(no land features)"

    template = args.template.read_text(encoding="utf-8")
    filled = (
        template.replace("__FEATS_JSON__", json.dumps({"feats": feats}, separators=(",", ":")))
        .replace("__REFDATA_JSON__", json.dumps(refdata, separators=(",", ":")))
        .replace("__ANCHORS_JSON__", json.dumps(anchors_flat, separators=(",", ":")))
        .replace("__SAMPLE_RECORD__", sample_html)
        .replace("__PROVINCE_COUNT__", f"{len(feats):,}")
        .replace("__VERTEX_COUNT__", f"{vertex_count:,}")
        .replace("__FIT_MEDIAN_KM__", str(meta.get("fit_median_km", "?")))
        .replace("__FIT_P90_KM__", str(meta.get("fit_p90_km", "?")))
        .replace("__ANCHOR_COUNT__", str(meta.get("anchor_count", len(anchors_flat))))
        .replace("__RASTER_WIDTH__", str(meta.get("raster_width", "?")))
        .replace("__RASTER_HEIGHT__", str(meta.get("raster_height", "?")))
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(filled, encoding="utf-8")
    print(f"wrote {len(feats)} provinces, {vertex_count} vertices -> {args.output}")


if __name__ == "__main__":
    main()
