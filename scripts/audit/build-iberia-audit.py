"""One-off generator for the pre-2AD Iberia audit batch (Lusitani,
Celtiberians, Cantabri, Astures, Vaccaei, Vettones, Turdetani, Carpetani,
Bastetani, Gallaeci, Ilergetes, Vascones). Follows
scripts/audit/ancient-nation-audit-prompt.md. Mints new cp_ tags into
reference/nations.json, same pattern as build-gaul-audit.py and
build-germania-audit.py.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from eu4_date import eu4_date_to_days  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AUDITS_DIR = REPO_ROOT / "public" / "earth-history" / "audits"
REFERENCE_NATIONS = REPO_ROOT / "public" / "earth-history" / "reference" / "nations.json"
CONVERTED_PROVINCES = REPO_ROOT / "public" / "earth-history" / "events" / "provinces.json"

with CONVERTED_PROVINCES.open(encoding="utf-8") as _f:
    _CONVERTED_PROVINCES = json.load(_f)


def d(year: int, month: int = 1, day: int = 1) -> int:
    astro_year = 1 - year
    return eu4_date_to_days(f"{astro_year}.{month}.{day}")


def event(date_: int, kind: str, payload: dict, note: str, confidence: str = "traditional") -> dict:
    return {"date": date_, "kind": kind, "payload": payload, "note": note, "sourceConfidence": confidence}


def ruler(date_: int, name: str, note: str, confidence: str = "traditional", **extra) -> dict:
    return event(date_, "rulerChange", {"name": name, **extra}, note, confidence)


def gov_change(date_: int, gov_type: str, note: str, confidence: str = "traditional") -> dict:
    return event(date_, "governmentChange", {"governmentType": gov_type}, note, confidence)


def reform_add(date_: int, reform_id: str, note: str, confidence: str = "traditional") -> dict:
    return event(date_, "governmentReformAdd", {"reformId": reform_id}, note, confidence)


def owner_events(date_: int, tag: str, note: str, confidence: str = "traditional") -> list[dict]:
    return [
        event(date_, "owner", {"tag": tag}, note, confidence),
        event(date_, "controller", {"tag": tag}, note, confidence),
    ]


def backfill_culture_religion(province_id: str, start_date: int, note: str) -> list[dict]:
    """Same gap-closing fix used in build-gaul-audit.py/build-germania-audit.py:
    carries the province's own existing (nearest-future) culture/religion
    values back to the tribe's start date if the source data's own coverage
    starts later, instead of leaving the map blank for that whole span.
    Excludes this same backfill's own prior injections (by their distinctive
    note marker), since the full pipeline rebuilds provinces.json from
    scratch each time rather than incrementally."""
    backfill_marker = "Carries the province's own existing culture/religion values back"
    events = [e for e in _CONVERTED_PROVINCES[province_id]["events"] if backfill_marker not in e.get("comment", "")]
    culture = min((e for e in events if e["kind"] == "culture"), key=lambda e: e["date"], default=None)
    religion = min((e for e in events if e["kind"] == "religion"), key=lambda e: e["date"], default=None)
    out = []
    if culture and culture["date"] > start_date:
        out.append(event(start_date, "culture", {"cultureId": culture["payload"]["cultureId"]}, note, "abstraction"))
    if religion and religion["date"] > start_date:
        out.append(event(start_date, "religion", {"religionId": religion["payload"]["religionId"]}, note, "abstraction"))
    return out


# ── Tags minted into reference/nations.json ─────────────────────────────

NEW_TAGS = [
    {"tag": "cp_lusitani", "name": "Lusitani", "color": [150, 90, 60]},
    {"tag": "cp_celtiberians", "name": "Celtiberians", "color": [110, 120, 90]},
    {"tag": "cp_cantabri", "name": "Cantabri", "color": [90, 100, 110]},
    {"tag": "cp_astures", "name": "Astures", "color": [100, 90, 80]},
    {"tag": "cp_vaccaei", "name": "Vaccaei", "color": [140, 130, 90]},
    {"tag": "cp_vettones", "name": "Vettones", "color": [120, 100, 70]},
    {"tag": "cp_turdetani", "name": "Turdetani", "color": [160, 140, 60]},
    {"tag": "cp_carpetani", "name": "Carpetani", "color": [130, 110, 100]},
    {"tag": "cp_bastetani", "name": "Bastetani", "color": [150, 100, 90]},
    {"tag": "cp_gallaeci", "name": "Gallaeci", "color": [80, 110, 100]},
    {"tag": "cp_ilergetes", "name": "Ilergetes", "color": [110, 90, 130]},
    {"tag": "cp_vascones", "name": "Vascones", "color": [100, 130, 80]},
]


def mint_tags() -> int:
    with REFERENCE_NATIONS.open(encoding="utf-8") as f:
        reference_nations = json.load(f)
    existing = {r["tag"] for r in reference_nations}
    minted = 0
    for entry in NEW_TAGS:
        if entry["tag"] in existing:
            continue
        reference_nations.append(
            {
                "tag": entry["tag"],
                "name": entry["name"],
                "color": entry["color"],
                "graphicalCulture": "westerngfx",
                "initialGovernmentType": "tribal",
                "primaryCulture": "iberi",
                "religion": "druidism",
            }
        )
        minted += 1
    if minted:
        REFERENCE_NATIONS.write_text(json.dumps(reference_nations, indent=2) + "\n", encoding="utf-8")
    return minted


# ── Nations ──────────────────────────────────────────────────────────────

nations: dict[str, dict] = {}


def nation(tag: str, capital_province: str, capital_note: str, events: list[dict]) -> None:
    start_date = events[0]["date"]
    province_events = owner_events(start_date, tag, capital_note, "abstraction")
    province_events += backfill_culture_religion(
        capital_province,
        start_date,
        f"{capital_note} Carries the province's own existing culture/religion values back to this earlier owner date instead of leaving them unset before the point where the source data's own coverage begins.",
    )
    nations[tag] = {
        "tag": tag,
        "events": events,
        "provinceEvents": {capital_province: province_events},
    }


nation(
    "cp_lusitani",
    "4150",
    "Evora is a direct match for Lusitanian territory in the modern Alentejo region.",
    [
        gov_change(d(400), "tribal", "Lusitani tribal kingdom, best known for sustained guerrilla resistance to Rome in the 2nd century BC.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform.", "abstraction"),
        ruler(d(155), "Punicus", "Lusitanian leader who defeated and killed a Roman praetor in 153 BC, opening the Lusitanian War.", "traditional"),
        ruler(d(153, 6, 1), "Caesarus", "Succeeded Punicus after his death, continuing raids into Roman Hispania Ulterior.", "traditional"),
        ruler(d(147), "Viriathus", "Shepherd-turned-guerrilla commander who became the single most effective Lusitanian leader; repeatedly defeated Roman armies through 147-140 BC, forcing humiliating treaties, before being assassinated by his own envoys after they were bribed by Rome, 139 BC.", "traditional"),
        ruler(d(139, 6, 1), "Tautalus", "Chosen successor after Viriathus's assassination; led a final march on Saguntum before surrendering to Rome shortly after, ending organized Lusitanian resistance.", "traditional"),
    ],
)

nation(
    "cp_celtiberians",
    "2755",
    "Soria sits immediately beside Numantia, the Celtiberian Arevaci's chief town and the site of the war's climactic siege.",
    [
        gov_change(d(400), "tribal", "Celtiberian federation (chiefly the Arevaci, Belli, Titti, and Lusones) in the central Iberian plateau.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(153), "Karos of the Belli", "Ambushed and destroyed a large Roman force under consul Quintus Fulvius Nobilior near Segeda in 153 BC (Appian's \"massacre of the dawn\"), before being killed later the same day in the pursuit.", "traditional"),
        ruler(d(143, 1, 1), "Numantine war-leaders", "Numantia's Arevaci defenders resisted a sequence of Roman commanders for a decade; the sources emphasize collective civic resistance over any single dominant leader for most of the siege.", "abstraction"),
        ruler(d(134, 6, 1), "Rhetogenes Caraunius", "Led a desperate breakout from besieged Numantia to seek help from neighboring towns; most refused out of fear of Rome, and the attempt failed to relieve the siege.", "traditional"),
        ruler(d(133, 8, 1), "Numantia's final defenders", "After Scipio Aemilianus's encirclement and an 8-month siege, the starving defenders burned their own city and largely killed themselves rather than surrender, 133 BC -- ending organized Celtiberian resistance and becoming a byword for defiance in Roman memory.", "traditional"),
    ],
)

nation(
    "cp_cantabri",
    "1745",
    "Cantabria is a direct match for Cantabri territory.",
    [
        gov_change(d(400), "tribal", "Cantabri tribal federation of the northern mountains, among the last and hardest-fought Roman conquests in Iberia.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(26), "Cantabri war-leaders of the Cantabrian Wars", "Resisted Augustus's personal campaign (his only campaign led in person as emperor) from mountain strongholds through 26-19 BC; no individual Cantabri leader is named in the surviving sources, unusually for a war this well documented on the Roman side.", "abstraction"),
    ],
)

nation(
    "cp_astures",
    "207",
    "Asturias is a direct match for Astures territory.",
    [
        gov_change(d(400), "tribal", "Astures tribal federation of the northwestern mountains, fighting alongside the Cantabri against Augustus's legions.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(25), "Astures war-leaders of the Cantabrian Wars", "Rose against Rome in 25 BC even after the Cantabri's nominal submission; their final defeat, including the mass suicide of defenders at Mons Medullius rather than face capture, effectively completed Rome's conquest of Iberia by 19 BC. No individual Astures leader is named in the surviving sources.", "abstraction"),
    ],
)

nation(
    "cp_vaccaei",
    "4552",
    "Palencia sits within Vaccaei territory on the northern Meseta.",
    [
        gov_change(d(400), "tribal", "Vaccaei tribal federation of the Duero valley, noted by ancient sources for unusually communal land tenure.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(220), "Vaccaei war-leaders against Hannibal", "Hannibal stormed the Vaccaei towns of Helmantike (Salamanca) and Arbucala in 220 BC; the Vaccaei, Carpetani, and Olcades then formed a coalition that Hannibal defeated at the Battle of the Tagus the same year. No individual Vaccaei leader from this campaign is named in the surviving sources.", "traditional"),
    ],
)

nation(
    "cp_vettones",
    "4551",
    "Avila is a direct match for Vettones territory, still known today for the tribe's distinctive verraco stone bull sculptures.",
    [
        gov_change(d(400), "tribal", "Vettones tribal federation, often allied with or subordinate to the Lusitani during Viriathus's war.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(193), "Vettones war-leaders of the 193 BC coalition", "Joined the Carpetani and Vaccaei in a coalition defeated by consul Marcus Fulvius Nobilior at the Battle of Toletum, 193 BC; no individual Vettones leader from this campaign is named in the surviving sources.", "abstraction"),
    ],
)

nation(
    "cp_turdetani",
    "4548",
    "Huelva sits within Turdetani/Tartessian territory in the far southwest, near the Rio Tinto mining region that made the area legendary for wealth.",
    [
        gov_change(d(560), "monarchy", "Kingdom of Tartessos/the Turdetani, the most economically developed and, per Herodotus, best-documented early Iberian polity -- famed for metal wealth and early contact with Phocaean Greek traders.", "traditional"),
        reform_add(d(560), "tribal_kingdom", "Reuses the tribal_kingdom reform.", "abstraction"),
        ruler(d(560), "Argantonius", "Semi-legendary king of Tartessos described by Herodotus as reigning some 80 years and welcoming the Phocaean trader Colaeus and later the founders of Massalia with great wealth and friendship; among the earliest individually named rulers in Iberian history.", "traditional"),
        ruler(d(206, 6, 1), "Turdetani elders of the Roman transition", "Turdetani territory was absorbed relatively peacefully into Rome's new Hispania Ulterior province after Scipio's victory over Carthage in Iberia, 206 BC; no individual Turdetani leader from this transition is named in the surviving sources.", "abstraction"),
    ],
)

nation(
    "cp_carpetani",
    "219",
    "Toledo is a direct match for Carpetani territory (their chief town, Toletum, is the origin of the city's name).",
    [
        gov_change(d(400), "tribal", "Carpetani tribal federation of the central Meseta, repeatedly drawn into wars with both Carthage and Rome.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(220), "Carpetani war-leaders against Hannibal", "Joined the Vaccaei and Olcades in a coalition Hannibal defeated at the Battle of the Tagus, 220 BC; no individual Carpetani leader from this campaign is named in the surviving sources.", "traditional"),
        ruler(d(193), "Carpetani war-leaders of the 193 BC revolt", "Led a renewed coalition with the Vaccaei and Vettones against Rome, defeated by consul Marcus Fulvius Nobilior at the Battle of Toletum -- fought in the Carpetani's own territory -- in 193 BC.", "traditional"),
    ],
)

nation(
    "cp_bastetani",
    "223",
    "Granada sits within Bastetani territory in the southeast.",
    [
        gov_change(d(400), "tribal", "Bastetani tribal federation of the southeast coast and interior, in the contested borderland between Punic and Roman spheres during the Second Punic War.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(197, 6, 1), "Bastetani elders of the provincial reorganization", "Bastetani territory was absorbed into Rome's newly organized Hispania Citerior/Ulterior provincial system in 197 BC; no individual Bastetani leader from this period is named in the surviving sources.", "abstraction"),
    ],
)

nation(
    "cp_gallaeci",
    "4554",
    "Lugo is a direct match for Gallaeci territory in the northwest.",
    [
        gov_change(d(400), "tribal", "Gallaeci tribal federation of the far northwest, among the last regions of Iberia to see direct Roman military expeditions.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(138), "Gallaeci war-leaders against Decimus Junius Brutus", "Decimus Junius Brutus led the first major Roman expedition into Gallaecia in 138-136 BC, crossing the Limia (Lethe) river that Roman soldiers reportedly feared as the mythical river of forgetfulness; his victories earned him the honorific \"Callaicus.\" No individual Gallaeci leader from this campaign is named in the surviving sources.", "traditional"),
    ],
)

nation(
    "cp_ilergetes",
    "213",
    "Barcelona is the nearest available northeast-Iberia/Ebro-valley province to stand in for Ilergetes territory, which has no dedicated province of its own on this map.",
    [
        gov_change(d(400), "tribal", "Ilergetes tribal kingdom of the lower Ebro valley.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform; the Ilergetes are attested with named kings, unlike most other Iberian federations.", "abstraction"),
        ruler(d(218), "Indibilis", "Ilergetes king, initially allied with Carthage, then Rome during the Second Punic War; rebelled against Rome alongside his brother Mandonius in 205-204 BC, and was defeated and killed by Roman forces under Lucius Cornelius Lentulus and Lucius Manlius Acidinus, 205 BC.", "traditional"),
        ruler(d(205, 6, 1), "Mandonius", "Indibilis's brother and co-leader of the 205-204 BC revolt; captured after Indibilis's death and executed by Rome, 204 BC.", "traditional"),
    ],
)

nation(
    "cp_vascones",
    "210",
    "Navarra is a direct match for Vasconian territory, the ancestral Basque homeland.",
    [
        gov_change(d(400), "tribal", "Vascones tribal federation of the western Pyrenees, notably resistant to cultural Romanization even as the surrounding regions assimilated.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(75), "Vascones elders of Pompaelo's founding", "Pompey founded Pompaelo (modern Pamplona) in Vascones territory in 75 BC during the Sertorian War, the tribe's clearest attested political turning point in this period; no individual Vascones leader is named in the surviving sources.", "abstraction"),
    ],
)


# ── Wars ─────────────────────────────────────────────────────────────────


def war(
    war_id: str,
    name: str,
    casus_belli: str,
    war_goal_type: str,
    attacker: list[str],
    defender: list[str],
    start: int,
    end: int,
    note: str,
    battles: list[dict] | None = None,
    war_goal_tag: str | None = None,
    war_goal_province: str | None = None,
    confidence: str = "traditional",
) -> dict:
    events = []
    for tag in attacker:
        events.append({"date": start, "nationTag": tag, "kind": "warStart", "side": "attacker"})
    for tag in defender:
        events.append({"date": start, "nationTag": tag, "kind": "warStart", "side": "defender"})
    for tag in attacker:
        events.append({"date": end, "nationTag": tag, "kind": "warEnd", "side": "attacker"})
    for tag in defender:
        events.append({"date": end, "nationTag": tag, "kind": "warEnd", "side": "defender"})
    return {
        "warId": war_id,
        "name": name,
        "casusBelli": casus_belli,
        "warGoalType": war_goal_type,
        "warGoalTag": war_goal_tag,
        "warGoalProvince": war_goal_province,
        "isRebel": False,
        "events": events,
        "battles": battles or [],
        "note": note,
        "sourceConfidence": confidence,
    }


def battle(
    year: int,
    name: str,
    location_province_id: str,
    attacker_country: str,
    attacker_commander: str | None,
    defender_country: str,
    defender_commander: str | None,
    attacker_won: bool,
    note: str,
    confidence: str = "traditional",
    month: int = 1,
    day: int = 1,
) -> dict:
    return {
        "date": d(year, month, day),
        "name": name,
        "locationProvinceId": location_province_id,
        "attacker": {"country": attacker_country, "commander": attacker_commander, "infantry": None, "cavalry": None, "artillery": None, "losses": None},
        "defender": {"country": defender_country, "commander": defender_commander, "infantry": None, "cavalry": None, "artillery": None, "losses": None},
        "attackerWon": attacker_won,
        "note": note,
        "sourceConfidence": confidence,
    }


wars = [
    war(
        "battleOfTheTagus220",
        "Hannibal's Campaign Against the Vaccaei Coalition",
        "cb_conquest",
        "take_province",
        ["cp_carthage"],
        ["cp_vaccaei", "cp_carpetani"],
        d(220, 6, 1),
        d(220, 9, 1),
        "Hannibal storms the Vaccaei towns of Helmantike and Arbucala, then defeats the resulting Vaccaei-Carpetani-Olcades coalition (the Olcades have no tag or province anchor of their own) at the Battle of the Tagus, securing his rear before crossing the Alps.",
        battles=[
            battle(220, "The Tagus", "219", "cp_carthage", "Hannibal Barca", "cp_carpetani", None, True, "Toledo is a direct match for Carpetani territory, where the coalition made its stand.", month=9),
        ],
    ),
    war(
        "lusitanianRevoltPunicus",
        "Lusitanian Revolt of Punicus",
        "cb_independence_war",
        "take_province",
        ["cp_lusitani"],
        ["cp_roman_republic"],
        d(155),
        d(153, 6, 1),
        "Punicus, and after his death Caesarus, lead Lusitanian raids that destroy a Roman praetor's army, opening decades of intermittent war in the southwest.",
        battles=[],
        confidence="abstraction",
    ),
    war(
        "celtiberianWarKaros",
        "Celtiberian War (Belli Uprising)",
        "cb_independence_war",
        "take_province",
        ["cp_celtiberians"],
        ["cp_roman_republic"],
        d(153, 3, 1),
        d(151),
        "Karos of the Belli ambushes and destroys a large Roman force near Segeda before being killed himself; the war continues until a negotiated peace in 151 BC.",
        battles=[
            battle(153, "Massacre of the Dawn", "2755", "cp_celtiberians", "Karos", "cp_roman_republic", "Quintus Fulvius Nobilior", True, "Soria stands in for the Segeda/Numantia theater; the exact ambush site has no dedicated province."),
        ],
    ),
    war(
        "viriathusWar",
        "Viriathic War",
        "cb_independence_war",
        "take_province",
        ["cp_lusitani"],
        ["cp_roman_republic"],
        d(147),
        d(139, 6, 1),
        "Viriathus leads a decade of Lusitanian victories over successive Roman armies, forcing a humiliating treaty in 140 BC that the Senate refused to honor; he is assassinated by his own envoys, bribed by Rome, in 139 BC, ending the war.",
        battles=[],
        war_goal_tag="cp_lusitani",
    ),
    war(
        "numantineWar",
        "Numantine War",
        "cb_conquest",
        "annex_country",
        ["cp_roman_republic"],
        ["cp_celtiberians"],
        d(143),
        d(133, 8, 1),
        "A decade-long Roman effort to subdue the Arevaci culminates in Scipio Aemilianus's total encirclement and starvation of Numantia; the defenders burn the city and largely kill themselves rather than surrender, 133 BC.",
        battles=[
            battle(133, "Siege of Numantia", "2755", "cp_roman_republic", "Scipio Aemilianus", "cp_celtiberians", "Rhetogenes Caraunius", True, "Soria sits immediately beside Numantia itself, which has no dedicated province of its own on this map.", month=8),
        ],
        war_goal_tag="cp_celtiberians",
    ),
    war(
        "ilergetesRevolt",
        "Revolt of Indibilis and Mandonius",
        "cb_independence_war",
        "take_capital",
        ["cp_ilergetes"],
        ["cp_roman_republic"],
        d(205),
        d(204, 6, 1),
        "Indibilis and Mandonius, having switched allegiance from Carthage to Rome earlier in the Second Punic War, rebel against Roman rule once Carthage is expelled from Iberia; both are defeated and killed within a year.",
        battles=[
            battle(205, "Defeat of Indibilis", "213", "cp_roman_republic", "Lucius Cornelius Lentulus and Lucius Manlius Acidinus", "cp_ilergetes", "Indibilis", True, "Barcelona is the nearest available northeast-Iberia province standing in for Ilergetes territory."),
        ],
        war_goal_tag="cp_ilergetes",
    ),
    war(
        "carpetaniRevolt193",
        "Carpetani-Vaccaei-Vettones Revolt",
        "cb_independence_war",
        "take_capital",
        ["cp_carpetani", "cp_vaccaei", "cp_vettones"],
        ["cp_roman_republic"],
        d(193),
        d(193, 9, 1),
        "A renewed central-Iberian coalition rises against Rome and is decisively defeated by consul Marcus Fulvius Nobilior at the Battle of Toletum, fought in Carpetani territory.",
        battles=[
            battle(193, "Toletum", "219", "cp_roman_republic", "Marcus Fulvius Nobilior", "cp_carpetani", None, True, "Toledo is a direct match for Toletum, where the battle was fought."),
        ],
        war_goal_tag="cp_carpetani",
    ),
    war(
        "brutusCallaicusCampaign",
        "Decimus Junius Brutus's Gallaecian Campaign",
        "cb_conquest",
        "take_province",
        ["cp_roman_republic"],
        ["cp_gallaeci"],
        d(138),
        d(136, 6, 1),
        "The first major Roman expedition into Gallaecia; Brutus crosses the Limia river that his own soldiers feared as the mythical Lethe, and his victories earn him the honorific \"Callaicus.\"",
        battles=[],
        war_goal_tag="cp_gallaeci",
        confidence="abstraction",
    ),
    war(
        "cantabrianWars",
        "Cantabrian Wars",
        "cb_conquest",
        "annex_country",
        ["cp_roman_republic"],
        ["cp_cantabri", "cp_astures"],
        d(26),
        d(19, 6, 1),
        "Augustus's only personally led military campaign; a brutal, prolonged war against the last independent peoples of Iberia in the northern mountains, ending with the Astures' defeat (including mass suicide at Mons Medullius) and completing Rome's conquest of the peninsula.",
        battles=[],
        war_goal_tag="cp_cantabri",
        confidence="abstraction",
    ),
]

REVOLTS: dict[str, dict] = {}


def main() -> None:
    minted = mint_tags()
    print(f"minted {minted} new reference tags")

    for tag, data in nations.items():
        path = AUDITS_DIR / f"{tag}.json"
        readme = (
            "Audit/proposal file: reconstructed pre-2AD events for the Iberia batch "
            "(Lusitani/Celtiberians/Cantabri/Astures/Vaccaei/Vettones/Turdetani/"
            "Carpetani/Bastetani/Gallaeci/Ilergetes/Vascones). Same methodology as "
            "scripts/audit/ancient-nation-audit-prompt.md."
        )
        payload = {"_readme": readme, "tag": data["tag"], "events": sorted(data["events"], key=lambda e: e["date"])}
        if data["provinceEvents"]:
            payload["provinceEvents"] = data["provinceEvents"]
        path.write_text(json.dumps(payload, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")

    wars_path = AUDITS_DIR / "wars" / "iberia-wars.json"
    wars_path.parent.mkdir(parents=True, exist_ok=True)
    wars_payload = {
        "_readme": "Audit/proposal file: wars for the Iberia batch.",
        "wars": sorted(wars, key=lambda w: w["events"][0]["date"]),
    }
    wars_path.write_text(json.dumps(wars_payload, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"wrote {len(nations)} nation files and {len(wars)} wars")


if __name__ == "__main__":
    main()
