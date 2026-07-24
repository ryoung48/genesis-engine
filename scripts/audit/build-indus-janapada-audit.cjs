// One-off generator for the Indus / Mahajanapada / Magadha-Shaishunaga pre-2AD audit batch.
// Writes 9 nation files plus shared wars and revolts files.
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
	return { date: d(year, month, day), name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence }
}

function revoltEvent({ year, type, size, leader, comment, note, sourceConfidence = "traditional" }) {
	const revolt = { type, size }
	if (leader) revolt.leader = leader
	return { date: d(year), kind: "revolt", payload: { revolt }, comment, note, sourceConfidence }
}

const readme =
	"Audit/proposal file: reconstructed pre-2AD events for the Indus / Mahajanapada / Magadha-Shaishunaga batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Ruler lists are conservative where chronology is epic, legendary, or only retrospectively preserved. ProvinceEvents only mark religion baseline mismatches using existing IDs; no new Harappan/Vedic religion id is invented."

function addCore(builder, year, governmentType, reformId, govNote, reformNote, sourceConfidence = "abstraction") {
	builder.govChange(year, governmentType, govNote, sourceConfidence)
	builder.reformAdd(year, reformId, reformNote, sourceConfidence)
}

function religionEvents(ids, year, religionId, note) {
	return Object.fromEntries(ids.map((provinceId) => [provinceId, [provinceEvent(year, "religion", { religionId }, note)]]))
}

const monarchyReform = "aristocratic_monarchy"
const republicReform = "oligarchy_reform"

const indusProvinceIds = [
	"503",
	"504",
	"505",
	"506",
	"507",
	"515",
	"521",
	"576",
	"2051",
	"2052",
	"2054",
	"2062",
	"2065",
	"2068",
	"2072",
	"2076",
	"2077",
	"2078",
	"2079",
	"2086",
	"2231",
	"4411",
	"4449",
	"4454",
	"4455",
	"4456",
	"4457",
	"4463",
	"4503",
	"4504",
	"4505",
	"4507",
	"4508",
	"4509",
	"4510",
	"4511",
	"4513",
]

const indus = nationBuilder("cp_indus_valley_civilization", {
	provinceEvents: religionEvents(
		indusProvinceIds,
		2600,
		"hinduism",
		"Indus/Harappan religion predates Buddhist, Mahayana, Jain, and Zoroastrian province baselines. Uses hinduism as the closest existing South Asian local-cult abstraction, not as a literal Vedic/Hindu identity.",
	),
})
addCore(
	indus,
	3300,
	"monarchy",
	monarchyReform,
	"Early Harappan urbanization and regional integration begin in the Indus sphere",
	"Reuses generic monarchy reform id as an abstraction for urban corporate/elite authority; no dedicated Harappan government reform exists.",
)
for (const [year, name, note, confidence = "abstraction"] of [
	[3300, "Early Harappan communities", "Regional village-to-town networks expand before mature urbanization"],
	[2600, "Mature Harappan urban centers", "Mohenjo-daro, Harappa, Dholavira, and related cities mark the mature urban phase"],
	[2500, "Indus mercantile and civic elites", "Administrative seals, weights, drainage, and planned cities indicate complex civic authority without attested ruler names"],
	[1900, "Late Harappan regionalization", "Urban contraction and regionalization after the mature phase"],
	[1700, "Post-urban Harappan successor communities", "Late/post-urban continuity marker before the local province history leaves the Indus tag"],
]) {
	indus.ruler(year, name, { dynasty: "Harappan", note, sourceConfidence: confidence })
}

const magadhaReligionProvinceEvents = {
	...religionEvents(
		["558", "561", "563", "564", "2039", "2046", "2047", "2055", "2096", "4474", "4475", "4476", "4477", "4478", "4479", "4486", "4487", "4488", "4489", "4490", "4495", "4496"],
		413,
		"buddhism",
		"Shaishunaga-era Magadha and its Ganges basin sphere are currently carrying later Mahayana or mixed baselines. Uses buddhism as the closest existing early sramana-era id where the province baseline is already Buddhist-family or eastern Ganges religious change is historically plausible.",
	),
}

