"""Converts geo-explorer's static EU4 reference data (cultures, religions,
nations) into JSON used by src/model/earth/history/reference/*.ts. One-time
offline conversion -- see docs/earth-history-plan.md. Never parsed at
runtime; output is checked into public/earth-history/reference/.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from clausewitz import get, parse_file

_CAMEL_BOUNDARY_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def _split_camel_case(name: str) -> str:
    """geo-explorer's countries/*.txt filenames are PascalCase with no
    spaces (e.g. ByzantineEmpire.txt, CzechRepublic.txt, AkKoyunlu.txt) --
    used directly as the nation's display name. Insert a space at each
    lowercase/digit -> uppercase boundary so labels read naturally."""
    return _CAMEL_BOUNDARY_RE.sub(" ", name.replace("_", " "))

DEFAULT_SOURCE = Path(r"C:\Users\rayou\projects\geo-explorer\public")
DEFAULT_OUTPUT = Path("public/earth-history/reference")

_TRAILING_CULTURE_RE = re.compile(r"\s+Culture$", re.IGNORECASE)

# Manual display-name overrides, keyed by the raw EU4 id -- for cases the
# generic id->name derivation gets literally correct but awkward (e.g.
# "cosmopolitan_french" is EU4's real id for modern/assimilated French
# culture) or where the source filename doesn't read as a real-world name
# (e.g. MAM's file is "Burgi.txt" after the Burji Mamluk dynasty, not the
# more recognizable "Mamluks").
CULTURE_NAME_OVERRIDES = {
    "cosmopolitan_french": "French",
}
NATION_NAME_OVERRIDES = {
    "MAM": "Mamluks",
    "FR2": "France",
    "TEU": "Teutonic Order"
}


_DIGIT_RE = re.compile(r"\d+")


def _clean_name(name: str) -> str:
    """Applied to every generated culture/heritage display name: drop a
    trailing "Culture" (several EU4 culture ids end in "_culture", e.g.
    mahri_culture, purely to disambiguate from a same-named tag/religion --
    redundant once turned into a display name), strip any stray digits, and
    collapse the whitespace either leaves behind."""
    name = _TRAILING_CULTURE_RE.sub("", name)
    name = _DIGIT_RE.sub("", name)
    return re.sub(r"\s+", " ", name).strip()


def _clean_culture_name(culture_id: str, name: str) -> str:
    if culture_id in CULTURE_NAME_OVERRIDES:
        return CULTURE_NAME_OVERRIDES[culture_id]
    return _clean_name(name)


def _load_primary_tags(source: Path) -> dict[str, str]:
    """primary_tag ("union tag") per culture id is only in the Clausewitz
    00_cultures.txt, not cultures.json (see build_heritages)."""
    path = source / "cultures" / "00_cultures.txt"
    if not path.exists():
        return {}
    entries = parse_file(path)
    tags: dict[str, str] = {}
    for _heritage_id, block in entries:
        if not isinstance(block, list) or not block or not isinstance(block[0], tuple):
            continue
        for key, value in block:
            if isinstance(value, list) and value and isinstance(value[0], tuple):
                primary_tag = get(value, "primary")
                if primary_tag:
                    tags[key] = primary_tag
    return tags


def build_heritages(source: Path) -> list[dict]:
    """geo-explorer's cultures.json is pre-flattened JSON (not Clausewitz)
    with real per-culture colors and names, and is more complete than
    00_cultures.txt -- e.g. colonial-culture variants like
    british_californian/french_caribbean exist in real EU4 history data but
    aren't defined in 00_cultures.txt at all (only in mod/DLC content this
    conversion doesn't have access to), so relying on 00_cultures.txt alone
    left 35 real cultures with no display name, leaking their raw
    underscored id as a fallback. Only primary_tag isn't in cultures.json
    (see _load_primary_tags)."""
    path = source / "cultures.json"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    primary_tags = _load_primary_tags(source)

    cultures_by_group: dict[str, list[dict]] = {}
    for culture_id, entry in data.get("cultures", {}).items():
        group_id = entry.get("group")
        if not group_id:
            continue
        cultures_by_group.setdefault(group_id, []).append(
            {
                "id": culture_id,
                "name": _clean_culture_name(culture_id, entry.get("name", culture_id)),
                "primaryTag": primary_tags.get(culture_id),
                "color": entry.get("color"),
            }
        )

    heritages = []
    for group_id, group in data.get("groups", {}).items():
        cultures = cultures_by_group.get(group_id)
        if not cultures:
            continue
        heritages.append(
            {
                "id": group_id,
                "name": _clean_name(group.get("name", group_id)),
                "cultures": cultures,
            }
        )
    return heritages


def _parse_color(block: list) -> list[int] | None:
    color = get(block, "color")
    if isinstance(color, list) and len(color) == 3:
        try:
            return [int(float(c)) for c in color]
        except ValueError:
            return None
    return None


RELIGION_NAME_OVERRIDES = {
    "mesoamerican_religion": "Mayan",
    "buddhism": "Theravada",
    "shamanism": "Fetishist",
}
_PAGAN_REFORMED_RE = re.compile(r"\s*Pagan Reformed\s*", re.IGNORECASE)


def _clean_religion_name(religion_id: str, name: str) -> str:
    """"Pagan Reformed" is EU4's own naming for reformed pagan faiths (e.g.
    Tengri Pagan Reformed, Norse Pagan Reformed) -- dropped per request,
    leaving just the faith's own name (Tengri, Norse). "Reformed" alone
    (the Christian religion) and "Reformed Chalcedonism" are unaffected --
    the regex only matches the literal two-word "Pagan Reformed" phrase."""
    if religion_id in RELIGION_NAME_OVERRIDES:
        return RELIGION_NAME_OVERRIDES[religion_id]
    return _PAGAN_REFORMED_RE.sub("", name).strip()


def build_religion_groups(source: Path) -> list[dict]:
    groups = []
    for filename in ("00_religion.txt", "et_religion.txt"):
        path = source / "religions" / filename
        if not path.exists():
            continue
        entries = parse_file(path)
        for group_id, block in entries:
            if not isinstance(block, list) or not block or not isinstance(block[0], tuple):
                continue
            religions = []
            for key, value in block:
                if not (isinstance(value, list) and value and isinstance(value[0], tuple)):
                    continue
                color = _parse_color(value)
                if color is None:
                    continue
                display = _clean_religion_name(key, key.replace("_", " ").title())
                religions.append({"id": key, "name": display, "color": color})
            if religions:
                groups.append(
                    {
                        "id": group_id,
                        "name": group_id.replace("_", " ").title(),
                        "religions": religions,
                    }
                )
    return groups


def build_nations(source: Path) -> list[dict]:
    tag_to_path: dict[str, str] = {}
    for filename in ("00_countries.txt", "et_countries.txt"):
        path = source / "country_tags" / filename
        if not path.exists():
            continue
        for tag, rel_path in parse_file(path):
            tag_to_path[tag] = rel_path

    history_dir = source / "history" / "countries"
    tag_to_history: dict[str, Path] = {}
    if history_dir.exists():
        for f in history_dir.glob("*.txt"):
            # Filenames are "TAG - Name.txt", but a few source files omit
            # the space before the dash (e.g. "CLY- Chalukya.txt",
            # "KER- Keres.txt"); split on the dash with optional
            # surrounding whitespace so those still resolve to the real
            # tag instead of the whole stem.
            tag = re.split(r"\s*-\s*", f.stem, maxsplit=1)[0].strip()
            tag_to_history[tag] = f

    nations = []
    for tag, rel_path in tag_to_path.items():
        country_path = source / rel_path
        if not country_path.exists():
            continue
        block = parse_file(country_path)
        color = _parse_color(block) or [128, 128, 128]
        graphical_culture = get(block, "graphical_culture", "westerngfx")
        name = NATION_NAME_OVERRIDES.get(tag) or _clean_name(
            _split_camel_case(Path(rel_path).stem)
        )

        government_type = None
        primary_culture = None
        religion = None
        history_path = tag_to_history.get(tag)
        if history_path is not None:
            hist = parse_file(history_path)
            government_type = get(hist, "government")
            primary_culture = get(hist, "primary_culture")
            religion = get(hist, "religion")

        nations.append(
            {
                "tag": tag,
                "name": name,
                "color": color,
                "graphicalCulture": graphical_culture,
                "initialGovernmentType": government_type,
                "primaryCulture": primary_culture,
                "religion": religion,
            }
        )
    return nations


ANCIENT_NATIONS_OVERRIDES_PATH = (
    Path(__file__).resolve().parent / "data" / "ancient-nations-reference-overrides.json"
)


def _apply_ancient_nations_overrides(nations: list[dict]) -> list[dict]:
    """The `cp_*` pre-2AD placeholder tags (Greek city-states, Gallic/Germanic/
    Iberian tribes, Dayuan, etc.) don't come from geo-explorer's raw EU4
    source data at all -- they were minted and hand-filled in by the
    scripts/audit/build-*-audit.{py,cjs} passes across many one-off sessions,
    and most of those scripts never persisted their reference/nations.json
    additions back into a reproducible source. Without this override file, a
    plain `build-eu4-reference-data.py` + `build-cliopatria-events.py` regen
    silently drops all of them. This file is the durable snapshot of those
    entries; regenerate it (see scripts/audit/ancient-nation-audit-prompt.md)
    only if you deliberately add/change one."""
    if not ANCIENT_NATIONS_OVERRIDES_PATH.exists():
        return nations
    with ANCIENT_NATIONS_OVERRIDES_PATH.open(encoding="utf-8") as f:
        overrides = json.load(f)
    by_tag = {n["tag"]: n for n in nations}
    added = 0
    updated = 0
    for override in overrides:
        if override["tag"] in by_tag:
            by_tag[override["tag"]].update(override)
            updated += 1
        else:
            nations.append(override)
            by_tag[override["tag"]] = override
            added += 1
    print(f"ancient-nations-reference-overrides.json: added {added}, updated {updated} entries")
    return nations


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    heritages = build_heritages(args.source)
    (args.output_dir / "heritages.json").write_text(
        json.dumps(heritages, indent=2) + "\n", encoding="utf-8"
    )
    print(f"heritages.json: {len(heritages)} heritages")

    religion_groups = build_religion_groups(args.source)
    (args.output_dir / "religion-groups.json").write_text(
        json.dumps(religion_groups, indent=2) + "\n", encoding="utf-8"
    )
    print(f"religion-groups.json: {len(religion_groups)} groups")

    nations = build_nations(args.source)
    nations = _apply_ancient_nations_overrides(nations)
    (args.output_dir / "nations.json").write_text(
        json.dumps(nations, indent=2) + "\n", encoding="utf-8"
    )
    print(f"nations.json: {len(nations)} nations")


if __name__ == "__main__":
    main()
