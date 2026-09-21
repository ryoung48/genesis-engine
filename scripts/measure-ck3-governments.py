import argparse
import collections
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import clausewitz as cw  # noqa: E402

DEFAULT_GAME_DIR = (
    r"C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game"
)

SIZE_BUCKETS = ["1", "2-4", "5-9", "10-24", "25+"]
TITLE_TIER = {"e": 4, "k": 3, "d": 2, "c": 1}
CLAN_HERITAGES = {"heritage_arabic", "heritage_iranian", "heritage_turkic"}
TITLE_RE = re.compile(r"^[hekdcb]_[A-Za-z0-9_'\-]+$")
TOKEN_RE = re.compile(r"[{}]|[^\s{}=]+|=")

FAMILY = {
    "tribal": "tribal",
    "nomad": "tribal",
    "herder": "tribal",
    "wanua": "tribal",
    "feudal": "feudal",
    "clan": "feudal",
    "mandala": "feudal",
    "japan_feudal": "feudal",
    "landless_adventurer": "feudal",
    "celestial": "bureaucratic",
    "meritocratic": "bureaucratic",
    "steppe_admin": "bureaucratic",
    "japan_administrative": "bureaucratic",
    "administrative": "bureaucratic",
    "republic": "republic",
    "theocracy": "theocracy",
}


def parse_date(key):
    year, month, day = key.split(".")
    return (int(year), int(month), int(day))


def read_text(path):
    try:
        return path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        return path.read_text(encoding="cp1252")


def size_bucket(count):
    if count == 1:
        return "1"
    if count <= 4:
        return "2-4"
    if count <= 9:
        return "5-9"
    if count <= 24:
        return "10-24"
    return "25+"


def share(count, total):
    return f"{count} ({100 * count / total:.1f}%)" if total else f"{count}"