const magadha = nationBuilder("cp_magadha_shaishunaga_dynasty", { provinceEvents: magadhaReligionProvinceEvents })
addCore(
	magadha,
	413,
	"monarchy",
	monarchyReform,
	"Shishunaga traditionally founds the Shaishunaga dynasty after the Haryanka line",
	"Reuses existing ancient monarchy reform id for Magadhan kingship.",
)
for (const [year, name, note, confidence = "traditional"] of [
	[413, "Shishunaga", "Founder of the Shaishunaga dynasty in traditional Magadhan chronology"],
	[395, "Kakavarna / Kalashoka", "Associated with the Second Buddhist Council and the late Shaishunaga phase"],
	[367, "The ten sons of Kalashoka", "Traditional collective rule/succession marker where individual chronology is compressed", "abstraction"],
	[350, "Nandivardhana", "Late Shaishunaga ruler in Puranic/Buddhist tradition"],
	[345, "Mahanandin", "Last Shaishunaga ruler before Mahapadma Nanda; some traditions make him father of Mahapadma"],
]) {
	magadha.ruler(year, name, { dynasty: "Shaishunaga", note, sourceConfidence: confidence })
}

function janapada(tag, year, governmentType, reformId, name, dynasty, note, provinceEvents = null) {
	const b = nationBuilder(tag, { provinceEvents })
	addCore(b, year, governmentType, reformId, note, `Reuses ${reformId} for the Mahajanapada's early historic polity structure.`, "abstraction")
	b.ruler(year, name, { dynasty, note: "Epic/Buddhist/Jain textual traditions preserve the polity more securely than a complete ruler list; this is a polity-level ruler marker.", sourceConfidence: "abstraction" })
	return b
}

const cedi = janapada("cp_janapada_of_cedi", 600, "monarchy", monarchyReform, "Cedi chiefs", "Cedi", "Cedi appears among the sixteen Mahajanapadas in central India.")
cedi.ruler(500, "Late Cedi line", { dynasty: "Cedi", note: "Late independent janapada phase before absorption into larger Ganges basin powers", sourceConfidence: "abstraction" })

const avanti = janapada("cp_janapada_of_avanti", 600, "monarchy", monarchyReform, "Pradyota", "Avanti", "Avanti is a major Mahajanapada centered on Ujjain/Mahishmati and a principal rival of early Magadha.")
avanti.ruler(520, "Pradyota dynasty", { dynasty: "Pradyota", note: "Pradyota and his successors represent Avanti's best-attested early royal line", sourceConfidence: "abstraction" })
avanti.ruler(413, "Late Avanti kings", { dynasty: "Avanti", note: "Late independent Avanti phase before Magadhan absorption in Shaishunaga tradition", sourceConfidence: "abstraction" })

const kosala = janapada(
	"cp_janapada_of_kosala",
	600,
	"monarchy",
	monarchyReform,
	"Mahakosala",
	"Ikshvaku/Kosala",
	"Kosala is a major Mahajanapada centered on Ayodhya/Sravasti.",
	{
		...religionEvents(["4495"], 600, "hinduism", "Kosala's janapada baseline is Jain at start; hinduism is used as the closest existing Vedic/Brahmanical baseline before later sramana prominence."),
	},
)
for (const [year, name, note] of [
	[560, "Pasenadi / Prasenajit", "Well-known king of Kosala and contemporary of the Buddha"],
	[500, "Vidudabha", "Late Kosalan ruler associated with conflict against the Sakyas and Magadha-era decline"],
]) {
	kosala.ruler(year, name, { dynasty: "Kosala", note })
}

