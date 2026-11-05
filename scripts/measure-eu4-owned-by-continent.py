import os
import re
import sys

GAME = r"C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV"
START = (1444, 11, 11)
DATED = re.compile(r"(\d+\.\d+\.\d+)\s*=\s*\{([^{}]*(\{[^{}]*\}[^{}]*)*)\}")
REGION_GROUPS = {
    "sub-saharan africa": ["niger_region", "guinea_region", "sahel_region", "horn_of_africa_region", "east_africa_region", "central_africa_region", "kongo_region", "south_africa_region"],
    "siberia": ["west_siberia_region", "east_siberia_region"],
    "maritime southeast asia": ["malaya_region", "moluccas_region", "indonesia_region"],
}


def read(path):
    return re.sub(r"#.*", "", open(path, encoding="latin-1").read())


def top_blocks(text):
    out = {}
    depth = 0
    name = None
    start = 0
    for m in re.finditer(r"(\w+)\s*=\s*\{|\{|\}", text):
        if m.group(0) == "}":
            depth -= 1
            if depth == 0 and name:
                out[name] = text[start:m.start()]
                name = None
            continue
        if depth == 0 and m.group(1):
            name = m.group(1)
            start = m.end()
        depth += 1
    return out


def owner_at_start(text):
    base = re.search(r"\bowner\s*=\s*(\w+)", DATED.sub("", text))
    owner = base.group(1) if base else None
    for m in DATED.finditer(text):
        date = tuple(int(x) for x in m.group(1).split("."))
        found = re.search(r"\bowner\s*=\s*(\w+)", m.group(2))
        if date <= START and found:
            owner = found.group(1)
    return owner


def table(title, groups, owned_of):
    owned = sum(r[0] for r in groups.values())
    land = sum(sum(r) for r in groups.values())
    print(f"{title:<26}{'owned':>7}{'free':>7}{'owned%':>8}{'%ofOwned':>10}{'%ofLand':>9}")
    for c, (o, f) in sorted(groups.items(), key=lambda kv: -sum(kv[1])):
        print(f"{c:<26}{o:>7}{f:>7}{100 * o / (o + f):>8.1f}{100 * o / owned_of:>10.1f}{100 * (o + f) / land:>9.1f}")


game = sys.argv[1] if len(sys.argv) > 1 else GAME
continents = top_blocks(read(os.path.join(game, "map", "continent.txt")))
continent_of = {int(n): c for c, body in continents.items() for n in re.findall(r"\d+", body)}
climate = top_blocks(read(os.path.join(game, "map", "climate.txt")))
wasteland = {int(n) for n in re.findall(r"\d+", climate.get("impassable", ""))}
areas = top_blocks(read(os.path.join(game, "map", "area.txt")))
regions = top_blocks(read(os.path.join(game, "map", "region.txt")))
group_of = {}
for group, names in REGION_GROUPS.items():
    for region in names:
        for area in re.findall(r"\b(\w+_area)\b", regions.get(region, "")):
            for n in re.findall(r"\d+", areas.get(area, "")):
                group_of[int(n)] = group

by_continent = {}
by_group = {}
folder = os.path.join(game, "history", "provinces")
for name in os.listdir(folder):
    m = re.match(r"(\d+)", name)
    if not m:
        continue
    pid = int(m.group(1))
    if pid in wasteland or pid not in continent_of:
        continue
    slot = 0 if owner_at_start(read(os.path.join(folder, name))) else 1
    by_continent.setdefault(continent_of[pid], [0, 0])[slot] += 1
    if pid in group_of:
        by_group.setdefault(group_of[pid], [0, 0])[slot] += 1

owned = sum(r[0] for r in by_continent.values())
land = sum(sum(r) for r in by_continent.values())
table("continent", by_continent, owned)
print(f"{'total':<26}{owned:>7}{land - owned:>7}{100 * owned / land:>8.1f}")
print()
table("region group", by_group, owned)
