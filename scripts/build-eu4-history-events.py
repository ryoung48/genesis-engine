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
from earth_history_organization_membership import (
    CURATED_ORGANIZATION_MEMBERSHIPS,
    CURATED_ORGANIZATION_SITES,
)
from eu4_date import eu4_date_to_days

DEFAULT_SOURCE = Path(r"C:\Users\rayou\projects\geo-explorer\public")
DEFAULT_OUTPUT = Path("public/earth-history/events")
DEFAULT_PROVINCE_NAMES_TOPOJSON = Path(
    r"C:\Users\rayou\projects\geo-explorer\public\provinces.topojson"
)

PROVINCE_FILE_RE = re.compile(r"^(\d+)\s*-\s*(.+)$")
DATE_BLOCK_START_RE = re.compile(r"^\s*(-?\d+\.\d+\.\d+)\s*=")

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

NATION_GOVERNMENT_EVENT_OVERRIDES = {
    # geo-explorer's flattened countries.json has these government/reform
    # transitions, but the raw history/countries files used for full ruler
    # history do not expose them as dated country-history events.
    "FRI": [
        ("1101.4.4", "republic", "peasants_republic"),
    ],
    "EFR": [
        ("896.1.1", "republic", "peasants_republic"),
    ],
}


# ── Provinces ────────────────────────────────────────────────────────────


