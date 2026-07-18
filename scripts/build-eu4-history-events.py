"""Converts geo-explorer's EU4-format dated history (provinces, countries,
wars, diplomacy) into the earth-history event format consumed by
src/model/earth/history/. One-time offline conversion -- see
docs/earth-history-plan.md. Never parsed at runtime.

Dates are converted via eu4_date_to_days (mirrors geo-explorer's
dateUtils.eu4DateToDays) so event dates share the same numeric axis as the
UI slider bounds (START_YEAR=2 .. END_YEAR=9999).
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from clausewitz import get_all, is_date_key, parse_file
from eu4_date import eu4_date_to_days

DEFAULT_SOURCE = Path(r"C:\Users\rayou\projects\geo-explorer\public")
DEFAULT_OUTPUT = Path("public/earth-history/events")
DEFAULT_PROVINCE_NAMES_TOPOJSON = Path(
    r"C:\Users\rayou\projects\geo-explorer\public\provinces.topojson"
)

PROVINCE_FILE_RE = re.compile(r"^(\d+)\s*-\s*(.+)$")

CURATED_WASTELAND_PROVINCE_IDS = {
    "1784",
    "1785",
    "1786",
    "1787",
    "2194",
    "2200",
    "2608",
    "2740",
    "3115",
    "3116",
    "3117",
    "3121",
    "3123",
    "3143",
    "3247",
    "3248",
    "4146",
    "4153",
    "4154",
    "4155",
    "4156",
    "4157",
    "4159",
    "4160",
    "4161",
    "4162",
    "4168",
    "4169",
    "4170",
    "4276",
    "4322",
    "4400",
    "4401",
    "4402",
    "4403",
    "4763",
    "4930",
    "4931",
    "4932",
}

NATION_NAME_EVENT_OVERRIDES = {
    # geo-explorer's static country file path gives FRM the timeless display
    # name "Formosa", but the polity on Taiwan changes identity across this
    # timeline. Emit dated rename events here so the Earth-history UI can
    # show the historically appropriate name while scrubbing.
    "FRM": [
        ("1661.6.14", "Tungning"),
        ("1949.10.1", "Taiwan"),
    ],
    # La Plata's static name never reflects independence or unification --
    # the Viceroyalty/junta era isn't distinguished by these events (base
    # name covers it), but the post-independence identity shifts are worth
    # showing while scrubbing.
    "LAP": [
        ("1816.7.9", "United Provinces of the Río de la Plata"),
        ("1862.10.12", "Argentina"),
    ],
    # Siam was renamed to Thailand in 1939, briefly reverted after WWII
    # (partly to distance the state from its wartime Japan-aligned
    # government), then renamed back permanently in 1949.
    "SIA": [
        ("1939.6.24", "Thailand"),
        ("1945.9.8", "Siam"),
        ("1949.5.11", "Thailand"),
    ],
    # Cambodia's name/regime changed repeatedly across the 20th century --
    # republic, Khmer Rouge-era "Kampuchea", Vietnamese-backed
    # reconstruction, and finally the restored kingdom.
    "KHM": [
        ("1970.10.9", "Khmer Republic"),
        ("1975.4.17", "Democratic Kampuchea"),
        ("1979.1.10", "People's Republic of Kampuchea"),
        ("1989.4.29", "State of Cambodia"),
        ("1993.9.24", "Kingdom of Cambodia"),
    ],
}


# ── Provinces ────────────────────────────────────────────────────────────


def _load_province_names_from_topojson(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    geometries = (
        data.get("objects", {})
        .get("provinces", {})
        .get("geometries", [])
    )
    names: dict[str, str] = {}
    for geom in geometries:
        properties = geom.get("properties", {})
        province_id = properties.get("province_id")
        name = properties.get("name")
        if province_id is None or not isinstance(name, str) or not name.strip():
            continue
        names.setdefault(str(province_id), name.strip())
    return names


def _load_province_names_from_political_json(source: Path) -> dict[str, str]:
    """geo-explorer's political.json is pre-flattened JSON keyed by EU4
    province id, e.g. {"236": {"name": "London", "history": [...], ...}}."""
    path = source / "political.json"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    return {pid: entry["name"] for pid, entry in data.items() if entry.get("name")}


def _load_wasteland_province_ids(source: Path) -> set[str]:
    """Uses the repo's curated wasteland set instead of geo-explorer's
    wastelands.json so Earth-history output can intentionally diverge from
    upstream classification while remaining deterministic across rebuilds."""
    del source
    return set(CURATED_WASTELAND_PROVINCE_IDS)


EU4_COVERAGE_START_DATE = eu4_date_to_days("2.1.1")
"""fold.ts treats `base` as true since the beginning of time. EU4's own raw
undated owner/controller/culture/religion fields are really only "true as
of EU4's own start" (in practice 1444, but this app's slider treats year 2
as where EU4's data becomes authoritative -- see EARTH_HISTORY_START_YEAR
in date.ts), not "true since the dawn of history". If left in `base`
directly, they'd leak backward into every earlier era covered by other
sources (the historical-basemaps snapshots, Imperium Universalis) -- e.g. a
province whose owner never changes in its own dated history would show
that same owner at 500 BC, 10000 BC, etc. So they're anchored as a dated
event at EU4_COVERAGE_START_DATE instead, leaving `base` unclaimed
(None) so earlier sources' own base/events are free to describe what
happened before EU4's own coverage starts."""


