// One-off generator for the remaining India pre-2AD audit batch.
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
	"Audit/proposal file: reconstructed pre-2AD events for the remaining India tags: Haryanka Magadha, aggregate Mahajanapadas, and Kalinga. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Complements the Indus/Janapada/Shaishunaga and India successor audits. ProvinceEvents reuse existing Hinduism/Jainism/Mahayana where present and propose narrow ancient culture ids for Magadhi and Kalingan where modern Bihari/Oriya/Garjati/Telegu labels are too broad."

const monarchyReform = "autocracy_reform"
const republicReform = "oligarchy_reform"

function addCore(builder, year, governmentType, reformId, govNote, reformNote) {
	builder.govChange(year, governmentType, govNote)
	builder.reformAdd(year, reformId, reformNote)
}

const magadhaIds = ["555", "556", "558", "560", "2038", "2044", "2047", "2055", "2081", "2095", "2096", "4469", "4470", "4471", "4472", "4476", "4477", "4487", "4488", "4489", "4490", "4495"]
const magadha = nationBuilder("cp_magadha_haryanka_dynasty", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: magadhaIds,
			year: 544,
			cultureId: "magadhi",
			religionId: null,
			note: "Proposes magadhi culture for the Haryanka Magadha/Ganges-footprint; existing Avadhi/Bihari/Bengali labels are later regional cultures. Existing province religions are retained because Hindu/Jain/Buddhist distributions are already mixed in the source.",
		},
	]),
})
addCore(magadha, 544, "monarchy", monarchyReform, "Bimbisara consolidates the Haryanka dynasty and begins Magadha's expansion", "Reuses autocracy reform for early Magadhan kingship.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[544, "Bimbisara", "Haryanka king who expanded Magadha through conquest and marriage alliances"],
	[492, "Ajatashatru", "Expanded Magadha, fought Kosala and Vajji, and fortified Pataliputra's predecessor"],
	[460, "Udayin", "Traditionally credited with developing Pataliputra as Magadha's capital"],
	[444, "Anuruddha", "Late Haryanka ruler; chronology varies by tradition", "abstraction"],
	[440, "Munda", "Late Haryanka ruler in Buddhist/Puranic king-list traditions", "abstraction"],
	[437, "Nagadasaka", "Last Haryanka ruler before the Shaishunaga takeover"],
	[413, "Transition to Shaishunaga", "Magadha passes to the already-covered Shaishunaga dynasty", "abstraction"],
]) {
	magadha.ruler(year, name, { dynasty: "Haryanka", note, sourceConfidence })
}

const mahajanapadas = nationBuilder("cp_mahajanapadas", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["2047"],
			year: 600,
			cultureId: "magadhi",
			religionId: null,
			note: "Uses proposed magadhi culture for the aggregate Mahajanapadas marker in Tirhut/Vajji-Magadha frontier territory. Religion baseline is retained.",
		},
	]),
})
addCore(mahajanapadas, 600, "republic", republicReform, "Aggregate Mahajanapadas/Vajji-style oligarchic confederacies appear in the Ganges plain", "Reuses oligarchy reform for gana-sangha and assembly-based polities.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[600, "Mahajanapada assemblies", "Aggregate marker for the sixteen great realms before individual local tags take over"],
	[540, "Vajji-Licchavi confederacy", "Tirhut/Vaishali-area republican confederacy marker"],
	[480, "Late Vajji confederate chiefs", "Confederacy persists until Magadhan conquest under Ajatashatru"],
]) {
	mahajanapadas.ruler(year, name, { dynasty: "Mahajanapada", note, sourceConfidence })
}

