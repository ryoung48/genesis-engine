import argparse
import collections
import importlib.util
import os
import statistics
import sys
from pathlib import Path

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location(
    "measure_ck3_governments", os.path.join(HERE, "measure-ck3-governments.py")
)
gov = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gov)
cw = gov.cw

TIER_NAME = {"h": "hegemony", "e": "empire", "k": "kingdom", "d": "duchy", "c": "county"}
TIER_RANK = {"h": 5, "e": 4, "k": 3, "d": 2, "c": 1}
SPOUSE_KEYS = ("add_spouse", "add_matrilineal_spouse")


def year_of(key):
    y, m, d = key.split(".")
    return int(y) + (int(m) - 1) / 12 + (int(d) - 1) / 365


def load_characters(game):
    chars = {}
    for path in sorted((game / "history/characters").glob("*.txt")):
        for cid, body in cw.parse_file(path):
            if not cid or not isinstance(body, list):
                continue
            c = {
                "female": False,
                "father": None,
                "mother": None,
                "birth": None,
                "death": None,
                "marriages": [],
            }
            for key, value in body:
                if key == "female" and value == "yes":
                    c["female"] = True
                elif key == "father":
                    c["father"] = value
                elif key == "mother":
                    c["mother"] = value
                elif key and cw.is_date_key(key) and isinstance(value, list):
                    when = year_of(key)
                    for k2, v2 in value:
                        if k2 == "birth":
                            c["birth"] = when
                        elif k2 == "death":
                            c["death"] = when
                        elif k2 in SPOUSE_KEYS and isinstance(v2, str):
                            c["marriages"].append((when, v2))
            chars[cid] = c
    return chars


def quantiles(values, qs=(0.05, 0.25, 0.5, 0.75, 0.95)):
    ordered = sorted(values)
    return [round(ordered[min(len(ordered) - 1, int(len(ordered) * q))], 1) for q in qs]


def pct(count, total):
    return f"{count} ({100 * count / total:.0f}%)" if total else f"{count}"


def alive(chars, cid, when):
    c = chars.get(cid)
    if not c or c["birth"] is None:
        return None
    if c["birth"] > when:
        return False
    return c["death"] is None or c["death"] > when


def rulers_at(world):
    best = {}
    for title, entry in world.state.items():
        holder = entry["holder"]
        if not holder or title[0] not in TIER_RANK:
            continue
        if holder not in best or TIER_RANK[title[0]] > TIER_RANK[best[holder][0]]:
            best[holder] = title
    return best


def report(world, chars):
    when = world.start[0] + (world.start[1] - 1) / 12
    print(f"start {when:.1f}  characters {len(chars)}")

    rulers = {
        holder: title
        for holder, title in rulers_at(world).items()
        if holder in chars and alive(chars, holder, when)
    }
    print(f"\nLANDED RULERS alive with a scripted birth: {len(rulers)}")

    ages = [when - chars[h]["birth"] for h in rulers]
    print("  age quantiles 5/25/50/75/95:", quantiles(ages))
    for label, keep in (
        ("male", lambda c: not c["female"]),
        ("female", lambda c: c["female"]),
    ):
        subset = [when - chars[h]["birth"] for h in rulers if keep(chars[h])]
        if subset:
            print(f"  {label} rulers {len(subset)}, median age {statistics.median(subset):.0f}")

    print("\nPARENTS of landed rulers at the start date")
    for role in ("father", "mother"):
        counter = collections.Counter()
        for holder in rulers:
            parent = chars[holder][role]
            if not parent or parent not in chars:
                counter["not scripted"] += 1
            else:
                state = alive(chars, parent, when)
                counter["alive" if state else "dead"] += 1
        total = sum(counter.values())
        print(f"  {role:7s} " + "  ".join(f"{k} {pct(v, total)}" for k, v in counter.most_common()))
    both = collections.Counter()
    for holder in rulers:
        c = chars[holder]
        states = []
        for role in ("father", "mother"):
            p = c[role]
            states.append(None if not p or p not in chars else alive(chars, p, when))
        known = [s for s in states if s is not None]
        both["no known parent alive" if not any(known) else "a known parent alive"] += 1
    print("  " + "  ".join(f"{k}: {pct(v, len(rulers))}" for k, v in both.items()))

    by_age = collections.defaultdict(lambda: collections.Counter())
    for holder in rulers:
        age = when - chars[holder]["birth"]
        band = "<25" if age < 25 else "25-39" if age < 40 else "40-54" if age < 55 else "55+"
        parent = chars[holder]["father"]
        known = parent and parent in chars
        by_age[band]["father alive" if known and alive(chars, parent, when) else "father dead or unscripted"] += 1
    print("  father alive by ruler age band:", {b: f"{c['father alive']}/{sum(c.values())}" for b, c in sorted(by_age.items())})

    print("\nSPOUSES of landed rulers at the start date (marriage on or before start, spouse alive)")
    male_rulers = [h for h in rulers if not chars[h]["female"]]
    with_spouse = 0
    for h in male_rulers:
        if any(m <= when and alive(chars, s, when) for m, s in chars[h]["marriages"]):
            with_spouse += 1
    print(f"  male rulers with a living scripted spouse: {pct(with_spouse, len(male_rulers))}")

    print("\nCHILDREN alive at the start date (scripted only; a floor, not a count)")
    children = collections.defaultdict(list)
    for cid, c in chars.items():
        for parent in (c["father"], c["mother"]):
            if parent:
                children[parent].append(cid)
    counter = collections.Counter()
    for holder in rulers:
        n = sum(1 for k in children[holder] if alive(chars, k, when))
        counter[min(n, 4)] += 1
    print("  " + "  ".join(f"{k}{'+' if k == 4 else ''}: {pct(counter[k], len(rulers))}" for k in sorted(counter)))


