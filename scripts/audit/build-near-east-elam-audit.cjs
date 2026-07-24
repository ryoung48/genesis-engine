// One-off generator for the Bronze Age Near East / Elam / upper Mesopotamia pre-2AD audit batch.
// Writes 10 nation files plus shared wars and revolts files.
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
	function govChange(year, governmentType, note, sourceConfidence = "traditional") {
		event(year, "governmentChange", { governmentType }, note, sourceConfidence)
	}
	function reformAdd(year, reformId, note, sourceConfidence = "traditional") {
		event(year, "governmentReformAdd", { reformId }, note, sourceConfidence)
	}
	return { tag, events, ruler, govChange, reformAdd, provinceEvents }
}

function provinceEvent(year, kind, payload, note, sourceConfidence = "abstraction") {
	return { date: d(year), kind, payload, note, sourceConfidence }
}

function cultureReligionEvents(ids, year, cultureId, religionId, note) {
	return Object.fromEntries(
		ids.map((provinceId) => [
			provinceId,
			[
				provinceEvent(year, "culture", { cultureId }, note),
				provinceEvent(year, "religion", { religionId }, note),
			],
		]),
	)
}

function cultureEvents(ids, year, cultureId, note) {
	return Object.fromEntries(ids.map((provinceId) => [provinceId, [provinceEvent(year, "culture", { cultureId }, note)]]))
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

function battle({ year, name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence = "traditional" }) {
	return { date: d(year), name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence }
}

function revoltEvent({ year, type, size, leader, comment, note, sourceConfidence = "traditional" }) {
	const revolt = { type, size }
	if (leader) revolt.leader = leader
	return { date: d(year), kind: "revolt", payload: { revolt }, comment, note, sourceConfidence }
}

const readme =
	"Audit/proposal file: reconstructed pre-2AD events for the Bronze Age Near East / Elam / upper Mesopotamia batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. CultureEvents may use proposed culture ids where the existing reference set lacks Akkadian, Sumerian, Elamite, Gutian, Hurrian, or Karduchian-era identities; those proposed ids are review markers, not current engine vocabulary."

const monarchyReform = "aristocratic_monarchy"
const tribalReform = "tribal_kingdom"

function addCore(builder, year, governmentType, reformId, govNote, reformNote, sourceConfidence = "abstraction") {
	builder.govChange(year, governmentType, govNote, sourceConfidence)
	builder.reformAdd(year, reformId, reformNote, sourceConfidence)
}

const sumerianIds = ["410", "2312", "4288", "4290"]
const sumerian = nationBuilder("cp_sumerian_city_states", {
	provinceEvents: cultureReligionEvents(
		sumerianIds,
		3500,
		"sumerian",
		"mesopotamian",
		"Proposes sumerian culture for the lower Mesopotamian city-state horizon; existing baseline is later Assyrian/Arabic/Khuzi. Uses existing mesopotamian religion id for Sumerian temple-cult practice.",
	),
})
addCore(sumerian, 3500, "monarchy", monarchyReform, "Uruk-period urban city-states emerge in lower Mesopotamia", "Reuses monarchy reform id for temple-palace city rule.")
for (const [year, name, note] of [
	[3500, "Uruk city rulers", "Collective marker for early urban Sumerian city-states before secure king lists"],
	[2900, "Early Dynastic city-kings", "City-state competition between Ur, Uruk, Lagash, Kish, and others"],
	[2500, "Eannatum of Lagash", "Best-attested Early Dynastic conqueror in Sumerian inscriptional tradition"],
	[2350, "Lugal-zage-si", "Ruler of Umma/Uruk who briefly unifies much of Sumer before Sargon's conquest"],
]) {
	sumerian.ruler(year, name, { dynasty: "Sumerian", note, sourceConfidence: "abstraction" })
}

const akkadianCoreIds = ["406", "407", "409", "410", "411", "415", "2308", "2309", "2310", "2311", "2312", "2314", "4292", "4293", "4294", "4298"]
const akkadianWestIds = ["327", "377", "378", "1849", "2302", "2313", "3070"]
const akkadianElamIds = ["412", "430", "2217", "4288", "4289", "4290", "4291", "4331"]
const akkadian = nationBuilder("cp_akkadian_empire", {
	provinceEvents: {
		...cultureReligionEvents(akkadianCoreIds, 2334, "akkadian", "mesopotamian", "Proposes akkadian culture for Akkadian imperial Mesopotamia; existing cultures are later Assyrian/Aramaic/Arabic. Uses existing mesopotamian religion id."),
		...cultureReligionEvents(akkadianWestIds, 2334, "eblaite_amorite", "mesopotamian", "Proposes eblaite_amorite culture for Akkadian-period Syria/Upper Mesopotamia where existing baselines are later Aramaic/Greek/Christian/Jewish."),
		...cultureReligionEvents(akkadianElamIds, 2334, "elamite", "mesopotamian", "Proposes elamite culture for Susiana/Zagros provinces inside the Akkadian-Elam frontier; mesopotamian religion is the closest existing ancient Near Eastern cult id."),
	},
})
addCore(akkadian, 2334, "monarchy", monarchyReform, "Sargon of Akkad founds the Akkadian Empire", "Reuses monarchy reform id for the first territorial empire in Mesopotamia.")
for (const [year, name, note] of [
	[2334, "Sargon", "Founder of the Akkadian Empire"],
	[2279, "Rimush", "Son of Sargon; suppresses revolts and campaigns in Elam/Sumer"],
	[2270, "Manishtushu", "Akkadian king associated with eastern campaigns"],
	[2254, "Naram-Sin", "Akkadian imperial high point; later tradition remembers him as deified king"],
	[2218, "Shar-kali-sharri", "Late Akkadian ruler facing Gutian and Amorite pressure"],
	[2193, "Dudu", "Late Akkadian king in king-list tradition"],
	[2173, "Shu-turul", "Last Akkadian king before collapse in traditional chronology"],
]) {
	akkadian.ruler(year, name, { dynasty: "Akkadian", note })
}

const gutian = nationBuilder("cp_gutian_dynasty", {
	provinceEvents: cultureReligionEvents(["412", "2217", "2312", "4289", "4290"], 2193, "gutian", "mesopotamian", "Proposes gutian culture for the Zagros dynasty that dominated parts of Mesopotamia after Akkad; religion uses broad existing mesopotamian id."),
})
addCore(gutian, 2193, "tribal", tribalReform, "Gutian power rises after the Akkadian collapse", "Reuses tribal kingdom reform id for Zagros highland kingship.")
for (const [year, name, note, confidence = "traditional"] of [
	[2193, "Erridupizir", "Early Gutian ruler known from inscriptions and king-list tradition"],
	[2160, "Inkishush", "Gutian king-list ruler; precise dates uncertain", "abstraction"],
	[2130, "Sarlagab", "Gutian king-list ruler; precise dates uncertain", "abstraction"],
	[2119, "Tirigan", "Last Gutian ruler defeated by Utu-hengal of Uruk"],
]) {
	gutian.ruler(year, name, { dynasty: "Gutian", note, sourceConfidence: confidence })
}

const sealand = nationBuilder("cp_first_sealand_dynasty", {
	provinceEvents: cultureReligionEvents(["408"], 1732, "sealand_babylonian", "mesopotamian", "Proposes sealand_babylonian culture for the marshland dynasty of southern Babylonia; existing baseline is much later Arabic/Zoroastrian."),
})
addCore(sealand, 1732, "monarchy", monarchyReform, "Ilum-ma-ili establishes the First Sealand Dynasty in southern Babylonia", "Reuses monarchy reform id for the Sealand kings.")
for (const [year, name, note, confidence = "traditional"] of [
	[1732, "Ilum-ma-ili", "Founder of the First Sealand Dynasty"],
	[1700, "Itti-ili-nibi", "Sealand king-list ruler; dates approximate", "abstraction"],
	[1650, "Damqi-ilishu", "Sealand king-list ruler; dates approximate", "abstraction"],
	[1500, "Ea-gamil", "Last king of the First Sealand Dynasty in later tradition", "abstraction"],
]) {
	sealand.ruler(year, name, { dynasty: "Sealand", note, sourceConfidence: confidence })
}

const elamIds = ["408", "412", "430", "2217", "2311", "2312", "4288", "4289", "4290", "4291", "4331"]
const elam = nationBuilder("cp_elam", {
	provinceEvents: cultureReligionEvents(elamIds, 2700, "elamite", "mesopotamian", "Proposes elamite culture for Susiana/Fars/Zagros Elamite provinces; existing Khuzi/Luri/Arabic/Assyrian cultures are later. Uses mesopotamian as closest existing ancient cult id."),
})
addCore(elam, 2700, "monarchy", monarchyReform, "Elamite polities emerge around Susa, Awan, Shimashki, and Anshan", "Reuses monarchy reform id for Elamite dynastic kingship.")
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[2700, "Awan kings", "Awan", "Early Elamite dynastic horizon centered east of lower Mesopotamia", "abstraction"],
	[2250, "Kutik-Inshushinak", "Awan", "Powerful Elamite ruler of Susa during/after the Akkadian period"],
	[2100, "Shimashki kings", "Shimashki", "Elamite highland dynasty after Akkad and Ur III pressure", "abstraction"],
	[1900, "Sukkalmah dynasty", "Sukkalmah", "Old Elamite high point with Susa and Anshan authority", "abstraction"],
	[1350, "Igehalkid rulers", "Igehalkid", "Middle Elamite dynasty; dates approximate", "abstraction"],
	[1185, "Shutruk-Nahhunte", "Shutrukid", "Elamite king who conquered Babylon and carried off major monuments"],
	[1155, "Shilhak-Inshushinak", "Shutrukid", "Major Elamite conqueror and builder after the sack of Babylon"],
	[760, "Neo-Elamite kings", "Neo-Elamite", "Fragmented Neo-Elamite phase under Assyrian pressure", "abstraction"],
	[653, "Teumman", "Neo-Elamite", "Defeated by Ashurbanipal near Susa/Ulai"],
]) {
	elam.ruler(year, name, { dynasty, note, sourceConfidence: confidence })
}

