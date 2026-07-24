"""One-off generator patching a handful of real, currently-existing nations
whose governmentReformAdd history stops at a medieval/early-modern reform
(iqta, autocracy_reform, mandala_reform, ...) and never records the real
20th-century constitutional change that produced their present-day form of
government, even though initialGovernmentType in reference/nations.json is
already correct ("monarchy"/"republic"). Writes one audits/<TAG>.json per
nation, merged automatically by apply_audit_enrichment() in
build-eu4-history-events.py on every regen -- same mechanism as the ancient-
nation audits, just post-2AD dates instead of pre-2AD. reformId choices reuse
existing values (see ceremonial_monarch/powerful_head_of_state/democracy_reform
usage on GBR/NED/SWE/NOR/JAP, SAU/UAE, and the 243 other democracy_reform
nations respectively) rather than inventing new ones.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from eu4_date import eu4_date_to_days as d  # noqa: E402

AUDITS_DIR = Path(__file__).resolve().parent.parent.parent / "public" / "earth-history" / "audits"

NATIONS = [
    {
        "tag": "MOR",
        "readme": (
            "Morocco's converted history stops at 'iqta' (day 462820, "
            "medieval Islamic land-grant administration). Adds the 2011 "
            "constitutional reform under Mohammed VI (approved by referendum "
            "1 July 2011, promulgated 29 July 2011 after the Feb20 Movement "
            "protests) that created an elected head-of-government role while "
            "the King retains substantial executive, military, and religious "
            "authority (Commander of the Faithful) -- matches the "
            "'powerful_head_of_state' reform already used for UAE, not the "
            "more ceremonial 'ceremonial_monarch' used for GBR/NED/SWE/JAP."
        ),
        "date": "2011.7.29",
        "reformId": "powerful_head_of_state",
        "note": (
            "2011 Moroccan constitutional reform (King Mohammed VI); King "
            "retains broad executive/religious/military authority alongside "
            "an elected Head of Government, matching UAE's "
            "'powerful_head_of_state' pattern rather than a ceremonial "
            "monarchy."
        ),
    },
    {
        "tag": "JOR",
        "readme": (
            "Jordan's converted history has no reform beyond the generic "
            "early_gov_reform_1..10 placeholders. Adds the 1952 constitution "
            "(8 Jan 1952) establishing the modern Hashemite Kingdom of "
            "Jordan, under which the King appoints/dismisses the Prime "
            "Minister and cabinet and can dissolve Parliament -- matches "
            "UAE's 'powerful_head_of_state' reform."
        ),
        "date": "1952.1.8",
        "reformId": "powerful_head_of_state",
        "note": (
            "1952 Jordanian constitution; King retains strong executive "
            "powers (appoints government, can dissolve Parliament), matching "
            "'powerful_head_of_state' rather than a ceremonial monarchy."
        ),
    },
    {
        "tag": "KUW",
        "readme": (
            "Kuwait's converted history has no reform beyond the generic "
            "early_gov_reform_1..10 placeholders. Adds the 1962 constitution "
            "(promulgated 11 Nov 1962) establishing the modern State of "
            "Kuwait, under which the Emir retains strong executive authority "
            "alongside an elected National Assembly -- matches "
            "'powerful_head_of_state'."
        ),
        "date": "1962.11.11",
        "reformId": "powerful_head_of_state",
        "note": (
            "1962 Kuwaiti constitution; Emir retains strong executive "
            "authority alongside an elected National Assembly, matching "
            "'powerful_head_of_state'."
        ),
    },
    {
        "tag": "SIA",
        "readme": (
            "Thailand/Siam's converted history has no reform beyond the "
            "generic early_gov_reform_1..10 placeholders (last one dated "
            "462820, medieval). Adds the Siamese Revolution of 1932 (24 June "
            "1932), which ended the absolute monarchy and made the monarch a "
            "ceremonial head of state under a constitution -- matches the "
            "'ceremonial_monarch' reform already used for GBR/NED/SWE/NOR/JAP."
        ),
        "date": "1932.6.24",
        "reformId": "ceremonial_monarch",
        "note": (
            "Siamese Revolution of 1932 ends the absolute monarchy; the King "
            "becomes a ceremonial constitutional head of state, matching "
            "'ceremonial_monarch' (GBR/NED/SWE/NOR/JAP pattern)."
        ),
    },
    {
        "tag": "SRN",
        "readme": (
            "Suriname's converted history has no reform beyond the generic "
            "early_gov_reform_1..10 placeholders. Adds the 1987 constitution "
            "(approved by referendum 30 Sep 1987), which restored "
            "parliamentary democracy after the 1980-1987 military regime and "
            "established the current representative-democratic republic -- "
            "matches the common 'democracy_reform' used by 243 other nations "
            "in this dataset."
        ),
        "date": "1987.9.30",
        "reformId": "democracy_reform",
        "note": (
            "1987 Surinamese constitution (referendum) restores parliamentary "
            "democracy after the 1980-1987 military regime, matching the "
            "standard 'democracy_reform' used across the dataset."
        ),
    },
]

for n in NATIONS:
    audit = {
        "_readme": n["readme"],
        "tag": n["tag"],
        "events": [
            {
                "date": d(n["date"]),
                "kind": "governmentReformAdd",
                "payload": {"reformId": n["reformId"]},
                "note": n["note"],
                "sourceConfidence": "traditional",
            }
        ],
    }
    out_path = AUDITS_DIR / f"{n['tag']}.json"
    out_path.write_text(json.dumps(audit, indent="\t") + "\n", encoding="utf-8")
    print(f"{out_path.name}: {n['reformId']} @ {n['date']}")
