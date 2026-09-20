"""Measures nation-size, government, diplomacy, and event-rate distributions
from the historical EU4 event log (public/earth-history/events/*.json) and
writes calibration targets to public/earth-history/reference/history-targets.json.

The generator consumes this JSON as its tuning table, rescaling ratios to the
generated planet's land area and province count; rerunning this script over a
generated log's provinces/nations JSON (if exported in the same shape) gives a
free audit by diffing histograms against these targets.
"""

import json
import os
import struct
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from eu4_date import eu4_date_to_days  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS_DIR = os.path.join(ROOT, "public", "earth-history", "events")
REFERENCE_DIR = os.path.join(ROOT, "public", "earth-history", "reference")

# Non-overlapping bucket upper bounds -- see memory "Bucket boundaries must
# not overlap with measurement ranges". Each tuple is inclusive [lo, hi];
# hi=None means unbounded.
SIZE_BUCKETS = [
    (1, 1),
    (2, 4),
    (5, 9),
    (10, 24),
    (25, 49),
    (50, 100),
    (101, None),
]

# The five diplomatic relation kinds the generator produces (NATION.relation),
# mapped to their Start/End event-kind pairs in diplomacy.json. `dependency`
# and `emperor` (HRE-specific) are measured too but reported separately since
# the generator doesn't currently model them.
GENERATED_RELATION_KINDS = {
    "vassal": ("vassalStart", "vassalEnd"),
    "union": ("unionStart", "unionEnd"),
    "alliance": ("allianceStart", "allianceEnd"),
    "guarantee": ("guaranteeStart", "guaranteeEnd"),
    "royalMarriage": ("royalMarriageStart", "royalMarriageEnd"),
}
UNGENERATED_RELATION_KINDS = {
    "dependency": ("dependencyStart", "dependencyEnd"),
    "emperor": ("emperorStart", "emperorEnd"),
}

START_YEAR = 2
END_YEAR = 2026
SAMPLE_COUNT = 24
SAMPLE_YEARS = sorted(
    {round(START_YEAR + i * (END_YEAR - START_YEAR) / (SAMPLE_COUNT - 1)) for i in range(SAMPLE_COUNT)}
)

RANGE_START_DAY = eu4_date_to_days(f"{START_YEAR}.1.1")
RANGE_END_DAY = eu4_date_to_days(f"{END_YEAR}.12.31")
RANGE_YEARS = END_YEAR - START_YEAR


def load(name):
    with open(os.path.join(EVENTS_DIR, name), "r", encoding="utf8") as f:
        return json.load(f)


def bucket_for(size):
    for lo, hi in SIZE_BUCKETS:
        if size >= lo and (hi is None or size <= hi):
            return f"{lo}-{hi if hi is not None else 'inf'}"
    raise ValueError(f"size {size} did not match any bucket")


def bucket_label(lo, hi):
    return f"{lo}-{hi if hi is not None else 'inf'}"


def latest_before(events, date, kind, key=None):
    """Returns the payload of the latest event of `kind` at or before `date`,
    or None. `key` optionally extracts a value from payload."""
    best_date = None
    best_payload = None
    for e in events:
        if e["kind"] != kind or e["date"] > date:
            continue
        if best_date is None or e["date"] >= best_date:
            best_date = e["date"]
            best_payload = e["payload"]
    return best_payload if key is None else (best_payload or {}).get(key)


def province_owners_at(provinces, date):
    """Returns {provinceId: ownerTag} for provinces owned at `date`."""
    owners = {}
    for pid, prov in provinces.items():
        base_owner = (prov.get("base") or {}).get("owner")
        owner = base_owner
        best_date = None
        for e in prov.get("events", []):
            if e["kind"] != "owner" or e["date"] > date:
                continue
            if best_date is None or e["date"] >= best_date:
                best_date = e["date"]
                owner = e["payload"]["tag"]
        if owner:
            owners[pid] = owner
    return owners


