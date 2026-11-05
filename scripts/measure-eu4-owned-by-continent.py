import os
import re
import sys

GAME = sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV"
START = (1444, 11, 11)
DATED = re.compile(r"(\d+\.\d+\.\d+)\s*=\s*\{([^{}]*(\{[^{}]*\}[^{}]*)*)\}")


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


continents = top_blocks(read(os.path.join(GAME, "map", "continent.txt")))
continent_of = {int(n): c for c, body in continents.items() for n in re.findall(r"\d+", body)}
climate = top_blocks(read(os.path.join(GAME, "map", "climate.txt")))
wasteland = {int(n) for n in re.findall(r"\d+", climate.get("impassable", ""))}

counts = {}
folder = os.path.join(GAME, "history", "provinces")
for name in os.listdir(folder):
    m = re.match(r"(\d+)", name)
    if not m:
        continue
    pid = int(m.group(1))
    if pid in wasteland or pid not in continent_of:
        continue
    row = counts.setdefault(continent_of[pid], [0, 0])
    row[0 if owner_at_start(read(os.path.join(folder, name))) else 1] += 1

owned = sum(r[0] for r in counts.values())
land = sum(sum(r) for r in counts.values())
print(f"{'continent':<24}{'owned':>7}{'free':>7}{'owned%':>8}{'%ofOwned':>10}{'%ofLand':>9}")
for c, (o, f) in sorted(counts.items(), key=lambda kv: -sum(kv[1])):
    print(f"{c:<24}{o:>7}{f:>7}{100 * o / (o + f):>8.1f}{100 * o / owned:>10.1f}{100 * (o + f) / land:>9.1f}")
print(f"{'total':<24}{owned:>7}{land - owned:>7}{100 * owned / land:>8.1f}")