const kuru = janapada(
	"cp_janapada_of_kuru",
	700,
	"monarchy",
	monarchyReform,
	"Parikshit-Janamejaya tradition",
	"Kuru",
	"Kuru is an early Vedic janapada in the upper Ganges-Yamuna region; ruler marker is epic/traditional.",
	{
		...religionEvents(["522"], 700, "hinduism", "Kuru's baseline is Mahayana at a Vedic-period date. Uses hinduism as the closest existing Vedic/Brahmanical id."),
	},
)
kuru.ruler(600, "Late Kuru chiefs", { dynasty: "Kuru", note: "Later Kuru polity survives as a smaller Mahajanapada in Buddhist lists", sourceConfidence: "abstraction" })

const matsya = janapada("cp_janapada_of_matsya", 600, "monarchy", monarchyReform, "Virata tradition", "Matsya", "Matsya is a Mahajanapada in the Rajasthan/Jaipur-Alwar sphere; ruler marker is epic/traditional.")
matsya.ruler(500, "Late Matsya chiefs", { dynasty: "Matsya", note: "Late independent janapada phase before incorporation into larger northern Indian states", sourceConfidence: "abstraction" })

const pancala = janapada(
	"cp_janapada_of_pancala",
	700,
	"monarchy",
	monarchyReform,
	"Drupada tradition",
	"Pancala",
	"Pancala is a major Vedic/early historic polity east of Kuru; ruler marker is epic/traditional.",
	{
		...religionEvents(["4499"], 700, "hinduism", "Pancala's baseline is Jain at a Vedic-period date. Uses hinduism as the closest existing Vedic/Brahmanical id."),
	},
)
pancala.ruler(600, "Northern and Southern Pancala chiefs", { dynasty: "Pancala", note: "Later division of Pancala into northern and southern centers is represented as a collective marker", sourceConfidence: "abstraction" })

const vajji = janapada(
	"cp_janapada_of_vajji",
	600,
	"republic",
	republicReform,
	"Licchavi-Vajji assembly",
	"Vajji",
	"Vajji/Vrijji is a gana-sangha confederacy centered on Vaishali.",
	{
		...religionEvents(["2047"], 600, "jainism", "Vajji's baseline is Mahayana at a pre-Mahayana date; jainism is the closest existing id for the Licchavi/Vaishali sramana context associated with Mahavira."),
	},
)
vajji.ruler(500, "Chetaka tradition", { dynasty: "Licchavi", note: "Chetaka is a traditional Licchavi/Vajji figure associated with Jain and Buddhist-era narratives", sourceConfidence: "abstraction" })

const vatsa = janapada(
	"cp_janapada_of_vatsa",
	600,
	"monarchy",
	monarchyReform,
	"Udayana",
	"Vatsa",
	"Vatsa is a Mahajanapada centered on Kausambi; Udayana is its best-known legendary/historical king.",
	{
		...religionEvents(["555"], 600, "hinduism", "Vatsa's baseline is Mahayana at a pre-Mahayana date. Uses hinduism as the closest existing Vedic/Brahmanical id."),
	},
)
vatsa.ruler(500, "Late Vatsa kings", { dynasty: "Vatsa", note: "Late Vatsa phase before absorption into Avanti/Magadha traditions", sourceConfidence: "abstraction" })

