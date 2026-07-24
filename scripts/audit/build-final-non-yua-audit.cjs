// One-off generator for the final pre-2AD audit cleanup batch.
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2

function dayOfYear(month, day) {
	return CUM_MONTH_DAYS[month - 1] + day
}

function eu4DateToDays(astroYear, month, day) {
	return (astroYear - EARTH_HISTORY_START_YEAR) * 365 + dayOfYear(month, day) - dayOfYear(1, 1)
}

function bc(year) {
	return 1 - year
}

function d(year, month = 1, day = 1) {
	return eu4DateToDays(bc(year), month, day)
}

function nationBuilder(tag, { provinceEvents = null } = {}) {
	const events = []
	function event(year, kind, payload, note, sourceConfidence = "traditional") {
		events.push({ date: d(year), kind, payload, note, sourceConfidence })
	}
	function ruler(year, name, opts = {}) {
		const { note, sourceConfidence = "traditional", ...payload } = opts
		event(year, "rulerChange", { name, ...payload }, note, sourceConfidence)
	}
	function govChange(year, governmentType, note, sourceConfidence = "abstraction") {
		event(year, "governmentChange", { governmentType }, note, sourceConfidence)
	}
	function reformAdd(year, reformId, note, sourceConfidence = "abstraction") {
		event(year, "governmentReformAdd", { reformId }, note, sourceConfidence)
	}
	return { tag, events, ruler, govChange, reformAdd, provinceEvents }
}

function provinceEvent(year, kind, payload, note, sourceConfidence = "abstraction") {
	return { date: d(year), kind, payload, note, sourceConfidence }
}

function cultureReligionEvents(entries) {
	const out = {}
	for (const { provinceIds, year, cultureId, religionId, note } of entries) {
		for (const provinceId of provinceIds) {
			if (!out[provinceId]) out[provinceId] = []
			if (cultureId) out[provinceId].push(provinceEvent(year, "culture", { cultureId }, note))
			if (religionId) out[provinceId].push(provinceEvent(year, "religion", { religionId }, note))
		}
	}
	return out
}

function war({ warId, name, casusBelli, warGoalType, warGoalTag = null, warGoalProvince = null, attacker, defender, start, end, battles = [], note, sourceConfidence = "traditional" }) {
	const events = []
	for (const tag of attacker) events.push({ date: start, nationTag: tag, kind: "warStart", side: "attacker" })
	for (const tag of defender) events.push({ date: start, nationTag: tag, kind: "warStart", side: "defender" })
	for (const tag of attacker) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "attacker" })
	for (const tag of defender) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "defender" })
	return { warId, name, casusBelli, warGoalType, warGoalTag, warGoalProvince, isRebel: false, events, battles, note, sourceConfidence }
}

function battle({ year, name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence = "traditional" }) {
	return { date: d(year), name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence }
}

function revoltEvent({ year, type, size, leader, comment, note, sourceConfidence = "traditional" }) {
	const revolt = { type, size }
	if (leader) revolt.leader = leader
	return { date: d(year), kind: "revolt", payload: { revolt }, comment, note, sourceConfidence }
}

const readme =
	"Audit/proposal file: final pre-2AD cleanup batch covering Mayan city-states, Zapotec civilization, the full ASY Assyria tag, Diadochi regency/remnant tags Laomedon, Perdiccas, Polyperchon, and the Thracian Kingdom remnant. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. ProvinceEvents reuse existing cultures and religions."

const monarchyReform = "autocracy_reform"
const tribalReform = "tribal_kingdom"
const republicReform = "oligarchy_reform"

function addCore(builder, year, governmentType, reformId, govNote, reformNote) {
	builder.govChange(year, governmentType, govNote)
	builder.reformAdd(year, reformId, reformNote)
}

