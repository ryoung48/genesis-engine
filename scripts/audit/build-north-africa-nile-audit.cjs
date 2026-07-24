// One-off generator for the North Africa / Nile / western Mediterranean Africa pre-2AD audit batch.
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
	"Audit/proposal file: reconstructed pre-2AD events for Cyrenaica, Mauretania, Ankhwennefer's Egyptian revolt, Numidia, and Axum. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. ProvinceEvents reuse existing Greek/Berber/Eastern Berber/Old Egyptian/Beja/Afar/Tigray and existing Hellenism/Egyptian/Shamanism/South Arabian religions where adequate, while proposing narrow ancient cultures for Numidian, Mauretanian, and Aksumite identities."

const monarchyReform = "autocracy_reform"
const tribalReform = "tribal_kingdom"
const republicReform = "oligarchy_reform"

function addCore(builder, year, governmentType, reformId, govNote, reformNote) {
	builder.govChange(year, governmentType, govNote)
	builder.reformAdd(year, reformId, reformNote)
}

const cyrenaica = nationBuilder("CYR")
addCore(cyrenaica, 331, "republic", republicReform, "Cyrenaica enters the Hellenistic world as a Greek civic and royal dependency after Alexander's conquest", "Reuses oligarchy reform for Greek civic institutions under royal oversight.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[631, "Battus I", "Traditional founder of Cyrene; included as dynastic background for the later Cyrenaican footprint"],
	[570, "Arcesilaus II", "Battiad king during early Cyrene expansion"],
	[515, "Arcesilaus III", "Battiad ruler restored with Persian/Egyptian support"],
	[440, "Cyrenaican civic oligarchies", "Battiad monarchy gives way to republican civic institutions", "abstraction"],
	[331, "Cyrenaican cities under Ptolemy", "Cyrenaica accepts Macedonian/Ptolemaic authority after Alexander", "abstraction"],
	[276, "Magas of Cyrene", "Ptolemaic governor who became independent king of Cyrene"],
	[250, "Berenice II", "Cyrenaican dynast whose marriage reunites Cyrene with Ptolemaic Egypt"],
	[96, "Ptolemy Apion", "Last Ptolemaic king of Cyrenaica; bequeathed the region to Rome"],
	[74, "Roman Cyrenaica settlement", "Rome organizes Cyrenaica after Apion's bequest", "abstraction"],
]) {
	cyrenaica.ruler(year, name, { dynasty: "Battiad/Ptolemaic", note, sourceConfidence })
}

const mauretanianIds = ["334", "335", "336", "337", "338", "339", "343", "1751", "2458", "2459", "2461", "2462", "2465", "2467", "2469", "3236", "4561", "4562", "4563", "4564"]
const mauretania = nationBuilder("cp_mauretania", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: mauretanianIds,
			year: 225,
			cultureId: "mauretanian",
			religionId: "shamanism",
			note: "Proposes mauretanian culture for the Mauretanian kingdom; existing Berber/Atlas cultures are broad regional baselines. Reuses existing shamanism for pre-Christian Maghrebi cult practice.",
		},
	]),
})
addCore(mauretania, 225, "monarchy", tribalReform, "Mauretanian kingship emerges in the western Maghreb before Roman client rule", "Reuses tribal kingdom reform for Berber royal-confederate structure.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[225, "Early Mauretanian kings", "Poorly attested early royal line before Baga", "abstraction"],
	[206, "Baga", "Mauretanian king who aided Masinissa during the Second Punic War"],
	[110, "Bocchus I", "Mauretanian king involved in the Jugurthine War and Roman diplomacy"],
	[80, "Bogud and Bocchus II tradition", "Late Mauretanian dynastic split is compressed for pre-2AD audit scale", "abstraction"],
	[49, "Bogud", "Mauretanian king and Caesarian ally in the Roman civil war"],
	[33, "Bocchus II", "Last native Mauretanian king before Roman-backed reorganization"],
	[25, "Juba II", "Roman-backed king of Mauretania, installed after Cleopatra Selene marriage alliance"],
]) {
	mauretania.ruler(year, name, { dynasty: "Mauretanian", note, sourceConfidence })
}

const ankhwennefer = nationBuilder("cp_ankhwennefer")
addCore(ankhwennefer, 205, "monarchy", monarchyReform, "Ankhwennefer/Hugronaphor leads a native Egyptian revolt in Upper Egypt against Ptolemaic rule", "Reuses autocracy reform for pharaonic rebel kingship.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[205, "Hugronaphor", "Native Egyptian rebel king in Thebes/Upper Egypt, often identified with Ankhwennefer in early revolt phase"],
	[199, "Ankhwennefer", "Successor or same rebel ruler in Upper Egyptian pharaonic titulary"],
	[191, "Chaonnophris-linked resistance", "Later rebel tradition in Upper Egypt before Ptolemaic reconquest", "abstraction"],
	[186, "Fall of the Upper Egyptian revolt", "Ptolemaic forces restore control over Upper Egypt", "abstraction"],
]) {
	ankhwennefer.ruler(year, name, { dynasty: "Native Egyptian", note, sourceConfidence })
}