def convert_provinces(source: Path, province_names_topojson: Path | None = None) -> dict:
    names = (
        _load_province_names_from_topojson(province_names_topojson)
        if province_names_topojson is not None
        else {}
    )
    if not names:
        names = _load_province_names_from_political_json(source)
    wasteland_ids = _load_wasteland_province_ids(source)

    out: dict[str, dict] = {}
    prov_dir = source / "history" / "provinces"
    for f in prov_dir.glob("*.txt"):
        m = PROVINCE_FILE_RE.match(f.stem)
        if not m:
            continue
        province_id = m.group(1)
        entries = parse_file(f)
        raw_base = {}
        for key in ("owner", "controller", "culture", "religion"):
            for k, v in entries:
                if k == key and isinstance(v, str):
                    # "XXX" is EU4's own sentinel for "no real owner" (used by
                    # a handful of native/uncolonized provinces) -- treat it
                    # as no owner at all rather than a literal country tag,
                    # which would otherwise show up as an unresolvable nation
                    # reference in the UI.
                    if key in ("owner", "controller") and v == "XXX":
                        continue
                    raw_base[key] = v

        base = {
            "owner": None,
            "controller": None,
            "cores": [v for k, v in entries if k == "add_core" and isinstance(v, str)],
            "name": names.get(province_id),
            "wasteland": province_id in wasteland_ids,
        }

        events = []
        if raw_base.get("owner"):
            events.append(
                {"date": EU4_COVERAGE_START_DATE, "kind": "owner", "payload": {"tag": raw_base["owner"]}}
            )
        if raw_base.get("controller"):
            events.append(
                {
                    "date": EU4_COVERAGE_START_DATE,
                    "kind": "controller",
                    "payload": {"tag": raw_base["controller"]},
                }
            )
        if raw_base.get("culture"):
            events.append(
                {
                    "date": EU4_COVERAGE_START_DATE,
                    "kind": "culture",
                    "payload": {"cultureId": raw_base["culture"]},
                }
            )
        if raw_base.get("religion"):
            events.append(
                {
                    "date": EU4_COVERAGE_START_DATE,
                    "kind": "religion",
                    "payload": {"religionId": raw_base["religion"]},
                }
            )

        for key, value in entries:
            if not is_date_key(key) or not isinstance(value, list):
                continue
            if not value or not isinstance(value[0], tuple):
                continue
            date = eu4_date_to_days(key)
            for sub_key, sub_value in value:
                if sub_key == "owner" and isinstance(sub_value, str):
                    # A mid-history transition *to* XXX (e.g. a province
                    # reverting to native control after its owner lost it)
                    # must still be recorded -- as a real "ownership cleared"
                    # event, not skipped -- or the fold engine has nothing
                    # telling it the previous owner stopped owning it, and
                    # that owner incorrectly appears to persist right through
                    # the uncolonized period.
                    tag = None if sub_value == "XXX" else sub_value
                    events.append({"date": date, "kind": "owner", "payload": {"tag": tag}})
                elif sub_key == "controller" and isinstance(sub_value, str):
                    tag = None if sub_value == "XXX" else sub_value
                    events.append({"date": date, "kind": "controller", "payload": {"tag": tag}})
                elif sub_key == "add_core" and isinstance(sub_value, str):
                    events.append({"date": date, "kind": "coreAdd", "payload": {"tag": sub_value}})
                elif sub_key == "remove_core" and isinstance(sub_value, str):
                    events.append({"date": date, "kind": "coreRemove", "payload": {"tag": sub_value}})
                elif sub_key == "culture" and isinstance(sub_value, str):
                    events.append({"date": date, "kind": "culture", "payload": {"cultureId": sub_value}})
                elif sub_key == "religion" and isinstance(sub_value, str):
                    events.append({"date": date, "kind": "religion", "payload": {"religionId": sub_value}})

        events.sort(key=lambda e: e["date"])
        out[province_id] = {"base": base, "events": events}

    return out


