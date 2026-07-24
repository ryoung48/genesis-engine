"""One-off generator for the pre-2AD Germania audit batch (Suebi, Cimbri,
Teutones, Marcomanni, Sugambri, Chatti, Cherusci, Bructeri, Chauci,
Usipetes/Tencteri). Follows scripts/audit/ancient-nation-audit-prompt.md.
Mints new cp_ tags into reference/nations.json, same pattern as
build-gaul-audit.py.

Hard scope constraint: every event must be dated before day 0 (2 AD Jan 1),
which excludes almost all of the "famous" Roman-Germanic history --
Arminius, the Teutoburg Forest disaster (9 AD), Maroboduus's downfall
(19 AD), and the later Marcomannic Wars are all outside this audit
collection's covered period and are intentionally omitted rather than bent
to fit. Coverage here stops at Drusus's campaigns and death (9 BC).
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
    """Same gap-closing fix used in build-gaul-audit.py: carries the
    province's own existing (nearest-future) culture/religion values back to
    the tribe's start date if the source data's own coverage starts later,
    instead of leaving the map blank for that whole span.

    _CONVERTED_PROVINCES is loaded from the on-disk build output, which
    itself may already include a *previous* run's own backfill events (the
    full pipeline doesn't rebuild provinces.json incrementally, but this
    generator can be rerun standalone against a stale merged snapshot) --
    those self-injected events are excluded by their distinctive note
    marker, or a rerun after an earlier date edit would wrongly see its own
    old backfill as "already covered" and skip emitting the new one."""
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
    {"tag": "cp_suebi", "name": "Suebi", "color": [90, 110, 130]},
    {"tag": "cp_cimbri", "name": "Cimbri", "color": [130, 140, 160]},
    {"tag": "cp_teutones", "name": "Teutones", "color": [110, 90, 130]},
    {"tag": "cp_marcomanni", "name": "Marcomanni", "color": [100, 70, 60]},
    {"tag": "cp_sugambri", "name": "Sugambri", "color": [140, 110, 70]},
    {"tag": "cp_chatti", "name": "Chatti", "color": [80, 120, 90]},
    {"tag": "cp_cherusci", "name": "Cherusci", "color": [120, 130, 70]},
    {"tag": "cp_bructeri", "name": "Bructeri", "color": [150, 100, 100]},
    {"tag": "cp_chauci", "name": "Chauci", "color": [70, 100, 120]},
    {"tag": "cp_usipetes_tencteri", "name": "Usipetes and Tencteri", "color": [130, 130, 90]},
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
                "primaryCulture": "hannoverian",
                "religion": "germanic",
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
    "cp_suebi",
    "77",
    "Worms stands in for the Rhine contact zone where Ariovistus's Suebi settled on the Gallic side of the river before Caesar drove them back; the Suebi proper were not anchored to one fixed territory east of the Rhine.",
    [
        gov_change(d(80), "tribal", "Suebic coalition kingdom; Caesar and Tacitus both describe the Suebi as the largest and most warlike of the Germanic peoples, not settled agriculturalists.", "abstraction"),
        reform_add(d(80), "tribal_kingdom", "Reuses the tribal_kingdom reform for Ariovistus's personal, non-hereditary war-kingship.", "abstraction"),
        ruler(d(71), "Ariovistus", "Suebi king invited across the Rhine by the Sequani and Arverni to help against the Aedui; defeated the Aedui at Magetobriga (63 BC), was granted the title \"friend of the Roman people\" by the Senate in 59 BC, then was decisively defeated and driven back across the Rhine by Caesar at the Battle of the Vosges, 58 BC. Presumed to have died shortly after.", "traditional"),
    ],
)

nation(
    "cp_cimbri",
    "4142",
    "Aarhus stands in for the Cimbri homeland on the Jutland peninsula, per the tribe's traditional Cimbric Chersonese origin.",
    [
        gov_change(d(400), "tribal", "Cimbri tribal kingdom on the Jutland peninsula, long predating the migration (per Roman tradition triggered by catastrophic flooding) that brought them into conflict with Rome from 113 BC.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform.", "abstraction"),
        ruler(d(113), "Cimbri war-leaders of the migration", "Cimbri war bands defeat the Roman consul Gnaeus Papirius Carbo at the Battle of Noreia, 113 BC, opening decades of conflict with Rome; no individual king is securely named for this specific battle in the surviving sources.", "abstraction"),
        ruler(d(105), "Boiorix", "Cimbri king who led the coalition (with the Teutones and Ambrones) to a catastrophic victory over Rome at the Battle of Arausio, 105 BC -- one of the worst defeats in Roman military history. Killed leading the final Cimbri charge at the Battle of Vercellae, 101 BC.", "traditional"),
        ruler(d(101, 6, 1), "Lugius, Claodicus, and Caesorix", "Cimbri chieftains named by Plutarch as captured or killed alongside Boiorix at Vercellae, where the tribe was effectively destroyed as a political entity.", "traditional"),
    ],
)

nation(
    "cp_teutones",
    "1775",
    "Holstein stands in for the Teutones' homeland, traditionally placed south/east of the Cimbri on the Jutland peninsula's southern approaches.",
    [
        gov_change(d(400), "tribal", "Teutones tribal kingdom, long predating the migration (alongside the Cimbri and the smaller Ambrones group, who have no tag or province anchor of their own) that brought them into conflict with Rome.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform.", "abstraction"),
        ruler(d(105), "Teutobod", "Teutones king who fought alongside Boiorix's Cimbri at Arausio (105 BC); defeated and captured by Marius at the Battle of Aquae Sextiae, 102 BC, reportedly displayed in Marius's triumph.", "traditional"),
    ],
)

nation(
    "cp_marcomanni",
    "266",
    "Bohemia is a direct match: Maroboduus led the Marcomanni migration into this exact region.",
    [
        gov_change(d(9), "monarchy", "Maroboduus organized the Marcomanni into a strong, centralized kingdom explicitly modeled on Roman military and administrative practice -- unusually state-like for a Germanic polity of this period.", "traditional"),
        reform_add(d(9), "tribal_kingdom", "Reuses the tribal_kingdom reform; Maroboduus's kingdom, though centralized, still rests on Germanic tribal kingship rather than any settled bureaucratic reform id.", "abstraction"),
        ruler(d(9), "Maroboduus", "Led the Marcomanni migration into Bohemia around 9 BC (displacing an earlier Boii population there, distinct from the Cisalpine Boii covered in the Gaul batch) and built a powerful kingdom. His later reign, war with Arminius, and downfall (7-19 AD) fall after this audit collection's day-0/2-AD cutoff and are intentionally not covered here.", "traditional"),
    ],
)

nation(
    "cp_sugambri",
    "82",
    "Lippe stands in for Sugambri territory along the lower Rhine/Sieg-Ruhr corridor; the Lippe river itself was the corridor of Drusus's later campaigns through the same region.",
    [
        gov_change(d(400), "tribal", "Sugambri tribal kingdom on the lower Rhine, long settled there before becoming among the most persistent Roman opponents in the region.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform.", "abstraction"),
        ruler(d(55), "Sugambri war-leaders of Caesar's first Rhine crossing", "Sheltered Usipetes and Tencteri refugees/survivors after Caesar's 55 BC massacre and refused to surrender them, prompting Caesar's first bridging of the Rhine as a punitive demonstration; the Sugambri withdrew into the forests rather than give battle, and no individual leader is named for this specific episode.", "traditional"),
        ruler(d(17), "Melo (Maelo)", "Sugambri chieftain who ambushed and destroyed a Roman force under Marcus Lollius in 17/16 BC (the \"Clades Lolliana\"), the worst Roman military setback on the German frontier before Teutoburg -- and the immediate trigger for Augustus's personal presence on the frontier and Drusus's subsequent campaigns.", "traditional"),
    ],
)

nation(
    "cp_chatti",
    "81",
    "Hessen is a direct match for Chatti territory (the region's name descends from the tribe's own).",
    [
        gov_change(d(400), "tribal", "Chatti tribal federation; Tacitus later singled the Chatti out for unusually disciplined, quasi-state-like military organization compared to other Germanic peoples, though no individual pre-2AD Chatti king is securely attested.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform; no individually named Chatti kingship is attested this early, unlike the Suebi or Sugambri.", "abstraction"),
        ruler(d(10), "Chatti war-leaders of Drusus's campaigns", "The Chatti were among the primary targets of Drusus's German campaigns (12-9 BC); no individual Chatti leader from this period is named in the surviving sources.", "abstraction"),
    ],
)

nation(
    "cp_cherusci",
    "1758",
    "Hannover is a direct match for the Cherusci heartland around the Weser.",
    [
        gov_change(d(400), "tribal", "Cherusci tribal federation, later to become Rome's most consequential Germanic ally-turned-enemy through Arminius -- whose own career (born c. 18/16 BC, revolt in 9 AD) falls almost entirely after this audit collection's 2 AD cutoff and is intentionally not covered here.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(8), "Segimerus", "Chief of the Cherusci (father of Arminius) who brought the tribe into alliance with Rome around the time of Drusus's and Tiberius's campaigns; the alliance would later collapse under his son's leadership, but that rupture (9 AD) is after this audit's covered period.", "traditional"),
    ],
)

nation(
    "cp_bructeri",
    "4775",
    "Bielefeld stands in for Bructeri territory between the Ems and Lippe rivers, which has no dedicated province of its own on this map.",
    [
        gov_change(d(400), "tribal", "Bructeri tribal federation, long settled between the Ems and Lippe before becoming one of Drusus's principal targets.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(11), "Bructeri war-leaders of Drusus's campaigns", "Targeted by Drusus's campaigns of 12-9 BC as Roman forces pushed east from the Rhine along the Lippe; no individual Bructeri leader from this period is named in the surviving sources (their later prophetess Veleda is a 1st-century-AD figure, outside this audit's scope).", "abstraction"),
    ],
)

nation(
    "cp_chauci",
    "1874",
    "Bremen is a direct match for Chauci territory on the North Sea coast.",
    [
        gov_change(d(400), "tribal", "Chauci tribal federation on the North Sea coast, described by later Roman writers (Pliny, Tacitus) as living on artificial mounds above the tides.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(12), "Chauci war-leaders of Drusus's naval campaign", "Drusus's fleet campaigned along the North Sea coast against the Chauci and neighboring Frisii in 12 BC, opening his multi-year German campaigns; no individual Chauci leader from this period is named in the surviving sources.", "abstraction"),
    ],
)

nation(
    "cp_usipetes_tencteri",
    "98",
    "Utrecht stands in for the lower Rhine delta area where the Usipetes and Tencteri crossed and were destroyed by Caesar; the two tribes acted as a single joint people throughout their attested history and share one tag accordingly.",
    [
        gov_change(d(58), "tribal", "Joint Usipetes-Tencteri federation, driven across the Rhine into Gaul by Suebi pressure from the east around 55 BC.", "abstraction"),
        reform_add(d(58), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(55, 4, 1), "Usipetes-Tencteri war-leaders", "Crossed the Rhine fleeing the Suebi and were massacred by Caesar in a controversial episode (Cato reportedly moved in the Senate that Caesar be handed over to the Germans for violating a truce during negotiations); survivors fled back across the Rhine and were sheltered by the Sugambri. No individual leader's name survives in the sources.", "traditional"),
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
        "battleOfMagetobriga",
        "Suebi Intervention in Gaul",
        "cb_hegemon",
        "take_province",
        ["cp_suebi"],
        ["cp_aedui"],
        d(63),
        d(63, 6, 1),
        "Ariovistus's Suebi, invited across the Rhine by the Sequani and Arverni, defeat the Aedui at Magetobriga, establishing Suebi dominance in eastern Gaul until Caesar's intervention five years later.",
        battles=[
            battle(63, "Magetobriga", "191", "cp_suebi", "Ariovistus", "cp_aedui", None, True, "Nevers stands in for Aedui territory, the same stand-in used for the Aedui's own audit file; Magetobriga's exact site is disputed and has no dedicated province."),
        ],
    ),
    war(
        "battleOfTheVosges",
        "Caesar's War Against Ariovistus",
        "cb_hegemon",
        "take_province",
        ["cp_roman_republic", "cp_aedui"],
        ["cp_suebi"],
        d(58, 6, 1),
        d(58, 9, 1),
        "Caesar, petitioned by the Aedui and other Gallic tribes, defeats Ariovistus decisively and drives the Suebi back across the Rhine, ending their presence in Gaul.",
        battles=[
            battle(58, "The Vosges", "77", "cp_roman_republic", "Julius Caesar", "cp_suebi", "Ariovistus", True, "Worms stands in for the Rhine-frontier theater where the Suebi were finally driven back across the river; the Vosges battle site itself has no dedicated province.", month=9),
        ],
        war_goal_tag="cp_suebi",
    ),
    war(
        "battleOfNoreia",
        "Cimbri War Against Noricum and Rome",
        "cb_conquest",
        "take_province",
        ["cp_cimbri"],
        ["cp_roman_republic"],
        d(113, 6, 1),
        d(113, 10, 1),
        "The migrating Cimbri crush a Roman army sent to defend Noricum under consul Gnaeus Papirius Carbo, the opening Roman disaster of the Cimbrian War.",
        battles=[
            battle(113, "Noreia", "4142", "cp_cimbri", None, "cp_roman_republic", "Gnaeus Papirius Carbo", True, "Aarhus stands in for the Cimbri migratory host; Noreia itself (in modern Austria) has no dedicated province on this map.", confidence="abstraction"),
        ],
    ),
    war(
        "battleOfArausio",
        "Cimbrian War: Arausio Campaign",
        "cb_conquest",
        "take_province",
        ["cp_cimbri", "cp_teutones"],
        ["cp_roman_republic"],
        d(105, 6, 1),
        d(105, 10, 6),
        "The combined Cimbri-Teutones-Ambrones host annihilates two Roman armies at Arausio, the worst Roman military disaster since Cannae; Rome's frontier lies open for years afterward.",
        battles=[
            battle(105, "Arausio", "4142", "cp_cimbri", "Boiorix", "cp_roman_republic", "Quintus Servilius Caepio and Gnaeus Mallius Maximus", True, "Aarhus stands in for the joint Cimbri-Teutones host; Arausio (modern Orange, in Gaul) has no dedicated province of its own on this map.", month=10, day=6),
        ],
    ),
    war(
        "battleOfAquaeSextiae",
        "Cimbrian War: Marius's Italian Campaign",
        "cb_conquest",
        "take_capital",
        ["cp_cimbri", "cp_teutones"],
        ["cp_roman_republic"],
        d(102, 6, 1),
        d(101, 8, 1),
        "Gaius Marius's reformed legions turn the tide of the Cimbrian War, crushing the Teutones at Aquae Sextiae and the Cimbri at Vercellae the following year, ending the migration's threat to Italy.",
        battles=[
            battle(102, "Aquae Sextiae", "4142", "cp_roman_republic", "Gaius Marius", "cp_teutones", "Teutobod", True, "Aarhus stands in for the Teutones host; Aquae Sextiae (modern Aix-en-Provence) has no dedicated province."),
            battle(101, "Vercellae", "4142", "cp_roman_republic", "Gaius Marius and Quintus Lutatius Catulus", "cp_cimbri", "Boiorix", True, "Aarhus stands in for the Cimbri host; Vercellae (in Cisalpine Gaul) has no dedicated province.", month=7, day=30),
        ],
    ),
    war(
        "caesarFirstRhineCrossing",
        "Massacre of the Usipetes and Tencteri",
        "cb_conquest",
        "take_province",
        ["cp_roman_republic"],
        ["cp_usipetes_tencteri"],
        d(55, 4, 1),
        d(55, 6, 1),
        "Caesar destroys the Usipetes and Tencteri after their crossing into Gaul, in an episode ancient and modern historians alike have criticized as a breach of an active truce; he then bridges the Rhine for the first time as a punitive demonstration against the Sugambri who sheltered survivors.",
        battles=[
            battle(55, "Massacre at the Rhine-Meuse confluence", "98", "cp_roman_republic", "Julius Caesar", "cp_usipetes_tencteri", None, True, "Utrecht stands in for the lower Rhine delta where the massacre occurred."),
        ],
        war_goal_tag="cp_usipetes_tencteri",
    ),
    war(
        "cladesLolliana",
        "Clades Lolliana",
        "cb_conquest",
        "take_province",
        ["cp_sugambri"],
        ["cp_roman_republic"],
        d(17, 6, 1),
        d(16, 6, 1),
        "Sugambri raiders under Melo ambush and destroy a Roman force under proconsul Marcus Lollius, capturing the Fifth Legion's eagle -- the worst Roman setback on the German frontier before Teutoburg, prompting Augustus's own journey to Gaul.",
        battles=[
            battle(17, "Clades Lolliana", "82", "cp_sugambri", "Melo", "cp_roman_republic", "Marcus Lollius", True, "Lippe stands in for Sugambri territory near the Rhine where the ambush occurred."),
        ],
    ),
    war(
        "drususGermanCampaigns",
        "Drusus's German Campaigns",
        "cb_conquest",
        "take_province",
        ["cp_roman_republic"],
        ["cp_sugambri", "cp_chatti", "cp_cherusci", "cp_bructeri", "cp_chauci"],
        d(12, 6, 1),
        d(9, 9, 14),
        "Drusus campaigns for four consecutive years east of the Rhine, opening with a North Sea fleet action against the Chauci, then pushing through Sugambri, Bructeri, Cherusci, and Chatti territory as far as the Elbe before dying from a fall from his horse on the return march in 9 BC.",
        battles=[
            battle(12, "North Sea coastal campaign", "1874", "cp_roman_republic", "Nero Claudius Drusus", "cp_chauci", None, True, "Bremen is a direct match for Chauci territory, the target of Drusus's opening naval campaign."),
            battle(11, "Lippe corridor campaign", "82", "cp_roman_republic", "Nero Claudius Drusus", "cp_sugambri", None, True, "Lippe is a direct match for the river corridor Drusus used to campaign against the Sugambri and Usipetes."),
            battle(10, "Chatti campaign", "81", "cp_roman_republic", "Nero Claudius Drusus", "cp_chatti", None, True, "Hessen is a direct match for Chatti territory."),
            battle(9, "March to the Elbe", "1758", "cp_roman_republic", "Nero Claudius Drusus", "cp_cherusci", None, True, "Hannover stands in for Cherusci territory, which Drusus crossed on his final march to the Elbe before his death on the return journey.", month=9, day=14),
        ],
    ),
]

REVOLTS: dict[str, dict] = {}


def main() -> None:
    minted = mint_tags()
    print(f"minted {minted} new reference tags")

    for tag, data in nations.items():
        path = AUDITS_DIR / f"{tag}.json"
        readme = (
            "Audit/proposal file: reconstructed pre-2AD events for the Germania batch "
            "(Suebi/Cimbri/Teutones/Marcomanni/Sugambri/Chatti/Cherusci/Bructeri/Chauci/"
            "Usipetes-Tencteri). Same methodology as "
            "scripts/audit/ancient-nation-audit-prompt.md. Everything is dated before "
            "day 0 (2 AD) -- Arminius, Teutoburg (9 AD), and Maroboduus's downfall "
            "(19 AD) are all after this audit collection's covered period and are "
            "intentionally omitted."
        )
        payload = {"_readme": readme, "tag": data["tag"], "events": sorted(data["events"], key=lambda e: e["date"])}
        if data["provinceEvents"]:
            payload["provinceEvents"] = data["provinceEvents"]
        path.write_text(json.dumps(payload, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")

    wars_path = AUDITS_DIR / "wars" / "germania-wars.json"
    wars_path.parent.mkdir(parents=True, exist_ok=True)
    wars_payload = {
        "_readme": "Audit/proposal file: wars for the Germania batch. Everything is dated before day 0 (2 AD); Teutoburg Forest (9 AD) and later Marcomannic Wars are out of scope.",
        "wars": sorted(wars, key=lambda w: w["events"][0]["date"]),
    }
    wars_path.write_text(json.dumps(wars_payload, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"wrote {len(nations)} nation files and {len(wars)} wars")


if __name__ == "__main__":
    main()
