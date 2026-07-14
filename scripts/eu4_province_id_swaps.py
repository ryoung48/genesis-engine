"""Shared province-id corrections for the EU4 GeoJSON (geo-explorer's
eu4.json): every script that rasterizes or vectorizes this file by province
id -- scripts/build-eu4-provinces.py (procedural-mesh mapping, drives
ownership/shape assignment), scripts/build-eu4-province-borders.py (vector
border-line asset), and scripts/build-stadester-population-eu4.py
(total/urban population) -- must apply the same corrections, or they'll
disagree with each other about which shape belongs to which province.

Three kinds of correction:

- PROVINCE_ID_SWAPS: a whole feature's geometry is mislabeled -- the shape
  that should be id A is tagged id B and vice versa. Fixed with
  swap_province_id().
- PROVINCE_ID_RENAMES: a whole feature's id needs to move to a different,
  previously-unused id (one-directional, unlike a swap -- nothing maps back
  to the old id). Used e.g. when a PROVINCE_PART_RELABELS split creates a
  collision with an existing id: the original occupant of that id gets
  renamed out of the way first. Fixed with rename_province_id(), which is
  applied *before* swap_province_id (see the id-resolution line in each
  consuming script).
- PROVINCE_PART_RELABELS: a single feature is a MultiPolygon whose parts are
  actually two unrelated regions that got merged under one id (e.g. two
  chunks of Siberia hundreds of km apart sharing id 1783). One part needs to
  become its own, different id. Identified by axis-aligned bounding box
  since that's cheap and unambiguous for geographically disjoint parts.
  Fixed with split_province_part_rings() (for the raw-GeoJSON-coordinate
  rasterizers) or split_province_part_geom() (for the shapely-based border
  script).

To add another correction, add an entry below and regenerate everything:

    python scripts/regenerate-all-eu4-data.py

Then re-run "Load Earth" in the app -- build-eu4-provinces.py's output is
baked into world generation, not fetched live for an already-generated
world.

A renamed-away province (PROVINCE_ID_RENAMES target) has no real EU4 history
data under its new id, so scripts/build-eu4-history-events.py synthesizes an
empty wasteland entry for it -- see SYNTHETIC_WASTELAND_PROVINCES.
"""

from __future__ import annotations

from typing import Any

PROVINCE_ID_SWAPS: list[tuple[int, int]] = [(4151, 4152), (2230, 4328)]

# Original province 4657 (Korea-area) was displaced when the dateline part of
# 1783 was relabeled to reuse id 4657 (see PROVINCE_PART_RELABELS below) --
# moved here to 4700 (an id above the geojson's max used id, 4693, so it
# can't collide with anything real) and left with no real history, culture,
# or religion (see SYNTHETIC_WASTELAND_PROVINCES).
PROVINCE_ID_RENAMES: dict[int, int] = {4657: 4700}

# Ids from PROVINCE_ID_RENAMES that have no real EU4 province-history file
# (their old id's data stayed with the old id conceptually; the new id is a
# blank slate) -- build-eu4-history-events.py gives these an empty,
# unowned/uncultured/unreligioned wasteland entry instead of silently
# omitting them from provinces.json.
SYNTHETIC_WASTELAND_PROVINCES: list[int] = [4700]

PROVINCE_PART_RELABELS: list[dict[str, Any]] = [
    # Province 1783 is a MultiPolygon with two parts hundreds of km apart --
    # one near the Bering Strait/dateline, one further west in central
    # Siberia. The dateline part becomes its own id, 4657 (freed up by
    # PROVINCE_ID_RENAMES above).
    {"from_id": 1783, "to_id": 4657, "bounds": (-181.0, 63.0, -168.0, 70.0)},
]


def rename_province_id(province_id: int) -> int:
    return PROVINCE_ID_RENAMES.get(province_id, province_id)


def swap_province_id(province_id: int) -> int:
    for a, b in PROVINCE_ID_SWAPS:
        if province_id == a:
            return b
        if province_id == b:
            return a
    return province_id


def _ring_bounds(exterior: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    lons = [c[0] for c in exterior]
    lats = [c[1] for c in exterior]
    return min(lons), min(lats), max(lons), max(lats)


def _bounds_within(
    inner: tuple[float, float, float, float], outer: tuple[float, float, float, float]
) -> bool:
    ix0, iy0, ix1, iy1 = inner
    ox0, oy0, ox1, oy1 = outer
    return ix0 >= ox0 and iy0 >= oy0 and ix1 <= ox1 and iy1 <= oy1


def split_province_part_rings(
    province_id: int,
    polygons_coords: list,
) -> list[tuple[int, list]]:
    """For the raw-GeoJSON-coordinate rasterizers (build-eu4-provinces.py,
    build-stadester-population-eu4.py): polygons_coords is the per-part list
    already extracted from feat["geometry"]["coordinates"] (one entry per
    Polygon part, each itself [exterior_ring, *hole_rings] of raw [lon, lat]
    pairs). Returns [(id, polygons_coords_subset), ...] -- most provinces
    return unchanged as a single-entry list."""
    relabels = [r for r in PROVINCE_PART_RELABELS if r["from_id"] == province_id]
    if not relabels:
        return [(province_id, polygons_coords)]

    remaining = list(polygons_coords)
    result: list[tuple[int, list]] = []
    for relabel in relabels:
        matched = []
        kept = []
        for rings in remaining:
            if _bounds_within(_ring_bounds(rings[0]), relabel["bounds"]):
                matched.append(rings)
            else:
                kept.append(rings)
        remaining = kept
        if matched:
            result.append((relabel["to_id"], matched))
    if remaining:
        result.append((province_id, remaining))
    return result


def split_province_part_geom(province_id: int, geom: Any) -> list[tuple[int, Any]]:
    """For the shapely-based border script (build-eu4-province-borders.py):
    geom is a shapely Polygon/MultiPolygon. Returns [(id, geometry), ...] --
    most provinces return unchanged as a single-entry list."""
    import shapely

    relabels = [r for r in PROVINCE_PART_RELABELS if r["from_id"] == province_id]
    if not relabels or geom.geom_type != "MultiPolygon":
        return [(province_id, geom)]

    remaining = list(geom.geoms)
    result: list[tuple[int, Any]] = []
    for relabel in relabels:
        matched = []
        kept = []
        for part in remaining:
            if _bounds_within(part.bounds, relabel["bounds"]):
                matched.append(part)
            else:
                kept.append(part)
        remaining = kept
        if matched:
            new_geom = matched[0] if len(matched) == 1 else shapely.MultiPolygon(matched)
            result.append((relabel["to_id"], new_geom))
    if remaining:
        base_geom = remaining[0] if len(remaining) == 1 else shapely.MultiPolygon(remaining)
        result.append((province_id, base_geom))
    return result
