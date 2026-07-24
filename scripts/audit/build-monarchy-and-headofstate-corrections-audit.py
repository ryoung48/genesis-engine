"""One-off generator correcting a systemic source-data bug: geo-explorer's
raw EU4 history files fire a single templated "modernize government" batch
(governmentChange to "republic" plus a fixed bundle of governmentReformAdd
events) on independence/full-self-government dates for many ex-British
colonies and other nations, without regard to whether the nation actually
became a republic. Confirmed real-world government forms as of 2026:

- 14 Commonwealth realms are still constitutional monarchies (the British
  monarch is head of state, via a Governor-General) -- their converted data
  incorrectly shows governmentType "republic".
- UAE is an absolute federal monarchy (President is always the hereditary
  Emir of Abu Dhabi) -- same "republic" mislabeling.
- USA is correctly "republic", but its reform bundle ends in
  "ceremonial_president"/starts with "parliamentary_reform", both wrong for
  a presidential system with real executive power; needs "powerful_head_of_
  state" (same category as UAE/Morocco/Jordan/Kuwait) instead.

Each correction is a new event dated one day after the erroneous batch's own
date (not a fabricated alternate history -- just enough to sort after it, so
fold.ts's last-wins per-field logic picks up the correction). Writes one
audits/<TAG>.json per nation, merged automatically by apply_audit_enrichment()
in build-eu4-history-events.py on every regen.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

AUDITS_DIR = Path(__file__).resolve().parent.parent.parent / "public" / "earth-history" / "audits"

CEREMONIAL_MONARCHY_NOTE = (
    "Source data's templated 'modernize government' batch incorrectly set "
    "governmentType to 'republic'; {name} is a Commonwealth realm and "
    "remains a constitutional monarchy with the British monarch as head of "
    "state (via a Governor-General). Corrected to monarchy + "
    "'ceremonial_monarch', matching the reform already used for GBR/NED/SWE/"
    "NOR/JAP."
)

# tag -> (name, last erroneous governmentChange date, correction date)
COMMONWEALTH_REALMS = {
    "CAN": ("Canada", 704429),
    "AUS": ("Australia", 708381),
    "NZL": ("New Zealand", 710253),
    "ANB": ("Antigua and Barbuda", 700070),
    "BHM": ("The Bahamas", 700070),
    "BLZ": ("Belize", 700070),
    "GRN": ("Grenada", 723362),
    "JMC": ("Jamaica", 700070),
    "SKN": ("St Kitts and Nevis", 700070),
    "SLU": ("St Lucia", 700070),
    "SVG": ("St Vincent and the Grenadines", 700070),
    "PNG": ("Papua New Guinea", 700070),
    "SLM": ("Solomon Islands", 700070),
    "TVL": ("Tuvalu", 700070),
}

audits_written = []

for tag, (name, last_bad_date) in COMMONWEALTH_REALMS.items():
    correction_date = last_bad_date + 1
    note = CEREMONIAL_MONARCHY_NOTE.format(name=name)
    audit = {
        "_readme": (
            f"Corrects {name}'s ({tag}) source-data 'republic' mislabeling; "
            "see build-monarchy-and-headofstate-corrections-audit.py for the "
            "systemic cause."
        ),
        "tag": tag,
        "events": [
            {
                "date": correction_date,
                "kind": "governmentChange",
                "payload": {"governmentType": "monarchy"},
                "note": note,
                "sourceConfidence": "traditional",
            },
            {
                "date": correction_date,
                "kind": "governmentReformAdd",
                "payload": {"reformId": "ceremonial_monarch"},
                "note": note,
                "sourceConfidence": "traditional",
            },
        ],
    }
    out_path = AUDITS_DIR / f"{tag}.json"
    out_path.write_text(json.dumps(audit, indent="\t") + "\n", encoding="utf-8")
    audits_written.append(out_path.name)

# UAE: absolute federal monarchy, President is always the hereditary Emir of
# Abu Dhabi -- same "republic" mislabeling as the Commonwealth realms, but
# the correct reform is 'powerful_head_of_state' (real executive power),
# not the ceremonial pattern.
uae_correction_date = 711020 + 1
uae_note = (
    "Source data's templated 'modernize government' batch incorrectly set "
    "governmentType to 'republic'; the UAE is an absolute federal monarchy "
    "-- the President is always the hereditary Emir of Abu Dhabi. Corrected "
    "to monarchy + 'powerful_head_of_state', matching the reform used for "
    "Morocco/Jordan/Kuwait."
)
uae_audit = {
    "_readme": "Corrects UAE's source-data 'republic' mislabeling; see build-monarchy-and-headofstate-corrections-audit.py.",
    "tag": "UAE",
    "events": [
        {
            "date": uae_correction_date,
            "kind": "governmentChange",
            "payload": {"governmentType": "monarchy"},
            "note": uae_note,
            "sourceConfidence": "traditional",
        },
        {
            "date": uae_correction_date,
            "kind": "governmentReformAdd",
            "payload": {"reformId": "powerful_head_of_state"},
            "note": uae_note,
            "sourceConfidence": "traditional",
        },
    ],
}
(AUDITS_DIR / "UAE.json").write_text(json.dumps(uae_audit, indent="\t") + "\n", encoding="utf-8")
audits_written.append("UAE.json")

# USA: governmentType "republic" is correct; only the reform is wrong. The
# source batch (parliamentary_reform -> ... -> ceremonial_president) is the
# template for parliamentary republics with a ceremonial president (matches
# Albania/Bulgaria/Croatia/Czech Republic etc. in this dataset) and doesn't
# fit the US presidential system, where the President holds real executive
# power and isn't accountable to Congress via confidence votes.
usa_correction_date = 707005 + 1
usa_note = (
    "Source data's reform batch (parliamentary_reform -> ... -> "
    "ceremonial_president) is the template for parliamentary republics with "
    "a ceremonial president and doesn't fit the US presidential system, "
    "where the President holds real executive power. Corrected to "
    "'powerful_head_of_state', matching the reform used for UAE/Morocco/"
    "Jordan/Kuwait (governmentType 'republic' is already correct and "
    "unchanged)."
)
usa_audit = {
    "_readme": "Corrects USA's mismatched government reform; see build-monarchy-and-headofstate-corrections-audit.py.",
    "tag": "USA",
    "events": [
        {
            "date": usa_correction_date,
            "kind": "governmentReformAdd",
            "payload": {"reformId": "powerful_head_of_state"},
            "note": usa_note,
            "sourceConfidence": "traditional",
        }
    ],
}
(AUDITS_DIR / "USA.json").write_text(json.dumps(usa_audit, indent="\t") + "\n", encoding="utf-8")
audits_written.append("USA.json")

print(f"wrote {len(audits_written)} audit files: {', '.join(audits_written)}")
