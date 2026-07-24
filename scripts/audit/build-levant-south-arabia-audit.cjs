// One-off generator for the Levant / Phoenician / South Arabian pre-2AD audit batch.
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

function cultureEvents(ids, year, cultureId, note) {
	return Object.fromEntries(ids.map((provinceId) => [provinceId, [provinceEvent(year, "culture", { cultureId }, note)]]))
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

function mergeProvinceEvents(...maps) {
	const merged = {}
	for (const map of maps) {
		for (const [provinceId, events] of Object.entries(map)) {
			if (!merged[provinceId]) merged[provinceId] = []
			merged[provinceId].push(...events)
		}
	}
	return merged
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
	"Audit/proposal file: reconstructed pre-2AD events for the Levant / Phoenician / South Arabian trade-state batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Ruler sequences are conservative where local records are fragmentary; provinceEvents reuse existing phoenician/punic/nabataean_culture and existing jewish/nabataean/south_arabian religion ids, while proposing narrower ancient culture ids for Philistine, Judean, and named South Arabian kingdoms where the baseline uses modern/coarse cultures."

const monarchyReform = "autocracy_reform"
const tribalReform = "tribal_kingdom"
const merchantReform = "merchants_reform"

function addCore(builder, year, governmentType, reformId, govNote, reformNote) {
	builder.govChange(year, governmentType, govNote)
	builder.reformAdd(year, reformId, reformNote)
}

const philistia = nationBuilder("cp_philistia", {
	provinceEvents: cultureEvents(
		["1854", "3244"],
		1175,
		"philistine",
		"Proposes philistine culture for the Philistine coastal city horizon; existing Israeli/Jewish baseline is too Judean for the Sea Peoples-derived pentapolis.",
	),
})
addCore(philistia, 1175, "monarchy", monarchyReform, "Philistine pentapolis emerges on the southern Levantine coast after the Bronze Age collapse", "Reuses monarchy reform for city-king rule among Gaza, Ashkelon, Ashdod, Gath, and Ekron.")
for (const [year, name, note, confidence = "traditional"] of [
	[1175, "Philistine city lords", "Collective marker for the early pentapolis before secure named rulers", "abstraction"],
	[1050, "Seranim of Philistia", "Collective term for the Philistine lords in the Israelite conflict tradition", "abstraction"],
	[734, "Hanun of Gaza", "Philistine ruler of Gaza in Tiglath-Pileser III's western campaigns"],
	[711, "Iamani of Ashdod", "Rebel ruler of Ashdod against Assyrian authority"],
	[701, "Padi of Ekron", "Assyrian-backed ruler restored during Sennacherib's campaign"],
	[604, "Philistine city governors", "Final Neo-Babylonian pressure on Philistine cities before absorption", "abstraction"],
]) {
	philistia.ruler(year, name, { dynasty: "Philistine", note, sourceConfidence: confidence })
}

const phoenicianLevantIds = ["378", "1855", "3070"]
const phoenicianColonyIds = ["126", "226", "1882", "2455", "2473", "4560"]
const phoenicia = nationBuilder("cp_phoenicia", {
	provinceEvents: mergeProvinceEvents(
		cultureEvents(phoenicianLevantIds, 1200, "phoenician", "Uses existing phoenician culture for Levantine Phoenician city-states; baseline is Aramaic/Greek in several coastal provinces."),
		cultureEvents(phoenicianColonyIds, 900, "punic", "Uses existing punic culture for western Phoenician colonial communities; baseline is local Greek/Iberian/Berber in the source file."),
	),
})
addCore(phoenicia, 1200, "republic", merchantReform, "Phoenician city-states persist after the Bronze Age collapse as palace-city and merchant oligarchies", "Reuses merchant republic reform for autonomous maritime city-states.")
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[1200, "Tyrian and Sidonian councils", "Phoenician", "Collective marker for the early Iron Age city-state phase", "abstraction"],
	[969, "Hiram I", "Tyre", "Tyrian king associated with expansion, monumental building, and Israelite alliance tradition"],
	[940, "Baal-Eser I", "Tyre", "Successor in the Tyrian royal tradition"],
	[887, "Ithobaal I", "Tyre", "Priest-king of Astarte and founder of a durable Tyrian line"],
	[831, "Pygmalion", "Tyre", "Tyrian ruler in the traditional foundation context for Carthage"],
	[701, "Luli", "Tyre/Sidon", "Flees Assyrian pressure during Sennacherib's western campaign"],
	[680, "Baal I", "Tyre", "Tyrian king under Assyrian overlordship"],
	[585, "Ithobaal III", "Tyre", "Ruler during Nebuchadnezzar II's long siege of Tyre"],
	[345, "Tennes", "Sidon", "Sidonian king associated with revolt against Artaxerxes III"],
	[332, "Azemilcus", "Tyre", "King of Tyre during Alexander's siege"],
	[64, "Phoenician civic councils", "Phoenician", "Late Hellenistic civic autonomy before Roman provincial organization", "abstraction"],
]) {
	phoenicia.ruler(year, name, { dynasty, note, sourceConfidence: confidence })
}

