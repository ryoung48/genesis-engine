// One-off generator for the Assyria/Mesopotamia pre-2AD audit batch.
// Writes:
//   - public/earth-history/audits/cp_neo_assyrian_empire.json
//   - public/earth-history/audits/cp_assyrian_egypt.json
//   - public/earth-history/audits/cp_babylonia.json
//   - public/earth-history/audits/cp_neo_babylonian_empire.json
//   - public/earth-history/audits/cp_median_kingdom.json
//   - public/earth-history/audits/wars/assyria-mesopotamia-wars.json
// Dates use real historical BCE years and project day encoding (day 0 = 2 AD Jan 1).
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2

function dayOfYear(month, day) {
	return CUM_MONTH_DAYS[month - 1] + day
}

function eu4DateToDays(astroYear, month, day) {
	return (
		(astroYear - EARTH_HISTORY_START_YEAR) * 365 +
		dayOfYear(month, day) -
		dayOfYear(1, 1)
	)
}

function bc(year) {
	return 1 - year
}

function d(year, month = 1, day = 1) {
	return eu4DateToDays(bc(year), month, day)
}

function nationBuilder(tag, extra = {}) {
	const events = []
	function event(year, kind, payload, note, sourceConfidence = "traditional") {
		events.push({ date: d(year), kind, payload, note, sourceConfidence })
	}
	function ruler(year, name, opts = {}) {
		const { note, sourceConfidence = "traditional", ...payload } = opts
		event(year, "rulerChange", { name, ...payload }, note, sourceConfidence)
	}
	function govChange(year, governmentType, note, sourceConfidence = "traditional") {
		event(year, "governmentChange", { governmentType }, note, sourceConfidence)
	}
	function reformAdd(year, reformId, note, sourceConfidence = "traditional") {
		event(year, "governmentReformAdd", { reformId }, note, sourceConfidence)
	}
	return { tag, events, ruler, govChange, reformAdd, ...extra }
}

function provinceEvent(year, kind, payload, note, sourceConfidence = "abstraction") {
	return { date: d(year), kind, payload, note, sourceConfidence }
}

function war({
	warId,
	name,
	casusBelli,
	warGoalType,
	warGoalTag = null,
	warGoalProvince = null,
	attacker,
	defender,
	start,
	end,
	battles = [],
	note,
	sourceConfidence = "traditional",
}) {
	const events = []
	for (const tag of attacker) events.push({ date: start, nationTag: tag, kind: "warStart", side: "attacker" })
	for (const tag of defender) events.push({ date: start, nationTag: tag, kind: "warStart", side: "defender" })
	for (const tag of attacker) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "attacker" })
	for (const tag of defender) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "defender" })
	return {
		warId,
		name,
		casusBelli,
		warGoalType,
		warGoalTag,
		warGoalProvince,
		isRebel: false,
		events,
		battles,
		note,
		sourceConfidence,
	}
}

function battle({
	year,
	month = 1,
	day = 1,
	name,
	locationProvinceId,
	attacker,
	defender,
	attackerWon,
	note,
	sourceConfidence = "traditional",
}) {
	return {
		date: d(year, month, day),
		name,
		locationProvinceId,
		attacker,
		defender,
		attackerWon,
		note,
		sourceConfidence,
	}
}

function revoltEvent({ year, type, size, leader, comment, note, sourceConfidence = "traditional" }) {
	const revolt = { type, size }
	if (leader) revolt.leader = leader
	return {
		date: d(year),
		kind: "revolt",
		payload: { revolt },
		comment,
		note,
		sourceConfidence,
	}
}

const readme =
	"Audit/proposal file: reconstructed pre-2AD events for the Assyria/Mesopotamia batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Dates use real historical BCE years. Province-level culture/religion additions are deliberately narrow: Babylonian heartland corrections use existing babylonian/mesopotamian IDs for Babylonian periods, late pre-2AD transition events bridge toward the year-2 baseline, Samaria gets an Assyrian-resettlement Aramaic marker, and Judea is not flipped because the Babylonian exile is not a clean province-wide conversion event."