const mayaIds = ["841", "842", "2635", "2636", "2637", "2638", "2653", "4586", "4587", "4589", "4594"]
const mayan = nationBuilder("cp_mayan_city_states", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: mayaIds,
			year: 250,
			cultureId: null,
			religionId: "mesoamerican_religion",
			note: "Keeps existing Mayan regional cultures and confirms mesoamerican_religion for the Preclassic Maya city-state footprint.",
		},
	]),
})
addCore(mayan, 250, "monarchy", monarchyReform, "Preclassic Maya city-states develop in the highlands and lowlands", "Reuses autocracy reform for divine-kingship city-states.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[250, "Preclassic Maya ajawob", "Collective marker for early Maya city-state rulers before secure dynastic lists"],
	[100, "El Mirador horizon kings", "Represents large Late Preclassic Maya centers such as El Mirador"],
	[50, "Kaminaljuyu highland lords", "Highland Maya center marker in the pre-2AD window"],
	[1, "Late Preclassic Maya courts", "Terminal marker for Maya city-state development before the Classic period"],
]) {
	mayan.ruler(year, name, { dynasty: "Maya", note, sourceConfidence })
}

const zapotec = nationBuilder("cp_zapotec_civilization", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["844", "2629", "2646"],
			year: 500,
			cultureId: "zapotek",
			religionId: "nahuatl",
			note: "Formalizes existing zapotek province culture for Monte Alban/Zapotec civilization and keeps the existing nahuatl broad Mesoamerican cult id in this source footprint.",
		},
		{
			provinceIds: ["847"],
			year: 500,
			cultureId: "mixtec",
			religionId: "nahuatl",
			note: "Keeps existing Mixtec culture in the neighboring Mixtec province while using the existing broad Mesoamerican cult id.",
		},
	]),
})
addCore(zapotec, 500, "monarchy", monarchyReform, "Monte Alban and Zapotec urban state formation begins in Oaxaca", "Reuses autocracy reform for early Mesoamerican city-state rulership.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[500, "Monte Alban founders", "Zapotec urban state foundation marker"],
	[300, "Early Monte Alban rulers", "Expansion of Zapotec state structures in Oaxaca"],
	[100, "Monte Alban II rulers", "Zapotec state consolidation in the late pre-2AD period"],
	[1, "Late Preclassic Zapotec lords", "Terminal marker before better-attested Classic-period development"],
]) {
	zapotec.ruler(year, name, { dynasty: "Zapotec", note, sourceConfidence })
}

const assyriaIds = ["411", "415", "2309", "2310", "4293", "4294", "4295"]
const assyria = nationBuilder("ASY", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: assyriaIds,
			year: 1800,
			cultureId: "assyrian",
			religionId: "ashurism",
			note: "Uses existing assyrian culture and ashurism for the old Assyrian heartland represented by the full ASY tag. Wider imperial provinces keep local cultures/religions.",
		},
	]),
})
addCore(assyria, 1800, "monarchy", monarchyReform, "Old Assyrian kingdom develops around Ashur and northern Mesopotamia", "Reuses autocracy reform for Assyrian royal rule.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[1800, "Shamshi-Adad I", "Old Assyrian ruler who built a northern Mesopotamian kingdom"],
	[1700, "Old Assyrian kings", "Compressed marker for poorly represented post-Shamshi-Adad Assyria", "abstraction"],
	[1365, "Ashur-uballit I", "Middle Assyrian ruler who restored Assyria as a great power"],
	[1274, "Shalmaneser I", "Middle Assyrian expansionist king"],
	[1244, "Tukulti-Ninurta I", "Conquered Babylon and marked Middle Assyrian high point"],
	[1114, "Tiglath-Pileser I", "Major early Neo-Assyrian expansionist ruler"],
	[934, "Ashur-dan II", "Begins Neo-Assyrian recovery"],
	[883, "Ashurnasirpal II", "Neo-Assyrian expansion and capital at Kalhu/Nimrud"],
	[858, "Shalmaneser III", "Campaigns across Syria and Mesopotamia"],
	[745, "Tiglath-Pileser III", "Reformer and empire-builder"],
	[722, "Sargon II", "Founded Sargonid dynasty and expanded empire"],
	[705, "Sennacherib", "Major Assyrian king; destroyed Babylon and campaigned in the Levant"],
	[681, "Esarhaddon", "Conquered Egypt and restored Babylon"],
	[669, "Ashurbanipal", "Last great Assyrian king"],
	[627, "Ashur-etil-ilani", "Late Assyrian succession crisis"],
	[612, "Sin-shar-ishkun", "King at the fall of Nineveh"],
	[609, "Ashur-uballit II", "Last Assyrian ruler at Harran/Carchemish remnant"],
]) {
	assyria.ruler(year, name, { dynasty: "Assyrian", note, sourceConfidence })
}