const kalingaIds = ["549", "552", "2048", "2049", "2080", "4441", "4446", "4448"]
const kalinga = nationBuilder("KLI", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: kalingaIds,
			year: 321,
			cultureId: "kalingan",
			religionId: null,
			note: "Proposes kalingan culture for the Kalinga coastal/interior footprint; existing Oriya/Garjati/Gondi/Telegu labels are later or regional. Existing Jain/Hindu/Mahayana province religions are retained.",
		},
	]),
})
addCore(kalinga, 321, "monarchy", monarchyReform, "Kalinga remains an eastern Indian kingdom outside early Mauryan control", "Reuses autocracy reform for early Kalingan kingship.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[321, "Early Kalinga kings", "Kalinga's pre-Ashokan dynasty is poorly attested", "abstraction"],
	[305, "Independent Kalinga court", "Kalinga remains outside Chandragupta's core empire in the local owner-history footprint", "abstraction"],
	[261, "Kalinga War leadership", "Unnamed Kalinga rulers resist Ashoka's conquest"],
	[232, "Post-Mauryan Kalinga chiefs", "Kalinga re-emerges after Mauryan central authority weakens", "abstraction"],
	[193, "Kharavela precursor line", "Early Mahameghavahana/Kalinga recovery marker before the separate covered dynasty tag", "abstraction"],
]) {
	kalinga.ruler(year, name, { dynasty: "Kalinga", note, sourceConfidence })
}

const wars = [
	war({
		warId: "magadhaAngaWar",
		name: "Magadha conquest of Anga",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_magadha_haryanka_dynasty",
		warGoalProvince: "2044",
		attacker: ["cp_magadha_haryanka_dynasty"],
		defender: ["cp_mahajanapadas"],
		start: d(544),
		end: d(530),
		note: "Bimbisara's conquest of Anga is represented against the aggregate Mahajanapadas tag because no distinct Anga owner tag remains uncovered.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "ajatashatruVajjiWar",
		name: "Ajatashatru's war against Vajji",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_mahajanapadas",
		warGoalProvince: "2047",
		attacker: ["cp_magadha_haryanka_dynasty"],
		defender: ["cp_mahajanapadas"],
		start: d(484),
		end: d(468),
		note: "Magadha defeats the Vajji/Licchavi confederacy after a prolonged war; dates are approximate.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 475,
				name: "Siege of Vaishali",
				locationProvinceId: "2047",
				attacker: { country: "cp_magadha_haryanka_dynasty", commander: "Ajatashatru", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_mahajanapadas", commander: "Vajji confederate chiefs", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Tirhut (2047) stands in for Vaishali/Vajji territory.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "kalingaWar",
		name: "Kalinga War",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "KLI",
		warGoalProvince: "2049",
		attacker: ["cp_maurya_empire"],
		defender: ["KLI"],
		start: d(262),
		end: d(261),
		note: "Ashoka's conquest of Kalinga; companion to existing Mauryan audit material and province-level Buddhist patronage marker.",
		battles: [
			battle({
				year: 261,
				name: "Battle of Kalinga",
				locationProvinceId: "2049",
				attacker: { country: "cp_maurya_empire", commander: "Ashoka", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "KLI", commander: "Kalinga defenders", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Khurda (2049) stands in for the Dhauli/Kalinga theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
]

const revolts = {
	"2047": {
		events: [
			revoltEvent({
				year: 484,
				type: "particularist_rebels",
				size: 3,
				comment: "Vajji resistance to Magadha",
				note: "Companion revolt marker for the Vajji/Licchavi confederacy's resistance to Ajatashatru.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"2049": {
		events: [
			revoltEvent({
				year: 261,
				type: "nationalist_rebels",
				size: 4,
				comment: "Kalinga resistance to Maurya",
				note: "Companion revolt marker for the Kalinga War; no separate rebel faction tag exists.",
				sourceConfidence: "abstraction",
			}),
		],
	},
}

const heritageAudit = [
	{
		id: "eastern_aryan",
		name: "Eastern Aryan",
		cultures: [
			{
				id: "magadhi",
				name: "Magadhi",
				primaryTag: "cp_magadha_haryanka_dynasty",
				color: [86, 126, 142],
			},
			{
				id: "kalingan",
				name: "Kalingan",
				primaryTag: "KLI",
				color: [96, 118, 154],
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

const builders = [magadha, mahajanapadas, kalinga]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "india-leftovers-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the remaining India batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "india-leftovers-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the remaining India batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(path.join(heritagesDir, "india-leftovers-heritages.json"), JSON.stringify(heritageAudit, null, "\t") + "\n")

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts, and ${heritageAudit.reduce((sum, group) => sum + group.cultures.length, 0)} heritage cultures`)
