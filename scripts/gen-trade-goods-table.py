#!/usr/bin/env python3
# Builds src/model/society/infrastructure/trade/trade-goods-table/index.ts from
# the EU5toGIS dataset (DavidRMilos): location raw materials from
# locations.gpkg, coastal = the location has a port in ports.gpkg. Oil and gas
# come from PRIO's PETRODATA onshore field polygons (Lujala, Rød & Thieme 2007).
#
#   python -I scripts/gen-trade-goods-table.py [EU5toGIS datasets dir] [PETRODATA dir]

import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely import wkb
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

DEFAULT_DATASETS = Path(r"C:\Users\rayou\Downloads\EU5toGIS\EU5toGIS\datasets")
DEFAULT_PETRODATA = Path(r"C:\Users\rayou\Downloads\PETRODATA")
OUT_PATH = (
    Path(__file__).parent.parent
    / "src/model/society/infrastructure/trade/trade-goods-table/index.ts"
)

LABELS = [
    "none", "alum", "beeswax", "clay", "coal", "cocoa", "coffee",
    "copper", "cotton", "dyes", "fiber_crops", "fish", "fruit",
    "fur", "gems", "goods_gold", "grain", "horses", "incense", "iron", "ivory",
    "lead", "legumes", "livestock", "lumber", "marble", "medicaments",
    "mercury", "oil_and_gas", "olives", "pearls", "salt", "saltpeter", "sand",
    "silk", "silver", "spices", "stone", "sugar", "tea", "tin", "tobacco",
    "wild_game", "wine", "wool",
]

# EU5 goods left out: their locations are not counted, so each row spreads
# that weight over its other goods.
DROPPED = {"elephants"}

# EU5's regional variants merged into one good each: placement cannot tell
# their regions apart, so one grain, one spice and one gem good stand for all
# of them (amber is an ornamental gem material, Baltic-only in EU5).
MERGED = {
    "wheat": "grain",
    "rice": "grain",
    "millet": "grain",
    "maize": "grain",
    "potato": "grain",
    "pepper": "spices",
    "cloves": "spices",
    "saffron": "spices",
    "chili": "spices",
    "amber": "gems",
}

CLIMATES = {
    "arctic", "arid", "cold_arid", "continental", "oceanic", "subtropical",
    "mediterranean", "tropical",
}
VEGETATION = {
    "desert", "sparse", "grasslands", "farmland", "woods", "forest", "jungle",
}
TOPOGRAPHY = {
    "flatland": "flatland",
    "hills": "hills",
    "plateau": "plateau",
    "mountains": "mountains",
    "mountain_wasteland": "mountains",
    "wetlands": "wetlands",
}


# Oil and gas take coal's EU5 world share: the deposits layer puts coal and oil
# and gas on the same share of land (4.7% of land regions at poor or richer).
# PETRODATA's basin-scale fields cover 12% of EU5 locations, so a location on
# a field counts as a fraction of an oil and gas location, spread by class.
# Offshore fields are left out: offshore production starts in 1947.
OIL_AND_GAS_SHARE_OF = "coal"


def gpkg_geometry(blob: bytes):
    envelope = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(blob[3] >> 1) & 7]
    return wkb.loads(bytes(blob[8 + envelope:]))


def oil_fields(petrodata: Path) -> STRtree:
    reader = shapefile.Reader(
        str(petrodata / "Petrodata_Onshore_V1.2.shp"), encoding="latin-1"
    )
    fields = []
    for record in reader.iterShapes():
        field = shape(record.__geo_interface__)
        fields.append(field if field.is_valid else field.buffer(0))
    return STRtree(fields)


def read_table(datasets: Path, petrodata: Path) -> dict[str, dict[str, float]]:
    ports = sqlite3.connect(str(datasets / "ports.gpkg"))
    coastal_tags = {row[0] for row in ports.execute("select tag from ports")}
    ports.close()

    con = sqlite3.connect(str(datasets / "locations.gpkg"))
    rows = con.execute(
        "select tag, climate, vegetation, topography, raw_material, geom"
        " from locations"
    ).fetchall()
    con.close()

    fields = oil_fields(petrodata)
    # EU5toGIS is in World Gall Stereographic.
    to_lonlat = Transformer.from_crs("ESRI:54016", "EPSG:4326", always_xy=True)
    table: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    on_field: dict[str, int] = defaultdict(int)
    for tag, climate, veg, topo, material, geom in rows:
        if not material or climate not in CLIMATES or veg not in VEGETATION:
            continue
        topo_key = TOPOGRAPHY.get(topo)
        if topo_key is None:
            continue
        coast = "coastal" if tag in coastal_tags else "inland"
        material = MERGED.get(material, material)
        if material in DROPPED:
            continue
        if (
            material == "fish"
            and coast == "inland"
            and climate in ("arid", "cold_arid")
            and topo_key != "wetlands"
        ):
            continue
        key = f"{climate}|{veg}|{topo_key}|{coast}"
        table[key][material] += 1
        point = gpkg_geometry(geom).representative_point()
        lonlat = Point(*to_lonlat.transform(point.x, point.y))
        if any(fields.geometries[i].contains(lonlat) for i in fields.query(lonlat)):
            on_field[key] += 1

    total = sum(sum(dist.values()) for dist in table.values())
    share = sum(dist.get(OIL_AND_GAS_SHARE_OF, 0) for dist in table.values()) / total
    hits = sum(on_field.values())
    per_hit = share * total / (hits * (1 - share))
    for key, count in on_field.items():
        table[key]["oil_and_gas"] += count * per_hit
    print(
        f"oil_and_gas: {hits}/{total:.0f} locations on a field, {per_hit:.4f} each",
        file=sys.stderr,
    )
    return table