const colonies = nationBuilder("cp_phoenician_colonies", {
	provinceEvents: cultureEvents(["126", "226", "4560"], 900, "punic", "Uses existing punic culture for the western Phoenician colonial network around Malta, the straits, and Ibiza."),
})
addCore(colonies, 900, "republic", merchantReform, "Western Phoenician colonial stations expand across the central and western Mediterranean", "Reuses merchant republic reform for colonial trade networks.")
for (const [year, name, note, confidence = "abstraction"] of [
	[900, "Western Phoenician emporia", "Collective marker for early western colonial foundations"],
	[814, "Tyrian colonial founders", "Traditional Carthage foundation era under Tyrian sponsorship"],
	[700, "Colonial merchant councils", "Phoenician colonies increasingly coordinate local trade and defense"],
	[550, "Punic colonial councils", "Western colonies pass into a more Punic/Carthaginian sphere"],
]) {
	colonies.ruler(year, name, { dynasty: "Phoenician", note, sourceConfidence: confidence })
}

const empire = nationBuilder("cp_phoenician_empire", {
	provinceEvents: mergeProvinceEvents(
		cultureEvents(phoenicianLevantIds, 814, "phoenician", "Uses existing phoenician culture for Tyrian/Sidonian core provinces during the broader Phoenician thalassocratic phase."),
		cultureEvents(phoenicianColonyIds, 814, "punic", "Uses existing punic culture for western dependencies and colonial footholds in the Phoenician empire abstraction."),
	),
})
addCore(empire, 814, "republic", merchantReform, "Phoenician maritime network reaches its greatest extent through Tyrian and colonial links", "Reuses merchant republic reform for a trade thalassocracy rather than a territorial empire.")
for (const [year, name, dynasty, note, confidence = "abstraction"] of [
	[814, "Tyrian thalassocracy", "Tyre", "Traditional high point of Tyrian colonial reach"],
	[730, "Assyrian-vassal Phoenician kings", "Phoenician", "Phoenician cities keep maritime roles under Assyrian pressure"],
	[600, "Tyrian colonial network", "Tyre", "Late independent maritime network before Babylonian and Persian constraints"],
	[332, "Phoenician fleets under Macedon", "Phoenician", "Alexander's conquest ends the independent imperial abstraction"],
]) {
	empire.ruler(year, name, { dynasty, note, sourceConfidence: confidence })
}

const hadhramaut = nationBuilder("cp_hadhramaut", {
	provinceEvents: cultureEvents(["402", "2343", "4283"], 700, "hadhrami", "Proposes hadhrami culture for ancient Hadhramaut; existing Mahri/Yemeni split is modern/coarse for the incense kingdom."),
})
addCore(hadhramaut, 700, "monarchy", monarchyReform, "Hadhramaut emerges as an incense-route kingdom in eastern Yemen", "Reuses monarchy reform for South Arabian royal rule.")
for (const [year, name, note, confidence = "abstraction"] of [
	[700, "Hadhramite mukarribs", "Early Hadhramaut incense-route rulers"],
	[500, "Yada'il of Hadhramaut", "Representative early Hadhramite royal name from South Arabian inscriptional tradition"],
	[300, "Hadhramite kings of Shabwa", "Hadhramaut's capital and incense trade power are represented at Shabwa/Hadramut"],
	[100, "Late Hadhramite kings", "Late pre-2AD Hadhramaut remains a regional South Arabian kingdom"],
]) {
	hadhramaut.ruler(year, name, { dynasty: "Hadhramaut", note, sourceConfidence: confidence })
}