def _read_text_with_fallback(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        return path.read_text(encoding="cp1252")


def _split_comment(line: str) -> tuple[str, str | None]:
    in_quotes = False
    for i, ch in enumerate(line):
        if ch == '"':
            in_quotes = not in_quotes
        elif ch == "#" and not in_quotes:
            comment = line[i + 1 :].strip()
            return line[:i], comment or None
    return line, None


def _extract_dated_comments(path: Path) -> dict[str, list[str]]:
    comments_by_date: dict[str, list[str]] = {}
    current_date: str | None = None
    current_comments: list[str] = []
    brace_depth = 0

    def finish_block() -> None:
        nonlocal current_date, current_comments, brace_depth
        if current_date is not None and current_comments:
            comments_by_date.setdefault(current_date, []).extend(current_comments)
        current_date = None
        current_comments = []
        brace_depth = 0

    for line in _read_text_with_fallback(path).splitlines():
        code, comment = _split_comment(line)
        if current_date is None:
            m = DATE_BLOCK_START_RE.match(code)
            if m is None:
                continue
            current_date = m.group(1)
            current_comments = []
            brace_depth = code.count("{") - code.count("}")
        else:
            brace_depth += code.count("{") - code.count("}")
        if comment is not None:
            current_comments.append(comment)
        if current_date is not None and brace_depth <= 0:
            finish_block()

    finish_block()
    return comments_by_date


def _extract_war_commentary(path: Path) -> dict[str, str]:
    """War narrative comments (e.g. "# Treaty of alliance", "# Third Battle
    of Panipat") always sit on their own line directly above the dated block
    they annotate -- unlike _extract_dated_comments, which sweeps up every
    comment *inside* a block (including noisy per-field ones like
    "# percent" on a losses value or a commander's name repeated as a
    comment), this only captures that one standalone preceding comment line,
    which is the actual editorial commentary. """
    commentary_by_date: dict[str, str] = {}
    pending: list[str] = []
    for line in _read_text_with_fallback(path).splitlines():
        code, comment = _split_comment(line)
        if not code.strip():
            if comment:
                pending.append(comment)
            continue
        m = DATE_BLOCK_START_RE.match(code)
        if m:
            if pending:
                commentary_by_date[m.group(1)] = " ".join(pending)
            pending = []
            continue
        pending = []
    return commentary_by_date


def _event(date: int, kind: str, payload: dict, comments: list[str] | None = None) -> dict:
    event = {"date": date, "kind": kind, "payload": payload}
    if comments:
        event["comment"] = " | ".join(dict.fromkeys(c for c in comments if c))
    return event


def _number(value: object) -> int | float | object:
    if not isinstance(value, str):
        return value
    try:
        parsed_int = int(value)
    except ValueError:
        try:
            return float(value)
        except ValueError:
            return value
    return parsed_int


def _yes_no(value: object) -> bool | object:
    if value == "yes":
        return True
    if value == "no":
        return False
    return value


def _clausewitz_value_to_json(value: object) -> object:
    if not isinstance(value, list):
        return _number(value)
    if not value:
        return {}
    if all(not isinstance(item, tuple) for item in value):
        return [_clausewitz_value_to_json(item) for item in value]

    out: dict[str, object] = {}
    for key, child in value:
        if key is None:
            continue
        json_value = _clausewitz_value_to_json(child)
        existing = out.get(key)
        if existing is None:
            out[key] = json_value
        elif isinstance(existing, list):
            existing.append(json_value)
        else:
            out[key] = [existing, json_value]
    return out


def _province_history_payload(sub_key: str, sub_value: object) -> tuple[str, dict] | None:
    numeric_keys = {
        "base_tax",
        "base_production",
        "base_manpower",
        "manpower",
        "unrest",
        "revolt_risk",
        "citysize",
        "native_size",
        "native_ferocity",
        "native_hostileness",
        "center_of_trade",
        "add_local_autonomy",
    }
    if sub_key in numeric_keys:
        return (
            {
                "base_tax": "baseTax",
                "base_production": "baseProduction",
                "base_manpower": "baseManpower",
                "revolt_risk": "revoltRisk",
                "citysize": "citySize",
                "native_size": "nativeSize",
                "native_ferocity": "nativeFerocity",
                "native_hostileness": "nativeHostileness",
                "center_of_trade": "centerOfTrade",
                "add_local_autonomy": "localAutonomyAdd",
            }.get(sub_key, sub_key),
            {"value": _number(sub_value)},
        )
    if sub_key == "revolt":
        return ("revolt", {"revolt": _clausewitz_value_to_json(sub_value)})
    if sub_key == "capital":
        return ("capitalName", {"name": sub_value})
    if sub_key == "trade_goods":
        return ("tradeGoods", {"tradeGoodId": sub_value})
    if sub_key == "is_city":
        return ("isCity", {"value": _yes_no(sub_value)})
    if sub_key.startswith("fort_"):
        return ("fort", {"era": sub_key.removeprefix("fort_"), "value": _yes_no(sub_value)})
    if sub_key == "tribal_owner":
        return ("tribalOwner", {"tag": sub_value})
    if sub_key == "discovered_by":
        return ("discoveredBy", {"tag": sub_value})
    if sub_key in {"add_claim", "remove_claim", "add_permanent_claim"}:
        return (
            {
                "add_claim": "claimAdd",
                "remove_claim": "claimRemove",
                "add_permanent_claim": "permanentClaimAdd",
            }[sub_key],
            {"tag": sub_value},
        )
    if sub_key in {"add_to_trade_company", "add_trade_company_investment"}:
        return (
            {
                "add_to_trade_company": "tradeCompanyAdd",
                "add_trade_company_investment": "tradeCompanyInvestmentAdd",
            }[sub_key],
            {"value": _clausewitz_value_to_json(sub_value)},
        )
    if sub_key in {
        "add_permanent_province_modifier",
        "add_province_triggered_modifier",
        "add_province_modifier",
        "remove_province_modifier",
    }:
        return (
            {
                "add_permanent_province_modifier": "permanentProvinceModifierAdd",
                "add_province_triggered_modifier": "provinceTriggeredModifierAdd",
                "add_province_modifier": "provinceModifierAdd",
                "remove_province_modifier": "provinceModifierRemove",
            }[sub_key],
            {"value": _clausewitz_value_to_json(sub_value)},
        )
    if sub_key in {"reformation_center", "estate", "seat_in_parliament"}:
        return (
            {
                "reformation_center": "reformationCenter",
                "seat_in_parliament": "seatInParliament",
            }.get(sub_key, sub_key),
            {"value": _yes_no(sub_value)},
        )
    if sub_key in {"shipyard", "temple", "textile"}:
        return (sub_key, {"value": _yes_no(sub_value)})
    return None


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
        comments_by_date = _extract_dated_comments(f)
        raw_base = {}
        for key in ("owner", "controller", "culture", "religion", "hre"):
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
                _event(EU4_COVERAGE_START_DATE, "owner", {"tag": raw_base["owner"]})
            )
        if raw_base.get("controller"):
            events.append(
                _event(EU4_COVERAGE_START_DATE, "controller", {"tag": raw_base["controller"]})
            )
        if raw_base.get("culture"):
            events.append(
                _event(EU4_COVERAGE_START_DATE, "culture", {"cultureId": raw_base["culture"]})
            )
        if raw_base.get("religion"):
            events.append(
                _event(EU4_COVERAGE_START_DATE, "religion", {"religionId": raw_base["religion"]})
            )
        if raw_base.get("hre") == "yes":
            events.append(
                _event(EU4_COVERAGE_START_DATE, "hre", {"member": True})
            )

        for key, value in entries:
            if not is_date_key(key) or not isinstance(value, list):
                continue
            if not value or not isinstance(value[0], tuple):
                continue
            date = eu4_date_to_days(key)
            comments = comments_by_date.get(key)
            sub_keys = {sub_key for sub_key, _ in value}
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
                    events.append(_event(date, "owner", {"tag": tag}, comments))
                elif sub_key == "controller" and isinstance(sub_value, str):
                    tag = None if sub_value == "XXX" else sub_value
                    events.append(_event(date, "controller", {"tag": tag}, comments))
                elif sub_key == "add_core" and isinstance(sub_value, str):
                    events.append(_event(date, "coreAdd", {"tag": sub_value}, comments))
                elif sub_key == "remove_core" and isinstance(sub_value, str):
                    events.append(_event(date, "coreRemove", {"tag": sub_value}, comments))
                elif sub_key == "culture" and isinstance(sub_value, str):
                    events.append(_event(date, "culture", {"cultureId": sub_value}, comments))
                elif sub_key == "religion" and isinstance(sub_value, str):
                    events.append(_event(date, "religion", {"religionId": sub_value}, comments))
                elif sub_key == "hre" and isinstance(sub_value, str):
                    events.append(_event(date, "hre", {"member": sub_value == "yes"}, comments))
                else:
                    converted = _province_history_payload(sub_key, sub_value)
                    if converted is not None and (comments or sub_key in {"revolt", "unrest", "tribal_owner"}):
                        kind, payload = converted
                        events.append(_event(date, kind, payload, comments))
                        if sub_key == "tribal_owner" and isinstance(sub_value, str):
                            if "owner" not in sub_keys:
                                events.append(_event(date, "owner", {"tag": sub_value}, comments))
                            if "controller" not in sub_keys:
                                events.append(_event(date, "controller", {"tag": sub_value}, comments))
                    elif comments:
                        events.append(
                            _event(
                                date,
                                "rawProvinceHistory",
                                {
                                    "key": sub_key,
                                    "value": _clausewitz_value_to_json(sub_value),
                                },
                                comments,
                            )
                        )

        events.sort(key=lambda e: e["date"])
        out[province_id] = {"base": base, "events": events}

    return out


