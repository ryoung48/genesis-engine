import argparse
import collections
import importlib.util
import os
import re
import sys
from pathlib import Path

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location(
    "measure_ck3_governments", os.path.join(HERE, "measure-ck3-governments.py")
)
gov = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gov)

TIER_NAME = {"h": "hegemony", "e": "empire", "k": "kingdom", "d": "duchy", "c": "county"}
TIER_RANK = {"h": 5, "e": 4, "k": 3, "d": 2, "c": 1}
DATE_HEADER = re.compile(r"^(\d+\.\d+\.\d+)\s*=\s*\{")
SINGLE_HEIR_TITLES = {"k_austria", "e_hindustan", "h_china"}


def pct(count, total):
    return f"{count:5d} ({100 * count / total:5.1f}%)" if total else f"{count:5d}"


def dated_blocks(text):
    blocks = []
    current = None
    for line in text.splitlines():
        match = DATE_HEADER.match(line)
        if match:
            current = (gov.parse_date(match.group(1)), [])
            blocks.append(current)
        elif current is not None:
            current[1].append(line)
    return blocks


class Ck3Succession(gov.Ck3World):
    def __init__(self, game_dir, start):
        super().__init__(game_dir, start, "bureaucratic")
        self.innovations = {}
        self.doctrines = {}
        self.load_innovations()
        self.load_faith_doctrines()
        self.load_title_laws()

    def culture_file(self, culture):
        history = self.game / "history/cultures"
        for name in (culture, self.heritage.get(culture, "")):
            path = history / f"{name}.txt"
            if name and path.exists():
                return path
        return None

    def load_innovations(self):
        for culture in set(self.culture.values()):
            path = self.culture_file(culture) if culture else None
            found = set()
            if path:
                for date, lines in dated_blocks(gov.read_text(path)):
                    if date > self.start:
                        break
                    for line in lines:
                        match = re.match(r"\s*discover_innovation\s*=\s*(\w+)", line)
                        if match:
                            found.add(match.group(1))
            self.innovations[culture] = found

    def load_faith_doctrines(self):
        for path in (self.game / "common/religion/religion_types").glob("*.txt"):
            religion_gender = None
            faith = None
            in_faiths = False
            for line in gov.read_text(path).splitlines():
                stripped = line.split("#")[0]
                if re.match(r"^\w+ = \{", stripped):
                    religion_gender = None
                    in_faiths = False
                if re.match(r"^\tfaiths = \{", stripped):
                    in_faiths = True
                match = re.match(r"^\t\t(\w+) = \{", stripped)
                if in_faiths and match:
                    faith = match.group(1)
                    self.doctrines[faith] = religion_gender
                match = re.search(r"doctrine = (doctrine_gender_\w+)", stripped)
                if match:
                    if in_faiths and faith:
                        self.doctrines[faith] = match.group(1)
                    elif not in_faiths:
                        religion_gender = match.group(1)

    def load_title_laws(self):
        self.title_laws = {}
        for path in sorted((self.game / "history/titles").glob("*.txt")):
            for title, body in gov.cw.parse_file(path):
                if not title or not isinstance(body, list):
                    continue
                laws = None
                dated = sorted(
                    (
                        (gov.parse_date(key), value)
                        for key, value in body
                        if key and gov.cw.is_date_key(key) and isinstance(value, list)
                    ),
                    key=lambda item: item[0],
                )
                for date, entries in dated:
                    if date > self.start:
                        break
                    for key, value in entries:
                        if key == "succession_laws":
                            laws = value if isinstance(value, list) else [value]
                        elif key == "remove_succession_laws":
                            laws = None
                if laws:
                    self.title_laws[title] = [
                        v if isinstance(v, str) else v[0] for v in laws if v
                    ]

    def holder_capital_info(self, title):
        county = self.capital_county(title)
        barony = self.county_capital_barony(county) if county else None
        province = self.provinces.get(barony) if barony else None
        return self.culture.get(province), self.religion.get(province)

    def realm_law(self, title, government, independent):
        family = gov.family(government)
        culture, faith = self.holder_capital_info(title)
        innov = self.innovations.get(culture, set())
        if title in SINGLE_HEIR_TITLES:
            return "single_heir"
        if family == "republic":
            return "city"
        if family == "theocracy":
            return "bishop_theocratic"
        if family == "bureaucratic":
            return "appointment"
        if government == "nomad":
            return "single_heir_kurultai"
        if government == "herder":
            return "herder"
        if government == "clan":
            return "clan_partition"
        if government == "mandala":
            return "mandala"
        if family == "tribal":
            return "confederate_partition"
        if "innovation_heraldry" in innov:
            return "high_partition"
        if "innovation_hereditary_rule" in innov:
            return "partition"
        return "confederate_partition"

    def gender_law(self, title):
        _, faith = self.holder_capital_info(title)
        doctrine = self.doctrines.get(faith) or "doctrine_gender_male_dominated"
        return {
            "doctrine_gender_male_dominated": "male_preference",
            "doctrine_gender_equal": "equal",
            "doctrine_gender_female_dominated": "female_preference",
        }.get(doctrine, doctrine)