const sabaeans = nationBuilder("cp_sabaeans", {
	provinceEvents: cultureEvents(["390", "4279"], 800, "sabaean", "Proposes sabaean culture for the Sabaean core around Ma'rib/Sana'a; existing Yemeni culture is a later umbrella."),
})
addCore(sabaeans, 800, "monarchy", monarchyReform, "Sabaean kingdom forms around Ma'rib and dominates early South Arabian trade", "Reuses monarchy reform for mukarrib/kingship.")
for (const [year, name, note, confidence = "traditional"] of [
	[800, "Karib'il Watar I", "Early Sabaean mukarrib in traditional chronology; exact date debated", "abstraction"],
	[700, "Yitha'amar Watar I", "Sabaean ruler known from Assyrian-era references"],
	[685, "Karib'il Watar II", "Major Sabaean ruler associated with expansion against Awsan and neighbors"],
	[500, "Sabaean mukarribs", "Representative marker for the middle Sabaean period", "abstraction"],
	[115, "Late Sabaean kings", "Sabaean rule contests Yemen with Himyar and other South Arabian polities", "abstraction"],
]) {
	sabaeans.ruler(year, name, { dynasty: "Saba", note, sourceConfidence: confidence })
}

const qataban = nationBuilder("QAT", {
	provinceEvents: cultureEvents(["2345", "4281"], 400, "qatabanian", "Proposes qatabanian culture for the Qataban kingdom; existing Yemeni culture is too broad for the audit marker."),
})
addCore(qataban, 400, "monarchy", monarchyReform, "Qataban rises as a South Arabian incense-route kingdom", "Reuses monarchy reform for Qatabanian kingship.")
for (const [year, name, note, confidence = "abstraction"] of [
	[400, "Qatabanian mukarribs", "Early Qataban rulers are inscriptional and only approximately dated"],
	[250, "Yada'ib Yigal", "Representative Qatabanian royal name from inscriptional tradition"],
	[150, "Shahr Hilal", "Qatabanian royal marker for the late pre-2AD period"],
	[50, "Late Qatabanian kings", "Qataban remains active before later Himyarite absorption"],
]) {
	qataban.ruler(year, name, { dynasty: "Qataban", note, sourceConfidence: confidence })
}

const minaeans = nationBuilder("cp_minaeans", {
	provinceEvents: cultureEvents(
		["384", "385", "386", "387", "388", "2329", "2331", "2345", "2346", "4278", "4280", "4281", "4282"],
		400,
		"minaean",
		"Proposes minaean culture for the Minaean trade network in north Yemen and the Hijaz; existing Hejazi/Yemeni cultures are too broad for ancient Ma'in.",
	),
})
addCore(minaeans, 400, "republic", merchantReform, "Minaean caravan kingdom of Ma'in expands along the incense route", "Reuses merchant republic reform for the trade-network character of Ma'in.")
for (const [year, name, note, confidence = "abstraction"] of [
	[400, "Minaean rulers of Qarnawu", "Early Ma'in/Minaean royal phase; dates are inscriptional and approximate"],
	[300, "Waqah'il Riyam", "Representative Minaean royal name from South Arabian inscriptions"],
	[200, "Minaean caravan councils", "Minaean trade stations reach into the Hijaz and Red Sea routes"],
	[50, "Late Minaean kings", "Late pre-2AD Minaean authority before Himyarite/Sabaean pressure"],
]) {
	minaeans.ruler(year, name, { dynasty: "Ma'in", note, sourceConfidence: confidence })
}

const nabataeans = nationBuilder("cp_nabataeans", {
	provinceEvents: cultureReligionEvents(
		["364", "365", "380", "381", "382", "2315", "3263", "4268"],
		312,
		"nabataean_culture",
		"nabataean",
		"Uses existing nabataean_culture and nabataean religion for the Nabataean desert kingdom; several footprint provinces otherwise retain Egyptian/Jewish/Hellenistic baselines.",
	),
})
addCore(nabataeans, 312, "monarchy", monarchyReform, "Nabataean kingdom is attested resisting Antigonid attempts to control Petra and the incense trade", "Reuses monarchy reform for Nabataean kingship.")
for (const [year, name, note, confidence = "traditional"] of [
	[312, "Nabataean elders", "Diodorus describes Nabataean resistance to Antigonus's commanders; named kings are not yet secure", "abstraction"],
	[169, "Aretas I", "Earliest named Nabataean ruler in traditional chronology"],
	[120, "Rabel I", "Nabataean ruler in the early royal sequence; dating approximate"],
	[96, "Obodas I", "Nabataean king associated with victories over Hasmonean and Seleucid forces"],
	[85, "Aretas III", "Nabataean expansion into Damascus begins just after the pre-2AD threshold but the dynasty is active before it"],
	[9, "Aretas IV", "Major Nabataean ruler beginning in 9 BC"],
]) {
	nabataeans.ruler(year, name, { dynasty: "Nabataean", note, sourceConfidence: confidence })
}

