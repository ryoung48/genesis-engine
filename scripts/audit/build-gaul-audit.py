"""One-off generator for the pre-Roman Gaul audit batch (Helvetii, Aedui,
Arverni, Carnutes, Treveri, Cadurci, Volcae Tectosages, Allobroges, Cisalpine
Boii, Insubres, Taurini, Cisalpine Senones). Follows
scripts/audit/ancient-nation-audit-prompt.md. Mints new cp_ tags into
reference/nations.json (none of these tribes had individual tags before --
only the aggregate provinces.json owner history existed, jumping straight
from no-owner to Roman conquest at day -18615 / 52 BC).

Germanic tribes (Ariovistus's Suebi, Cimbri/Teutones, Nervii/Eburones and
the rest of the Belgic confederation) are deliberately out of scope here --
follow-up batches, since Gaul alone is already a full batch per the
one-region-at-a-time approach.
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


def backfill_culture_religion(province_id: str, start_date: int, note: str) -> list[dict]:
    """provinces.json's own culture/religion coverage for these Gaul
    capitals often only starts at the Roman-conquest owner event, not
    earlier -- so a tribe owning the province before that date would show
    with no culture/religion on the map at all. Carries the province's own
    existing (nearest-future) culture/religion values back to the tribe's
    start date instead of inventing new ones, closing that gap.

    Excludes this same backfill's own prior injections (by their distinctive
    note marker) -- otherwise a rerun after editing a start date would see
    its own earlier-run event and wrongly conclude the gap is already
    covered, even though the full pipeline rebuilds provinces.json from
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


def bc(year: int) -> str:
    return f"{1 - year}.1.1"


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


# ── Tags minted into reference/nations.json ─────────────────────────────

NEW_TAGS = [
    {"tag": "cp_helvetii", "name": "Helvetii", "color": [150, 168, 189]},
    {"tag": "cp_aedui", "name": "Aedui", "color": [96, 140, 96]},
    {"tag": "cp_arverni", "name": "Arverni", "color": [140, 60, 60]},
    {"tag": "cp_carnutes", "name": "Carnutes", "color": [120, 110, 60]},
    {"tag": "cp_treveri", "name": "Treveri", "color": [80, 90, 140]},
    {"tag": "cp_cadurci", "name": "Cadurci", "color": [160, 120, 70]},
    {"tag": "cp_volcae", "name": "Volcae Tectosages", "color": [180, 150, 60]},
    {"tag": "cp_allobroges", "name": "Allobroges", "color": [100, 130, 160]},
    {"tag": "cp_boii_cisalpine", "name": "Boii (Cisalpine)", "color": [110, 80, 130]},
    {"tag": "cp_insubres", "name": "Insubres", "color": [70, 100, 70]},
    {"tag": "cp_taurini", "name": "Taurini", "color": [130, 100, 90]},
    {"tag": "cp_senones_gaul", "name": "Senones", "color": [160, 90, 90]},
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
                "primaryCulture": "gallian",
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
    "cp_helvetii",
    "165",
    "Bern stands in for the Helvetii Swiss Plateau heartland (Aventicum, their real oppidum, has no dedicated province on this map).",
    [
        gov_change(d(400), "tribal", "Helvetii tribal federation of the Swiss Plateau; no earlier turning point is attested.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform already used elsewhere for Gallic/Germanic confederations.", "abstraction"),
        ruler(d(107), "Divico", "Helvetii (Tigurini) war leader who destroyed a Roman army under consul Lucius Cassius Longinus at the Battle of the Arar/Agen, 107 BC.", "traditional"),
        ruler(d(61), "Orgetorix", "Wealthy Helvetii noble who conspired to make himself king and organize a mass migration; charged with conspiracy and died (reportedly by suicide) before trial, 58 BC per Caesar's own account.", "traditional"),
        ruler(d(58), "Divico (migration envoy)", "A Helvetii leader named Divico negotiated with Caesar during the 58 BC migration crisis; ancient sources imply this is the same Divico as 107 BC, though the 49-year gap makes certain identification uncertain.", "abstraction"),
        ruler(d(58, 6, 1), "Helvetii remnant chiefs", "After defeat at the Battle of Bibracte (58 BC), Caesar ordered the roughly 110,000 survivors resettled back in their homeland as a Roman-aligned buffer state; no further individually named leaders are attested before the province passes to direct Roman provincial control.", "abstraction"),
    ],
)