# ── Nations (government, reforms, rulers) ──────────────────────────────


def _clean_ruler_name(name: object) -> str | None:
    if not isinstance(name, str):
        return None
    name = name.strip()
    if name.startswith("(") and name.endswith(")"):
        name = name[1:-1].strip()
    return name or None


def _camel_case_key(key: object) -> object:
    if not isinstance(key, str):
        return key
    aliases = {
        "birth_Date": "birthDate",
        "birth_date": "birthDate",
        "country_of_origin": "countryOfOrigin",
        "death_Date": "deathDate",
        "death_date": "deathDate",
        "monarch_name": "monarchName",
        "manuever": "maneuver",
    }
    if key in aliases:
        return aliases[key]
    parts = key.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def _person_payload(entries: list) -> dict:
    payload: dict[str, object] = {}
    raw = _clausewitz_value_to_json(entries)
    if isinstance(raw, dict):
        for key, value in raw.items():
            normalized_key = _camel_case_key(key)
            normalized_value = _yes_no(value)
            if normalized_key in {"adm", "dip", "mil", "fire", "shock", "maneuver", "siege", "claim"}:
                normalized_value = _number(normalized_value)
            payload[normalized_key] = normalized_value
    if "name" in payload:
        payload["name"] = _clean_ruler_name(payload["name"])
    return payload


