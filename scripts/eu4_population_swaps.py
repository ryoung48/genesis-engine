"""Shared province-population corrections, applied as a postprocessing step
after regenerating public/heightmap/earth-real-population-eu4.* and
earth-real-urban-population-eu4.* from the Stadester rasters
(build-stadester-population-eu4.py). A handful of provinces have their
total- and urban-population data mismatched at the source; this swaps the
listed province pairs' entire timelines (both datasets) with each other.

To add another swap, add a tuple here -- scripts/regenerate-earth-population.py
runs this automatically every time it regenerates population, so there's
nothing else to remember.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

POPULATION_PROVINCE_SWAPS: list[tuple[int, int]] = [(151, 316)]


def _load(output_dir: Path, prefix: str) -> tuple[dict, np.ndarray, Path]:
    meta_path = output_dir / f"{prefix}.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    bin_path = output_dir / meta["bin"]
    values = np.fromfile(bin_path, dtype="<i2").reshape(
        meta["timeCount"], meta["provinceCount"]
    )
    return meta, values, bin_path


def _swap_columns(
    meta: dict, values: np.ndarray, province_a: int, province_b: int
) -> np.ndarray:
    id_to_index = {pid: i for i, pid in enumerate(meta["rawProvinceIds"])}
    index_a = id_to_index.get(province_a)
    index_b = id_to_index.get(province_b)
    if index_a is None:
        raise KeyError(f"Province {province_a} not found")
    if index_b is None:
        raise KeyError(f"Province {province_b} not found")

    values = values.copy()
    col_a = values[:, index_a].copy()
    col_b = values[:, index_b].copy()
    values[:, index_a] = col_b
    values[:, index_b] = col_a
    return values


def apply_population_swaps_to_prefix(output_dir: Path, prefix: str) -> None:
    """Apply POPULATION_PROVINCE_SWAPS to a single asset prefix exactly once
    against freshly generated, unswapped data."""
    meta, values, bin_path = _load(output_dir, prefix)

    for province_a, province_b in POPULATION_PROVINCE_SWAPS:
        values = _swap_columns(meta, values, province_a, province_b)

    values.astype("<i2", copy=False).tofile(bin_path)


def apply_population_swaps(
    output_dir: Path,
    total_prefix: str,
    urban_prefix: str,
) -> None:
    """Applies every pair in POPULATION_PROVINCE_SWAPS to both the total-
    and urban-population assets. Must only be run once against freshly
    (re)generated, unswapped data -- running it twice against the same
    files would swap the pairs back."""
    apply_population_swaps_to_prefix(output_dir, total_prefix)
    apply_population_swaps_to_prefix(output_dir, urban_prefix)
