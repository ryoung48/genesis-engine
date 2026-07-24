// One-off generator for the Parthia / Xiongnu / Wusun pre-2AD audit batch. cp_dayuan intentionally excluded.
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
	"Audit/proposal file: reconstructed pre-2AD events for Parthia, Xiongnu, and Wusun. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. cp_dayuan is intentionally excluded per user direction. ProvinceEvents are scoped: Parthian core zones use existing parthian/zoroastrian ids while keeping diverse local cultures elsewhere; Xiongnu and Wusun propose missing ancient steppe culture ids and reuse tengri_pagan_reformed."

const monarchyReform = "autocracy_reform"
const tribalReform = "tribal_kingdom"

function addCore(builder, year, governmentType, reformId, govNote, reformNote) {
	builder.govChange(year, governmentType, govNote)
	builder.reformAdd(year, reformId, reformNote)
}

const parthianCore = [
	"437",
	"2214",
	"2236",
	"2349",
	"2350",
	"427",
	"428",
	"432",
	"433",
	"2221",
	"2235",
	"4325",
	"4326",
	"4334",
	"4336",
]
const parthia = nationBuilder("PRT", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: parthianCore,
			year: 247,
			cultureId: "parthian",
			religionId: "zoroastrian",
			note: "Uses existing parthian culture and zoroastrian religion for the Arsacid Parthian core in Parthia/Hyrcania/Khurasan; the wider empire keeps local cultures rather than forcing uniform Parthian identity.",
		},
	]),
})
addCore(parthia, 247, "monarchy", monarchyReform, "Arsaces I founds the Arsacid kingdom in Parthia after Seleucid control weakens", "Reuses autocracy reform for Arsacid royal rule.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[247, "Arsaces I", "Founder of the Arsacid dynasty in Parthia"],
	[211, "Arsaces II", "Early Arsacid ruler under Seleucid pressure"],
	[191, "Phriapatius", "Arsacid king in the early consolidation phase"],
	[176, "Phraates I", "Expanded Arsacid authority among nearby Iranian groups"],
	[171, "Mithridates I", "Major empire-builder who conquered Media and Babylonia"],
	[132, "Phraates II", "Fought Seleucids and eastern nomad pressure"],
	[127, "Artabanus I", "Arsacid ruler killed fighting eastern nomads in later tradition"],
	[124, "Mithridates II", "Restored and expanded Parthian power; first direct diplomatic contacts with Han/Rome era powers"],
	[91, "Gotarzes I", "Arsacid king in a disputed succession sequence"],
	[78, "Orodes I", "Late pre-2AD Arsacid ruler; chronology is partly disputed", "abstraction"],
	[57, "Orodes II", "Parthian king during Carrhae and civil conflict with Mithridates III"],
	[37, "Phraates IV", "Parthian king during Antony's campaign and Augustan diplomacy"],
	[2, "Phraataces", "Late pre-2AD ruler after Phraates IV; included to the edge of the audit window"],
]) {
	parthia.ruler(year, name, { dynasty: "Arsacid", note, sourceConfidence })
}

const xiongnuMongolia = [
	"702",
	"716",
	"717",
	"718",
	"719",
	"720",
	"721",
	"722",
	"723",
	"2114",
	"2115",
	"2116",
	"2117",
	"2189",
	"2190",
	"2191",
	"2193",
	"2747",
	"4220",
	"4221",
	"4222",
	"4668",
	"4669",
	"4670",
	"4671",
	"4672",
	"4673",
	"4674",
	"4675",
	"4676",
	"4677",
	"4678",
	"4679",
	"4680",
	"4681",
	"4682",
]
const xiongnuGansuTarim = ["461", "698", "701", "707", "708", "709", "712", "713", "714", "715", "2118", "2119", "2120", "2121", "2122", "2123", "2179", "2181", "2182", "2192", "2355", "2360", "2368", "4206", "4207", "4208", "4683", "4684"]
const xiongnu = nationBuilder("XIO", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: [...xiongnuMongolia, ...xiongnuGansuTarim],
			year: 209,
			cultureId: "xiongnu",
			religionId: "tengri_pagan_reformed",
			note: "Proposes xiongnu culture for the steppe confederation core and western corridor; existing Mongol/Chahar/Khitan/Tocharian labels are later or regional stand-ins.",
		},
	]),
})
addCore(xiongnu, 209, "tribal", tribalReform, "Modu Chanyu consolidates the Xiongnu empire across the eastern steppe", "Reuses tribal kingdom reform for chanyu-led confederation rule.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[209, "Modu Chanyu", "Founder of the Xiongnu imperial confederation after killing Touman"],
	[174, "Laoshang Chanyu", "Expanded Xiongnu pressure westward and defeated the Yuezhi"],
	[160, "Junchen Chanyu", "Maintained heqin relations and pressure on Han borders"],
	[126, "Yizhixie Chanyu", "Ruler during Emperor Wu's early Han-Xiongnu wars"],
	[114, "Wuwei Chanyu", "Xiongnu ruler during continuing Han offensives"],
	[105, "Wushilu Chanyu", "Short-reigned Xiongnu ruler; succession disputes grow"],
	[102, "Qiedihou Chanyu", "Ruler during Li Guangli-era Han campaigns"],
	[96, "Hulugu Chanyu", "Xiongnu ruler during renewed Han frontier warfare"],
	[85, "Huyandi Chanyu", "Ruler in a period of internal Xiongnu instability"],
	[68, "Xulüquanqu Chanyu", "Late united Xiongnu ruler before factional splits"],
	[58, "Huhanye Chanyu", "Southern claimant who submitted to Han suzerainty"],
	[56, "Zhizhi Chanyu", "Northern/western rival claimant defeated near the Talas region"],
	[31, "Fuzhulei Ruodi Chanyu", "Late pre-2AD southern Xiongnu ruler"],
	[20, "Sousie Ruodi Chanyu", "Late pre-2AD Xiongnu ruler in Han-aligned order", "abstraction"],
	[12, "Cheya Ruodi Chanyu", "Final pre-2AD Xiongnu ruler marker", "abstraction"],
]) {
	xiongnu.ruler(year, name, { dynasty: "Luandi", note, sourceConfidence })
}