const laomedon = nationBuilder("cp_laomedon")
addCore(laomedon, 323, "monarchy", monarchyReform, "Laomedon receives Syria/Phoenicia in the Babylon settlement after Alexander's death", "Reuses autocracy reform for Diadochi satrapal kingship.")
for (const [year, name, note] of [
	[323, "Laomedon of Mytilene", "Satrap of Syria after the Partition of Babylon"],
	[320, "Laomedon's Syrian satrapy", "Held Syria until displaced by Ptolemy's intervention"],
	[319, "Fall of Laomedon", "Ptolemy captures Syria and Laomedon is removed"],
]) {
	laomedon.ruler(year, name, { dynasty: "Diadochi", note })
}

const perdiccas = nationBuilder("cp_perdiccas")
addCore(perdiccas, 323, "monarchy", monarchyReform, "Perdiccas acts as regent of Alexander's empire after the Partition of Babylon", "Reuses autocracy reform for imperial regency.")
for (const [year, name, note] of [
	[323, "Perdiccas", "Regent/chiliarch after Alexander's death"],
	[322, "Perdiccan regency", "Attempts to hold Alexander's empire together against other Diadochi"],
	[321, "Death of Perdiccas", "Killed during the failed Egyptian campaign"],
]) {
	perdiccas.ruler(year, name, { dynasty: "Argead Regency", note })
}

const polyperchon = nationBuilder("cp_polyperchon")
addCore(polyperchon, 319, "monarchy", monarchyReform, "Polyperchon is appointed regent after Antipater's death", "Reuses autocracy reform for Macedonian regency.")
for (const [year, name, note] of [
	[319, "Polyperchon", "Macedonian regent appointed by Antipater"],
	[318, "Polyperchon and Olympias", "Backs the Argead royal house against Cassander"],
	[316, "Polyperchon in retreat", "Loses Macedonian primacy after Cassander's victories"],
	[309, "Polyperchon in the Peloponnese", "Continues as a regional Diadochi actor into the late fourth century"],
]) {
	polyperchon.ruler(year, name, { dynasty: "Antipatrid Regency", note })
}

const thracian = nationBuilder("cp_thracian_kingdom")
addCore(thracian, 90, "tribal", tribalReform, "Late Thracian client/remnant kingdoms persist after Odrysian and Macedonian eras", "Reuses tribal kingdom reform for Thracian dynastic confederacies.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[90, "Late Thracian dynasts", "Fragmentary Thracian kingdom marker after the Odrysian high period"],
	[48, "Cotys-linked Thracian rulers", "Thracian client kings maneuver in Roman civil-war politics"],
	[11, "Rhoemetalces I", "Roman-aligned Thracian king at the edge of the pre-2AD window"],
]) {
	thracian.ruler(year, name, { dynasty: "Thracian", note, sourceConfidence })
}