const babylonianHeartlandProvinceEvents = {
	"408": [
		provinceEvent(1750, "culture", { cultureId: "babylonian" }, "Basra/lower Babylonia is marked al_iraqiya_arabic in the source baseline; for Old/Neo-Babylonian audit purposes this proposes the existing babylonian culture id for the ancient alluvial south."),
		provinceEvent(1750, "religion", { religionId: "mesopotamian" }, "Uses the existing mesopotamian religion id for Babylonian civic cults rather than the source baseline's later zoroastrian value."),
		provinceEvent(141, "culture", { cultureId: "al_iraqiya_arabic" }, "Late pre-2AD bridge to the source year-2 Basra culture; prevents Babylonian from persisting all the way to the post-2AD baseline.", "abstraction"),
		provinceEvent(141, "religion", { religionId: "zoroastrian" }, "Late pre-2AD bridge to the source year-2 Basra religion after Achaemenid/Seleucid/Parthian rule; prevents mesopotamian temple religion from persisting to the handoff.", "abstraction"),
	],
	"410": [
		provinceEvent(1750, "culture", { cultureId: "babylonian" }, "Iraq-i-Arab/Babylon region is the Babylonian core; source baseline currently leaves it assyrian through later periods."),
		provinceEvent(1750, "religion", { religionId: "mesopotamian" }, "Marks Babylonian temple religion in the core rather than later zoroastrian baseline."),
		provinceEvent(141, "culture", { cultureId: "assyrian" }, "Late pre-2AD bridge to the source year-2 Iraq-i-Arab culture after Achaemenid/Seleucid/Parthian rule; Babylonian should not persist as the province-scale culture into year 2.", "abstraction"),
		provinceEvent(141, "religion", { religionId: "zoroastrian" }, "Late pre-2AD bridge to the source year-2 religion after imperial Iranian rule; mesopotamian temple religion should not persist as the province-scale religion into year 2.", "abstraction"),
	],
	"2310": [
		provinceEvent(1750, "culture", { cultureId: "babylonian" }, "Tikrit/Samarra corridor is included in the modeled Babylonian core footprint and needs a Babylonian culture proposal while Babylonia owns it."),
		provinceEvent(1750, "religion", { religionId: "mesopotamian" }, "Marks Mesopotamian cult continuity while Babylonia controls the province."),
		provinceEvent(141, "culture", { cultureId: "assyrian" }, "Late pre-2AD bridge to the source year-2 Tikrit culture; Babylonian should not persist into the Parthian/Roman-era handoff.", "abstraction"),
		provinceEvent(141, "religion", { religionId: "zoroastrian" }, "Late pre-2AD bridge to the source year-2 Tikrit religion after imperial Iranian rule.", "abstraction"),
	],
	"2311": [
		provinceEvent(1750, "culture", { cultureId: "babylonian" }, "Samawah/lower Euphrates stand-in for southern Babylonia; source baseline is not ancient-Babylonian specific."),
		provinceEvent(1750, "religion", { religionId: "mesopotamian" }, "Uses existing mesopotamian religion id for the Babylonian temple-cult zone."),
		provinceEvent(141, "culture", { cultureId: "al_iraqiya_arabic" }, "Late pre-2AD bridge to the source year-2 Samawah culture; prevents Babylonian from persisting to the handoff.", "abstraction"),
		provinceEvent(141, "religion", { religionId: "ashurism" }, "Late pre-2AD bridge to the source year-2 Samawah religion; prevents broad mesopotamian temple religion from persisting to the handoff.", "abstraction"),
	],
	"2312": [
		provinceEvent(1750, "culture", { cultureId: "babylonian" }, "Wasit/Tigris alluvium stand-in for Babylonia; proposed as Babylonian in the ancient period."),
		provinceEvent(1750, "religion", { religionId: "mesopotamian" }, "Uses existing mesopotamian religion id for the Babylonian temple-cult zone."),
		provinceEvent(141, "culture", { cultureId: "al_iraqiya_arabic" }, "Late pre-2AD bridge to the source year-2 Wasit culture; prevents Babylonian from persisting to the handoff.", "abstraction"),
		provinceEvent(141, "religion", { religionId: "zoroastrian" }, "Late pre-2AD bridge to the source year-2 Wasit religion after imperial Iranian rule.", "abstraction"),
	],
	"4288": [
		provinceEvent(1750, "culture", { cultureId: "babylonian" }, "Shatt/lower Mesopotamia stand-in for southern Babylonia."),
		provinceEvent(1750, "religion", { religionId: "mesopotamian" }, "Uses existing mesopotamian religion id for Babylonian cult practice."),
		provinceEvent(141, "culture", { cultureId: "al_iraqiya_arabic" }, "Late pre-2AD bridge to the source year-2 Shatt culture; prevents Babylonian from persisting to the handoff.", "abstraction"),
		provinceEvent(141, "religion", { religionId: "hellenism" }, "Late pre-2AD bridge to the source year-2 Characene/Shatt religion in the Hellenistic-Parthian frontier; prevents mesopotamian from persisting to the handoff.", "abstraction"),
	],
	"4290": [
		provinceEvent(1750, "culture", { cultureId: "babylonian" }, "Hoveyzeh sits on the Babylonian-Elamite border in the local footprint; proposed as Babylonian while Babylonia controls it."),
		provinceEvent(1750, "religion", { religionId: "mesopotamian" }, "Uses existing mesopotamian religion id for Babylonian control periods."),
		provinceEvent(141, "culture", { cultureId: "khuzi" }, "Late pre-2AD bridge to the source year-2 Hoveyzeh culture; Babylonian should not persist across the Elamite/Susiana frontier into year 2.", "abstraction"),
		provinceEvent(141, "religion", { religionId: "zoroastrian" }, "Late pre-2AD bridge to the source year-2 Hoveyzeh religion after Iranian imperial influence.", "abstraction"),
	],
	"4291": [
		provinceEvent(1750, "culture", { cultureId: "babylonian" }, "Qazania/Diyala-Babylonian border province is proposed as Babylonian during Babylonian control."),
		provinceEvent(1750, "religion", { religionId: "mesopotamian" }, "Uses existing mesopotamian religion id for Babylonian control periods."),
		provinceEvent(141, "culture", { cultureId: "assyrian" }, "Late pre-2AD bridge to the source year-2 Qazania/Diyala culture after Achaemenid/Seleucid/Parthian rule.", "abstraction"),
		provinceEvent(141, "religion", { religionId: "zoroastrian" }, "Late pre-2AD bridge to the source year-2 Qazania/Diyala religion after Iranian imperial influence.", "abstraction"),
	],
}