def report(world):
    holders = collections.defaultdict(list)
    for title, entry in world.state.items():
        if entry["holder"] and title[0] in TIER_RANK and title[0] != "c":
            holders[entry["holder"]].append(title)
    county_holder = {c: world.state[c]["holder"] for c in world.counties}
    for county, holder in county_holder.items():
        holders[holder].append(county)

    print(f"start {'.'.join(map(str, world.start))}  landed rulers {len(holders)}")

    highest = collections.Counter()
    for titles in holders.values():
        highest[TIER_NAME[max(titles, key=lambda t: TIER_RANK[t[0]])[0]]] += 1
    print("\nLANDED RULERS by highest title held")
    for name in ("hegemony", "empire", "kingdom", "duchy", "county"):
        print(f"  {name:10s} {pct(highest[name], len(holders))}")

    print("\nTITLES HELD PER RULER (rulers whose highest title is the tier, by count of titles of that tier)")
    for letter in ("e", "k", "d"):
        counter = collections.Counter()
        for titles in holders.values():
            top = max(TIER_RANK[t[0]] for t in titles)
            if top != TIER_RANK[letter]:
                continue
            counter[min(sum(1 for t in titles if t[0] == letter), 5)] += 1
        total = sum(counter.values())
        row = "  ".join(f"{k if k < 5 else '5+'}: {pct(counter[k], total)}" for k in sorted(counter))
        print(f"  {TIER_NAME[letter]:8s} rulers {total:4d}   {row}")

    print("\nDE JURE TIER vs HOLDER: is a title held by the same person as its de jure liege title?")
    for letter, upper in (("d", "k"), ("k", "e")):
        same = other = orphan = vacant = 0
        for title, entry in world.state.items():
            if title[0] != letter:
                continue
            liege = world.parent.get(title)
            liege_holder = world.state.get(liege, {}).get("holder") if liege else None
            if not entry["holder"]:
                vacant += 1
            elif not liege or liege[0] != upper or not liege_holder:
                orphan += 1
            elif entry["holder"] == liege_holder:
                same += 1
            else:
                other += 1
        total = same + other
        print(
            f"  {TIER_NAME[letter]:8s} held with de jure {TIER_NAME[upper]:7s} holder: "
            f"same {pct(same, total)}   different {pct(other, total)}   "
            f"(no/vacant liege title {orphan}, vacant {vacant})"
        )

    print("\nREALM LAYER: top-liege realms, share of de jure counties of each held title inside the holder's own realm")
    realm_of = {}
    for top, members in world.realm_counties.items():
        for county in members:
            realm_of[county] = top
    for letter in ("k", "e"):
        buckets = collections.Counter()
        for title, entry in world.state.items():
            if title[0] != letter or not entry["holder"]:
                continue
            counties = [c for c in world.counties if letter_in_chain(world, c, title)]
            if not counties:
                continue
            holder_realm = next(
                (realm_of[c] for c in world.counties if county_holder[c] == entry["holder"]),
                None,
            )
            inside = sum(1 for c in counties if realm_of.get(c) == holder_realm)
            share = inside / len(counties)
            buckets["0-24%" if share < 0.25 else "25-49%" if share < 0.5 else "50-74%" if share < 0.75 else "75-99%" if share < 1 else "100%"] += 1
        total = sum(buckets.values())
        print(f"  {TIER_NAME[letter]:8s} titles held: {total}")
        for key in ("100%", "75-99%", "50-74%", "25-49%", "0-24%"):
            print(f"      {key:7s} of de jure counties in holder's realm  {pct(buckets[key], total)}")

    print("\nREALM DEMESNE: share held directly by the top liege, by realm size")
    print("  size   realms  direct counties  direct duchies (of held)  vassal rulers/realm  vassal rulers per 10 counties")
    demesne = collections.defaultdict(list)
    for top, members in world.realm_counties.items():
        top_holder = world.state.get(top, {}).get("holder")
        if not top_holder:
            continue
        direct = sum(1 for c in members if county_holder[c] == top_holder)
        duchies = [
            t
            for t, e in world.state.items()
            if t[0] == "d" and e["holder"] and world.chain(t)[-1] == top
        ]
        direct_duchies = sum(1 for t in duchies if world.state[t]["holder"] == top_holder)
        rulers = {county_holder[c] for c in members} | {world.state[t]["holder"] for t in duchies}
        rulers.discard(top_holder)
        demesne[gov.size_bucket(len(members))].append(
            (len(members), direct, len(duchies), direct_duchies, len(rulers))
        )
    for bucket in gov.SIZE_BUCKETS:
        rows = demesne[bucket]
        if not rows:
            continue
        counties = sum(r[0] for r in rows)
        direct = sum(r[1] for r in rows)
        duchies = sum(r[2] for r in rows)
        direct_duchies = sum(r[3] for r in rows)
        rulers = sum(r[4] for r in rows)
        duchy_text = (
            f"{direct_duchies}/{duchies} ({100 * direct_duchies / duchies:.0f}%)"
            if duchies
            else "-"
        )
        print(
            f"  {bucket:6s} {len(rows):5d}   {100 * direct / counties:5.1f}%          "
            f"{duchy_text:22s}    {rulers / len(rows):6.1f}                {10 * rulers / counties:5.2f}"
        )

    print("\nSTART SUCCESSION ORDER LAW (derived from the game's should_start_with rules)")
    for label, units in (("REALMS (top liege)", "realm"), ("ALL LANDED RULERS", "ruler")):
        counter = collections.Counter()
        by_size = collections.defaultdict(collections.Counter)
        if units == "realm":
            for top, members in world.realm_counties.items():
                law = world.realm_law(top, world.title_government(top), True)
                counter[law] += 1
                by_size[gov.size_bucket(len(members))][law] += 1
        else:
            for holder, titles in holders.items():
                best = max(titles, key=lambda t: (TIER_RANK[t[0]], world.sub_counties.get(t, 1)))
                law = world.realm_law(best, world.title_government(best), False)
                counter[law] += 1
                by_size[gov.size_bucket(world.sub_counties.get(best, 1))][law] += 1
        total = sum(counter.values())
        print(f"\n  {label}: {total}")
        for law, count in counter.most_common():
            print(f"    {law:24s} {pct(count, total)}")
        print("    by size:")
        for bucket in gov.SIZE_BUCKETS:
            row = by_size[bucket]
            bucket_total = sum(row.values())
            if bucket_total:
                print(f"      {bucket:6s} {bucket_total:5d}  " + "  ".join(f"{k} {100*v/bucket_total:.0f}%" for k, v in row.most_common()))

    print("\nREALM LAW by government family (top-liege realms; also weighted by counties)")
    family_laws = collections.defaultdict(collections.Counter)
    family_counties = collections.defaultdict(collections.Counter)
    for top, members in world.realm_counties.items():
        government = world.title_government(top)
        law = world.realm_law(top, government, True)
        family_laws[gov.family(government)][law] += 1
        family_counties[gov.family(government)][law] += len(members)
    for name, counter in sorted(family_laws.items()):
        total = sum(counter.values())
        county_total = sum(family_counties[name].values())
        print(f"  {name} ({total} realms, {county_total} counties)")
        for law, count in counter.most_common():
            print(
                f"      {law:24s} realms {pct(count, total)}   counties {pct(family_counties[name][law], county_total)}"
            )

    print("\nGENDER LAW of top-liege realms (faith doctrine of the capital county)")
    gender = collections.Counter(world.gender_law(top) for top in world.realm_counties)
    total = sum(gender.values())
    for law, count in gender.most_common():
        print(f"    {law:24s} {pct(count, total)}")

    print("\nSCRIPTED TITLE-LEVEL SUCCESSION LAWS in history/titles (elective, gender, noble family...)")
    counter = collections.Counter(law for laws in world.title_laws.values() for law in laws)
    for law, count in counter.most_common():
        print(f"    {law:44s} {count}")
    elective = [t for t, laws in world.title_laws.items() if any("elective" in l for l in laws)]
    print("  elective titles by tier: " + str(collections.Counter(TIER_NAME[t[0]] for t in elective)))


def letter_in_chain(world, county, title):
    seen = 0
    current = county
    while current and seen < 8:
        if current == title:
            return True
        current = world.parent.get(current)
        seen += 1
    return False


def main():
    parser = argparse.ArgumentParser(
        description="Succession law and title-holder distributions at a CK3 start date."
    )
    parser.add_argument("date", nargs="?", default="1066.9.15")
    parser.add_argument(
        "--game-dir", default=os.environ.get("CK3_GAME_DIR", gov.DEFAULT_GAME_DIR)
    )
    args = parser.parse_args()
    report(Ck3Succession(args.game_dir, gov.parse_date(args.date)))


if __name__ == "__main__":
    main()