const judea = nationBuilder("JUD", {
	provinceEvents: cultureEvents(["379", "1854", "3244"], 140, "judean", "Proposes judean culture for Hasmonean/Judean provinces; existing Israeli culture is modern-named and too broad for ancient Judea."),
})
addCore(judea, 140, "theocracy", "feudal_theocracy", "Hasmonean Judea becomes an independent priestly kingdom after the Maccabean revolt", "Reuses feudal theocracy reform for high-priestly dynastic rule.")
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[167, "Mattathias", "Hasmonean", "Priestly rebel founder of the Maccabean revolt"],
	[166, "Judas Maccabeus", "Hasmonean", "Leader of the revolt against Seleucid authority"],
	[160, "Jonathan Apphus", "Hasmonean", "Hasmonean leader and high priest"],
	[142, "Simon Thassi", "Hasmonean", "Secures practical Judean independence"],
	[134, "John Hyrcanus I", "Hasmonean", "Expands Hasmonean territory and power"],
	[104, "Aristobulus I", "Hasmonean", "First Hasmonean to take the royal title in later accounts"],
	[103, "Alexander Jannaeus", "Hasmonean", "Hasmonean king and high priest during major expansion and civil unrest"],
	[76, "Salome Alexandra", "Hasmonean", "Hasmonean queen; one of the best-attested female rulers in the region"],
	[67, "Hyrcanus II", "Hasmonean", "Contested Hasmonean ruler during civil conflict"],
	[66, "Aristobulus II", "Hasmonean", "Rival Hasmonean claimant before Roman intervention"],
	[40, "Antigonus II Mattathias", "Hasmonean", "Last Hasmonean king, backed by Parthian intervention"],
	[37, "Herod the Great", "Herodian", "Roman-backed king of Judea"],
	[4, "Herod Archelaus", "Herodian", "Ethnarch of Judea after Herod's death"],
]) {
	judea.ruler(year, name, { dynasty, note, sourceConfidence: confidence })
}

const himyar = nationBuilder("cp_himyarite_kingdom", {
	provinceEvents: cultureEvents(
		["384", "385", "386", "387", "388", "390", "2329", "2331", "2345", "2346", "4278", "4279", "4280", "4281", "4282"],
		110,
		"himyarite",
		"Proposes himyarite culture for the early Himyarite highland/coastal kingdom; existing Hejazi/Yemeni cultures are broad modern umbrellas.",
	),
})
addCore(himyar, 110, "monarchy", monarchyReform, "Himyarite kingdom emerges in southwest Arabia and begins absorbing older South Arabian polities", "Reuses monarchy reform for Himyarite kingship.")
for (const [year, name, note, confidence = "abstraction"] of [
	[110, "Himyarite kings of Zafar", "Early Himyarite royal phase begins around the late second/first century BC"],
	[75, "Dhu Raydan rulers", "Representative marker for the Himyarite royal title and highland base"],
	[25, "Late pre-2AD Himyarite kings", "Himyarite power expands across Yemen before later consolidation"],
]) {
	himyar.ruler(year, name, { dynasty: "Himyar", note, sourceConfidence: confidence })
}