const wars = [
	war({
		warId: "declineOfIndusUrbanSystem",
		name: "Late Harappan urban contraction",
		casusBelli: "cb_disaster",
		warGoalType: "take_province",
		warGoalTag: "cp_indus_valley_civilization",
		warGoalProvince: "504",
		attacker: ["cp_indus_valley_civilization"],
		defender: ["cp_indus_valley_civilization"],
		start: d(1900),
		end: d(1700),
		note: "Non-state collapse marker: climate, river, and exchange-system stresses fragment the Indus urban order. Same-tag war is an audit abstraction because no opposing polity tag exists.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "magadhaVajjiWar",
		name: "Magadha-Vajji War",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_janapada_of_vajji",
		warGoalProvince: "2047",
		attacker: ["cp_magadha_shaishunaga_dynasty"],
		defender: ["cp_janapada_of_vajji"],
		start: d(484),
		end: d(468),
		note: "Ajatashatru's long war against the Vajji/Licchavi confederacy is included under this batch because it explains Magadha's absorption of Vajji before the Shaishunaga/Nanda sequence; opposing tag exists.",
		sourceConfidence: "traditional",
		battles: [
			battle({
				year: 468,
				name: "Fall of Vaishali",
				locationProvinceId: "2047",
				attacker: { country: "cp_magadha_shaishunaga_dynasty", commander: "Magadhan forces", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_janapada_of_vajji", commander: "Licchavi-Vajji assembly", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Tirhut (2047) stands in for Vaishali/Vajji territory.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "kosalaMagadhaConflict",
		name: "Kosala-Magadha conflict",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_janapada_of_kosala",
		warGoalProvince: "4495",
		attacker: ["cp_magadha_shaishunaga_dynasty"],
		defender: ["cp_janapada_of_kosala"],
		start: d(490),
		end: d(480),
		note: "Represents the Magadha-Kosala rivalry around Kashi/Kosala's eventual subordination; exact dates and dynastic attribution vary.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "avantiMagadhaWar",
		name: "Avanti-Magadha rivalry",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_magadha_shaishunaga_dynasty",
		warGoalProvince: "558",
		attacker: ["cp_magadha_shaishunaga_dynasty"],
		defender: ["cp_janapada_of_avanti"],
		start: d(413),
		end: d(400),
		note: "Shishunaga is traditionally credited with ending Avanti's rivalry with Magadha. Uses the available cp_janapada_of_avanti tag.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "magadhaAbsorptionOfVatsa",
		name: "Magadhan absorption of Vatsa",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_janapada_of_vatsa",
		warGoalProvince: "555",
		attacker: ["cp_magadha_shaishunaga_dynasty"],
		defender: ["cp_janapada_of_vatsa"],
		start: d(380),
		end: d(360),
		note: "Represents Vatsa's disappearance into the larger Magadhan/Avanti imperial world by the Nanda-Maurya transition.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "nandaConquestOfResidualJanapadas",
		name: "Nanda conquest of residual Mahajanapadas",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_janapada_of_kuru",
		warGoalProvince: "522",
		attacker: ["cp_nanda_empire"],
		defender: ["cp_janapada_of_kuru", "cp_janapada_of_pancala", "cp_janapada_of_cedi", "cp_janapada_of_matsya"],
		start: d(345),
		end: d(321),
		note: "Mahapadma Nanda's expansion is traditionally described as subduing older kshatriya lineages; groups several residual janapada tags that have no clearer individual conquest record.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
]

const revolts = {
	"558": {
		events: [
			revoltEvent({
				year: 413,
				type: "pretender_rebels",
				size: 3,
				leader: "Shishunaga",
				comment: "Shaishunaga takeover in Magadha",
				note: "Traditional dynastic transition after the Haryanka line; revolt marker records internal overthrow because the outgoing Haryanka line has no separate local tag.",
				sourceConfidence: "abstraction",
			}),
			revoltEvent({
				year: 345,
				type: "pretender_rebels",
				size: 4,
				leader: "Mahapadma Nanda",
				comment: "Nanda takeover from late Shaishunagas",
				note: "Transition to the already-covered Nanda Empire; represented as a pretender revolt because no separate late-Shaishunaga rebel tag exists.",
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

const builders = [indus, magadha, cedi, avanti, kosala, kuru, matsya, pancala, vajji, vatsa]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "indus-janapada-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the Indus / Mahajanapada / Magadha-Shaishunaga batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields. Some entries are explicitly abstraction-level because early Indian chronology and combat details are thin.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "indus-janapada-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Indus / Mahajanapada / Magadha-Shaishunaga batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields. Only includes internal upheavals without a clean separate opposing tag.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, and ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts`)