def load_adjacency():
    """Province adjacency from public/earth-history/reference/eu4-province-borders.*,
    a flat list of (provinceA, provinceB) border segments. -1 is a sentinel
    for the map edge / open sea, not a real province, and is dropped."""
    meta = json.load(open(os.path.join(REFERENCE_DIR, "eu4-province-borders.json"), encoding="utf8"))
    with open(os.path.join(REFERENCE_DIR, meta["bin"]), "rb") as f:
        data = f.read()
    rec_bytes = meta["recordBytes"]
    count = meta["segmentCount"]
    adjacency = defaultdict(set)
    for i in range(count):
        a, b = struct.unpack_from("<ii", data, i * rec_bytes)
        if a < 0 or b < 0:
            continue
        a, b = str(a), str(b)
        adjacency[a].add(b)
        adjacency[b].add(a)
    return adjacency


def classify_border_provinces(adjacency, all_owners_by_year):
    """A province is a "border" province in a given sample year if at least
    one neighbor has a different owner (including no owner at all). A
    province is classified overall as border/interior by majority vote across
    all sample years it was owned in -- this is a coarse, whole-window label,
    not a per-year one, since a province that flips front/rear over centuries
    only gets one bucket here."""
    owned_years = defaultdict(int)
    border_years = defaultdict(int)
    for owners in all_owners_by_year.values():
        for pid, tag in owners.items():
            owned_years[pid] += 1
            if any(owners.get(n) != tag for n in adjacency.get(pid, ())):
                border_years[pid] += 1
    border, interior = set(), set()
    for pid, owned in owned_years.items():
        ratio = border_years[pid] / owned if owned else 0
        (border if ratio >= 0.5 else interior).add(pid)
    return border, interior


def nation_size_distribution(owners):
    counts = defaultdict(int)
    for tag in owners.values():
        counts[tag] += 1
    return counts


def measure_nation_sizes(all_owners_by_year):
    per_year = {}
    for year, owners in all_owners_by_year.items():
        counts = nation_size_distribution(owners)
        total_nations = len(counts)
        total_provinces = sum(counts.values())
        by_bucket = defaultdict(lambda: {"nationCount": 0, "provinceMass": 0})
        for size in counts.values():
            label = bucket_for(size)
            by_bucket[label]["nationCount"] += 1
            by_bucket[label]["provinceMass"] += size
        per_year[str(year)] = {
            "totalNations": total_nations,
            "totalProvinces": total_provinces,
            "buckets": {
                label: {
                    "nationCountShare": b["nationCount"] / total_nations if total_nations else 0,
                    "provinceMassShare": b["provinceMass"] / total_provinces if total_provinces else 0,
                }
                for label, b in by_bucket.items()
            },
        }
    return per_year


def measure_government(nations, all_owners_by_year):
    per_year = {}
    for year, owners in all_owners_by_year.items():
        date = eu4_date_to_days(f"{year}.1.1")
        counts = nation_size_distribution(owners)
        gov_counts = defaultdict(int)
        gov_by_size_bucket = defaultdict(lambda: defaultdict(int))
        for tag, size in counts.items():
            nation = nations.get(tag)
            if nation is None:
                continue
            gov = latest_before(nation.get("events", []), date, "governmentChange", "governmentType")
            gov = gov or "unknown"
            gov_counts[gov] += 1
            gov_by_size_bucket[bucket_for(size)][gov] += 1
        total = sum(gov_counts.values())
        per_year[str(year)] = {
            "overall": {g: c / total for g, c in gov_counts.items()} if total else {},
            "bySizeBucket": {
                label: {g: c / sum(counts_.values()) for g, c in counts_.items()}
                for label, counts_ in gov_by_size_bucket.items()
            },
        }
    return per_year