class Ck3World:
    def __init__(self, game_dir, start, byzantium):
        self.game = Path(game_dir)
        self.start = start
        self.byzantium = byzantium
        self.parent = {}
        self.children = collections.defaultdict(list)
        self.capital = {}
        self.provinces = {}
        self.holding = {}
        self.culture = {}
        self.religion = {}
        self.heritage = {}
        self.islam_faiths = set()
        self.state = {}
        self.load_landed_titles()
        self.load_provinces()
        self.load_culture_and_faith()
        self.load_title_history()
        self.counties = [
            title
            for title, entry in self.state.items()
            if title.startswith("c_") and entry["holder"]
        ]
        self.realm_counties = collections.defaultdict(list)
        self.sub_counties = collections.Counter()
        for county in self.counties:
            liege_chain = self.chain(county)
            self.realm_counties[liege_chain[-1]].append(county)
            for title in liege_chain[:-1]:
                self.sub_counties[title] += 1
        self.byzantine_counties = (
            set(self.realm_counties.get("e_byzantium", []))
            if byzantium == "bureaucratic"
            else set()
        )

    def load_landed_titles(self):
        for path in sorted((self.game / "common/landed_titles").glob("*.txt")):
            text = re.sub(r"#[^\n]*", "", read_text(path))
            tokens = TOKEN_RE.findall(text)
            stack = []
            depth = 0
            i = 0
            while i < len(tokens):
                token = tokens[i]
                if token == "{":
                    depth += 1
                elif token == "}":
                    depth -= 1
                    while stack and stack[-1][0] > depth:
                        stack.pop()
                elif (
                    TITLE_RE.match(token)
                    and i + 2 < len(tokens)
                    and tokens[i + 1] == "="
                    and tokens[i + 2] == "{"
                    and (not stack or stack[-1][0] == depth)
                ):
                    if stack:
                        self.parent[token] = stack[-1][1]
                        self.children[stack[-1][1]].append(token)
                    stack.append((depth + 1, token))
                elif (
                    stack
                    and depth == stack[-1][0]
                    and i + 2 < len(tokens)
                    and tokens[i + 1] == "="
                ):
                    if token == "capital":
                        self.capital[stack[-1][1]] = tokens[i + 2]
                    elif token == "province" and tokens[i + 2].isdigit():
                        self.provinces[stack[-1][1]] = tokens[i + 2]
                i += 1

    def load_provinces(self):
        for path in sorted((self.game / "history/provinces").glob("*.txt")):
            for province, body in cw.parse_file(path):
                if not province or not province.isdigit() or not isinstance(body, list):
                    continue
                values = {"holding": None, "culture": None, "religion": None}
                for key, value in body:
                    if key in values:
                        values[key] = value
                dated = sorted(
                    (
                        (parse_date(key), value)
                        for key, value in body
                        if key and cw.is_date_key(key) and isinstance(value, list)
                    ),
                    key=lambda entry: entry[0],
                )
                for date, entries in dated:
                    if date > self.start:
                        break
                    for key, value in entries:
                        if key in values:
                            values[key] = value
                self.holding[province] = values["holding"]
                self.culture[province] = values["culture"]
                self.religion[province] = values["religion"]

    def load_culture_and_faith(self):
        for path in (self.game / "common/culture/cultures").glob("*.txt"):
            current = None
            for line in read_text(path).splitlines():
                match = re.match(r"^([a-z_0-9]+) = \{", line)
                if match:
                    current = match.group(1)
                match = re.match(r"^\s+heritage = (heritage_[a-z_]+)", line)
                if match and current:
                    self.heritage[current] = match.group(1)
        islam = self.game / "common/religion/religion_types/00_islam.txt"
        for line in read_text(islam).splitlines():
            match = re.match(r"^\t\t([a-z_0-9]+) = \{", line)
            if match:
                self.islam_faiths.add(match.group(1))

    def load_title_history(self):
        for path in sorted((self.game / "history/titles").glob("*.txt")):
            for title, body in cw.parse_file(path):
                if not title or not isinstance(body, list):
                    continue
                entry = {"holder": None, "liege": None, "gov": None}
                dated = sorted(
                    (
                        (parse_date(key), value)
                        for key, value in body
                        if key and cw.is_date_key(key) and isinstance(value, list)
                    ),
                    key=lambda item: item[0],
                )
                for date, entries in dated:
                    if date > self.start:
                        break
                    for key, value in entries:
                        if key == "holder":
                            entry["holder"] = None if value in ("0", 0) else value
                            entry["gov"] = None
                        elif key == "liege":
                            entry["liege"] = None if value in ("0", 0) else value
                        elif key == "government":
                            entry["gov"] = value
                self.state[title] = entry

    def chain(self, title):
        result = []
        seen = set()
        while title and title not in seen:
            result.append(title)
            seen.add(title)
            entry = self.state.get(title)
            title = entry["liege"] if entry else None
        return result

    def county_capital_barony(self, county):
        capital = self.capital.get(county)
        if capital and capital in self.provinces:
            return capital
        for barony in self.children.get(county, []):
            if barony.startswith("b_") and barony in self.provinces:
                return barony
        return None

    def capital_county(self, title):
        seen = set()
        while title and not title.startswith("c_") and title not in seen:
            seen.add(title)
            following = self.capital.get(title)
            if not following:
                kids = self.children.get(title, [])
                following = kids[0] if kids else None
            title = following
        return title

    def government_from_holding(self, holding, province):
        culture = self.culture.get(province)
        religion = self.religion.get(province)
        clan = (
            self.heritage.get(culture) in CLAN_HERITAGES and religion in self.islam_faiths
        )
        if holding == "tribal_holding":
            return "tribal"
        if holding == "nomad_holding":
            return "nomad"
        if holding == "herder_holding":
            return "herder"
        if holding == "city_holding":
            return "republic"
        if holding == "church_holding":
            return "theocracy"
        if holding == "temple_citadel_holding":
            return "mandala"
        if holding in ("castle_holding", None, "auto"):
            return "clan" if clan else "feudal"
        return f"other:{holding}"

    def county_government(self, county):
        if county in self.byzantine_counties:
            return "administrative"
        return self.resolved_county_government(county)

    def resolved_county_government(self, county):
        entry = self.state.get(county, {})
        if entry.get("gov"):
            return entry["gov"].replace("_government", "")
        barony = self.county_capital_barony(county)
        province = self.provinces.get(barony) if barony else None
        holding = self.holding.get(province) if province else None
        return self.government_from_holding(holding, province)

    def title_government(self, title):
        if title == "e_byzantium" and self.byzantium == "bureaucratic":
            return "administrative"
        entry = self.state.get(title, {})
        if entry.get("gov"):
            return entry["gov"].replace("_government", "")
        county = self.capital_county(title)
        return self.resolved_county_government(county) if county else "unresolved"


