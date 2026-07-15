"""Builds the standalone HTML artifact that visualizes
eu4-extended-timeline-aligned.json, by filling scripts/eu4-map-artifact.template.html
with the province data and stats from a build-mod-province-aligned.py run.

The template holds everything static: styles, layout, and the canvas
rendering JS (pan/zoom/hover, reading the mod's data from a `#data` script
tag and the unchanging vanilla-EU4 reference outlines from a `#refdata`
script tag). This script only fills in what changes between runs: the
compact per-province feature list and the header stats.

The reference outlines (vanilla EU4 province borders, scaled lon/lat*100
per ring) don't depend on the mod at all, so they're a static checked-in
asset (artifact-assets/eu4-vanilla-outlines.json) rather than rebuilt here.

Usage: run build-mod-province-geojson.py then build-mod-province-aligned.py
first, then this script, then publish the output HTML as a Claude Artifact
(same URL, to update in place).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_INPUT = Path(
    r"c:\Users\rayou\projects\geo-explorer\public\eu4-extended-timeline-aligned.json"
)
DEFAULT_TEMPLATE = HERE / "eu4-map-artifact.template.html"
DEFAULT_REFDATA = HERE / "artifact-assets" / "eu4-vanilla-outlines.json"
DEFAULT_OUTPUT = HERE / "eu4-extended-timeline-artifact.html"
DEFAULT_GRID_RESOLUTION_DEG = 0.04


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
    parser.add_argument(
        "--grid-resolution-deg", type=float, default=DEFAULT_GRID_RESOLUTION_DEG
    )
    args = parser.parse_args()

    geojson = json.loads(args.input.read_text(encoding="utf-8"))

    feats, vertex_count, relocated_count = build_feats(geojson)

    refdata = json.loads(args.refdata.read_text(encoding="utf-8"))

    template = args.template.read_text(encoding="utf-8")
    filled = (
        template.replace("__FEATS_JSON__", json.dumps({"feats": feats}, separators=(",", ":")))
        .replace("__REFDATA_JSON__", json.dumps(refdata, separators=(",", ":")))
        .replace("__PROVINCE_COUNT__", f"{len(feats):,}")
        .replace("__VERTEX_COUNT__", f"{vertex_count:,}")
        .replace("__GRID_RESOLUTION_DEG__", str(args.grid_resolution_deg))
        .replace("__RELOCATED_COUNT__", str(relocated_count))
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(filled, encoding="utf-8")
    print(f"wrote {len(feats)} provinces, {vertex_count} vertices -> {args.output}")


if __name__ == "__main__":
    main()