# ── Nations (government, reforms, rulers) ──────────────────────────────


def convert_nations(source: Path) -> dict:
    from clausewitz import get as cget

    out: dict[str, dict] = {}
    hist_dir = source / "history" / "countries"
    for f in hist_dir.glob("*.txt"):
        tag = f.stem.split(" - ", 1)[0].strip()
        entries = parse_file(f)

        events = []
        for key, value in entries:
            if not is_date_key(key) or not isinstance(value, list):
                continue
            if not value or not isinstance(value[0], tuple):
                continue
            date = eu4_date_to_days(key)
            for sub_key, sub_value in value:
                if sub_key == "government" and isinstance(sub_value, str):
                    events.append(
                        {"date": date, "kind": "governmentChange", "payload": {"governmentType": sub_value}}
                    )
                elif sub_key == "add_government_reform" and isinstance(sub_value, str):
                    events.append(
                        {"date": date, "kind": "governmentReformAdd", "payload": {"reformId": sub_value}}
                    )
                elif sub_key == "remove_government_reform" and isinstance(sub_value, str):
                    events.append(
                        {"date": date, "kind": "governmentReformRemove", "payload": {"reformId": sub_value}}
                    )
                elif sub_key == "capital" and isinstance(sub_value, str):
                    events.append(
                        {"date": date, "kind": "capitalChange", "payload": {"provinceId": sub_value}}
                    )
                elif sub_key == "monarch" and isinstance(sub_value, list):
                    events.append(
                        {
                            "date": date,
                            "kind": "rulerChange",
                            "payload": {
                                "name": cget(sub_value, "name"),
                                "dynasty": cget(sub_value, "dynasty"),
                            },
                        }
                    )

        for date_str, name in NATION_NAME_EVENT_OVERRIDES.get(tag, ()):
            events.append(
                {
                    "date": eu4_date_to_days(date_str),
                    "kind": "nameChange",
                    "payload": {"name": name},
                }
            )

        # Un-dated add_government_reform lines at file top are the nation's
        # starting reforms (no event date -- folded into base, same spirit
        # as the province base fields above). Same for the top-level
        # `capital = <province id>` field -- the nation's starting capital.
        base_reforms = [v for k, v in entries if k == "add_government_reform" and isinstance(v, str)]
        base_capital = cget(entries, "capital")

        events.sort(key=lambda e: e["date"])
        if events or base_reforms or base_capital:
            out[tag] = {
                "base": {"reforms": base_reforms, "capital": base_capital},
                "events": events,
            }
    return out


# ── Wars ─────────────────────────────────────────────────────────────────

REBEL_CB_HINTS = ("rebel", "civil_war", "independence", "revolt")