// =======================================================================
// NEO-ASSYRIAN EMPIRE
// =======================================================================
const assyria = nationBuilder("cp_neo_assyrian_empire", {
	provinceEvents: {
		"1854": [
			provinceEvent(722, "culture", { cultureId: "aramaic" }, "Samaria/Acco stand-in: after Assyria conquered the kingdom of Israel, Assyrian deportation and resettlement policy replaced part of the population with deportees from other regions. Aramaic is the closest existing culture id for the mixed imperial-resettlement population; religion is intentionally not flipped because the sources describe mixed Yahwistic and imported cult practice rather than one clean conversion."),
		],
	},
})
assyria.govChange(911, "monarchy", "Adad-nirari II begins the conventionally defined Neo-Assyrian period")
assyria.reformAdd(911, "aristocratic_monarchy", "Reuses an existing monarchy reform id for the Assyrian royal court and magnate system", "abstraction")
for (const [year, name, note] of [
	[911, "Adad-nirari II", "Restored Assyrian strength after the late Middle Assyrian contraction"],
	[891, "Tukulti-Ninurta II", "Consolidated Assyrian recovery in northern Mesopotamia"],
	[883, "Ashurnasirpal II", "Expanded aggressively and founded Kalhu/Nimrud as a new royal capital"],
	[859, "Shalmaneser III", "Campaigned widely in Syria, Anatolia, and Babylonia; fought at Qarqar"],
	[824, "Shamshi-Adad V", "Inherited civil conflict and campaigned against Babylonia"],
	[811, "Shammuramat", "Queen mother/regent for Adad-nirari III; later remembered in Semiramis traditions"],
	[811, "Adad-nirari III", "Ruled during renewed Assyrian campaigning in Syria and Babylonia"],
	[783, "Shalmaneser IV", "Weak king during a period of magnate influence and Urartian pressure"],
	[773, "Ashur-dan III", "Reign marked by plague, revolt, and eclipse omen traditions"],
	[755, "Ashur-nirari V", "Last king before Tiglath-Pileser III's usurpation"],
	[745, "Tiglath-Pileser III", "Major reformer and conqueror; annexed territories and expanded mass deportation policy"],
	[727, "Shalmaneser V", "Besieged Samaria and ruled both Assyria and Babylon"],
	[722, "Sargon II", "Completed the conquest of Samaria and founded the Sargonid dynasty"],
	[705, "Sennacherib", "Built Nineveh as capital, suppressed revolts, and destroyed Babylon in 689 BC"],
	[681, "Esarhaddon", "Restored Babylon and conquered Egypt in 671 BC"],
	[669, "Ashurbanipal", "Last great Assyrian king; defeated Elam and held Egypt briefly before decline"],
	[631, "Ashur-etil-ilani", "Succeeded Ashurbanipal amid growing instability; chronology is partly reconstructed"],
	[627, "Sinsharishkun", "Fought the Babylonian revolt and the Medo-Babylonian coalition; killed as Assyria collapsed"],
	[612, "Ashur-uballit II", "Last Assyrian king, ruling from Harran after Nineveh's fall until final defeat around 609 BC"],
]) {
	assyria.ruler(year, name, { dynasty: "Neo-Assyrian", note, sourceConfidence: name === "Ashur-etil-ilani" ? "abstraction" : "traditional" })
}

