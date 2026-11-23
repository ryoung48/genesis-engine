import csv
import hashlib
import json
import math
import tempfile
import zipfile
from pathlib import Path

import shapefile
import xlrd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "stats" / "reference-data" / "farming-earth" / "raw"
OUT = ROOT / "stats" / "reference-data" / "farming-earth"

ECKERT_RADIUS_M = 6378137.0
SLICES = {
    "10KBP": -8050,
    "8KBP": -6050,
    "6KBP": -4050,
    "4KBP": -2050,
    "3KBP": -1050,
    "2KBP": -50,
    "1KBP": 950,
    "1500CE": 1500,
}
CATEGORIES = {"FHG": "forage", "PAS": "herd", "EXAGR": "farm", "EXAG": "farm", "INAG": "farm"}

SOURCES = [
    {
        "name": "pinhasi-2005",
        "file": "pinhasi/pinhasi-2005-table-s1.xls",
        "url": "https://journals.plos.org/plosbiology/article/file?type=supplementary&id=10.1371/journal.pbio.0030410.st001",
        "version": "PLoS Biol 3(12): e410, Suppl. Info. 1 (Table S1)",
        "licence": "CC BY (PLOS Biology open access)",
    },
    {
        "name": "archaeoglobe-regions",
        "file": "archaeoglobe-regions/ArchaeGLOBE_Regions.zip",
        "url": "https://dataverse.harvard.edu/api/access/datafile/3196210",
        "version": "doi:10.7910/DVN/CQWUBI, version 6.0",
        "licence": "CC0 1.0",
    },
    {
        "name": "archaeoglobe-consensus",
        "file": "archaeoglobe-data/ARCHAEOGLOBE_CONSENSUS_ASSESSMENT.tab",
        "url": "https://dataverse.harvard.edu/api/access/datafile/3442650?format=original",
        "version": "doi:10.7910/DVN/CNCANQ, version 3.0",
        "licence": "CC0 1.0",
    },
    {
        "name": "cliopatria",
        "file": "cliopatria/cliopatria.geojson.zip",
        "url": "https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/v0.2.1/cliopatria.geojson.zip",
        "version": "GitHub tag v0.2.1 (downloaded, not converted)",
        "licence": "CC BY 4.0",
    },
]


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def eckert_iv_inverse(x, y):
    k = 2 * math.sqrt(math.pi / (4 + math.pi))
    theta = math.asin(max(-1.0, min(1.0, y / (k * ECKERT_RADIUS_M))))
    phi = math.asin(
        max(
            -1.0,
            min(
                1.0,
                (theta + math.sin(theta) * math.cos(theta) + 2 * math.sin(theta))
                / (2 + math.pi / 2),
            ),
        )
    )
    lam = x * math.sqrt(math.pi * (4 + math.pi)) / (
        2 * ECKERT_RADIUS_M * (1 + math.cos(theta))
    )
    return [round(math.degrees(lam), 5), round(math.degrees(phi), 5)]


def convert_pinhasi():
    book = xlrd.open_workbook(RAW / "pinhasi/pinhasi-2005-table-s1.xls")
    sheet = book.sheet_by_index(0)
    header = sheet.row_values(1)
    lat, lon = header.index("Latitude"), header.index("Longitude")
    name, cal = header.index("Site/Centre name"), header.index("CAL C14 BP")
    cal_sd = header.index("CAL_SD")
    rows = []
    for r in range(2, sheet.nrows):
        row = sheet.row_values(r)
        if row[0] != "SITE" or not isinstance(row[cal], float):
            continue
        rows.append(
            [row[name], row[lat], row[lon], row[cal], row[cal_sd] if row[cal_sd] != "" else ""]
        )
    with open(OUT / "pinhasi-2005.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["site", "latitude", "longitude", "cal_bp", "cal_sd"])
        writer.writerows(rows)
    return len(rows)


def convert_regions():
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(RAW / "archaeoglobe-regions/ArchaeGLOBE_Regions.zip") as archive:
            archive.extractall(tmp)
        reader = shapefile.Reader(str(Path(tmp) / "ArchaeGLOBE_Regions"))
        names = [field[0] for field in reader.fields[1:]]
        features = []
        shape_records = reader.shapeRecords()
        reader.close()
        for shape_record in shape_records:
            record = dict(zip(names, shape_record.record))
            points = shape_record.shape.points
            parts = list(shape_record.shape.parts) + [len(points)]
            rings = [
                [eckert_iv_inverse(x, y) for x, y in points[parts[i] : parts[i + 1]]]
                for i in range(len(parts) - 1)
            ]
            features.append(
                {
                    "type": "Feature",
                    "properties": {"id": record["Archaeo_ID"], "name": record["Archaeo_RG"]},
                    "geometry": {"type": "Polygon", "coordinates": rings},
                }
            )
    with open(OUT / "archaeoglobe-regions.geojson", "w", encoding="utf-8") as handle:
        json.dump({"type": "FeatureCollection", "features": features}, handle)
    return len(features)


def convert_landuse():
    rows = []
    with open(
        RAW / "archaeoglobe-data/ARCHAEOGLOBE_CONSENSUS_ASSESSMENT.tab", encoding="latin-1"
    ) as handle:
        reader = csv.DictReader(handle)
        for record in reader:
            for column, level in record.items():
                if column in ("Region", "Label") or level is None:
                    continue
                prefix, _, slice_name = column.partition("_")
                if prefix not in CATEGORIES or slice_name.upper() not in SLICES:
                    continue
                rows.append(
                    [
                        record["Region"],
                        record["Label"],
                        prefix,
                        CATEGORIES[prefix],
                        slice_name.upper(),
                        SLICES[slice_name.upper()],
                        level,
                    ]
                )
    with open(OUT / "archaeoglobe-landuse.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["region_id", "region", "column", "way_of_life", "slice", "astro_year", "level"])
        writer.writerows(rows)
    return len(rows)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    counts = {
        "pinhasi_sites": convert_pinhasi(),
        "archaeoglobe_regions": convert_regions(),
        "archaeoglobe_landuse_rows": convert_landuse(),
    }
    sources = [{**source, "sha256": sha256(RAW / source["file"])} for source in SOURCES]
    with open(OUT / "sources.json", "w", encoding="utf-8") as handle:
        json.dump({"sources": sources, "counts": counts}, handle, indent=2)
    print(json.dumps(counts))


if __name__ == "__main__":
    main()