const wars = [
	war({
		warId: "philistineIsraeliteWars",
		name: "Philistine-Israelite wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_kingdom_of_israel",
		warGoalProvince: "1854",
		attacker: ["cp_philistia"],
		defender: ["cp_kingdom_of_israel"],
		start: d(1050),
		end: d(1000),
		note: "Represents the sustained Philistine-Israelite conflict cycle from the late Judges/Saul-David period.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 1050,
				name: "Battle of Aphek",
				locationProvinceId: "1854",
				attacker: { country: "cp_philistia", commander: "Philistine lords", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_kingdom_of_israel", commander: "Israelite elders", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Acco (1854) stands in for the coastal plain theater; Aphek has no direct province.",
			}),
			battle({
				year: 1000,
				name: "David's campaigns against Philistia",
				locationProvinceId: "3244",
				attacker: { country: "cp_kingdom_of_israel", commander: "David", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_philistia", commander: "Philistine lords", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Jaffa (3244) stands in for the southern coastal plain.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "assyrianCampaignAgainstPhilistia",
		name: "Assyrian campaign against Philistia",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_philistia",
		warGoalProvince: "3244",
		attacker: ["cp_neo_assyrian_empire"],
		defender: ["cp_philistia"],
		start: d(734),
		end: d(711),
		note: "Tiglath-Pileser III and Sargon II's western campaigns reduce Philistine cities and suppress Ashdod's revolt.",
		battles: [],
	}),
	war({
		warId: "nebuchadnezzarCampaignAgainstPhilistia",
		name: "Babylonian conquest of Philistia",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_philistia",
		warGoalProvince: "3244",
		attacker: ["cp_neo_babylonian_empire"],
		defender: ["cp_philistia"],
		start: d(604),
		end: d(604),
		note: "Nebuchadnezzar II's campaign destroys or subdues the remaining Philistine city-states.",
		battles: [],
	}),
	war({
		warId: "sidonianRevoltAgainstPersia",
		name: "Sidonian revolt against Persia",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_phoenicia",
		warGoalProvince: "1855",
		attacker: ["cp_phoenicia"],
		defender: ["cp_achaemenid_empire"],
		start: d(351),
		end: d(345),
		note: "Tennes of Sidon leads a major Phoenician revolt before Artaxerxes III's reconquest.",
		battles: [
			battle({
				year: 345,
				name: "Fall of Sidon",
				locationProvinceId: "1855",
				attacker: { country: "cp_achaemenid_empire", commander: "Artaxerxes III", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_phoenicia", commander: "Tennes", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Sidon is directly represented by province 1855.",
			}),
		],
	}),
	war({
		warId: "siegeOfTyre",
		name: "Siege of Tyre",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_phoenicia",
		warGoalProvince: "378",
		attacker: ["cp_macedonian_empire"],
		defender: ["cp_phoenicia"],
		start: d(332),
		end: d(332),
		note: "Alexander's siege ends Tyre's independent resistance and shifts the Phoenician coast into the Macedonian successor sphere.",
		battles: [
			battle({
				year: 332,
				name: "Siege of Tyre",
				locationProvinceId: "378",
				attacker: { country: "cp_macedonian_empire", commander: "Alexander III", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_phoenicia", commander: "Azemilcus / Tyrian defenders", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Beirut (378) is the closest local coastal province in this footprint; Tyre has no separate province id.",
			}),
		],
	}),
	war({
		warId: "antigonidCampaignAgainstNabataeans",
		name: "Antigonid campaign against the Nabataeans",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_nabataeans",
		warGoalProvince: "380",
		attacker: ["cp_antigonid_dynasty"],
		defender: ["cp_nabataeans"],
		start: d(312),
		end: d(312),
		note: "Antigonus I's commanders attack the Nabataeans near Petra but fail to control the desert trade routes.",
		battles: [
			battle({
				year: 312,
				name: "Antigonid raid on Petra",
				locationProvinceId: "380",
				attacker: { country: "cp_antigonid_dynasty", commander: "Athenaeus / Demetrius", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_nabataeans", commander: "Nabataean defenders", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: false,
				note: "Al Karak (380) stands in for the Petra region.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "maccabeanRevolt",
		name: "Maccabean revolt",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "JUD",
		warGoalProvince: "379",
		attacker: ["JUD"],
		defender: ["cp_seleucid_empire"],
		start: d(167),
		end: d(160),
		note: "Hasmonean revolt against Seleucid religious and political control; modeled as a war because both tags exist.",
		battles: [
			battle({
				year: 166,
				name: "Battle of Beth Horon",
				locationProvinceId: "379",
				attacker: { country: "JUD", commander: "Judas Maccabeus", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_seleucid_empire", commander: "Seron", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Judea province stands in for the hill-country battlefield.",
			}),
			battle({
				year: 164,
				name: "Battle of Beth Zur",
				locationProvinceId: "379",
				attacker: { country: "JUD", commander: "Judas Maccabeus", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_seleucid_empire", commander: "Lysias", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Judea province stands in for Beth Zur.",
			}),
			battle({
				year: 160,
				name: "Battle of Elasa",
				locationProvinceId: "379",
				attacker: { country: "cp_seleucid_empire", commander: "Bacchides", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "JUD", commander: "Judas Maccabeus", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Judea province stands in for Elasa; Judas dies in the battle.",
			}),
		],
	}),
	war({
		warId: "hasmoneanIdumaeanCampaigns",
		name: "Hasmonean coastal and Idumaean campaigns",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "JUD",
		warGoalProvince: "3244",
		attacker: ["JUD"],
		defender: ["cp_nabataeans"],
		start: d(110),
		end: d(96),
		note: "Represents Hasmonean expansion into southern/coastal zones and clashes with Nabataean-linked neighbors; Idumaea has no separate owner tag in this local footprint.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "nabataeanHasmoneanWar",
		name: "Nabataean-Hasmonean war",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "JUD",
		warGoalProvince: "379",
		attacker: ["cp_nabataeans"],
		defender: ["JUD"],
		start: d(93),
		end: d(88),
		note: "Obodas I defeats Alexander Jannaeus after Hasmonean expansion threatens Nabataean trade routes.",
		battles: [
			battle({
				year: 93,
				name: "Battle of Gadara",
				locationProvinceId: "381",
				attacker: { country: "cp_nabataeans", commander: "Obodas I", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "JUD", commander: "Alexander Jannaeus", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Hawran (381) is used for the Transjordan/Gadara theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
]

const revolts = {
	"1855": {
		events: [
			revoltEvent({
				year: 345,
				type: "particularist_rebels",
				size: 3,
				leader: "Tennes",
				comment: "Sidonian revolt",
				note: "Sidon's revolt against Artaxerxes III is also represented as a war against Persia; the revolt marker records the internal city uprising phase.",
			}),
		],
	},
	"379": {
		events: [
			revoltEvent({
				year: 167,
				type: "religious_rebels",
				size: 4,
				leader: "Mattathias",
				comment: "Maccabean revolt",
				note: "Initial religious uprising in Judea before full Hasmonean state formation; companion to the Seleucid-Judean war entry.",
			}),
			revoltEvent({
				year: 88,
				type: "particularist_rebels",
				size: 3,
				comment: "Judean civil unrest under Alexander Jannaeus",
				note: "Alexander Jannaeus faces severe internal opposition after wars and sectarian conflict; no separate rebel tag exists.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"390": {
		events: [
			revoltEvent({
				year: 115,
				type: "particularist_rebels",
				size: 3,
				comment: "Sabaean-Himyarite rivalry",
				note: "Local resistance during the early Himyarite rise in the Sabaean highlands; modeled as revolt because the transition is fragmentary in the owner history.",
				sourceConfidence: "abstraction",
			}),
		],
	},
}

const heritageAudit = [
	{
		id: "canaanite",
		name: "Canaanite",
		cultures: [
			{
				id: "philistine",
				name: "Philistine",
				primaryTag: "cp_philistia",
				color: [171, 112, 138],
			},
			{
				id: "judean",
				name: "Judean",
				primaryTag: "JUD",
				color: [72, 108, 156],
			},
		],
	},
	{
		id: "south_arabian",
		name: "South Arabian",
		cultures: [
			{
				id: "sabaean",
				name: "Sabaean",
				primaryTag: "cp_sabaeans",
				color: [168, 102, 74],
			},
			{
				id: "qatabanian",
				name: "Qatabanian",
				primaryTag: "QAT",
				color: [151, 116, 70],
			},
			{
				id: "minaean",
				name: "Minaean",
				primaryTag: "cp_minaeans",
				color: [181, 130, 76],
			},
			{
				id: "hadhrami",
				name: "Hadhrami",
				primaryTag: "cp_hadhramaut",
				color: [126, 142, 86],
			},
			{
				id: "himyarite",
				name: "Himyarite",
				primaryTag: "cp_himyarite_kingdom",
				color: [143, 92, 72],
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

const builders = [philistia, phoenicia, colonies, empire, hadhramaut, sabaeans, qataban, minaeans, nabataeans, judea, himyar]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "levant-south-arabia-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the Levant / Phoenician / South Arabian batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields. South Arabian conflicts are mostly omitted from wars because the opposing polities are often already in the same batch but the specific battle records and dates are inscriptional or hard to place in this province footprint.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "levant-south-arabia-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Levant / Phoenician / South Arabian batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields. Only includes internal upheavals without a clean separate opposing tag or where a war entry also benefits from a local uprising marker.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(path.join(heritagesDir, "levant-south-arabia-heritages.json"), JSON.stringify(heritageAudit, null, "\t") + "\n")

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts, and ${heritageAudit.reduce((sum, group) => sum + group.cultures.length, 0)} heritage cultures`)