// =======================================================================
// ASSYRIAN EGYPT
// =======================================================================
const assyrianEgypt = nationBuilder("cp_assyrian_egypt")
assyrianEgypt.govChange(671, "monarchy", "Esarhaddon conquers Memphis and installs Assyrian authority over Egypt")
assyrianEgypt.reformAdd(671, "aristocratic_monarchy", "Reuses an existing monarchy reform id for Assyrian provincial/vassal rule in Egypt", "abstraction")
for (const [year, name, note] of [
	[671, "Esarhaddon", "Conquered Egypt after earlier failed campaigns against Taharqa"],
	[669, "Ashurbanipal", "Repeatedly campaigned in Egypt and sacked Thebes in 663 BC before Assyrian control faded"],
	[664, "Necho I", "Assyrian-backed Saite ruler in the Delta; included as local vassal authority under the Assyrian Egypt tag"],
	[664, "Psamtik I", "Initially an Assyrian-backed Saite ruler before founding the independent Twenty-Sixth Dynasty as Assyrian power withdrew"],
]) {
	assyrianEgypt.ruler(year, name, { dynasty: name.includes("Necho") || name.includes("Psamtik") ? "Saite" : "Sargonid", note })
}

// =======================================================================
// BABYLONIA
// =======================================================================
const babylonia = nationBuilder("cp_babylonia", { provinceEvents: babylonianHeartlandProvinceEvents })
babylonia.govChange(1894, "monarchy", "Approximate start of the First Dynasty of Babylon under Sumu-abum")
babylonia.reformAdd(1894, "aristocratic_monarchy", "Reuses an existing monarchy reform id for the Amorite and later Babylonian kingship", "abstraction")
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[1894, "Sumu-abum", "First Dynasty of Babylon", "Founder of the First Dynasty of Babylon; early chronology is middle-chronology approximate", "abstraction"],
	[1881, "Sumu-la-El", "First Dynasty of Babylon", "Expanded early Babylonian power in central Mesopotamia", "abstraction"],
	[1845, "Sabium", "First Dynasty of Babylon", "Early Babylonian king in the Amorite dynasty", "abstraction"],
	[1831, "Apil-Sin", "First Dynasty of Babylon", "Early Babylonian king in the Amorite dynasty", "abstraction"],
	[1813, "Sin-Muballit", "First Dynasty of Babylon", "Father of Hammurabi; strengthened Babylon before its imperial expansion", "abstraction"],
	[1792, "Hammurabi", "First Dynasty of Babylon", "Created the Old Babylonian Empire and issued the law collection associated with his name"],
	[1750, "Samsu-iluna", "First Dynasty of Babylon", "Faced major revolts after Hammurabi and lost parts of southern Mesopotamia"],
	[747, "Nabonassar", "Dynasty of E", "Opened the better-attested Babylonian king-list era used by later astronomical chronology"],
	[734, "Nabu-nadin-zeri", "Dynasty of E", "Son of Nabonassar; overthrown in a short succession crisis"],
	[732, "Nabu-shuma-ukin II", "Dynasty of E", "Brief Babylonian ruler during the crisis before Nabu-mukin-zeri"],
	[731, "Nabu-mukin-zeri", "Chaldean", "Chaldean ruler defeated by Tiglath-Pileser III"],
	[729, "Pulu / Tiglath-Pileser III", "Assyrian", "Assyrian king ruling Babylon under the throne name Pulu"],
	[727, "Ululayu / Shalmaneser V", "Assyrian", "Assyrian king ruling Babylon under the throne name Ululayu"],
	[722, "Marduk-apla-iddina II", "Chaldean", "Merodach-Baladan; repeatedly resisted Assyrian control with Elamite support"],
	[710, "Sargon II", "Assyrian", "Took Babylon after defeating Marduk-apla-iddina II"],
	[703, "Bel-ibni", "Assyrian client", "Assyrian-appointed Babylonian king under Sennacherib"],
	[700, "Ashur-nadin-shumi", "Assyrian", "Son of Sennacherib installed as king of Babylon"],
	[694, "Nergal-ushezib", "Elamite-backed", "Brief rebel king backed by Elam against Assyria"],
	[693, "Mushezib-Marduk", "Chaldean", "Led the final anti-Assyrian revolt before Sennacherib destroyed Babylon"],
	[689, "Sennacherib", "Assyrian", "Destroyed Babylon and carried off its cult image; Babylonian kingship was effectively suspended"],
	[681, "Esarhaddon", "Assyrian", "Restored Babylon and rebuilt the city"],
	[668, "Shamash-shum-ukin", "Assyrian", "Ashurbanipal's brother, installed as king of Babylon; later rebelled"],
	[648, "Kandalanu", "Assyrian client", "Ruled Babylon after Shamash-shum-ukin's defeat; exact identity is debated"],
	[626, "Nabopolassar", "Chaldean", "Rebelled against Assyria and founded the Neo-Babylonian Empire"],
]) {
	babylonia.ruler(year, name, { dynasty, note, sourceConfidence: confidence })
}