def measure_diplomacy(diplomacy, all_owners_by_year):
    def alive_relations(kind_pair, date):
        start_kind, end_kind = kind_pair
        starts = defaultdict(list)  # (first, second) -> [start dates]
        ends = defaultdict(list)
        for e in diplomacy:
            if e["kind"] == start_kind:
                starts[(e["payload"]["firstTag"], e["payload"]["secondTag"])].append(e["date"])
            elif e["kind"] == end_kind:
                ends[(e["payload"]["firstTag"], e["payload"]["secondTag"])].append(e["date"])
        alive = []
        for pair, start_dates in starts.items():
            end_dates = sorted(ends.get(pair, []))
            for start_date in sorted(start_dates):
                end_date = next((d for d in end_dates if d >= start_date), None)
                if start_date <= date and (end_date is None or end_date > date):
                    alive.append(pair)
        return alive

    def alive_dependencies_by_subtype(date):
        """Like alive_relations, but keyed by (first, second, subjectType) so
        the six dependency flavors (tributary_state, protectorate,
        client_kingdom, appanage, dominion, colony) are tracked separately."""
        starts = defaultdict(list)
        ends = defaultdict(list)
        for e in diplomacy:
            if e["kind"] not in ("dependencyStart", "dependencyEnd"):
                continue
            key = (e["payload"]["firstTag"], e["payload"]["secondTag"], e["payload"].get("subjectType", "unknown"))
            (starts if e["kind"] == "dependencyStart" else ends)[key].append(e["date"])
        alive = []
        for key, start_dates in starts.items():
            end_dates = sorted(ends.get(key, []))
            for start_date in sorted(start_dates):
                end_date = next((d for d in end_dates if d >= start_date), None)
                if start_date <= date and (end_date is None or end_date > date):
                    alive.append(key)
        return alive

    def avg_holder_bucket(count_by_holder, counts):
        by_bucket = defaultdict(list)
        for tag, count in count_by_holder.items():
            size = counts.get(tag)
            if size:
                by_bucket[bucket_for(size)].append(count)
        return {label: sum(v) / len(v) for label, v in by_bucket.items()}

    all_kinds = {**GENERATED_RELATION_KINDS, **UNGENERATED_RELATION_KINDS}
    per_year = {}
    for year, owners in all_owners_by_year.items():
        date = eu4_date_to_days(f"{year}.1.1")
        counts = nation_size_distribution(owners)
        total_nations = len(counts)
        by_kind = {}
        vassal_count_by_holder = defaultdict(int)
        senior_sizes, junior_sizes = [], []
        for label, kind_pair in all_kinds.items():
            if label == "dependency":
                continue  # replaced by the subject-type breakdown below
            pairs = alive_relations(kind_pair, date)
            by_kind[label] = {
                "count": len(pairs),
                "perNation": len(pairs) / total_nations if total_nations else 0,
            }
            if label == "vassal":
                for first, _second in pairs:
                    vassal_count_by_holder[first] += 1
            elif label == "union":
                for senior, junior in pairs:
                    if senior in counts:
                        senior_sizes.append(counts[senior])
                    if junior in counts:
                        junior_sizes.append(counts[junior])

        dep_by_subtype = defaultdict(int)
        for _first, _second, subtype in alive_dependencies_by_subtype(date):
            dep_by_subtype[subtype] += 1

        per_year[str(year)] = {
            "byKind": by_kind,
            "avgVassalsBySizeBucket": avg_holder_bucket(vassal_count_by_holder, counts),
            "dependencyBySubjectType": {
                subtype: {"count": c, "perNation": c / total_nations if total_nations else 0}
                for subtype, c in dep_by_subtype.items()
            },
            "union": {
                "pairCount": len(senior_sizes),
                "seniorAvgSize": sum(senior_sizes) / len(senior_sizes) if senior_sizes else 0,
                "juniorAvgSize": sum(junior_sizes) / len(junior_sizes) if junior_sizes else 0,
            },
        }
    return per_year


def measure_ruler_stats(nations):
    """Average ruler reign length, counting only reigns closed by a later
    rulerChange within the window (the still-reigning final ruler of each
    nation is excluded to avoid right-censoring bias)."""
    reign_days = []
    for nation in nations.values():
        dates = sorted(
            e["date"]
            for e in nation.get("events", [])
            if e["kind"] == "rulerChange" and RANGE_START_DAY <= e["date"] <= RANGE_END_DAY
        )
        for a, b in zip(dates, dates[1:]):
            reign_days.append(b - a)
    avg_years = (sum(reign_days) / len(reign_days) / 365) if reign_days else 0
    return {"avgReignYears": avg_years, "reignsCounted": len(reign_days)}