const mitanniIds = ["377", "407", "411", "1849", "2303", "2308", "2309", "2313", "2314", "3070", "4292", "4293", "4298"]
const mitanni = nationBuilder("cp_mitanni", {
	provinceEvents: cultureReligionEvents(mitanniIds, 1500, "hurrian", "mesopotamian", "Proposes hurrian culture for the Mitanni/Hanigalbat footprint; existing baselines are later Aramaic/Assyrian/Armenian. Religion uses broad ancient Near Eastern mesopotamian id."),
})
addCore(mitanni, 1500, "monarchy", monarchyReform, "Mitanni emerges as a Hurrian kingdom in northern Syria and upper Mesopotamia", "Reuses monarchy reform id for Hurrian royal state.")
for (const [year, name, note] of [
	[1500, "Kirta", "Traditional founder of Mitanni in later king-list reconstruction"],
	[1450, "Parshatatar", "Mitanni king during early imperial expansion"],
	[1430, "Shaushtatar", "Mitanni high point; associated with dominance over Assur"],
	[1360, "Tushratta", "Mitanni ruler during Amarna diplomacy and conflict with Suppiluliuma I"],
	[1340, "Shattiwaza", "Restored as Hittite client after Mitanni's civil wars"],
]) {
	mitanni.ruler(year, name, { dynasty: "Mitanni", note, sourceConfidence: "traditional" })
}