const wars = [
	war({
		warId: "middleAssyrianBabylonianWars",
		name: "Middle Assyrian-Babylonian wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_babylonia",
		warGoalProvince: "410",
		attacker: ["ASY"],
		defender: ["cp_babylonia"],
		start: d(1244),
		end: d(1225),
		note: "Tukulti-Ninurta I conquers Babylon and marks Middle Assyrian imperial reach.",
		battles: [],
	}),
	war({
		warId: "fallOfAssyria",
		name: "Fall of Assyria",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "ASY",
		warGoalProvince: "411",
		attacker: ["cp_neo_babylonian_empire", "cp_median_kingdom"],
		defender: ["ASY"],
		start: d(614),
		end: d(609),
		note: "Medes and Babylonians destroy the Assyrian imperial core from Ashur/Nineveh to Harran.",
		battles: [
			battle({
				year: 612,
				name: "Fall of Nineveh",
				locationProvinceId: "411",
				attacker: { country: "cp_neo_babylonian_empire", commander: "Nabopolassar and Cyaxares", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "ASY", commander: "Sin-shar-ishkun", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Mosul (411) stands in for Nineveh.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 609,
				name: "Fall of Harran",
				locationProvinceId: "377",
				attacker: { country: "cp_neo_babylonian_empire", commander: "Nabopolassar", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "ASY", commander: "Ashur-uballit II", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Aleppo (377) is a coarse stand-in for Harran/upper Mesopotamia.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "firstWarOfTheDiadochi",
		name: "First War of the Diadochi",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_perdiccas",
		warGoalProvince: "408",
		attacker: ["cp_perdiccas"],
		defender: ["cp_ptolemaic_kingdom", "cp_antigonid_dynasty"],
		start: d(322),
		end: d(321),
		note: "Perdiccas campaigns against Ptolemy and is killed in Egypt; Antigonus and other Diadochi oppose his regency.",
		battles: [],
	}),
	war({
		warId: "ptolemySeizureOfSyria",
		name: "Ptolemy's seizure of Syria from Laomedon",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_laomedon",
		warGoalProvince: "377",
		attacker: ["cp_ptolemaic_kingdom"],
		defender: ["cp_laomedon"],
		start: d(320),
		end: d(319),
		note: "Ptolemy removes Laomedon from Syria/Phoenicia after the first Diadochi settlement.",
		battles: [],
	}),
	war({
		warId: "secondWarOfTheDiadochiPolyperchon",
		name: "Second War of the Diadochi: Polyperchon's regency",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_polyperchon",
		warGoalProvince: "148",
		attacker: ["cp_polyperchon"],
		defender: ["cp_antigonid_dynasty", "cp_kingdom_of_lysimachus"],
		start: d(319),
		end: d(316),
		note: "Polyperchon struggles against Cassander/Antigonus-aligned forces for control of Macedon and Greece.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "romanThracianClientWars",
		name: "Roman-Thracian client wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_thracian_kingdom",
		warGoalProvince: "2750",
		attacker: ["ROM"],
		defender: ["cp_thracian_kingdom"],
		start: d(29),
		end: d(11),
		note: "Roman campaigns and client arrangements bring late Thracian kingdoms into Augustan frontier order.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
]

const revolts = {
	"842": {
		events: [
			revoltEvent({
				year: 100,
				type: "particularist_rebels",
				size: 2,
				comment: "Preclassic Maya city-state competition",
				note: "Internal Maya rivalry is tracked as a province conflict marker because no separate pre-2AD Maya opposing tags exist.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"2629": {
		events: [
			revoltEvent({
				year: 300,
				type: "particularist_rebels",
				size: 2,
				comment: "Zapotec expansion around Monte Alban",
				note: "Monte Alban's expansion is tracked as a province conflict marker because no separate local Oaxacan opposing tags exist.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"411": {
		events: [
			revoltEvent({
				year: 627,
				type: "pretender_rebels",
				size: 4,
				comment: "Assyrian succession crisis after Ashurbanipal",
				note: "Internal Assyrian conflict accelerates imperial collapse; no separate pretender tag exists.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"148": {
		events: [
			revoltEvent({
				year: 317,
				type: "pretender_rebels",
				size: 3,
				leader: "Polyperchon",
				comment: "Polyperchon regency conflict",
				note: "Companion revolt marker for Argead regency civil war inside Macedon.",
			}),
		],
	},
}

function writeNation(builder) {
	const out = { _readme: readme, tag: builder.tag, events: builder.events.sort((a, b) => a.date - b.date) }
	if (builder.provinceEvents) out.provinceEvents = builder.provinceEvents
	fs.writeFileSync(path.join(auditsDir, `${builder.tag}.json`), JSON.stringify(out, null, "\t") + "\n")
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
const revoltsDir = path.join(auditsDir, "revolts")
fs.mkdirSync(warsDir, { recursive: true })
fs.mkdirSync(revoltsDir, { recursive: true })

const builders = [mayan, zapotec, assyria, laomedon, perdiccas, polyperchon, thracian]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "final-non-yua-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the final cleanup batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "final-non-yua-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the final cleanup batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, and ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts`)