def build_attr_timeline(prov, kind):
    return sorted(
        ((e["date"], e["payload"]) for e in prov.get("events", []) if e["kind"] == kind),
        key=lambda pair: pair[0],
    )


def value_at(timeline, key, date):
    val = None
    for d, payload in timeline:
        if d > date:
            break
        val = payload.get(key)
    return val


def measure_attribute_stats(provinces, kind, key):
    """Generic measurer for a per-province timeline attribute (culture,
    religion): group-size-over-time, average persistence lifespan, and the
    per-province rate of changes within the sample window."""
    timelines = {pid: build_attr_timeline(prov, kind) for pid, prov in provinces.items()}

    group_size_by_year = {}
    for year in SAMPLE_YEARS:
        date = eu4_date_to_days(f"{year}.1.1")
        counts = defaultdict(int)
        for timeline in timelines.values():
            val = value_at(timeline, key, date)
            if val:
                counts[val] += 1
        distinct = len(counts)
        total = sum(counts.values())
        group_size_by_year[str(year)] = {
            "distinctGroups": distinct,
            "avgGroupSize": total / distinct if distinct else 0,
        }

    lifespans_days = []
    change_counts = []
    for timeline in timelines.values():
        start_val = value_at(timeline, key, RANGE_START_DAY)
        prev_date, prev_val = RANGE_START_DAY, start_val
        changes = 0
        for d, payload in timeline:
            if d <= RANGE_START_DAY or d > RANGE_END_DAY:
                continue
            if prev_val is not None:
                lifespans_days.append(d - prev_date)
            prev_date, prev_val = d, payload.get(key)
            changes += 1
        if prev_val is not None:
            lifespans_days.append(RANGE_END_DAY - prev_date)
        change_counts.append(changes)

    change_rates = [c / (RANGE_YEARS / 100) for c in change_counts]
    return {
        "groupSizeByYear": group_size_by_year,
        "avgLifespanYears": (sum(lifespans_days) / len(lifespans_days) / 365) if lifespans_days else 0,
        "changesPerProvinceCentury": {
            "mean": sum(change_rates) / len(change_rates) if change_rates else 0,
            "min": min(change_rates) if change_rates else 0,
            "max": max(change_rates) if change_rates else 0,
        },
    }


def top_n_share(counts, n=8):
    """Collapses a counts dict to its top-n keys plus an 'other' bucket,
    returned as shares of the total."""
    total = sum(counts.values())
    if not total:
        return {}
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])
    top = ranked[:n]
    other = sum(c for _k, c in ranked[n:])
    shares = {k: c / total for k, c in top}
    if other:
        shares["other"] = other / total
    return shares


def measure_war_stats(wars):
    cb_counts = defaultdict(int)
    durations_days = []
    windowed = 0
    for war in wars:
        starts = [e["date"] for e in war["events"] if e["kind"] == "warStart"]
        ends = [e["date"] for e in war["events"] if e["kind"] == "warEnd"]
        if not starts:
            continue
        start = min(starts)
        if not (RANGE_START_DAY <= start <= RANGE_END_DAY):
            continue
        windowed += 1
        cb_counts[war.get("casusBelli") or "unknown"] += 1
        if ends:
            durations_days.append(max(ends) - start)
    return {
        "warsCounted": windowed,
        "avgDurationYears": (sum(durations_days) / len(durations_days) / 365) if durations_days else 0,
        "casusBelliShare": top_n_share(cb_counts),
    }