const israel = nationBuilder("cp_kingdom_of_israel")
addCore(israel, 930, "monarchy", monarchyReform, "Northern Kingdom of Israel forms after the united monarchy splits", "Reuses monarchy reform id for Israelite kingship.")
for (const [year, name, dynasty, note] of [
	[930, "Jeroboam I", "Jeroboam", "Founder of the northern kingdom"],
	[909, "Nadab", "Jeroboam", "Short-reigned successor"],
	[908, "Baasha", "Baasha", "Usurper and founder of a new northern dynasty"],
	[885, "Omri", "Omride", "Founder of Samaria and the Omride dynasty"],
	[874, "Ahab", "Omride", "Major Omride king involved in Levantine and Assyrian-era diplomacy"],
	[842, "Jehu", "Jehu", "Founder of the Jehu dynasty"],
	[786, "Jeroboam II", "Jehu", "Northern kingdom high point in traditional chronology"],
	[732, "Pekah", "Late Israelite king under Assyrian pressure"],
	[732, "Hoshea", "Last king before Assyrian annexation"],
]) {
	israel.ruler(year, name, { dynasty, note })
}

const adiabene = nationBuilder("cp_kingdom_of_adiabene", {
	provinceEvents: cultureEvents(["4295"], 164, "adiabene_aramaic", "Proposes adiabene_aramaic culture for the Adiabene kingdom; existing Kurdish baseline is later/coarser for the pre-2AD Aramaic-Assyrian frontier polity."),
})
addCore(adiabene, 164, "monarchy", monarchyReform, "Adiabene emerges as a client kingdom in northern Mesopotamia by the late Hellenistic/Parthian period", "Reuses monarchy reform id for client kingship.")
adiabene.ruler(164, "Early Adiabene kings", { dynasty: "Adiabene", note: "Pre-Izates chronology is sparse; marker records the late Hellenistic kingdom phase", sourceConfidence: "abstraction" })