nation(
    "cp_aedui",
    "191",
    "Nevers stands in for the Aedui heartland around Bibracte (Mont Beuvray), which has no dedicated province on this map.",
    [
        gov_change(d(400), "tribal", "Aedui tribal federation, governed by an annually-elected chief magistrate (the Vergobret) rather than a hereditary king.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform; the Vergobret system is itself a documented check against kingship, consistent with a federation rather than a tribal_kingdom.", "abstraction"),
        ruler(d(60), "Diviciacus", "Aeduan druid and Vergobret, staunchly pro-Roman; travelled to Rome and addressed the Senate seeking help against Ariovistus's Germans, and supported Caesar throughout the early Gallic campaigns.", "traditional"),
        ruler(d(58), "Liscus", "Vergobret of the Aedui in 58 BC during the Helvetii migration crisis, per Caesar's Commentarii.", "traditional"),
        ruler(d(54), "Dumnorix", "Diviciacus's brother and rival, anti-Roman and ambitious for kingship; executed on Caesar's order in 54 BC while trying to flee rather than join a campaign in Britain.", "traditional"),
        ruler(d(52, 3, 1), "Convictolitavis", "Elected Vergobret in a disputed 52 BC election (adjudicated by Caesar in his favor over Cotus); later defected to Vercingetorix's revolt.", "traditional"),
        ruler(d(52, 3, 2), "Cotus", "Rival claimant to the Vergobret office in the same disputed 52 BC election, from a family that had already held the office; his claim was rejected by Caesar's arbitration.", "traditional"),
        ruler(d(52, 5, 1), "Litaviccus", "Aeduan noble who led the anti-Roman faction, falsely reported a massacre of Aeduan cavalry to incite revolt during the Gergovia campaign, 52 BC.", "traditional"),
        ruler(d(52, 6, 1), "Eporedorix and Viridomarus", "Aeduan noble cavalry commanders who joined Vercingetorix's revolt after Litaviccus's uprising, leading Aeduan forces at Alesia.", "traditional"),
    ],
)

nation(
    "cp_arverni",
    "199",
    "Auvergne is a direct match for the Arverni heartland (Gergovia, their oppidum, sat in this region).",
    [
        gov_change(d(400), "tribal", "Arverni tribal kingdom; unlike the Aedui they are repeatedly attested with individual paramount kings.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform already used for other Iron Age kingships.", "abstraction"),
        ruler(d(150), "Luernios", "Arverni king renowned by Poseidonius/Athenaeus for lavish feasts and gift-giving that cemented his hegemony over much of southern Gaul.", "traditional"),
        ruler(d(123), "Bituitus", "Son and successor of Luernios; led the Arverni-Allobroges coalition against Rome, defeated and captured after the battles of Vindalium and the Isère, 121 BC.", "traditional"),
        ruler(d(80), "Celtillus", "Father of Vercingetorix; tried to reunite the old Arverni paramount kingship and was executed by his own people for it, some decades after Bituitus's fall.", "traditional", dynasty="Celtilli"),
        ruler(d(52, 1, 1), "Gobannitio", "Vercingetorix's uncle, leader of the Arverni faction opposed to renewing the war with Rome; expelled Vercingetorix from Gergovia before the revolt, per Caesar.", "traditional"),
        ruler(d(52, 2, 1), "Vercingetorix", "Rallied the Arverni and much of Gaul into the great revolt of 52 BC; proclaimed king by his supporters, defeated at Alesia, held prisoner for six years and executed in Rome after Caesar's triumph, 46 BC.", "traditional", dynasty="Celtilli"),
        ruler(d(52, 9, 1), "Vercassivellaunus", "Vercingetorix's cousin, commanded the Gallic relief army that attempted (and failed) to break the siege of Alesia.", "traditional"),
    ],
)