// =======================================================================
// NEO-BABYLONIAN EMPIRE
// =======================================================================
const neoBabylonian = nationBuilder("cp_neo_babylonian_empire", {
	provinceEvents: {
		...babylonianHeartlandProvinceEvents,
		"379": [
			provinceEvent(586, "religion", { religionId: "jewish" }, "Nebuchadnezzar's destruction of Jerusalem and deportations profoundly shaped Jewish religious history, but this deliberately keeps Judea Jewish rather than converting it; the event is a review marker documenting why no province-wide religion flip is proposed."),
		],
	},
})
neoBabylonian.govChange(626, "monarchy", "Nabopolassar's revolt establishes the Neo-Babylonian kingdom")
neoBabylonian.reformAdd(626, "aristocratic_monarchy", "Reuses an existing monarchy reform id for Chaldean Babylonian kingship", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[626, "Nabopolassar", "Founder of the Neo-Babylonian Empire; allied with the Medes against Assyria"],
	[605, "Nebuchadnezzar II", "Defeated Egypt at Carchemish, rebuilt Babylon, and conquered Jerusalem"],
	[562, "Amel-Marduk", "Son of Nebuchadnezzar II; released Jehoiachin from prison according to Babylonian/Judean tradition"],
	[560, "Neriglissar", "Usurper/royal in-law who ruled after Amel-Marduk"],
	[556, "Labashi-Marduk", "Brief child king overthrown in favor of Nabonidus"],
	[556, "Nabonidus", "Last Neo-Babylonian king; absent at Tayma for years while Belshazzar governed Babylon"],
	[553, "Belshazzar", "Crown prince and regent during Nabonidus's absence; included as governing authority rather than sole king", "abstraction"],
]) {
	neoBabylonian.ruler(year, name, { dynasty: "Chaldean", note, sourceConfidence: confidence })
}

// =======================================================================
// MEDIAN KINGDOM
// =======================================================================
const media = nationBuilder("cp_median_kingdom")
media.govChange(678, "monarchy", "Traditional foundation period for Median royal power under Deioces; historicity and imperial extent remain debated")
media.reformAdd(678, "aristocratic_monarchy", "Reuses an existing monarchy reform id; Median state structure is poorly attested", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[678, "Deioces", "Traditional founder in Herodotus; early Median state formation is uncertain", "abstraction"],
	[647, "Phraortes", "Traditional Median king said to have expanded power and fought Assyria", "abstraction"],
	[625, "Cyaxares", "Best-attested Median king; reorganized Median power and helped destroy Assyria"],
	[585, "Astyages", "Last Median king; overthrown by Cyrus the Great around 550 BC"],
]) {
	media.ruler(year, name, { dynasty: "Median", note, sourceConfidence: confidence })
}

