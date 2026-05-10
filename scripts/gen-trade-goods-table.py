#!/usr/bin/env python3
"""
Generate src/model/economy/trade-goods-table.ts from the distribution xlsx.

Usage:
    python scripts/gen-trade-goods-table.py \
        "C:/Users/rayou/Downloads/raw_material_distribution_by_climate_veg_topo_coastal.xlsx"

The script reads the `full_distribution` sheet, applies the climate-mapping
rules agreed with the design, merges duplicate keys, and emits a TypeScript
module with:
  - TRADE_GOOD_LABELS: readonly string[]        — 53 entries, index 0 = "none"
  - TRADE_GOODS_TABLE: Record<string, readonly [number, number][]>
      key   = "<climateKey>|<vegKey>|<topoKey>|<coastalKey>"
      value = pairs of [materialIndex (1-based), weight]
"""

import sys
from collections import defaultdict
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("openpyxl not found — installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl

# ── climate merging: spreadsheet value → internal key ───────────────────────
# The full_distribution sheet already has arid/cold_arid as climate values.
# We only need to merge continental+oceanic and subtropical+mediterranean.
CLIMATE_MAP: dict[str, str | None] = {
    "arctic":        "arctic",
    "arid":          "arid",
    "cold_arid":     "cold_arid",
    "continental":   "continental",
    "oceanic":       "oceanic",
    "subtropical":   "subtropical",
    "mediterranean": "mediterranean",
    "tropical":      "tropical",
}

# ── vegetation: spreadsheet → internal ─────────────────────────────────────
VEG_MAP: dict[str, str | None] = {
    "desert":     "desert",
    "sparse":     "sparse",
    "grasslands": "grasslands",
    "woods":      "woods",
    "forest":     "forest",
    "jungle":     "jungle",
    "farmland":   None,   # skip
}

# ── topography: spreadsheet → internal ─────────────────────────────────────
TOPO_MAP: dict[str, str | None] = {
    "flatland":           "flatland",
    "hills":              "hills",
    "plateau":            "plateau",
    "mountains":          "mountains",
    "mountain_wasteland": "mountains",
    "wetlands":           "wetlands",
    "marsh":              "wetlands",
    "atoll":              None,   # skip
    "ocean":              None,
    "lake":               None,
}


def parse_xlsx(path: str) -> tuple[list[str], dict[str, dict[str, int]]]:
    """
    Returns:
        materials: sorted list of unique material names
        table: { combo_key: { material_name: count } }
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if "full_distribution" not in wb.sheetnames:
        raise ValueError(f"Sheet 'full_distribution' not found. Sheets: {wb.sheetnames}")
    ws = wb["full_distribution"]

    rows = ws.iter_rows(values_only=True)
    next(rows)  # skip header row 1 (column names)
    next(rows)  # skip header row 2 (sub-header artefact)

    # Column positions by inspection: climate=0, vegetation=1, topography=2,
    # coastal_status=3, raw_material=4, location_count=5
    CI, VI, TI, OI, MI, NI = 0, 1, 2, 3, 4, 5

    table: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    all_materials: set[str] = set()
    skipped = 0

    for row in rows:
        climate_raw = str(row[CI]).strip().lower() if row[CI] is not None else ""
        veg_raw     = str(row[VI]).strip().lower() if row[VI] is not None else ""
        topo_raw    = str(row[TI]).strip().lower() if row[TI] is not None else ""
        coastal_raw = str(row[OI]).strip().lower() if row[OI] is not None else ""
        material    = str(row[MI]).strip() if row[MI] is not None else ""
        count_raw   = row[NI]
        try:
            count = int(count_raw) if count_raw is not None else 0
        except (ValueError, TypeError):
            count = 0

        if not material or count <= 0:
            skipped += 1
            continue

        climate_key = CLIMATE_MAP.get(climate_raw)
        if climate_key is None:
            skipped += 1
            continue

        veg_key = VEG_MAP.get(veg_raw)
        if veg_key is None:
            skipped += 1
            continue

        topo_key = TOPO_MAP.get(topo_raw)
        if topo_key is None:
            skipped += 1
            continue

        if coastal_raw not in ("coastal", "inland"):
            skipped += 1
            continue

        combo = f"{climate_key}|{veg_key}|{topo_key}|{coastal_raw}"
        table[combo][material] += count
        all_materials.add(material)

    print(f"Skipped rows: {skipped}", file=sys.stderr)
    print(f"Unique combos: {len(table)}", file=sys.stderr)
    print(f"Unique materials: {len(all_materials)}", file=sys.stderr)

    return sorted(all_materials), dict(table)


# ── Post-processing filters ──────────────────────────────────────────────────

def apply_filters(table: dict[str, dict[str, int]]) -> dict[str, dict[str, int]]:
    """
    Remove ecologically implausible trade good assignments.
    Fish inland is only plausible where freshwater is abundant:
      - wetlands topography (rivers/lakes), or
      - non-arid climates (arctic, continental, oceanic, tropical, subtropical)
    Remove fish from arid/cold_arid inland entries that lack wetlands.
    """
    result: dict[str, dict[str, int]] = {}
    for combo, dist in table.items():
        parts = combo.split("|")
        if len(parts) == 4:
            climate, _veg, topo, coastal = parts
            if (
                coastal == "inland"
                and climate in ("arid", "cold_arid")
                and topo != "wetlands"
                and "fish" in dist
            ):
                dist = {m: c for m, c in dist.items() if m != "fish"}
        if dist:
            result[combo] = dist
    return result


def emit_ts(materials: list[str], table: dict[str, dict[str, int]]) -> str:
    # Index 0 = "none", then 1..N = materials
    mat_index = {m: i + 1 for i, m in enumerate(materials)}

    lines: list[str] = []
    lines.append("// AUTO-GENERATED — do not edit. Run scripts/gen-trade-goods-table.py to regenerate.")
    lines.append("")
    lines.append("/**")
    lines.append(" * Trade good names. Index 0 is reserved for 'none' (unassigned).")
    lines.append(" * Indices 1..N correspond to the materials in the distribution table.")
    lines.append(" */")
    lines.append("export const TRADE_GOOD_LABELS: readonly string[] = [")
    lines.append('\t"none",')
    for m in materials:
        escaped = m.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'\t"{escaped}",')
    lines.append("] as const")
    lines.append("")
    lines.append("/**")
    lines.append(" * Weighted distribution table for trade good assignment.")
    lines.append(" * Key format: \"<climate>|<vegetation>|<topography>|<coastal>\"")
    lines.append(" * Value: pairs of [materialIndex, weight] where materialIndex is 1-based")
    lines.append(" * into TRADE_GOOD_LABELS and weight is the raw location_count.")
    lines.append(" */")
    lines.append("export const TRADE_GOODS_TABLE: Readonly<Record<string, readonly (readonly [number, number])[]>> = {")

    for combo in sorted(table.keys()):
        dist = table[combo]
        # Sort by descending weight for readability
        pairs = sorted(dist.items(), key=lambda x: -x[1])
        parts = ", ".join(f"[{mat_index[m]}, {cnt}]" for m, cnt in pairs)
        lines.append(f'\t"{combo}": [{parts}],')

    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    if len(sys.argv) < 2:
        xlsx_path = r"C:\Users\rayou\Downloads\raw_material_distribution_by_climate_veg_topo_coastal.xlsx"
        print(f"No path given, using default: {xlsx_path}", file=sys.stderr)
    else:
        xlsx_path = sys.argv[1]

    out_path = Path(__file__).parent.parent / "src" / "model" / "economy" / "trade-goods-table.ts"

    print(f"Reading {xlsx_path} ...", file=sys.stderr)
    materials, table = parse_xlsx(xlsx_path)
    table = apply_filters(table)
    # Recompute materials list after filtering (some may have been fully removed)
    all_materials: set[str] = set()
    for dist in table.values():
        all_materials.update(dist.keys())
    materials = sorted(all_materials)

    ts = emit_ts(materials, table)
    out_path.write_text(ts, encoding="utf-8")
    print(f"Written {out_path}", file=sys.stderr)
    print(f"  {len(materials)} materials, {len(table)} table entries", file=sys.stderr)


if __name__ == "__main__":
    main()