nation(
    "cp_carnutes",
    "4388",
    "Chartres stands in for the Carnutes' territory around Cenabum (modern Orléans, no dedicated province on this map) -- the Carnutes' own oppidum near Chartres was the traditional meeting place of the Gaul-wide druidic assembly.",
    [
        gov_change(d(400), "tribal", "Carnutes tribal federation; their territory was traditionally regarded as the religious center of all Gaul.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(54), "Tasgetius", "Carnutes king installed by Caesar in gratitude for past support; assassinated by his own countrymen in 54 BC, a sign of growing anti-Roman sentiment.", "traditional"),
        ruler(d(52, 1, 1), "Cotuatus and Conconnetodumnus", "Carnutes leaders who led the massacre of Roman traders and citizens at Cenabum in early 52 BC, the spark that ignited Vercingetorix's revolt.", "traditional"),
    ],
)

nation(
    "cp_treveri",
    "80",
    "Trier is a direct match for the Treveri heartland (it is the site of their oppidum, later Augusta Treverorum).",
    [
        gov_change(d(400), "tribal", "Treveri tribal kingdom, on the Rhine frontier and closely tied to Germanic tribes across the river.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform; the Treveri are repeatedly attested with named individual leaders/kings, unlike the Aedui's elected-magistrate system.", "abstraction"),
        ruler(d(54, 1, 1), "Indutiomarus", "Anti-Roman Treveri leader who rallied the tribe against Caesar's garrisons; killed in battle by Labienus's cavalry, 53 BC.", "traditional"),
        ruler(d(54, 1, 2), "Cingetorix", "Pro-Roman rival of Indutiomarus (his son-in-law), backed by Caesar as the Treveri's leading chief after Indutiomarus's death.", "traditional"),
    ],
)

nation(
    "cp_cadurci",
    "4112",
    "Cahors is a direct match for the Cadurci heartland (it is the site of their oppidum, Divona/Uxellodunum territory).",
    [
        gov_change(d(400), "tribal", "Cadurci tribal federation in the wider Aquitanian-Gallic borderland.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(52, 3, 1), "Lucterius", "Cadurci noble and one of Vercingetorix's principal lieutenants in the 52 BC revolt; continued resistance after Alesia, making a final stand at the siege of Uxellodunum in Cadurci territory, 51 BC, before being captured.", "traditional"),
    ],
)

nation(
    "cp_volcae",
    "196",
    "Toulouse is a direct match for the Volcae Tectosages heartland (their oppidum, Tolosa, is the origin of the city's name).",
    [
        gov_change(d(400), "tribal", "Volcae Tectosages tribal federation of the far south, astride the later Roman Provincia.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(279), "Volcae Tectosages raiders of Delphi", "Traditional participants (alongside other Gauls) in the 279 BC invasion of Greece and the attack on Delphi; later sources claim a faction returned home with looted sanctuary gold. No individual leader's name is securely attested for the Tectosages contingent specifically.", "abstraction"),
        ruler(d(106), "Volcae Tectosages elders", "In 106 BC the Roman proconsul Quintus Servilius Caepio sacked Tolosa and seized the tribe's accumulated gold (the semi-legendary \"Aurum Tolosanum\"), reportedly in reprisal for an earlier revolt; the temple treasure's subsequent loss in transit was later blamed for Caepio's ruin. No individual Tectosages leader from this episode is named in the surviving sources.", "abstraction"),
    ],
)

nation(
    "cp_allobroges",
    "4720",
    "Geneva was itself an Allobrogic town (per Caesar's Commentarii, opening chapters), making it a direct anchor for Allobroges territory.",
    [
        gov_change(d(400), "tribal", "Allobroges tribal kingdom, controlling the lower Rhone valley between the Rhone and Isère rivers.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform; the Allobroges are attested with kings, unlike some neighboring federations.", "abstraction"),
        ruler(d(121), "Allobroges elders", "Fought alongside Bituitus's Arverni against Rome at Vindalium and the Isère, 121 BC, after which the tribe was made tributary to Rome; no individual Allobrogic king from this campaign is securely named in the surviving sources.", "abstraction"),
        ruler(d(62), "Catugnatus", "Allobroges king who led a major revolt against Roman rule and taxation, 62-61 BC; defeated after early successes, ending the tribe's last independent uprising before full provincial integration.", "traditional"),
    ],
)

nation(
    "cp_boii_cisalpine",
    "4730",
    "Bologna is a direct match for the Cisalpine Boii heartland (their oppidum, Felsina, later became Roman Bononia/Bologna).",
    [
        gov_change(d(400), "tribal", "Cisalpine Boii tribal kingdom, one of the major Gallic powers of the Po valley.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform.", "abstraction"),
        ruler(d(225), "Boii war-leaders at Telamon", "Joined the Insubres and Transalpine Gaesatae mercenaries in the great invasion of Italy, crushed by Rome at the Battle of Telamon, 225 BC; no individual Boii king from the campaign is securely named in the surviving sources.", "abstraction"),
        ruler(d(218), "Boii war-leaders against the colonies", "Besieged the new Roman colonies of Placentia and Cremona in 218-217 BC, taking advantage of Rome's war with Hannibal, whom the Boii supported.", "abstraction"),
        ruler(d(197), "Boii war-leaders of the final wars", "Fought a last series of wars against Rome after the Second Punic War; decisively defeated by consul Publius Cornelius Scipio Nasica in 191 BC, after which much of the tribe reportedly migrated north toward Bohemia (a name later etymologically linked to the Boii).", "abstraction"),
    ],
)

nation(
    "cp_insubres",
    "4740",
    "Como sits within Insubres territory; their actual capital, Mediolanum (Milan), has no dedicated province on this map.",
    [
        gov_change(d(400), "tribal", "Insubres tribal kingdom, the leading Gallic power of Cisalpine Gaul before Rome's conquest.", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform.", "abstraction"),
        ruler(d(225), "Insubres war-leaders at Telamon", "Joined the Boii and Gaesatae mercenaries in the 225 BC invasion of Italy, defeated at Telamon.", "abstraction"),
        ruler(d(222), "Viridomarus (Britomartus)", "Insubrian king killed in single combat by Roman consul Marcus Claudius Marcellus at the Battle of Clastidium, 222 BC -- the third and last time a Roman commander won the spolia opima for personally slaying an enemy leader.", "traditional"),
        ruler(d(194), "Insubres elders of the final submission", "Cisalpine Insubres finally and fully subdued by Rome by 194 BC, after which their territory was absorbed into direct Roman control.", "abstraction"),
    ],
)

nation(
    "cp_taurini",
    "1875",
    "Turin is a direct match for the Taurini heartland (their oppidum, Taurasia, is the origin of the city's name).",
    [
        gov_change(d(400), "tribal", "Taurini tribal federation of the western Alpine foothills.", "abstraction"),
        reform_add(d(400), "tribal_federation", "Reuses the tribal_federation reform.", "abstraction"),
        ruler(d(218), "Taurini elders besieged by Hannibal", "Hannibal stormed the Taurini's chief town after they refused an alliance against their Insubrian rivals, the first military action of the Second Punic War in Italy, 218 BC; no individual Taurini leader from the siege is named in the surviving sources.", "abstraction"),
    ],
)

nation(
    "cp_senones_gaul",
    "119",
    "Ancona stands in for the Cisalpine Senones' territory on the Adriatic coast (Ager Gallicus/Sena Gallica); their homeland before crossing the Alps was in northern Gaul and has no dedicated province of its own on this map.",
    [
        gov_change(d(400), "tribal", "Senones tribal kingdom; the branch that crossed into Italy settled the Adriatic coast around Sena Gallica (modern Senigallia).", "abstraction"),
        reform_add(d(400), "tribal_kingdom", "Reuses the tribal_kingdom reform.", "abstraction"),
        ruler(d(390), "Brennus", "Senones war leader who defeated Rome at the Battle of the Allia and sacked the city itself, 390/387 BC, extracting a ransom of gold -- the traditional \"vae victis\" episode.", "traditional"),
        ruler(d(283), "Senones war-leaders of the final destruction", "Cisalpine Senones killed the Roman envoys sent to them and were annihilated in reprisal by consul Publius Cornelius Dolabella in 283 BC; their territory was annexed outright as the Ager Gallicus, the first Gallic land directly absorbed by Rome.", "abstraction"),
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
    attacker_losses: int | None = None,
    defender_losses: int | None = None,
) -> dict:
    return {
        "date": d(year, month, day),
        "name": name,
        "locationProvinceId": location_province_id,
        "attacker": {
            "country": attacker_country,
            "commander": attacker_commander,
            "infantry": None,
            "cavalry": None,
            "artillery": None,
            "losses": attacker_losses,
        },
        "defender": {
            "country": defender_country,
            "commander": defender_commander,
            "infantry": None,
            "cavalry": None,
            "artillery": None,
            "losses": defender_losses,
        },
        "attackerWon": attacker_won,
        "note": note,
        "sourceConfidence": confidence,
    }


wars = [
    war(
        "sackOfRome390",
        "Gallic Sack of Rome",
        "cb_conquest",
        "take_capital",
        ["cp_senones_gaul"],
        ["cp_roman_republic"],
        d(390),
        d(390, 8, 1),
        "Brennus's Senones rout Rome at the Allia and sack the city itself before withdrawing with a gold ransom.",
        battles=[
            battle(390, "Battle of the Allia", "119", "cp_senones_gaul", "Brennus", "cp_roman_republic", "Quintus Sulpicius", True, "Ancona stands in for Senones territory/the wider Cisalpine Gallic theater; the Allia itself is north of Rome and has no dedicated province."),
        ],
    ),
    war(
        "battleOfLakeVadimo283",
        "Roman Destruction of the Senones",
        "cb_conquest",
        "annex_country",
        ["cp_roman_republic"],
        ["cp_senones_gaul", "cp_etruscans"],
        d(284),
        d(283, 6, 1),
        "After the Senones killed Roman envoys, consul Publius Cornelius Dolabella annihilated the tribe and annexed their territory (the Ager Gallicus); the Senones' Etruscan allies were defeated the same year at Lake Vadimo.",
        battles=[
            battle(283, "Lake Vadimo", "119", "cp_roman_republic", "Publius Cornelius Dolabella", "cp_etruscans", None, True, "Ancona stands in for the wider Senones/Etruscan theater; Lake Vadimo itself has no dedicated province."),
        ],
        war_goal_tag="cp_senones_gaul",
    ),
    war(
        "battleOfTelamon",
        "Gallic Invasion of Italy",
        "cb_conquest",
        "take_province",
        ["cp_boii_cisalpine", "cp_insubres"],
        ["cp_roman_republic"],
        d(225),
        d(225, 6, 1),
        "A great Boii/Insubres/Transalpine Gaesatae coalition invades Italy and is crushed at Telamon; the Gaesatae mercenaries had no home tag of their own and are omitted as a participant.",
        battles=[
            battle(225, "Telamon", "4730", "cp_boii_cisalpine", None, "cp_roman_republic", "Gaius Atilius Regulus and Lucius Aemilius Papus", False, "Bologna stands in for the Boii/Insubres coalition army; Telamon itself is on the Etruscan coast and has no dedicated province."),
        ],
        war_goal_province="4730",
    ),
    war(
        "clastidium",
        "Roman Campaign Against the Insubres",
        "cb_conquest",
        "take_capital",
        ["cp_roman_republic"],
        ["cp_insubres"],
        d(224),
        d(222, 6, 1),
        "Rome exploits the aftermath of Telamon to campaign directly against the Insubres; consul Marcus Claudius Marcellus kills King Viridomarus in single combat at Clastidium, winning the spolia opima.",
        battles=[
            battle(222, "Clastidium", "4740", "cp_roman_republic", "Marcus Claudius Marcellus", "cp_insubres", "Viridomarus", True, "Como stands in for Insubres territory; Clastidium itself (modern Casteggio) has no dedicated province."),
        ],
        war_goal_tag="cp_insubres",
    ),
    war(
        "taurini218",
        "Hannibal's Storm of the Taurini",
        "cb_conquest",
        "take_capital",
        ["cp_carthage"],
        ["cp_taurini"],
        d(218, 10, 1),
        d(218, 11, 1),
        "Hannibal storms the Taurini's chief town after they refuse to ally with him against their Insubrian rivals -- the first military action of the Second Punic War fought in Italy.",
        battles=[
            battle(218, "Siege of Taurasia", "1875", "cp_carthage", "Hannibal Barca", "cp_taurini", None, True, "Turin is a direct match for the Taurini's chief town.", month=11),
        ],
    ),
    war(
        "boiiInsubresRevolt218",
        "Boii-Insubres Revolt During the Hannibalic War",
        "cb_independence_war",
        "take_province",
        ["cp_boii_cisalpine", "cp_insubres"],
        ["cp_roman_republic"],
        d(218, 6, 1),
        d(217),
        "The Boii and Insubres rise up and besiege the new Roman colonies of Placentia and Cremona, taking advantage of Rome's war with Hannibal, whom they supported.",
        battles=[
            battle(218, "Siege of Placentia", "2573", "cp_boii_cisalpine", None, "cp_roman_republic", "Lucius Manlius Vulso", True, "Placentia is a direct match, founded that same year as a Roman colony in Boii territory.", month=8),
        ],
    ),
    war(
        "boiiFinalWar",
        "Roman Conquest of the Boii",
        "cb_conquest",
        "annex_country",
        ["cp_roman_republic"],
        ["cp_boii_cisalpine"],
        d(197),
        d(191, 6, 1),
        "A final series of wars ends with consul Publius Cornelius Scipio Nasica's decisive defeat of the Boii in 191 BC; much of the tribe reportedly migrates north toward Bohemia afterward.",
        battles=[
            battle(191, "Final defeat of the Boii", "4730", "cp_roman_republic", "Publius Cornelius Scipio Nasica", "cp_boii_cisalpine", None, True, "Bologna stands in for the Boii heartland where the tribe's power was finally broken.", confidence="abstraction"),
        ],
        war_goal_tag="cp_boii_cisalpine",
    ),
    war(
        "insubresFinalWar",
        "Roman Conquest of the Insubres",
        "cb_conquest",
        "annex_country",
        ["cp_roman_republic"],
        ["cp_insubres"],
        d(197),
        d(194),
        "Rome completes the conquest of Cisalpine Gaul by fully subduing the Insubres, absorbing their territory into direct provincial control by 194 BC.",
        battles=[],
        war_goal_tag="cp_insubres",
        confidence="abstraction",
    ),
    war(
        "arverniAllobrogesWar121",
        "Roman War Against the Arverni and Allobroges",
        "cb_hegemon",
        "take_capital",
        ["cp_roman_republic"],
        ["cp_arverni", "cp_allobroges"],
        d(122),
        d(121, 8, 1),
        "Rome intervenes against the Arverni-led coalition defending the Allobroges' independence, defeating King Bituitus at Vindalium and again at the Isère; both peoples become tributary and the Roman Provincia (Gallia Narbonensis) is established soon after.",
        battles=[
            battle(121, "Vindalium", "4720", "cp_roman_republic", "Gnaeus Domitius Ahenobarbus", "cp_arverni", "Bituitus", True, "Geneva stands in for the lower Rhone/Allobroges theater; Vindalium itself has no dedicated province.", month=6),
            battle(121, "The Isère", "199", "cp_roman_republic", "Quintus Fabius Maximus", "cp_arverni", "Bituitus", True, "Auvergne stands in for the Arverni royal army under Bituitus, decisively defeated and captured shortly after.", month=8),
        ],
        war_goal_tag="cp_arverni",
    ),
    war(
        "aurumTolosanum106",
        "Sack of Tolosa",
        "cb_conquest",
        "take_capital",
        ["cp_roman_republic"],
        ["cp_volcae"],
        d(107),
        d(106, 6, 1),
        "Proconsul Quintus Servilius Caepio sacks Tolosa and seizes the Volcae Tectosages' accumulated gold, the semi-legendary \"Aurum Tolosanum,\" reportedly in reprisal for an earlier revolt against Rome.",
        battles=[
            battle(106, "Sack of Tolosa", "196", "cp_roman_republic", "Quintus Servilius Caepio", "cp_volcae", None, True, "Toulouse is a direct match for Tolosa."),
        ],
        war_goal_tag="cp_volcae",
    ),
    war(
        "catugnatusRevolt",
        "Revolt of Catugnatus",
        "cb_independence_war",
        "take_capital",
        ["cp_allobroges"],
        ["cp_roman_republic"],
        d(62),
        d(61, 6, 1),
        "King Catugnatus leads the Allobroges in a major revolt against Roman rule and taxation; early successes are eventually reversed and the tribe's last independent uprising is crushed.",
        battles=[],
        confidence="abstraction",
    ),
    war(
        "helvetiiMigrationWar",
        "Helvetii Migration War",
        "cb_conquest",
        "take_province",
        ["cp_helvetii"],
        ["cp_roman_republic", "cp_aedui"],
        d(58, 3, 1),
        d(58, 6, 1),
        "The Helvetii attempt a mass migration west into Gaul; Caesar blocks and defeats them, first at the Arar and decisively at Bibracte, before resettling the survivors as a buffer state.",
        battles=[
            battle(58, "The Arar (Saône)", "191", "cp_roman_republic", "Julius Caesar", "cp_helvetii", None, True, "Nevers stands in for the Aedui-territory river-crossing theater; the Arar/Saône itself has no dedicated province.", month=5),
            battle(58, "Bibracte", "191", "cp_roman_republic", "Julius Caesar", "cp_helvetii", "Divico", True, "Nevers stands in for the Aedui heartland around Bibracte, which has no dedicated province.", month=6),
        ],
    ),
    war(
        "gallicWarVercingetorix",
        "Gallic War (Vercingetorix's Revolt)",
        "cb_independence_war",
        "annex_country",
        ["cp_arverni", "cp_carnutes", "cp_cadurci", "cp_aedui"],
        ["cp_roman_republic"],
        d(52, 1, 1),
        d(51, 9, 1),
        "The Carnutes' massacre at Cenabum triggers a Gaul-wide revolt led by Vercingetorix of the Arverni; despite early Gallic success at Gergovia, Caesar's siege of Alesia crushes the revolt, and Cadurci resistance under Lucterius holds out a further year at Uxellodunum.",
        battles=[
            battle(52, "Gergovia", "199", "cp_arverni", "Vercingetorix", "cp_roman_republic", "Julius Caesar", True, "Auvergne is a direct match for Gergovia.", month=6),
            battle(52, "Alesia", "191", "cp_roman_republic", "Julius Caesar", "cp_arverni", "Vercingetorix", True, "Nevers stands in for the wider Aedui-adjacent region around Alesia, which has no dedicated province on this map.", month=9),
            battle(51, "Uxellodunum", "4112", "cp_roman_republic", "Gaius Caninius Rebilus", "cp_cadurci", "Lucterius", True, "Cahors is a direct match for Cadurci territory, where Lucterius made his final stand.", month=8),
        ],
        war_goal_tag="cp_arverni",
    ),
]

REVOLTS = {
    "80": {
        "events": [
            {
                "date": d(54, 1, 1),
                "kind": "revolt",
                "payload": {"revolt": {"type": "nationalist_rebels", "size": 3, "leader": "Ambiorix"}},
                "comment": "Eburones uprising",
                "note": "Ambiorix and Catuvolcus of the Eburones destroy Sabinus and Cotta's legion near Atuatuca, then join the wider 54 BC Belgic uprising against Caesar's winter camps; the Eburones have no province anchor of their own on this map, so this is recorded against Trier (Treveri territory), the nearest audited neighbor.",
                "sourceConfidence": "abstraction",
            },
        ],
    },
}


def main() -> None:
    minted = mint_tags()
    print(f"minted {minted} new reference tags")

    for tag, data in nations.items():
        path = AUDITS_DIR / f"{tag}.json"
        readme = (
            "Audit/proposal file: reconstructed pre-2AD events for the Gaul batch "
            "(Helvetii/Aedui/Arverni/Carnutes/Treveri/Cadurci/Volcae Tectosages/"
            "Allobroges/Cisalpine Boii/Insubres/Taurini/Cisalpine Senones). Same "
            "methodology as scripts/audit/ancient-nation-audit-prompt.md. Germanic "
            "tribes and the Belgic confederation proper are out of scope -- separate "
            "follow-up batches."
        )
        payload = {"_readme": readme, "tag": data["tag"], "events": sorted(data["events"], key=lambda e: e["date"])}
        if data["provinceEvents"]:
            payload["provinceEvents"] = data["provinceEvents"]
        path.write_text(json.dumps(payload, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")

    wars_path = AUDITS_DIR / "wars" / "gaul-wars.json"
    wars_path.parent.mkdir(parents=True, exist_ok=True)
    wars_payload = {
        "_readme": "Audit/proposal file: wars for the Gaul batch. Germanic-side conflicts (Ariovistus vs. Aedui/Sequani, the Cimbrian War) are deliberately excluded pending a Germania batch.",
        "wars": sorted(wars, key=lambda w: w["events"][0]["date"]),
    }
    wars_path.write_text(json.dumps(wars_payload, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")

    revolts_path = AUDITS_DIR / "revolts" / "gaul-revolts.json"
    revolts_path.parent.mkdir(parents=True, exist_ok=True)
    revolts_payload = {
        "_readme": "Audit/proposal file: revolts for the Gaul batch. Only covers uprisings with no registered opposing tag (the Eburones have no province anchor on this map).",
        "provinces": REVOLTS,
    }
    revolts_path.write_text(json.dumps(revolts_payload, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"wrote {len(nations)} nation files, {len(wars)} wars, and {sum(len(e['events']) for e in REVOLTS.values())} revolts")


if __name__ == "__main__":
    main()