const wars = [
	war({
		warId: "assyrianBabylonianWars",
		name: "Assyrian-Babylonian Wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "410",
		attacker: ["cp_neo_assyrian_empire"],
		defender: ["cp_babylonia"],
		start: d(745),
		end: d(689),
		note: "Long Assyrian struggle to dominate Babylonia from Tiglath-Pileser III through Sennacherib's destruction of Babylon. Modeled as one recurring war because the local schema has one cp_babylonia tag for multiple Babylonian regimes.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 689,
				name: "Siege and destruction of Babylon",
				locationProvinceId: "410",
				attacker: { country: "cp_neo_assyrian_empire", commander: "Sennacherib", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_babylonia", commander: "Mushezib-Marduk", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Iraq-i-Arab (410) stands in for Babylon; the sources stress destruction and deportation more than battle order.",
			}),
		],
	}),
	war({
		warId: "assyrianConquestOfIsrael",
		name: "Assyrian Conquest of Israel",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_kingdom_of_israel",
		attacker: ["cp_neo_assyrian_empire"],
		defender: ["cp_kingdom_of_israel"],
		start: d(732),
		end: d(722),
		note: "Tiglath-Pileser III, Shalmaneser V, and Sargon II reduce and annex the northern kingdom of Israel; Acco (1854) is the local Samaria/Galilee stand-in for province-level impact.",
		battles: [
			battle({
				year: 722,
				name: "Fall of Samaria",
				locationProvinceId: "1854",
				attacker: { country: "cp_neo_assyrian_empire", commander: "Sargon II / Shalmaneser V", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_kingdom_of_israel", commander: "Hoshea", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Acco (1854) is used as the closest local northern Israel/Samaria stand-in.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "sennacheribJudahCampaign",
		name: "Sennacherib's Judah Campaign",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "379",
		attacker: ["cp_neo_assyrian_empire"],
		defender: ["cp_kingdom_of_judah"],
		start: d(701),
		end: d(701, 1, 2),
		note: "Sennacherib devastates Judah and besieges Jerusalem, but Hezekiah survives as a vassal; represented as a limited Assyrian victory rather than annexation.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "assyrianConquestOfEgypt",
		name: "Assyrian Conquest of Egypt",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "361",
		attacker: ["cp_neo_assyrian_empire"],
		defender: ["cp_kingdom_of_kush"],
		start: d(673),
		end: d(663),
		note: "Esarhaddon and Ashurbanipal fight Taharqa and Tantamani, creating the short Assyrian Egypt phase.",
		battles: [
			battle({
				year: 671,
				name: "Capture of Memphis",
				locationProvinceId: "361",
				attacker: { country: "cp_neo_assyrian_empire", commander: "Esarhaddon", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_kingdom_of_kush", commander: "Taharqa", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Cairo (361) stands in for Memphis.",
			}),
			battle({
				year: 663,
				name: "Sack of Thebes",
				locationProvinceId: "360",
				attacker: { country: "cp_assyrian_egypt", commander: "Ashurbanipal's commanders", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_kingdom_of_kush", commander: "Tantamani", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Nile (360) stands in for Upper Egypt/Thebes.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "shamashShumUkinRevolt",
		name: "Shamash-shum-ukin's Babylonian Revolt",
		casusBelli: "cb_independence_war",
		warGoalType: "take_capital",
		warGoalProvince: "410",
		attacker: ["cp_babylonia"],
		defender: ["cp_neo_assyrian_empire"],
		start: d(652),
		end: d(648),
		note: "Ashurbanipal suppresses his brother Shamash-shum-ukin's Babylonian revolt after a long siege.",
		battles: [
			battle({
				year: 648,
				name: "Siege of Babylon",
				locationProvinceId: "410",
				attacker: { country: "cp_neo_assyrian_empire", commander: "Ashurbanipal", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_babylonia", commander: "Shamash-shum-ukin", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Iraq-i-Arab (410) stands in for Babylon.",
			}),
		],
	}),
	war({
		warId: "medoBabylonianWarAgainstAssyria",
		name: "Medo-Babylonian War Against Assyria",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_neo_assyrian_empire",
		attacker: ["cp_median_kingdom", "cp_neo_babylonian_empire"],
		defender: ["cp_neo_assyrian_empire"],
		start: d(626),
		end: d(609),
		note: "Nabopolassar's Babylonian revolt and Cyaxares's Median offensive destroy the Assyrian Empire, including Nineveh in 612 and Harran by 609.",
		battles: [
			battle({
				year: 614,
				name: "Fall of Ashur",
				locationProvinceId: "2310",
				attacker: { country: "cp_median_kingdom", commander: "Cyaxares", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_neo_assyrian_empire", commander: "Sinsharishkun's garrison", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Tikrit (2310) stands in for Ashur on the Tigris.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 612,
				name: "Fall of Nineveh",
				locationProvinceId: "411",
				attacker: { country: "cp_neo_babylonian_empire", commander: "Nabopolassar and Cyaxares", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_neo_assyrian_empire", commander: "Sinsharishkun", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Mosul (411) stands in for Nineveh.",
			}),
			battle({
				year: 609,
				name: "Fall of Harran",
				locationProvinceId: "2308",
				attacker: { country: "cp_neo_babylonian_empire", commander: "Nabopolassar", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_neo_assyrian_empire", commander: "Ashur-uballit II", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Diyarbakir (2308) stands in for Harran/upper Mesopotamia.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "battleOfCarchemish",
		name: "Battle of Carchemish",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "377",
		attacker: ["cp_neo_babylonian_empire"],
		defender: ["cp_twenty_sixth_dynasty_of_egypt"],
		start: d(605),
		end: d(605, 1, 2),
		note: "Nebuchadnezzar II defeats Necho II's Egyptian army, ending Egyptian intervention in Syria and confirming Babylonian control of the Levant.",
		battles: [
			battle({
				year: 605,
				name: "Carchemish",
				locationProvinceId: "377",
				attacker: { country: "cp_neo_babylonian_empire", commander: "Nebuchadnezzar II", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_twenty_sixth_dynasty_of_egypt", commander: "Necho II", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Aleppo (377) stands in for the Euphrates/Carchemish theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "babylonianConquestOfJudah",
		name: "Babylonian Conquest of Judah",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_kingdom_of_judah",
		attacker: ["cp_neo_babylonian_empire"],
		defender: ["cp_kingdom_of_judah"],
		start: d(597),
		end: d(586),
		note: "Nebuchadnezzar II captures Jerusalem in 597 and destroys the city and Temple in 586/587 after Zedekiah's revolt.",
		battles: [
			battle({
				year: 597,
				name: "First Babylonian capture of Jerusalem",
				locationProvinceId: "379",
				attacker: { country: "cp_neo_babylonian_empire", commander: "Nebuchadnezzar II", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_kingdom_of_judah", commander: "Jehoiachin", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Judea (379) stands in for Jerusalem.",
			}),
			battle({
				year: 586,
				name: "Destruction of Jerusalem",
				locationProvinceId: "379",
				attacker: { country: "cp_neo_babylonian_empire", commander: "Nebuchadnezzar II / Nebuzaradan", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_kingdom_of_judah", commander: "Zedekiah", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Judea (379) stands in for Jerusalem; date follows the common 586 BC convention.",
			}),
		],
	}),
	war({
		warId: "persianConquestOfMedia",
		name: "Persian Conquest of Media",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_median_kingdom",
		attacker: ["cp_achaemenid_empire"],
		defender: ["cp_median_kingdom"],
		start: d(553),
		end: d(550),
		note: "Cyrus the Great defeats Astyages and absorbs Media, turning a Persian revolt into the Achaemenid imperial foundation.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 550,
				name: "Fall of Ecbatana",
				locationProvinceId: "414",
				attacker: { country: "cp_achaemenid_empire", commander: "Cyrus the Great", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_median_kingdom", commander: "Astyages", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Hamadan (414) stands in for Ecbatana.",
			}),
		],
	}),
	war({
		warId: "persianConquestOfBabylon",
		name: "Persian Conquest of Babylon",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_neo_babylonian_empire",
		attacker: ["cp_achaemenid_empire"],
		defender: ["cp_neo_babylonian_empire"],
		start: d(539),
		end: d(539, 10, 12),
		note: "Cyrus the Great defeats Nabonidus's forces at Opis and takes Babylon, ending the Neo-Babylonian Empire. This complements the existing Achaemenid audit war but records the defender-side batch coverage here.",
		battles: [
			battle({
				year: 539,
				month: 9,
				day: 25,
				name: "Battle of Opis",
				locationProvinceId: "408",
				attacker: { country: "cp_achaemenid_empire", commander: "Cyrus the Great", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_neo_babylonian_empire", commander: "Nabonidus's army", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Basra (408) is the same lower Mesopotamian stand-in used by the existing Achaemenid pilot audit for Opis.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
]

const revolts = {
	"411": {
		events: [
			revoltEvent({
				year: 826,
				type: "pretender_rebels",
				size: 5,
				leader: "Ashur-danin-pal",
				comment: "Ashur-danin-pal's revolt",
				note: "Late in Shalmaneser III's reign, his son Ashur-danin-pal rebelled and won support from Nineveh and other Assyrian cities; Shamshi-Adad V eventually suppressed the civil war around 821/820 BC. No separate rebel-state tag exists, so this is a province-level pretender revolt. Mosul (411) stands in for Nineveh.",
			}),
			revoltEvent({
				year: 631,
				type: "pretender_rebels",
				size: 3,
				leader: "Nabu-rihtu-usur",
				comment: "Nabu-rihtu-usur usurpation attempt",
				note: "After Ashurbanipal's death, Nabu-rihtu-usur attempted to seize power against Ashur-etil-ilani and was crushed by Sin-shumu-lishir; Nineveh shows fire damage in this succession context. No separate tag exists for the claimant faction, so this is recorded as a pretender revolt. Mosul (411) stands in for Nineveh.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"2310": {
		events: [
			revoltEvent({
				year: 763,
				type: "noble_rebels",
				size: 3,
				comment: "Ashur-dan III unrest",
				note: "Ashur-dan III's reign was marked by repeated revolts amid plague and the Bur-Sagale solar eclipse. The record does not preserve a clean rebel polity or single leader, so this abstracts the internal unrest as noble rebels in the Assyrian heartland. Tikrit (2310) stands in for Assur/Tigris heartland unrest.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"4293": {
		events: [
			revoltEvent({
				year: 746,
				type: "pretender_rebels",
				size: 4,
				leader: "Tiglath-Pileser III's faction",
				comment: "Kalhu revolt and Tiglath-Pileser III's accession",
				note: "A rebellion at Kalhu/Nimrud in 746 BC preceded Tiglath-Pileser III's seizure of the throne in 745 BC. Since no separate faction tag exists and the exact leadership is debated, this is modeled as a pretender revolt. Arbil (4293) is the nearest local Assyrian-core stand-in for Kalhu/Nimrud.",
				sourceConfidence: "abstraction",
			}),
		],
	},
}

function writeNation(builder) {
	const out = {
		_readme: readme,
		tag: builder.tag,
		events: builder.events.sort((a, b) => a.date - b.date),
	}
	if (builder.provinceEvents) out.provinceEvents = builder.provinceEvents
	fs.writeFileSync(path.join(auditsDir, `${builder.tag}.json`), JSON.stringify(out, null, "\t") + "\n")
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
const revoltsDir = path.join(auditsDir, "revolts")
fs.mkdirSync(warsDir, { recursive: true })
fs.mkdirSync(revoltsDir, { recursive: true })

for (const builder of [assyria, assyrianEgypt, babylonia, neoBabylonian, media]) {
	writeNation(builder)
}

wars.sort((a, b) => a.events[0].date - b.events[0].date)
fs.writeFileSync(
	path.join(warsDir, "assyria-mesopotamia-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: wars for the Assyria/Mesopotamia batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields for review. Not wired into the engine.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "assyria-mesopotamia-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Assyria/Mesopotamia batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields for review. Babylonian anti-Assyrian uprisings are modeled in assyria-mesopotamia-wars.json because cp_babylonia exists as an opposing tag; this file only covers internal Assyrian revolts with no separate polity tag.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote 5 nation files, ${wars.length} wars, and ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts`)