def measure_wars_by_period(wars, all_owners_by_year):
    """Wars-started rate and revolt share, per interval between consecutive
    sample years (event rates are a flow, not a snapshot, so they're measured
    over periods rather than at sample points)."""
    periods = []
    for y0, y1 in zip(SAMPLE_YEARS, SAMPLE_YEARS[1:]):
        d0, d1 = eu4_date_to_days(f"{y0}.1.1"), eu4_date_to_days(f"{y1}.1.1")
        starts_in_period = []
        for war in wars:
            starts = [e["date"] for e in war["events"] if e["kind"] == "warStart"]
            if starts and d0 <= min(starts) < d1:
                starts_in_period.append(war)
        nation_count = len(nation_size_distribution(all_owners_by_year[y0])) or 1
        years = y1 - y0
        war_count = len(starts_in_period)
        rebel_count = sum(1 for w in starts_in_period if w.get("isRebel"))
        periods.append({
            "startYear": y0,
            "endYear": y1,
            "warsPerNationYear": war_count / (nation_count * years) if nation_count and years else 0,
            "revoltShareOfWars": rebel_count / war_count if war_count else 0,
        })
    return periods


def measure_revolt_stats(provinces, border_pids, interior_pids):
    """Province-level revolt events (kind='revolt') split into actual revolt
    starts (payload.revolt.type present) vs suppressions/clears (empty
    payload), with type frequency and a per-province rate split by the same
    border/interior classification used for culture and religion churn."""
    type_counts = defaultdict(int)

    def rate_for(subset, count_types=False):
        rates = []
        for pid in subset:
            prov = provinces.get(pid)
            if prov is None:
                continue
            count = 0
            for e in prov.get("events", []):
                if e["kind"] != "revolt" or not (RANGE_START_DAY <= e["date"] <= RANGE_END_DAY):
                    continue
                revolt_type = (e["payload"].get("revolt") or {}).get("type")
                if revolt_type:
                    count += 1
                    if count_types:
                        type_counts[revolt_type] += 1
            rates.append(count / (RANGE_YEARS / 100))
        return {
            "mean": sum(rates) / len(rates) if rates else 0,
            "min": min(rates) if rates else 0,
            "max": max(rates) if rates else 0,
        }

    all_rate = rate_for(provinces.keys(), count_types=True)
    return {
        "revoltsPerProvinceCentury": {
            "all": all_rate,
            "border": rate_for(border_pids),
            "interior": rate_for(interior_pids),
        },
        "typeShare": top_n_share(type_counts),
    }


def measure_event_rates(nations, provinces, wars):
    war_starts = 0
    rebel_wars = 0
    for war in wars:
        start_dates = [e["date"] for e in war["events"] if e["kind"] == "warStart"]
        if not start_dates:
            continue
        start = min(start_dates)
        if not (RANGE_START_DAY <= start <= RANGE_END_DAY):
            continue
        war_starts += 1
        if war.get("isRebel"):
            rebel_wars += 1

    owner_changes = 0
    for prov in provinces.values():
        for e in prov.get("events", []):
            if e["kind"] == "owner" and RANGE_START_DAY <= e["date"] <= RANGE_END_DAY:
                owner_changes += 1

    ruler_changes = 0
    for nation in nations.values():
        for e in nation.get("events", []):
            if e["kind"] == "rulerChange" and RANGE_START_DAY <= e["date"] <= RANGE_END_DAY:
                ruler_changes += 1

    avg_nation_count = sum(
        len(nation_size_distribution(province_owners_at(provinces, eu4_date_to_days(f"{y}.1.1"))))
        for y in SAMPLE_YEARS
    ) / len(SAMPLE_YEARS)
    province_count = len(provinces)

    return {
        "warsStartedPerNationYear": war_starts / (avg_nation_count * RANGE_YEARS),
        "revoltShareOfWars": rebel_wars / war_starts if war_starts else 0,
        "ownershipChangesPerProvinceCentury": owner_changes / (province_count * RANGE_YEARS / 100),
        "rulerChangesPerNationYear": ruler_changes / (avg_nation_count * RANGE_YEARS),
        "sampleWindow": {"startYear": START_YEAR, "endYear": END_YEAR},
    }