def _nation_history_payload(sub_key: object, sub_value: object) -> tuple[str, dict] | None:
    if sub_key is None:
        return None

    string_value = _yes_no(sub_value)
    number_value = _number(string_value)
    structured_value = _clausewitz_value_to_json(sub_value)

    simple_value_kinds = {
        "add_accepted_culture": "acceptedCultureAdd",
        "add_heir_personality": "heirTrait",
        "add_piety": "piety",
        "add_queen_personality": "queenTrait",
        "add_ruler_personality": "rulerTrait",
        "change_unit_type": "unitType",
        "changed_tag_from": "tagFrom",
        "clear_scripted_personalities": "clearTraits",
        "clr_country_flag": "countryFlagClear",
        "culture": "culture",
        "decision": "decision",
        "enable_hre_leagues": "hreLeagues",
        "government_rank": "govRank",
        "join_league": "leagueJoin",
        "leave_league": "leagueLeave",
        "mercantilism": "mercantilism",
        "override_country_name": "nameOverride",
        "primary_culture": "primaryCulture",
        "religion": "religion",
        "religious_school": "school",
        "remove_accepted_culture": "acceptedCultureRemove",
        "remove_country_modifier": "countryModifierRemove",
        "restore_country_name": "nameRestore",
        "revolution_target": "revolutionTarget",
        "secondary_religion": "secondaryReligion",
        "set_country_flag": "countryFlagSet",
        "set_global_flag": "globalFlagSet",
        "set_heir_flag": "heirFlagSet",
        "set_hre_religion_treaty": "hreTreaty",
        "set_legacy_government": "legacyGov",
        "set_ruler_flag": "rulerFlagSet",
        "technology_group": "techGroup",
        "unit_type": "unitType",
    }
    if sub_key in simple_value_kinds:
        return (simple_value_kinds[sub_key], {"value": number_value})

    structured_value_kinds = {
        "add_country_modifier": "countryModifierAdd",
        "add_ruler_modifier": "rulerModifierAdd",
        "change_price": "priceChange",
        "federation": "federation",
        "set_estate_privilege": "estatePrivilege",
    }
    if sub_key in structured_value_kinds:
        return (structured_value_kinds[sub_key], {"value": structured_value})

    ambient_kinds = {
        "hide_ambient_object": "ambientHide",
        "show_ambient_object": "ambientShow",
    }
    if sub_key in ambient_kinds:
        return (ambient_kinds[sub_key], {"objectId": string_value})

    if sub_key == "elector":
        return ("elector", {"elector": string_value == "yes"})

    if sub_key == "set_government":
        return ("governmentChange", {"governmentType": string_value})

    return None