const osroene = nationBuilder("cp_kingdom_of_osroene", {
	provinceEvents: cultureEvents(["407", "2308", "4292"], 132, "osroene_aramaic", "Proposes osroene_aramaic culture for Edessa/Osroene's Syriac-Aramaic ruling and urban milieu; existing Aramaic/Assyrian values are close but not specific."),
})
addCore(osroene, 132, "monarchy", monarchyReform, "Osroene emerges around Edessa after Seleucid weakening", "Reuses monarchy reform id for Abgarid client kingship.")
for (const [year, name, note, confidence = "traditional"] of [
	[132, "Aryu", "Early king in Osroene/Edessa tradition"],
	[127, "Abdu bar Mazur", "Early Abgarid-era ruler; chronology varies", "abstraction"],
	[94, "Abgar I Piqa", "Early Osroene king before the Roman-Parthian frontier era"],
]) {
	osroene.ruler(year, name, { dynasty: "Abgarid", note, sourceConfidence: confidence })
}

const gordyene = nationBuilder("cp_kingdom_of_gordyene", {
	provinceEvents: cultureEvents(["418"], 189, "karduchian", "Proposes karduchian culture for Gordyene/Corduene in the Van-Zagros frontier; existing Armenian culture is plausible regionally but not specific to the Corduene polity."),
})
addCore(gordyene, 189, "monarchy", monarchyReform, "Gordyene/Corduene appears as a highland kingdom between Armenia and Mesopotamia in the Hellenistic period", "Reuses monarchy reform id for frontier kingship.")
gordyene.ruler(189, "Zarbienus tradition", { dynasty: "Gordyene", note: "Named Gordyene rulers are mostly later; this is a polity-level marker for the pre-2AD kingdom", sourceConfidence: "abstraction" })

