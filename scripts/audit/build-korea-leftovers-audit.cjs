// One-off generator for the remaining Korea pre-2AD audit batch.
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
	"Audit/proposal file: reconstructed pre-2AD events for the remaining Korea/Manchuria tags: Korean Jin, Dongye, Jinhan, Mahan, and Goguryeo. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Complements the earlier Korea/SE Asia/South India audit covering Gojoseon, Dong Okjeo, and Byeonhan. ProvinceEvents reuse existing Korean/Buyeo/Jinhan and Muism where adequate and propose narrow missing ancient cultures for Korean Jin, Mahan, Dongye, and Goguryeo."

const tribalReform = "tribal_kingdom"

function addCore(builder, year, govNote, reformNote) {
	builder.govChange(year, "tribal", govNote)
	builder.reformAdd(year, tribalReform, reformNote)
}

const koreanJinIds = ["734", "735", "736", "737", "1013", "2694", "2745", "4227", "4228", "4229", "4230"]
const koreanJin = nationBuilder("cp_korean_jin", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: koreanJinIds,
			year: 200,
			cultureId: "korean_jin",
			religionId: "muism",
			note: "Proposes korean_jin culture for the broad southern Korean Jin confederacy before the Samhan split; reuses existing Muism.",
		},
	]),
})
addCore(koreanJin, 200, "Jin confederacy dominates southern Korean polities before Samhan differentiation", "Reuses tribal kingdom reform for loose confederated chiefdoms.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[200, "Jin confederated chiefs", "Broad southern Korean Jin marker; no secure individual ruler list exists"],
	[150, "Late Jin chiefs", "Jin confederacy fragments toward Mahan, Jinhan, and Byeonhan"],
	[100, "Samhan transition councils", "Transition marker before distinct Samhan polities dominate the footprint"],
]) {
	koreanJin.ruler(year, name, { dynasty: "Jin", note, sourceConfidence })
}

const dongye = nationBuilder("DON", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["2694"],
			year: 100,
			cultureId: "dongye",
			religionId: "muism",
			note: "Proposes dongye culture for the eastern Korean polity; existing Korean culture is broad but valid, Muism is retained.",
		},
	]),
})
addCore(dongye, 100, "Dongye appears as an eastern Korean polity between Okjeo, Goguryeo, and the Samhan world", "Reuses tribal kingdom reform for local chiefdom structure.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[100, "Dongye chiefs", "No secure pre-2AD individual ruler list is preserved"],
	[50, "Dongye tributary chiefs", "Dongye remains a local polity before later Goguryeo pressure"],
]) {
	dongye.ruler(year, name, { dynasty: "Dongye", note, sourceConfidence })
}

const jinhan = nationBuilder("JHN")
addCore(jinhan, 100, "Jinhan confederacy appears in southeastern Korea as part of the Samhan system", "Reuses tribal kingdom reform for confederated chiefdoms.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[100, "Jinhan confederated chiefs", "Existing jinhan culture already covers the province; no new culture event needed"],
	[50, "Saro/Jinhan chiefs", "Early Saro/Jinhan marker before later Silla consolidation"],
]) {
	jinhan.ruler(year, name, { dynasty: "Jinhan", note, sourceConfidence })
}

const mahanIds = ["734", "735", "737", "1013", "4228", "4229", "4230"]
const mahan = nationBuilder("MHN", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: mahanIds,
			year: 100,
			cultureId: "mahan",
			religionId: "muism",
			note: "Proposes mahan culture for the western/southwestern Samhan confederacy; existing Korean culture is broad but valid, Muism is retained.",
		},
	]),
})
addCore(mahan, 100, "Mahan confederacy forms in western and southwestern Korea", "Reuses tribal kingdom reform for Samhan confederated chiefdoms.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[100, "Mahan confederated chiefs", "No secure pre-2AD ruler list is preserved"],
	[50, "Mahan statelets", "Mahan remains a loose confederacy before Baekje consolidation centuries later"],
]) {
	mahan.ruler(year, name, { dynasty: "Mahan", note, sourceConfidence })
}

const goguryeo = nationBuilder("GOG", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["2111", "2742", "4201", "4653"],
			year: 37,
			cultureId: "goguryeo",
			religionId: "muism",
			note: "Proposes goguryeo culture for the early Yemaek/Goguryeo polity; existing Korean/Buyeo baselines are adjacent but not specific.",
		},
	]),
})
addCore(goguryeo, 37, "Goguryeo is traditionally founded by Jumong in the Yalu/Manchurian frontier", "Reuses tribal kingdom reform for early Goguryeo royal chiefdom.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[37, "Jumong / Dongmyeong", "Traditional founder of Goguryeo"],
	[19, "Yuri", "Second Goguryeo ruler in traditional chronology"],
	[18, "Daemusin heir marker", "Late pre-2AD dynastic continuity marker; later reign is outside the window", "abstraction"],
]) {
	goguryeo.ruler(year, name, { dynasty: "Goguryeo", note, sourceConfidence })
}

const wars = [
	war({
		warId: "wimanJoseonJinPressure",
		name: "Wiman Joseon pressure on Jin and Samhan",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_korean_jin",
		warGoalProvince: "735",
		attacker: ["cp_gojoseon"],
		defender: ["cp_korean_jin"],
		start: d(194),
		end: d(108),
		note: "Represents Wiman Joseon and Han-commandery pressure on southern Korean Jin networks before the Samhan split; Go-Joseon is already covered.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "goguryeoBuyeoFoundationConflict",
		name: "Goguryeo foundation conflict with Buyeo",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "GOG",
		warGoalProvince: "4201",
		attacker: ["GOG"],
		defender: ["XIO"],
		start: d(37),
		end: d(19),
		note: "Jumong's foundation story is rooted in flight from Buyeo; no separate pre-2AD Buyeo owner tag is available, so Xiongnu-steppe frontier authority is used as a coarse opposing tag present in the footprint.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 37,
				name: "Foundation at Jolbon",
				locationProvinceId: "4201",
				attacker: { country: "GOG", commander: "Jumong", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "XIO", commander: "Northern frontier chiefs", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Jiangzhou (4201) stands in for Jolbon/Yalu-Manchurian frontier.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
]

const revolts = {
	"735": {
		events: [
			revoltEvent({
				year: 100,
				type: "particularist_rebels",
				size: 2,
				comment: "Samhan fragmentation from Jin",
				note: "Represents local confederacies separating from the broader Jin aggregate; no separate rebel tags exist.",
				sourceConfidence: "abstraction",
			}),
		],
	},
}

const heritageAudit = [
	{
		id: "korean_g",
		name: "Korean G",
		cultures: [
			{
				id: "korean_jin",
				name: "Korean Jin",
				primaryTag: "cp_korean_jin",
				color: [168, 56, 62],
			},
			{
				id: "mahan",
				name: "Mahan",
				primaryTag: "MHN",
				color: [184, 74, 64],
			},
			{
				id: "dongye",
				name: "Dongye",
				primaryTag: "DON",
				color: [142, 56, 78],
			},
			{
				id: "goguryeo",
				name: "Goguryeo",
				primaryTag: "GOG",
				color: [128, 44, 58],
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

const builders = [koreanJin, dongye, jinhan, mahan, goguryeo]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "korea-leftovers-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the remaining Korea batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "korea-leftovers-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the remaining Korea batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(path.join(heritagesDir, "korea-leftovers-heritages.json"), JSON.stringify(heritageAudit, null, "\t") + "\n")

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts, and ${heritageAudit.reduce((sum, group) => sum + group.cultures.length, 0)} heritage cultures`)