def _load_elector_transitions(source: Path) -> dict[str, list[tuple[str, bool]]]:
    """geo-explorer's countries.json is a pre-flattened, per-country JSON
    (color/name/dated history) that -- unlike the raw history/countries/*.txt
    files -- carries a dated `elector` boolean directly, so this is the only
    thing pulled from it; government/reform/capital/monarch already come
    from the raw .txt files below and aren't duplicated from here."""
    path = source / "countries.json"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    transitions: dict[str, list[tuple[str, bool]]] = {}
    for tag, entry in data.items():
        tag_transitions = [
            (h["date"], bool(h["elector"]))
            for h in entry.get("history", [])
            if "elector" in h and isinstance(h.get("date"), str)
        ]
        if tag_transitions:
            transitions[tag] = tag_transitions
    return transitions


def convert_nations(source: Path) -> dict:
    from clausewitz import get as cget

    elector_transitions = _load_elector_transitions(source)

    out: dict[str, dict] = {}
    hist_dir = source / "history" / "countries"
    for f in hist_dir.glob("*.txt"):
        tag = f.stem.split(" - ", 1)[0].strip()
        entries = parse_file(f)
        comments_by_date = _extract_dated_comments(f)

        events = []
        for key, value in entries:
            if not is_date_key(key) or not isinstance(value, list):
                continue
            if not value or not isinstance(value[0], tuple):
                continue
            date = eu4_date_to_days(key)
            comments = comments_by_date.get(key)
            for sub_key, sub_value in value:
                if sub_key == "government" and isinstance(sub_value, str):
                    events.append(
                        _event(date, "governmentChange", {"governmentType": sub_value}, comments)
                    )
                elif sub_key == "add_government_reform" and isinstance(sub_value, str):
                    events.append(
                        _event(date, "governmentReformAdd", {"reformId": sub_value}, comments)
                    )
                elif sub_key == "remove_government_reform" and isinstance(sub_value, str):
                    events.append(
                        _event(date, "governmentReformRemove", {"reformId": sub_value}, comments)
                    )
                elif sub_key == "capital" and isinstance(sub_value, str):
                    events.append(
                        _event(date, "capitalChange", {"provinceId": sub_value}, comments)
                    )
                elif sub_key == "monarch" and isinstance(sub_value, list):
                    events.append(_event(date, "rulerChange", _person_payload(sub_value), comments))
                elif sub_key == "heir" and isinstance(sub_value, list):
                    events.append(_event(date, "heirChange", _person_payload(sub_value), comments))
                elif sub_key == "queen" and isinstance(sub_value, list):
                    events.append(_event(date, "queenChange", _person_payload(sub_value), comments))
                elif sub_key == "leader" and isinstance(sub_value, list):
                    events.append(_event(date, "leaderAdd", _person_payload(sub_value), comments))
                elif sub_key is None:
                    continue
                elif comments:
                    converted = _nation_history_payload(sub_key, sub_value)
                    if converted is None:
                        raise ValueError(f"Uncategorized commented nation history key {sub_key!r} in {f}")
                    kind, payload = converted
                    events.append(_event(date, kind, payload, comments))

        for date_str, name in NATION_NAME_EVENT_OVERRIDES.get(tag, ()):
            events.append(
                {
                    "date": eu4_date_to_days(date_str),
                    "kind": "nameChange",
                    "payload": {"name": name},
                }
            )

        for date_str, government_type, reform_id in NATION_GOVERNMENT_EVENT_OVERRIDES.get(tag, ()):
            date = eu4_date_to_days(date_str)
            events.append(
                {
                    "date": date,
                    "kind": "governmentChange",
                    "payload": {"governmentType": government_type},
                }
            )
            events.append(
                {
                    "date": date,
                    "kind": "governmentReformAdd",
                    "payload": {"reformId": reform_id},
                }
            )

        for date_str, elector in elector_transitions.get(tag, ()):
            events.append(
                {
                    "date": eu4_date_to_days(date_str),
                    "kind": "elector",
                    "payload": {"elector": elector},
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


def _parse_int(value) -> int | None:
    # The Clausewitz parser (clausewitz.py) never converts leaf tokens --
    # every value, numeric or not, comes through as a plain string.
    if isinstance(value, str) and value.lstrip("-").isdigit():
        return int(value)
    return None


def _parse_battle_side(entries) -> dict | None:
    if not isinstance(entries, list):
        return None
    from clausewitz import get as cget

    country = cget(entries, "country", None)
    if not isinstance(country, str):
        return None
    commander = cget(entries, "commander", None)
    return {
        "country": country,
        "commander": commander if isinstance(commander, str) else None,
        "infantry": _parse_int(cget(entries, "infantry", None)),
        "cavalry": _parse_int(cget(entries, "cavalry", None)),
        "artillery": _parse_int(cget(entries, "artillery", None)),
        "losses": _parse_int(cget(entries, "losses", None)),
    }


def merge_war_record(base: dict, incoming: dict) -> dict:
    events_by_key = {
        (event["date"], event["nationTag"], event["kind"], event["side"]): event
        for event in [*base["events"], *incoming["events"]]
    }
    events = sorted(events_by_key.values(), key=lambda e: (e["date"], e["nationTag"], e["kind"], e["side"]))
    battles_by_key = {
        (battle["date"], battle["name"], battle["attacker"]["country"], battle["defender"]["country"]): battle
        for battle in [*base["battles"], *incoming["battles"]]
    }
    battles = sorted(battles_by_key.values(), key=lambda b: b["date"])
    return {
        "warId": base["warId"],
        "name": base["name"] or incoming["name"],
        "casusBelli": base["casusBelli"] or incoming["casusBelli"],
        "warGoalType": base["warGoalType"] or incoming["warGoalType"],
        "warGoalTag": base["warGoalTag"] or incoming["warGoalTag"],
        "warGoalProvince": base["warGoalProvince"] or incoming["warGoalProvince"],
        "isRebel": bool(base["isRebel"] or incoming["isRebel"]),
        "events": events,
        "battles": battles,
    }


def convert_wars(source: Path) -> list:
    from clausewitz import get as cget

    out_by_id = {}
    wars_dirs = [source / "history" / "wars", source / "old" / "history" / "wars"]
    for wars_dir in wars_dirs:
        if not wars_dir.exists():
            continue
        for f in wars_dir.glob("*.txt"):
            entries = parse_file(f)
            name = cget(entries, "name", f.stem)
            war_goal = cget(entries, "war_goal", [])
            casus_belli = cget(war_goal, "casus_belli", "") if isinstance(war_goal, list) else ""
            war_goal_type = cget(war_goal, "type", "") if isinstance(war_goal, list) else ""
            war_goal_tag_raw = cget(war_goal, "tag", None) if isinstance(war_goal, list) else None
            war_goal_tag = war_goal_tag_raw if isinstance(war_goal_tag_raw, str) else None
            # A war goal targets either a nation (`tag`) or a province
            # (`province`, a raw EU4 province id) -- never both, per EU4's own
            # war_goal schema (e.g. history/wars/AkbarOrissa.txt's
            # `province = 552` vs. americancivilwar.txt's `tag = USA`).
            war_goal_province_raw = (
                cget(war_goal, "province", None) if isinstance(war_goal, list) else None
            )
            war_goal_province = (
                str(war_goal_province_raw)
                if isinstance(war_goal_province_raw, (str, int))
                else None
            )
            is_rebel = any(h in casus_belli.lower() for h in REBEL_CB_HINTS)
            commentary_by_date = _extract_war_commentary(f)

            participant_events = []
            battle_records = []
            for key, value in entries:
                if not is_date_key(key) or not isinstance(value, list):
                    continue
                if not value or not isinstance(value[0], tuple):
                    continue
                date = eu4_date_to_days(key)
                comment = commentary_by_date.get(key)
                for sub_key, tag in value:
                    if sub_key == "add_attacker" and isinstance(tag, str):
                        event = {"date": date, "nationTag": tag, "kind": "warStart", "side": "attacker"}
                        if comment:
                            event["comment"] = comment
                        participant_events.append(event)
                    elif sub_key == "add_defender" and isinstance(tag, str):
                        event = {"date": date, "nationTag": tag, "kind": "warStart", "side": "defender"}
                        if comment:
                            event["comment"] = comment
                        participant_events.append(event)
                    elif sub_key == "rem_attacker" and isinstance(tag, str):
                        event = {"date": date, "nationTag": tag, "kind": "warEnd", "side": "attacker"}
                        if comment:
                            event["comment"] = comment
                        participant_events.append(event)
                    elif sub_key == "rem_defender" and isinstance(tag, str):
                        event = {"date": date, "nationTag": tag, "kind": "warEnd", "side": "defender"}
                        if comment:
                            event["comment"] = comment
                        participant_events.append(event)
                    elif sub_key == "battle" and isinstance(tag, list):
                        battle_name = cget(tag, "name", "")
                        location_raw = cget(tag, "location", None)
                        location = (
                            str(location_raw) if isinstance(location_raw, (str, int)) else None
                        )
                        attacker_side = _parse_battle_side(cget(tag, "attacker", []))
                        defender_side = _parse_battle_side(cget(tag, "defender", []))
                        result_raw = cget(tag, "result", "no")
                        attacker_won = result_raw == "yes" if isinstance(result_raw, str) else False
                        if attacker_side and defender_side:
                            battle = {
                                "date": date,
                                "name": battle_name,
                                "locationProvinceId": location,
                                "attacker": attacker_side,
                                "defender": defender_side,
                                "attackerWon": attacker_won,
                            }
                            if comment:
                                battle["comment"] = comment
                            battle_records.append(battle)

            if not participant_events:
                continue
            participant_events.sort(key=lambda e: e["date"])
            battle_records.sort(key=lambda b: b["date"])
            record = {
                "warId": f.stem,
                "name": name,
                "casusBelli": casus_belli,
                "warGoalType": war_goal_type,
                "warGoalTag": war_goal_tag,
                "warGoalProvince": war_goal_province,
                "isRebel": is_rebel,
                "battles": battle_records,
                "events": participant_events,
            }
            out_by_id[f.stem] = merge_war_record(out_by_id[f.stem], record) if f.stem in out_by_id else record
    return list(out_by_id.values())


# ── Diplomacy (alliances, vassals, unions, dependencies) ───────────────

RELATION_KEYS = {
    "alliance": ("allianceStart", "allianceEnd"),
    "guarantee": ("guaranteeStart", "guaranteeEnd"),
    "royal_marriage": ("royalMarriageStart", "royalMarriageEnd"),
    "vassal": ("vassalStart", "vassalEnd"),
    "union": ("unionStart", "unionEnd"),
    "dependency": ("dependencyStart", "dependencyEnd"),
}


def convert_diplomacy(source: Path) -> list:
    from clausewitz import get as cget

    out = []
    diplomacy_dirs = [source / "history" / "diplomacy", source / "old" / "history" / "diplomacy"]
    for diplo_dir in diplomacy_dirs:
        if not diplo_dir.exists():
            continue
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
    out.extend(convert_emperors(source))
    out.sort(key=lambda e: e["date"])
    return out


def convert_emperors(source: Path) -> list:
    """geo-explorer's hre.json is a hand-curated list of {date, emperor}
    entries (EU4's own HRE emperor mechanic isn't scripted per-tag in the
    country history files -- HLR - Holy Roman Empire.txt's succession is
    only documented as free-text comments, not parseable fields -- so this
    is sourced separately rather than from history/countries like
    elector/government). Modeled as a diplomacy-style relation between the
    emperor tag and "HLR" (the empire's own country tag, present in
    nations.json like any other converted country) so it reuses the
    existing firstTag/secondTag fold machinery instead of a bespoke shape.
    """
    path = source / "hre.json"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    out = []
    prev_tag: str | None = None
    for entry in data.get("emperors", []):
        date_str = entry.get("date")
        tag = entry.get("emperor")
        if not isinstance(date_str, str) or not isinstance(tag, str):
            continue
        if tag == prev_tag:
            continue
        date = eu4_date_to_days(date_str)
        if prev_tag is not None and prev_tag != "---":
            out.append(
                {
                    "date": date,
                    "nationTag": prev_tag,
                    "kind": "emperorEnd",
                    "payload": {"firstTag": prev_tag, "secondTag": "HLR"},
                }
            )
        if tag != "---":
            out.append(
                {
                    "date": date,
                    "nationTag": tag,
                    "kind": "emperorStart",
                    "payload": {"firstTag": tag, "secondTag": "HLR"},
                }
            )
        prev_tag = tag
    return out


# ── International organizations (Hanseatic League, ...) ────────────────


def convert_organizations(source: Path) -> list:
    """Convert curated organization rows into generic history events.

    Unlike HRE, whose membership is inherently territorial (see convert_provinces'
    province-level `hre` field), HSA members are modeled as discrete per-nation
    relations while foreign kontors/trade posts are modeled as province-level
    sites. The Hanseatic League is curated instead of inferred from geo-explorer's
    HSA alliance rows because it was a loose city league and trading network,
    not a normal country-to-country alliance.
    """
    out = []
    # A row's leave_date is often immediately superseded by another row's
    # join_date for the same (org, nation) -- e.g. Milan flipping from
    # guelphMember to ghibellineLeader in 1277 with no real gap in between.
    # The subsequent join already overwrites FoldedNationState.organizations'
    # role for that org (see fold.ts's applyOrganizationDelta), so emitting
    # the leave event too would only add a redundant back-to-back
    # "left the org" / "joined the org" pair to the timeline for what is
    # really a single continuous membership switching sides. Skip the leave
    # in that case; a leave still fires normally when a row's membership
    # actually ends (no immediately-following row for that org/nation).
    join_dates_by_member = {}
    for membership in CURATED_ORGANIZATION_MEMBERSHIPS:
        key = (membership.org_id, membership.nation_tag)
        join_dates_by_member.setdefault(key, set()).add(membership.join_date)
    for membership in CURATED_ORGANIZATION_MEMBERSHIPS:
        out.append(
            {
                "date": eu4_date_to_days(membership.join_date),
                "nationTag": membership.nation_tag,
                "kind": "join",
                "payload": {"orgId": membership.org_id, "role": membership.role},
            }
        )
        key = (membership.org_id, membership.nation_tag)
        superseded = membership.leave_date in join_dates_by_member.get(key, ())
        if membership.leave_date is not None and not superseded:
            out.append(
                {
                    "date": eu4_date_to_days(membership.leave_date),
                    "nationTag": membership.nation_tag,
                    "kind": "leave",
                    "payload": {"orgId": membership.org_id, "role": membership.role},
                }
            )
    for site in CURATED_ORGANIZATION_SITES:
        out.append(
            {
                "date": eu4_date_to_days(site.start_date),
                "provinceId": site.province_id,
                "kind": "siteStart",
                "payload": {
                    "orgId": site.org_id,
                    "name": site.name,
                    "role": site.role,
                },
            }
        )
        if site.end_date is not None:
            out.append(
                {
                    "date": eu4_date_to_days(site.end_date),
                    "provinceId": site.province_id,
                    "kind": "siteEnd",
                    "payload": {
                        "orgId": site.org_id,
                        "name": site.name,
                        "role": site.role,
                    },
                }
            )
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

    organizations = convert_organizations(args.source)
    (args.output_dir / "organizations.json").write_text(json.dumps(organizations), encoding="utf-8")
    print(f"organizations.json: {len(organizations)} organization events")


if __name__ == "__main__":
    main()