def main():
    provinces = load("provinces.json")
    nations = load("nations.json")
    diplomacy = load("diplomacy.json")
    wars = load("wars.json")

    all_owners_by_year = {
        year: province_owners_at(provinces, eu4_date_to_days(f"{year}.1.1")) for year in SAMPLE_YEARS
    }

    adjacency = load_adjacency()
    border_pids, interior_pids = classify_border_provinces(adjacency, all_owners_by_year)
    border_provinces = {pid: p for pid, p in provinces.items() if pid in border_pids}
    interior_provinces = {pid: p for pid, p in provinces.items() if pid in interior_pids}

    def attribute_stats_with_border_split(kind, key):
        stats = measure_attribute_stats(provinces, kind, key)
        stats["byBorderClass"] = {
            "border": measure_attribute_stats(border_provinces, kind, key),
            "interior": measure_attribute_stats(interior_provinces, kind, key),
        }
        return stats

    targets = {
        "sampleYears": SAMPLE_YEARS,
        "sizeBuckets": [bucket_label(lo, hi) for lo, hi in SIZE_BUCKETS],
        "nationSizeDistribution": measure_nation_sizes(all_owners_by_year),
        "governmentType": measure_government(nations, all_owners_by_year),
        "diplomacy": measure_diplomacy(diplomacy, all_owners_by_year),
        "rulerStats": measure_ruler_stats(nations),
        "cultureStats": attribute_stats_with_border_split("culture", "cultureId"),
        "religionStats": attribute_stats_with_border_split("religion", "religionId"),
        "borderClassCounts": {"border": len(border_pids), "interior": len(interior_pids)},
        "warStats": measure_war_stats(wars),
        "warsByPeriod": measure_wars_by_period(wars, all_owners_by_year),
        "revoltStats": measure_revolt_stats(provinces, border_pids, interior_pids),
        "eventRates": measure_event_rates(nations, provinces, wars),
        "notes": [
            "governmentType.bySizeBucket correlates gov type with nation size; "
            "correlation with migrationWave-equivalent distance from cradle regions "
            "is not measurable from this dataset (EU4 geography has no cradle-region "
            "concept) and is left to the generator's own audit against its generated log.",
            "diplomacy.dependency is not in GENERATED_RELATION_KINDS along with emperor -- "
            "the generator does not currently produce those relation kinds. dependency is "
            "measured via dependencyBySubjectType instead of byKind, broken down by EU4's "
            "subjectType (tributary_state, protectorate, client_kingdom, appanage, "
            "dominion, colony) -- tributary_state and protectorate dominate by count; the "
            "rest are thin samples.",
            "diplomacy.union senior/junior sizes come from unionStart's firstTag "
            "(senior) vs secondTag (junior), per nations.ts's union semantics.",
            "rulerStats.avgReignYears only counts reigns closed by a later rulerChange "
            "within the window -- each nation's still-reigning final ruler is excluded "
            "to avoid right-censoring bias.",
            "cultureStats/religionStats.changesPerProvinceCentury.min/max show the range "
            "across provinces, not just the mean; byBorderClass.border/interior splits the "
            "same stats using eu4-province-borders.* adjacency data -- a province is "
            "'border' if a majority of its owned sample-years had at least one "
            "differently-owned (or unowned) neighbor. This is a coarse whole-window label, "
            "not per-year, so a province that flips front/rear over centuries only gets "
            "one bucket. See borderClassCounts for how many provinces landed in each.",
            "warsByPeriod buckets wars by warStart date into the 23 intervals between "
            "consecutive sampleYears, since war rate is a flow rather than a snapshot -- "
            "each entry's nation count is measured at the interval's start year.",
            "revoltStats counts only province 'revolt' events with a populated "
            "revolt.type (an actual uprising); events with an empty payload are "
            "suppression/clear markers and are excluded. revoltsPerProvinceCentury "
            "is split border/interior via the same classification as culture/religion.",
        ],
    }

    os.makedirs(REFERENCE_DIR, exist_ok=True)
    out_path = os.path.join(REFERENCE_DIR, "history-targets.json")
    with open(out_path, "w", encoding="utf8") as f:
        json.dump(targets, f, indent=2)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