def family(government):
    return FAMILY.get(government, f"other:{government}")


def print_counter(title, counter, total):
    print(f"\n{title}")
    for key, count in counter.most_common():
        print(f"  {key:22s} {share(count, total)}")


def report(world):
    counties = world.counties
    print(
        f"start {'.'.join(map(str, world.start))}  held counties {len(counties)}  "
        f"realms {len(world.realm_counties)}  byzantium {world.byzantium}"
    )

    realms = [
        (top, len(members), world.title_government(top))
        for top, members in world.realm_counties.items()
    ]
    print_counter(
        "REALMS by government",
        collections.Counter(gov for _, _, gov in realms),
        len(realms),
    )
    print_counter(
        "REALMS by family",
        collections.Counter(family(gov) for _, _, gov in realms),
        len(realms),
    )
    by_size = collections.defaultdict(collections.Counter)
    for _, count, gov in realms:
        by_size[size_bucket(count)][family(gov)] += 1
    print("\nREALMS by size, family")
    for bucket in SIZE_BUCKETS:
        counter = by_size[bucket]
        total = sum(counter.values())
        if total:
            print(f"  {bucket:6s} {total:5d}  " + "  ".join(
                f"{key} {share(count, total)}" for key, count in counter.most_common()
            ))

    county_gov = {county: world.county_government(county) for county in counties}
    print_counter(
        "COUNTIES by own holder's government",
        collections.Counter(county_gov.values()),
        len(counties),
    )
    print_counter(
        "COUNTIES by own holder's family",
        collections.Counter(family(gov) for gov in county_gov.values()),
        len(counties),
    )

    realm_of = {}
    for top, members in world.realm_counties.items():
        for county in members:
            realm_of[county] = top
    differing = collections.Counter()
    for county, gov in county_gov.items():
        realm_family = family(world.title_government(realm_of[county]))
        county_family = family(gov)
        if county_family != realm_family:
            differing[(realm_family, county_family)] += 1
    print(
        f"\nCOUNTIES whose family differs from their realm's: "
        f"{share(sum(differing.values()), len(counties))}"
    )
    for (realm_family, county_family), count in differing.most_common():
        print(f"  realm {realm_family:13s} -> county {county_family:13s} {count}")

    top_titles = set(world.realm_counties)
    top_holders = {
        world.state[title]["holder"]
        for title in top_titles
        if world.state.get(title, {}).get("holder")
    }
    holder_titles = collections.defaultdict(list)
    for title, entry in world.state.items():
        if entry["holder"] and title[0] in TITLE_TIER:
            holder_titles[entry["holder"]].append(title)
    vassals = []
    for holder, titles in holder_titles.items():
        if holder in top_holders or all(title in top_titles for title in titles):
            continue
        best = max(
            titles,
            key=lambda title: (TITLE_TIER[title[0]], world.sub_counties.get(title, 1)),
        )
        vassals.append(
            (max(1, world.sub_counties.get(best, 1)), world.title_government(best))
        )
    print_counter(
        "VASSAL title holders by government",
        collections.Counter(gov for _, gov in vassals),
        len(vassals),
    )
    vassal_sizes = collections.defaultdict(collections.Counter)
    for count, gov in vassals:
        vassal_sizes[size_bucket(count)][family(gov)] += 1
    print("\nVASSAL title holders by sub-realm size, family")
    for bucket in SIZE_BUCKETS:
        counter = vassal_sizes[bucket]
        total = sum(counter.values())
        if total:
            print(f"  {bucket:6s} {total:5d}  " + "  ".join(
                f"{key} {share(count, total)}" for key, count in counter.most_common()
            ))


def main():
    parser = argparse.ArgumentParser(
        description="Government distributions at a CK3 start date, from the local install."
    )
    parser.add_argument("date", nargs="?", default="867.1.1")
    parser.add_argument(
        "--game-dir", default=os.environ.get("CK3_GAME_DIR", DEFAULT_GAME_DIR)
    )
    parser.add_argument(
        "--byzantium", choices=["bureaucratic", "feudal"], default="bureaucratic"
    )
    args = parser.parse_args()
    report(Ck3World(args.game_dir, parse_date(args.date), args.byzantium))


if __name__ == "__main__":
    main()