const wusun = nationBuilder("WUS", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["461", "2368"],
			year: 160,
			cultureId: "wusun",
			religionId: "tengri_pagan_reformed",
			note: "Proposes wusun culture for the Ili/Zhetysu Wusun kingdom; existing Tocharian/Kirgiz labels are inadequate for the pre-2AD Wusun polity.",
		},
	]),
})
addCore(wusun, 160, "tribal", tribalReform, "Wusun migrate into Zhetysu/Ili after Xiongnu and Yuezhi pressure", "Reuses tribal kingdom reform for Kunmi-led steppe monarchy.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[160, "Nandoumi tradition", "Early Wusun ruler/father of Liejiaomi in Chinese accounts; exact date approximate", "abstraction"],
	[140, "Liejiaomi", "Wusun Kunmi raised under Xiongnu influence who restored Wusun power"],
	[105, "Wengguimi", "Wusun ruler in Han alliance-marriage diplomacy"],
	[60, "Nimi", "Wusun ruler amid Han-backed succession struggles", "abstraction"],
	[50, "Wusun lesser and greater Kunmi", "Split Wusun rulership under Han mediation", "abstraction"],
]) {
	wusun.ruler(year, name, { dynasty: "Wusun", note, sourceConfidence })
}

const wars = [
	war({
		warId: "parthianRevoltAgainstSeleucids",
		name: "Parthian revolt against the Seleucids",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "PRT",
		warGoalProvince: "437",
		attacker: ["PRT"],
		defender: ["cp_seleucid_empire"],
		start: d(247),
		end: d(238),
		note: "Arsaces I seizes Parthia as Seleucid power is distracted by dynastic and regional crises.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "mithridatesConquestOfMediaBabylonia",
		name: "Mithridates I's conquest of Media and Babylonia",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_seleucid_empire",
		warGoalProvince: "410",
		attacker: ["PRT"],
		defender: ["cp_seleucid_empire"],
		start: d(148),
		end: d(141),
		note: "Mithridates I takes Media, Elymais/Babylonia, and enters Seleucia, transforming Parthia into an empire.",
		battles: [],
	}),
	war({
		warId: "antiochusVIISidetesParthianWar",
		name: "Antiochus VII's Parthian War",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "PRT",
		warGoalProvince: "414",
		attacker: ["cp_seleucid_empire"],
		defender: ["PRT"],
		start: d(130),
		end: d(129),
		note: "Antiochus VII briefly recovers territory before being defeated and killed by Phraates II.",
		battles: [
			battle({
				year: 129,
				name: "Defeat of Antiochus VII",
				locationProvinceId: "414",
				attacker: { country: "PRT", commander: "Phraates II", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_seleucid_empire", commander: "Antiochus VII Sidetes", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Hamadan (414) stands in for the Media/Ecbatana wintering theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "carrhaeCampaign",
		name: "Carrhae campaign",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "PRT",
		warGoalProvince: "2308",
		attacker: ["cp_roman_republic"],
		defender: ["PRT"],
		start: d(54),
		end: d(53),
		note: "Crassus invades Mesopotamia and is destroyed by Surena's Parthian cavalry army.",
		battles: [
			battle({
				year: 53,
				name: "Battle of Carrhae",
				locationProvinceId: "2308",
				attacker: { country: "cp_roman_republic", commander: "Marcus Licinius Crassus", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "PRT", commander: "Surena", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: false,
				note: "Diyarbakir (2308) stands in for Carrhae/Harran.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "pacorusParthianInvasion",
		name: "Parthian invasion of the Roman East",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "ROM",
		warGoalProvince: "377",
		attacker: ["PRT"],
		defender: ["ROM"],
		start: d(40),
		end: d(38),
		note: "Pacorus and Labienus invade Syria and Asia Minor before Roman counteroffensives.",
		battles: [
			battle({
				year: 38,
				name: "Battle of Mount Gindarus",
				locationProvinceId: "377",
				attacker: { country: "ROM", commander: "Publius Ventidius Bassus", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "PRT", commander: "Pacorus I", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Aleppo (377) stands in for Cyrrhestica/Mount Gindarus.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "hanXiongnuWar",
		name: "Han-Xiongnu War",
		casusBelli: "cb_border_war",
		warGoalType: "take_province",
		warGoalTag: "XIO",
		warGoalProvince: "701",
		attacker: ["HND"],
		defender: ["XIO"],
		start: d(133),
		end: d(60),
		note: "Emperor Wu and successors wage sustained campaigns that push Xiongnu power back from the Ordos, Hexi corridor, and Tarim approaches.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 119,
				name: "Battle of Mobei",
				locationProvinceId: "2190",
				attacker: { country: "HND", commander: "Wei Qing and Huo Qubing", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "XIO", commander: "Yizhixie Chanyu", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Qaraqorum (2190) stands in for the northern desert/steppe theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "xiongnuDefeatOfYuezhi",
		name: "Xiongnu defeat of the Yuezhi",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_yuezhi",
		warGoalProvince: "708",
		attacker: ["XIO"],
		defender: ["cp_yuezhi"],
		start: d(176),
		end: d(162),
		note: "Laoshang Chanyu defeats the Yuezhi and pushes them westward; companion to the existing Yuezhi audit.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "wusunYuezhiWar",
		name: "Wusun-Yuezhi war",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_yuezhi",
		warGoalProvince: "461",
		attacker: ["WUS"],
		defender: ["cp_yuezhi"],
		start: d(160),
		end: d(130),
		note: "Wusun pressure, under Xiongnu patronage and then Han diplomacy, helps displace Yuezhi from the Ili/Zhetysu region.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "zhizhiCampaign",
		name: "Han-Wusun campaign against Zhizhi Chanyu",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "XIO",
		warGoalProvince: "2368",
		attacker: ["HND", "WUS"],
		defender: ["XIO"],
		start: d(36),
		end: d(36),
		note: "Han forces and Central Asian allies destroy Zhizhi Chanyu's western Xiongnu base near the Talas region.",
		battles: [
			battle({
				year: 36,
				name: "Battle of Zhizhi",
				locationProvinceId: "2368",
				attacker: { country: "HND", commander: "Chen Tang and Gan Yanshou", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "XIO", commander: "Zhizhi Chanyu", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Karamegdan (2368) stands in for the Talas-region battlefield.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
]

const revolts = {
	"437": {
		events: [
			revoltEvent({
				year: 247,
				type: "particularist_rebels",
				size: 4,
				leader: "Arsaces I",
				comment: "Parthian revolt against Seleucid authority",
				note: "Companion revolt marker for Arsacid seizure of Parthia before the conflict expands into an interstate war.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"719": {
		events: [
			revoltEvent({
				year: 58,
				type: "pretender_rebels",
				size: 4,
				leader: "Huhanye and Zhizhi",
				comment: "Xiongnu succession split",
				note: "Civil conflict between Xiongnu claimants divides the confederation into Han-aligned and western factions.",
			}),
		],
	},
	"461": {
		events: [
			revoltEvent({
				year: 60,
				type: "pretender_rebels",
				size: 2,
				comment: "Wusun Kunmi succession conflict",
				note: "Han-mediated Wusun succession disputes divide greater and lesser Kunmi lines; no separate tag exists.",
				sourceConfidence: "abstraction",
			}),
		],
	},
}

const heritageAudit = [
	{
		id: "mongolic",
		name: "Mongolic",
		cultures: [
			{
				id: "xiongnu",
				name: "Xiongnu",
				primaryTag: "XIO",
				color: [150, 86, 74],
			},
		],
	},
	{
		id: "iranian",
		name: "Iranian",
		cultures: [
			{
				id: "wusun",
				name: "Wusun",
				primaryTag: "WUS",
				color: [132, 154, 94],
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

const builders = [parthia, xiongnu, wusun]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "parthia-xiongnu-wusun-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for Parthia, Xiongnu, and Wusun. Mirrors events/wars.json's schema plus note/sourceConfidence fields. cp_dayuan intentionally excluded.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "parthia-xiongnu-wusun-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for Parthia, Xiongnu, and Wusun. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(path.join(heritagesDir, "parthia-xiongnu-wusun-heritages.json"), JSON.stringify(heritageAudit, null, "\t") + "\n")

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts, and ${heritageAudit.reduce((sum, group) => sum + group.cultures.length, 0)} heritage cultures`)