# A level's own counts weigh n / (n + BLEND_K) against its parent's mix. At 10
# locations a 10% share has a binomial standard error of about 9.5 points, as
# large as the share, so a row that small takes half its mix from its parent.
BLEND_K = 10
# Blended shares are written as weights per WEIGHT_SCALE; smaller ones dropped.
WEIGHT_SCALE = 1000
TOPOGRAPHY_KEYS = sorted(set(TOPOGRAPHY.values()))
# A good with no EU5 location in a whole vegetation or topography class of at
# least this many locations is kept out of that class's rows. Were its share
# 0.5%, zero in 600 locations would happen about 5% of the time (e^-3).
ABSENT_MIN_LOCATIONS = 600


def normalize(counts: dict[str, float]) -> dict[str, float]:
    total = sum(counts.values())
    return {m: c / total for m, c in counts.items()} if total else {}


def shrink(counts: dict[str, float], parent: dict[str, float]) -> dict[str, float]:
    n = sum(counts.values())
    out = {m: BLEND_K * p for m, p in parent.items()}
    for m, c in counts.items():
        out[m] = out.get(m, 0) + c
    return normalize(out) if n or parent else {}


# Backs each row off to the same climate, topography and coast over all
# vegetation, then to the same climate and coast, keeping coast at every level
# so coastal goods never reach inland rows.
def absent(table: dict[str, dict[str, float]], field: int) -> dict[str, set[str]]:
    counts: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for key, dist in table.items():
        for m, c in dist.items():
            counts[key.split("|")[field]][m] += c
    goods = {m for dist in table.values() for m in dist}
    return {
        cls: goods - {m for m, c in dist.items() if c > 0}
        for cls, dist in counts.items()
        if sum(dist.values()) >= ABSENT_MIN_LOCATIONS
    }


def blend(table: dict[str, dict[str, float]]) -> dict[str, dict[str, int]]:
    absent_veg = absent(table, 1)
    absent_topo = absent(table, 2)
    by_topo: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    by_climate: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for key, dist in table.items():
        climate, _, topo, coast = key.split("|")
        for m, c in dist.items():
            by_topo[f"{climate}|{topo}|{coast}"][m] += c
            by_climate[f"{climate}|{coast}"][m] += c
    out: dict[str, dict[str, int]] = {}
    for climate in sorted(CLIMATES):
        for coast in ("coastal", "inland"):
            top = normalize(by_climate.get(f"{climate}|{coast}", {}))
            if not top:
                continue
            for topo in TOPOGRAPHY_KEYS:
                middle = shrink(by_topo.get(f"{climate}|{topo}|{coast}", {}), top)
                for veg in sorted(VEGETATION):
                    key = f"{climate}|{veg}|{topo}|{coast}"
                    banned = absent_veg.get(veg, set()) | absent_topo.get(topo, set())
                    allowed = {m: p for m, p in middle.items() if m not in banned}
                    mix = shrink(table.get(key, {}), normalize(allowed))
                    weights = {m: round(p * WEIGHT_SCALE) for m, p in mix.items()}
                    out[key] = {m: w for m, w in weights.items() if w > 0}
    return out


def emit_ts(table: dict[str, dict[str, int]]) -> str:
    index = {label: i for i, label in enumerate(LABELS)}
    unknown = {m for dist in table.values() for m in dist} - set(LABELS)
    if unknown:
        raise ValueError(f"materials missing from LABELS: {sorted(unknown)}")
    lines = ["const tradeGoodLabels: readonly string[] = ["]
    lines += [f'\t"{label}",' for label in LABELS]
    lines += [
        "] as const",
        "",
        "export const TRADE_GOODS_TABLE: Readonly<",
        "\tRecord<string, readonly (readonly [number, number])[] | readonly string[]> & {",
        "\t\ttradeGoodLabels: readonly string[]",
        "\t}",
        "> = {",
    ]
    for key in sorted(table):
        lines.append(f'\t"{key}": [')
        for material, count in sorted(table[key].items(), key=lambda x: (-x[1], index[x[0]])):
            lines.append(f"\t\t[{index[material]}, {count}],")
        lines.append("\t],")
    lines += ["\ttradeGoodLabels,", "}", ""]
    return "\n".join(lines)


def main() -> None:
    datasets = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATASETS
    petrodata = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_PETRODATA
    table = blend(read_table(datasets, petrodata))
    with OUT_PATH.open("w", encoding="utf-8", newline="\n") as out:
        out.write(emit_ts(table))
    print(f"{len(table)} rows -> {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