const numidianIds = ["336", "337", "338", "339", "340", "351", "353", "354", "355", "1882", "2451", "2452", "2453", "2454", "2456", "2458", "2459", "2461", "2462", "2465", "4562"]
const numidia = nationBuilder("cp_kingdom_of_numidia", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: numidianIds,
			year: 220,
			cultureId: "numidian",
			religionId: "shamanism",
			note: "Proposes numidian culture for Massylii/Masaesyli and unified Numidia; existing Berber/Eastern Berber baselines are broad. Reuses existing shamanism for pre-Christian Berber cult practice.",
		},
	]),
})
addCore(numidia, 220, "monarchy", tribalReform, "Numidian Massylii and Masaesyli kingdoms rise beside Carthage and Rome", "Reuses tribal kingdom reform for Numidian royal-confederate structures.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[220, "Gala", "Massylii king and father of Masinissa"],
	[215, "Syphax", "Masaesyli king who shifted between Rome and Carthage"],
	[206, "Masinissa", "Massylii prince and Roman ally who unified Numidia after the Second Punic War"],
	[148, "Micipsa", "Son of Masinissa and long-ruling Numidian king"],
	[118, "Adherbal, Hiempsal, and Jugurtha", "Succession division after Micipsa's death"],
	[112, "Jugurtha", "Numidian king in the Jugurthine War against Rome"],
	[105, "Gauda", "Roman-backed Numidian king after Jugurtha's capture"],
	[88, "Hiempsal II", "Numidian king restored with Roman support"],
	[60, "Juba I", "Numidian king who opposed Caesar in the Roman civil war"],
	[46, "Roman annexation and client Numidia", "Juba I's defeat ends independent Numidian kingship in much of the kingdom", "abstraction"],
	[30, "Juba II client settlement", "Numidian royal line redirected into Roman-backed Mauretania", "abstraction"],
]) {
	numidia.ruler(year, name, { dynasty: "Numidian", note, sourceConfidence })
}

const axum = nationBuilder("cp_kingdom_of_axum", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["1227", "2767"],
			year: 50,
			cultureId: "aksumite",
			religionId: "south_arabian",
			note: "Proposes aksumite culture for the early Aksum/Tigray core; existing Tigray is acceptable modern regional coverage but too broad for the ancient polity. Reuses south_arabian for pre-Christian Red Sea cult links.",
		},
		{
			provinceIds: ["2765", "3268"],
			year: 50,
			cultureId: "afar",
			religionId: "south_arabian",
			note: "Keeps existing Afar culture in the Red Sea lowlands while using south_arabian as the closest existing ancient Red Sea cult bucket.",
		},
	]),
})
addCore(axum, 50, "monarchy", monarchyReform, "Aksum emerges as a Red Sea highland kingdom by the late pre-2AD period", "Reuses autocracy reform for early Aksumite kingship.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[50, "Early Aksumite kings", "Pre-2AD Aksumite rulers are poorly attested; this marks the emergence of the polity"],
	[25, "Red Sea trade kings", "Aksum participates in Red Sea trade networks linking the Horn, Nile, and South Arabia"],
	[1, "Aksumite royal court", "Late pre-2AD marker before better-attested early Common Era kings"],
]) {
	axum.ruler(year, name, { dynasty: "Aksumite", note, sourceConfidence })
}