def convert_wars(source: Path) -> list:
    from clausewitz import get as cget

    wars_dir = source / "history" / "wars"
    out = []
    for f in wars_dir.glob("*.txt"):
        entries = parse_file(f)
        name = cget(entries, "name", f.stem)
        war_goal = cget(entries, "war_goal", [])
        casus_belli = cget(war_goal, "casus_belli", "") if isinstance(war_goal, list) else ""
        is_rebel = any(h in casus_belli.lower() for h in REBEL_CB_HINTS)

        participant_events = []
        for key, value in entries:
            if not is_date_key(key) or not isinstance(value, list):
                continue
            if not value or not isinstance(value[0], tuple):
                continue
            date = eu4_date_to_days(key)
            for sub_key, tag in value:
                if sub_key == "add_attacker" and isinstance(tag, str):
                    participant_events.append({"date": date, "nationTag": tag, "kind": "warStart", "side": "attacker"})
                elif sub_key == "add_defender" and isinstance(tag, str):
                    participant_events.append({"date": date, "nationTag": tag, "kind": "warStart", "side": "defender"})
                elif sub_key == "rem_attacker" and isinstance(tag, str):
                    participant_events.append({"date": date, "nationTag": tag, "kind": "warEnd", "side": "attacker"})
                elif sub_key == "rem_defender" and isinstance(tag, str):
                    participant_events.append({"date": date, "nationTag": tag, "kind": "warEnd", "side": "defender"})

        if not participant_events:
            continue
        participant_events.sort(key=lambda e: e["date"])
        out.append(
            {
                "warId": f.stem,
                "name": name,
                "casusBelli": casus_belli,
                "isRebel": is_rebel,
                "events": participant_events,
            }
        )
    return out


# ── Diplomacy (alliances, vassals, unions, dependencies) ───────────────

RELATION_KEYS = {
    "alliance": ("allianceStart", "allianceEnd"),
    "vassal": ("vassalStart", "vassalEnd"),
    "union": ("unionStart", "unionEnd"),
    "dependency": ("dependencyStart", "dependencyEnd"),
}


def convert_diplomacy(source: Path) -> list:
    from clausewitz import get as cget

    diplo_dir = source / "history" / "diplomacy"
    out = []
    for f in diplo_dir.glob("*.txt"):
        entries = parse_file(f)
        for key, value in entries:
            kinds = RELATION_KEYS.get(key)
            if kinds is None or not isinstance(value, list):
                continue
            first = cget(value, "first")
            second = cget(value, "second")
            start = cget(value, "start_date")
            end = cget(value, "end_date")
            subject_type = cget(value, "subject_type")
            if not (isinstance(first, str) and isinstance(second, str) and isinstance(start, str)):
                continue
            start_kind, end_kind = kinds
            payload = {"firstTag": first, "secondTag": second}
            if subject_type:
                payload["subjectType"] = subject_type
            out.append({"date": eu4_date_to_days(start), "nationTag": first, "kind": start_kind, "payload": payload})
            if isinstance(end, str):
                out.append({"date": eu4_date_to_days(end), "nationTag": first, "kind": end_kind, "payload": payload})
    out.sort(key=lambda e: e["date"])
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--province-names-topojson",
        type=Path,
        default=DEFAULT_PROVINCE_NAMES_TOPOJSON,
    )
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    provinces = convert_provinces(args.source, args.province_names_topojson)
    (args.output_dir / "provinces.json").write_text(json.dumps(provinces), encoding="utf-8")
    print(f"provinces.json: {len(provinces)} provinces")

    nations = convert_nations(args.source)
    (args.output_dir / "nations.json").write_text(json.dumps(nations), encoding="utf-8")
    print(f"nations.json: {len(nations)} nations with events")

    wars = convert_wars(args.source)
    (args.output_dir / "wars.json").write_text(json.dumps(wars), encoding="utf-8")
    print(f"wars.json: {len(wars)} wars")

    diplomacy = convert_diplomacy(args.source)
    (args.output_dir / "diplomacy.json").write_text(json.dumps(diplomacy), encoding="utf-8")
    print(f"diplomacy.json: {len(diplomacy)} relation events")


if __name__ == "__main__":
    main()