const wars = [
	war({
		warId: "sargonConquestOfSumer",
		name: "Sargon's conquest of Sumer",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_sumerian_city_states",
		warGoalProvince: "410",
		attacker: ["cp_akkadian_empire"],
		defender: ["cp_sumerian_city_states"],
		start: d(2334),
		end: d(2325),
		note: "Sargon defeats Lugal-zage-si and subordinates the Sumerian city-states.",
		battles: [
			battle({
				year: 2334,
				name: "Defeat of Lugal-zage-si",
				locationProvinceId: "410",
				attacker: { country: "cp_akkadian_empire", commander: "Sargon", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_sumerian_city_states", commander: "Lugal-zage-si", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Iraq-i-Arab (410) stands in for the lower Mesopotamian campaign theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "akkadianCampaignsAgainstElam",
		name: "Akkadian campaigns against Elam",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_elam",
		warGoalProvince: "412",
		attacker: ["cp_akkadian_empire"],
		defender: ["cp_elam"],
		start: d(2280),
		end: d(2250),
		note: "Rimush, Manishtushu, and Naram-Sin campaign against Elam and the Iranian plateau; exact campaign dates vary.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "gutianOverthrowOfAkkad",
		name: "Gutian overthrow of Akkadian power",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_akkadian_empire",
		warGoalProvince: "410",
		attacker: ["cp_gutian_dynasty"],
		defender: ["cp_akkadian_empire"],
		start: d(2193),
		end: d(2154),
		note: "Represents the Gutian/Zagros pressure and Mesopotamian collapse after Shar-kali-sharri.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "utuHengalWarAgainstGutians",
		name: "Utu-hengal's war against the Gutians",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_gutian_dynasty",
		warGoalProvince: "2312",
		attacker: ["cp_sumerian_city_states"],
		defender: ["cp_gutian_dynasty"],
		start: d(2119),
		end: d(2119),
		note: "Utu-hengal of Uruk defeats Tirigan and ends Gutian rule in Sumerian tradition.",
		battles: [
			battle({
				year: 2119,
				name: "Defeat of Tirigan",
				locationProvinceId: "2312",
				attacker: { country: "cp_sumerian_city_states", commander: "Utu-hengal", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_gutian_dynasty", commander: "Tirigan", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Wasit (2312) stands in for the southern Mesopotamian theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "sealandRevoltAgainstBabylon",
		name: "Sealand revolt against Babylon",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_first_sealand_dynasty",
		warGoalProvince: "408",
		attacker: ["cp_first_sealand_dynasty"],
		defender: ["cp_babylonia"],
		start: d(1732),
		end: d(1700),
		note: "Ilum-ma-ili and successors break away from the Babylonian south; cp_babylonia already exists from the Assyria/Mesopotamia batch.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "elamiteSackOfBabylon",
		name: "Elamite sack of Babylon",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_babylonia",
		warGoalProvince: "410",
		attacker: ["cp_elam"],
		defender: ["cp_babylonia"],
		start: d(1160),
		end: d(1155),
		note: "Shutruk-Nahhunte's Elamite campaign sacks Babylon and carries off monuments including the Stele of Hammurabi.",
		battles: [
			battle({
				year: 1155,
				name: "Sack of Babylon",
				locationProvinceId: "410",
				attacker: { country: "cp_elam", commander: "Shutruk-Nahhunte", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_babylonia", commander: "Zababa-shuma-iddina / late Kassite defenders", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Iraq-i-Arab (410) stands in for Babylon.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "thutmoseCampaignsAgainstMitanni",
		name: "Egyptian-Mitanni wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_mitanni",
		warGoalProvince: "377",
		attacker: ["cp_new_kingdom_of_egypt"],
		defender: ["cp_mitanni"],
		start: d(1457),
		end: d(1440),
		note: "Thutmose III's Syrian campaigns break Mitanni influence in the Levantine corridor; Kadesh itself is already represented elsewhere.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 1457,
				name: "Battle of Megiddo",
				locationProvinceId: "377",
				attacker: { country: "cp_new_kingdom_of_egypt", commander: "Thutmose III", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_mitanni", commander: "Canaanite-Mitanni coalition", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Aleppo (377) is an imperfect stand-in for the Levantine-Syrian coalition theater because Megiddo has no direct province in this footprint.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
]

const revolts = {
	"410": {
		events: [
			revoltEvent({
				year: 2279,
				type: "particularist_rebels",
				size: 4,
				comment: "Sumerian revolts after Sargon's death",
				note: "Rimush is remembered as suppressing widespread revolts in Sumer and Elam after Sargon's death; modeled as province-level revolt because the main Sumerian opposing tag is already used in the conquest war.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"377": {
		events: [
			revoltEvent({
				year: 1340,
				type: "pretender_rebels",
				size: 3,
				leader: "Shattiwaza",
				comment: "Mitanni succession crisis",
				note: "Mitanni civil conflict and Hittite intervention after Tushratta; no separate Mitanni pretender tag exists.",
				sourceConfidence: "abstraction",
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

const builders = [sumerian, akkadian, gutian, sealand, elam, mitanni, israel, adiabene, osroene, gordyene]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "near-east-elam-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the Bronze Age Near East / Elam / upper Mesopotamia batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields. Avoids duplicating the Assyrian conquest of Israel already present in assyria-mesopotamia-wars.json.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "near-east-elam-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Bronze Age Near East / Elam / upper Mesopotamia batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields. Only includes internal upheavals without a clean separate opposing tag.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, and ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts`)