const wars = [
	war({
		warId: "magasWarAgainstPtolemy",
		name: "Magas of Cyrene's war against Ptolemy II",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "CYR",
		warGoalProvince: "356",
		attacker: ["CYR"],
		defender: ["cp_ptolemaic_kingdom"],
		start: d(274),
		end: d(250),
		note: "Magas asserts Cyrenaican independence from the Ptolemies and survives as king until dynastic reconciliation.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "upperEgyptianRevolt",
		name: "Upper Egyptian revolt against the Ptolemies",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_ankhwennefer",
		warGoalProvince: "4319",
		attacker: ["cp_ankhwennefer"],
		defender: ["cp_ptolemaic_kingdom"],
		start: d(205),
		end: d(186),
		note: "Hugronaphor/Ankhwennefer and successors control Upper Egypt for nearly two decades.",
		battles: [
			battle({
				year: 186,
				name: "Ptolemaic reconquest of Thebes",
				locationProvinceId: "4319",
				attacker: { country: "cp_ptolemaic_kingdom", commander: "Ptolemaic royal forces", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_ankhwennefer", commander: "Upper Egyptian rebels", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Isna (4319) stands in for the Theban/Upper Egyptian theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "secondPunicWarNumidianTheater",
		name: "Second Punic War Numidian theater",
		casusBelli: "cb_alliance",
		warGoalType: "take_province",
		warGoalTag: "cp_kingdom_of_numidia",
		warGoalProvince: "340",
		attacker: ["cp_roman_republic", "cp_kingdom_of_numidia"],
		defender: ["cp_carthage"],
		start: d(206),
		end: d(202),
		note: "Masinissa's alliance with Rome and conflict with Syphax/Carthage shifts Numidia into the Roman camp.",
		battles: [
			battle({
				year: 203,
				name: "Battle of the Great Plains",
				locationProvinceId: "340",
				attacker: { country: "cp_roman_republic", commander: "Scipio Africanus and Masinissa", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_carthage", commander: "Hasdrubal Gisgo and Syphax", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Constantine (340) stands in for the inland Numidian/Carthaginian theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "jugurthineWar",
		name: "Jugurthine War",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_kingdom_of_numidia",
		warGoalProvince: "340",
		attacker: ["cp_roman_republic"],
		defender: ["cp_kingdom_of_numidia", "cp_mauretania"],
		start: d(112),
		end: d(105),
		note: "Rome defeats Jugurtha; Bocchus of Mauretania shifts alliance and hands him over.",
		battles: [
			battle({
				year: 109,
				name: "Battle of the Muthul",
				locationProvinceId: "2454",
				attacker: { country: "cp_roman_republic", commander: "Quintus Caecilius Metellus", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_kingdom_of_numidia", commander: "Jugurtha", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Kef (2454) stands in for the Muthul river theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "caesarsAfricanWar",
		name: "Caesar's African War",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_kingdom_of_numidia",
		warGoalProvince: "340",
		attacker: ["cp_roman_republic"],
		defender: ["cp_kingdom_of_numidia"],
		start: d(47),
		end: d(46),
		note: "Caesar defeats the Pompeian-Numidian coalition and ends Juba I's kingdom.",
		battles: [
			battle({
				year: 46,
				name: "Battle of Thapsus",
				locationProvinceId: "2453",
				attacker: { country: "cp_roman_republic", commander: "Julius Caesar", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_kingdom_of_numidia", commander: "Juba I and Pompeian allies", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Sfax (2453) stands in for Thapsus.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "mauretanianCivilWar",
		name: "Mauretanian civil war in the Roman civil wars",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_mauretania",
		warGoalProvince: "334",
		attacker: ["cp_mauretania"],
		defender: ["cp_kingdom_of_numidia"],
		start: d(49),
		end: d(38),
		note: "Bogud and Bocchus II align with rival Roman factions while Mauretania and Numidian politics are reorganized.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
]

const revolts = {
	"4319": {
		events: [
			revoltEvent({
				year: 205,
				type: "nationalist_rebels",
				size: 4,
				leader: "Hugronaphor / Ankhwennefer",
				comment: "Upper Egyptian revolt",
				note: "Native Egyptian revolt against Ptolemaic rule; companion to the interstate audit war.",
			}),
		],
	},
	"340": {
		events: [
			revoltEvent({
				year: 118,
				type: "pretender_rebels",
				size: 3,
				leader: "Jugurtha",
				comment: "Numidian succession crisis",
				note: "Jugurtha's conflict with Adherbal and Hiempsal begins as a dynastic crisis before direct Roman war.",
			}),
		],
	},
}

const heritageAudit = [
	{
		id: "maghrebi",
		name: "Maghrebi",
		cultures: [
			{
				id: "numidian",
				name: "Numidian",
				primaryTag: "cp_kingdom_of_numidia",
				color: [116, 82, 102],
			},
			{
				id: "mauretanian",
				name: "Mauretanian",
				primaryTag: "cp_mauretania",
				color: [92, 76, 96],
			},
		],
	},
	{
		id: "cushitic",
		name: "Cushitic",
		cultures: [
			{
				id: "aksumite",
				name: "Aksumite",
				primaryTag: "cp_kingdom_of_axum",
				color: [184, 118, 98],
			},
		],
	},
]

function writeNation(builder) {
	const out = { _readme: readme, tag: builder.tag, events: builder.events.sort((a, b) => a.date - b.date) }
	if (builder.provinceEvents) out.provinceEvents = builder.provinceEvents
	fs.writeFileSync(path.join(auditsDir, `${builder.tag}.json`), JSON.stringify(out, null, "\t") + "\n")
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
const revoltsDir = path.join(auditsDir, "revolts")
const heritagesDir = path.join(auditsDir, "heritages")
fs.mkdirSync(warsDir, { recursive: true })
fs.mkdirSync(revoltsDir, { recursive: true })
fs.mkdirSync(heritagesDir, { recursive: true })

const builders = [cyrenaica, mauretania, ankhwennefer, numidia, axum]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "north-africa-nile-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the North Africa / Nile / western Mediterranean Africa batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "north-africa-nile-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the North Africa / Nile / western Mediterranean Africa batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(path.join(heritagesDir, "north-africa-nile-heritages.json"), JSON.stringify(heritageAudit, null, "\t") + "\n")

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts, and ${heritageAudit.reduce((sum, group) => sum + group.cultures.length, 0)} heritage cultures`)
