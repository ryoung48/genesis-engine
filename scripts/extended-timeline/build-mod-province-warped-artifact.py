"""Builds the standalone HTML artifact that visualizes
eu4-extended-timeline.json (the raw TPS-warped fit, before the grid-snap
alignment pass), by filling eu4-map-artifact-warped.template.html with the
province data and fit-quality stats from a build-mod-province-geojson.py run.

Sibling of build-mod-province-artifact.py, which visualizes the aligned
(grid-snapped) output instead. Use this one when you want to see the warp's
own fit error against the vanilla reference, rather than the exact-match
result.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_INPUT = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline.json"
)
DEFAULT_TEMPLATE = HERE / "eu4-map-artifact-warped.template.html"
DEFAULT_REFDATA = HERE / "artifact-assets" / "eu4-vanilla-outlines.json"
DEFAULT_OUTPUT = HERE / "eu4-extended-timeline-warped-artifact.html"


def ring_to_flat(ring: list[list[float]]) -> list[int]:
    flat = []
    for x, y in ring:
        flat.append(round(x * 100))
        flat.append(round(y * 100))
    return flat


def build_feats(geojson: dict) -> tuple[list[dict], int, int]:
    feats = []
    vertex_count = 0
    relocated_count = 0
    for f in geojson["features"]:
        p = f["properties"]
        if p.get("type") != "land":
            continue
        geom = f["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
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
        if p.get("relocated"):
            entry["r"] = 1
            relocated_count += 1
        feats.append(entry)
    return feats, vertex_count, relocated_count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--template", type=Path, default=DEFAULT_TEMPLATE)
    parser.add_argument("--refdata", type=Path, default=DEFAULT_REFDATA)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    geojson = json.loads(args.input.read_text(encoding="utf-8"))
    meta = geojson.get("meta", {})

    feats, vertex_count, relocated_count = build_feats(geojson)
    if "relocated_count" in meta and meta["relocated_count"] != relocated_count:
        print(
            f"note: meta.relocated_count={meta['relocated_count']} but "
            f"{relocated_count} land features are flagged relocated (some "
            "relocated ids are sea/lake and excluded from the map)"
        )

    refdata = json.loads(args.refdata.read_text(encoding="utf-8"))

    template = args.template.read_text(encoding="utf-8")
    filled = (
        template.replace("__FEATS_JSON__", json.dumps({"feats": feats}, separators=(",", ":")))
        .replace("__REFDATA_JSON__", json.dumps(refdata, separators=(",", ":")))
        .replace("__PROVINCE_COUNT__", f"{len(feats):,}")
        .replace("__VERTEX_COUNT__", f"{vertex_count:,}")
        .replace("__FIT_MEDIAN_KM__", str(meta.get("fit_median_km", "?")))
        .replace("__FIT_P90_KM__", str(meta.get("fit_p90_km", "?")))
        .replace("__RELOCATED_COUNT__", str(meta.get("relocated_count", relocated_count)))
        .replace("__RASTER_WIDTH__", str(meta.get("raster_width", "?")))
        .replace("__RASTER_HEIGHT__", str(meta.get("raster_height", "?")))
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(filled, encoding="utf-8")
    print(f"wrote {len(feats)} provinces, {vertex_count} vertices -> {args.output}")


if __name__ == "__main__":
    main()