def report_global(chars):
    print("\n=== ALL SCRIPTED CHARACTERS (dates 800-1250) ===")
    marriage_age = {"male": [], "female": []}
    gaps = []
    for cid, c in chars.items():
        if c["birth"] is None:
            continue
        for when, spouse in c["marriages"]:
            s = chars.get(spouse)
            if not s or s["birth"] is None or not (800 <= when <= 1250):
                continue
            age = when - c["birth"]
            if age < 10 or age > 70:
                continue
            marriage_age["female" if c["female"] else "male"].append(age)
            if not c["female"] and s["female"]:
                gaps.append(s["birth"] - c["birth"])
    for sex, values in marriage_age.items():
        if values:
            print(f"  age at marriage, {sex}: n={len(values)} quantiles 5/25/50/75/95 {quantiles(values)}")
    if gaps:
        print(f"  wife minus husband birth year (positive = wife younger): n={len(gaps)} quantiles {quantiles(gaps)}")

    mother_age, father_age, intervals = [], [], []
    by_mother = collections.defaultdict(list)
    for cid, c in chars.items():
        if c["birth"] is None or not (800 <= c["birth"] <= 1250):
            continue
        m = chars.get(c["mother"]) if c["mother"] else None
        f = chars.get(c["father"]) if c["father"] else None
        if m and m["birth"] is not None:
            mother_age.append(c["birth"] - m["birth"])
            by_mother[c["mother"]].append(c["birth"])
        if f and f["birth"] is not None:
            father_age.append(c["birth"] - f["birth"])
    for label, values in (("mother", mother_age), ("father", father_age)):
        if values:
            print(f"  parent age at child's birth, {label}: n={len(values)} quantiles {quantiles(values)}")
    for births in by_mother.values():
        births.sort()
        intervals.extend(b - a for a, b in zip(births, births[1:]))
    if intervals:
        print(f"  gap between a mother's consecutive scripted births: n={len(intervals)} quantiles {quantiles(intervals)}")

    print("\nLIFESPAN of scripted adults (reached 16; died in 800-1250)")
    for label, keep in (("male", lambda c: not c["female"]), ("female", lambda c: c["female"])):
        ages = [
            c["death"] - c["birth"]
            for c in chars.values()
            if c["birth"] is not None
            and c["death"] is not None
            and keep(c)
            and 800 <= c["death"] <= 1250
            and c["death"] - c["birth"] >= 16
        ]
        if ages:
            print(f"  {label}: n={len(ages)} age at death quantiles 5/25/50/75/95 {quantiles(ages)}, mean {statistics.mean(ages):.1f}")
    early = [
        c["death"] - c["birth"]
        for c in chars.values()
        if c["birth"] is not None and c["death"] is not None and 800 <= c["death"] <= 1250
    ]
    print(f"  died before 16 among all scripted with a death date: {pct(sum(1 for a in early if a < 16), len(early))}  (floor, not a mortality rate: children are scripted only if they matter)")


def main():
    parser = argparse.ArgumentParser(
        description="Ruler ages, parents, spouses and lifespans from CK3's scripted characters."
    )
    parser.add_argument("date", nargs="?", default="1066.9.15")
    parser.add_argument(
        "--game-dir", default=os.environ.get("CK3_GAME_DIR", gov.DEFAULT_GAME_DIR)
    )
    args = parser.parse_args()
    game = Path(args.game_dir)
    world = gov.Ck3World(args.game_dir, gov.parse_date(args.date), "bureaucratic")
    chars = load_characters(game)
    report(world, chars)
    report_global(chars)


if __name__ == "__main__":
    main()
