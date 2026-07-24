// One-off generator for the Shang / Spring and Autumn / Warring States / early Han-remnant pre-2AD audit batch.
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

function mergeProvinceEvents(...maps) {
	const out = {}
	for (const map of maps) {
		for (const [provinceId, events] of Object.entries(map)) {
			if (!out[provinceId]) out[provinceId] = []
			out[provinceId].push(...events)
		}
	}
	return out
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
	"Audit/proposal file: reconstructed pre-2AD events for Shang, Spring and Autumn, Warring States, Qin state/dynasty tag, Han dynasty tag, and short-lived early Han regional remnants. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. This complements scripts/audit/build-china-transition-audit.cjs, which already covers cp_zhou_dynasty, cp_qin_dynasty, cp_han, Western Chu, and selected Eighteen Kingdoms cp_* tags. ProvinceEvents reuse existing Chinese culture/religion ids where adequate and propose only narrow ancient audit cultures for Shang, Chu, Qin, and Yue."

const imperialReform = "celestial_empire"
const bureaucracyReform = "confucian_bureaucracy"
const monarchyReform = "autocracy_reform"

function addCore(builder, year, reformId = monarchyReform, governmentType = "monarchy") {
	builder.govChange(year, governmentType, `${builder.tag} enters the pre-2AD owner-history footprint as a Chinese royal or regional state.`)
	builder.reformAdd(year, reformId, `Reuses ${reformId} for ancient Chinese court administration or royal rule.`)
}

function makeState(tag, startYear, dynasty, rulers, provinceEvents = null, reformId = monarchyReform) {
	const builder = nationBuilder(tag, { provinceEvents })
	addCore(builder, startYear, reformId)
	for (const row of rulers) {
		const [year, name, note, sourceConfidence = "traditional"] = row
		builder.ruler(year, name, { dynasty, note, sourceConfidence })
	}
	return builder
}

const shang = makeState(
	"cp_shang_dynasty",
	1600,
	"Shang",
	[
		[1600, "Tang of Shang", "Traditional founder of Shang after overthrowing Xia; exact date is reconstructed", "abstraction"],
		[1500, "Early Shang kings", "Placeholder for early Shang royal succession before the Anyang oracle-bone phase", "abstraction"],
		[1300, "Pan Geng", "Associated with the move to Yin/Anyang in the late Shang chronology"],
		[1250, "Wu Ding", "Best-attested powerful late Shang king in oracle-bone records"],
		[1200, "Fu Hao regency marker", "Fu Hao is represented as a court/military figure during Wu Ding's era rather than as sovereign", "abstraction"],
		[1075, "Di Yi", "Late Shang king before the final reign"],
		[1075, "Di Xin", "Last Shang king, defeated by Zhou at Muye"],
	],
	cultureEvents(["691", "692", "2137", "2140", "4195"], 1600, "shang", "Proposes shang culture for the Anyang/North China Shang footprint; existing regional cultures are later Chinese dialect-zone labels."),
	imperialReform,
)

const chu = makeState(
	"CHC",
	770,
	"Chu",
	[
		[770, "Viscounts of Chu", "Early Spring and Autumn Chu rulers before royal title; dates approximate", "abstraction"],
		[704, "King Wu of Chu", "First Chu ruler to assume the title king"],
		[690, "King Wen of Chu", "Expanded Chu power in the Han River region"],
		[613, "King Zhuang of Chu", "One of the Five Hegemons in later tradition"],
		[540, "King Ling of Chu", "Ambitious ruler during late Spring and Autumn conflict"],
		[515, "King Zhao of Chu", "Reigned during Wu's invasion and sack of Ying"],
		[488, "King Hui of Chu", "Restores Chu power after Wu pressure"],
		[329, "King Wei of Chu", "Warring States ruler during Chu's late expansion"],
		[298, "King Huai of Chu", "Captured by Qin after diplomatic and military defeats"],
		[262, "King Kaolie of Chu", "Late Warring States Chu king during Qin expansion"],
		[223, "King Fuchu of Chu", "Last Chu king before Qin conquest"],
	],
	cultureEvents(
		["682", "684", "685", "686", "687", "688", "1821", "1822", "1836", "1838", "2140", "2141", "2142", "2143", "2144", "2145", "2146", "2147", "2171", "2172", "2175", "2176", "4196", "4197"],
		770,
		"chu",
		"Proposes chu culture for the southern Zhou/Warring States Chu sphere; existing province cultures mix later Wu, Jianghuai, Zhongyuan, and Xiang labels.",
	),
	imperialReform,
)

const jinState = makeState("cp_state_of_jin", 770, "Jin", [
	[770, "Marquesses of Jin", "Early Spring and Autumn Jin rulers; early list is compressed for audit scale", "abstraction"],
	[636, "Duke Wen of Jin", "Returned from exile and became a leading hegemon"],
	[632, "Duke Wen after Chengpu", "Jin hegemony established after victory over Chu at Chengpu"],
	[607, "Duke Ling of Jin", "Ruler during internal noble conflict"],
	[573, "Duke Dao of Jin", "Restored Jin influence in late Spring and Autumn politics"],
	[453, "Jin partition crisis", "Zhao, Wei, and Han destroy Zhi power, effectively partitioning Jin"],
	[376, "Marquis Jing of Jin", "Last Jin ruler before formal partition by Zhao, Wei, and Han"],
])

const cai = makeState("cp_cai", 770, "Cai", [
	[770, "Marquesses of Cai", "Small Zhou-lineage state in the central plains; individual early dates are compressed", "abstraction"],
	[531, "Marquis Ling of Cai", "Cai ruler killed during Chu intervention"],
	[447, "Last Cai rulers", "Cai disappears into Chu dominance", "abstraction"],
])

const lu = makeState("cp_lu", 770, "Lu", [
	[770, "Dukes of Lu", "Zhou-lineage state centered in Shandong; early succession compressed", "abstraction"],
	[722, "Duke Yin of Lu", "Starting point of the Spring and Autumn Annals"],
	[694, "Duke Zhuang of Lu", "Lu ruler during early Qi-Lu conflicts"],
	[572, "Duke Xiang of Lu", "Ruler during late Spring and Autumn interstate meetings"],
	[505, "Duke Ding of Lu", "Ruler during Confucius's political career"],
	[256, "Last Lu rulers", "Lu is absorbed by Chu before Qin unification", "abstraction"],
])

const wey = makeState("cp_wey", 770, "Wey", [
	[770, "Dukes of Wey", "Small Zhou state around the Yellow River; early succession compressed", "abstraction"],
	[660, "Duke Dai of Wey", "Restored Wey after Di attack destroyed the old capital"],
	[493, "Duke Chu of Wey", "Ruler during Confucius-era succession conflict"],
	[254, "Lord Yuan of Wey", "Wey survives as a minor remnant under larger-state pressure", "abstraction"],
	[209, "Wey remnant lords", "Wey remnant persists into the Qin collapse era before disappearing", "abstraction"],
])

const qi = makeState("QIC", 770, "Qi", [
	[770, "Jiang Qi dukes", "Early Spring and Autumn Qi rulers", "abstraction"],
	[685, "Duke Huan of Qi", "First major hegemon under Guan Zhong's reforms"],
	[643, "Qi succession crisis", "Qi loses hegemony after Duke Huan's death", "abstraction"],
	[481, "Tian clan dominance", "Tian family takes effective power in Qi", "abstraction"],
	[386, "Duke Tai of Tian Qi", "Zhou recognition of Tian replacement of the Jiang house"],
	[319, "King Xuan of Qi", "Warring States ruler during Qi's cultural and political high point"],
	[284, "King Min of Qi", "Qi is devastated by the coalition led by Yan"],
	[221, "King Jian of Qi", "Last Qi ruler; surrendered to Qin"],
])

const qin = makeState(
	"QIN",
	770,
	"Qin",
	[
		[770, "Duke Xiang of Qin", "Qin receives western Zhou lands after escorting King Ping east"],
		[659, "Duke Mu of Qin", "Spring and Autumn hegemon in western China"],
		[361, "Duke Xiao of Qin", "Patron of Shang Yang's Legalist reforms"],
		[338, "King Huiwen of Qin", "First Qin ruler to claim royal title"],
		[306, "King Zhaoxiang of Qin", "Long-reigned Qin ruler during major Warring States conquests"],
		[260, "Qin after Changping", "Qin destroys Zhao's strategic power at Changping", "abstraction"],
		[247, "Ying Zheng", "King of Qin before imperial unification"],
		[221, "Qin Shi Huang", "Unifies the Warring States and takes the emperor title"],
		[210, "Qin Er Shi", "Second emperor during revolt and collapse"],
		[207, "Ziying", "Last Qin ruler before surrender to Liu Bang"],
	],
	mergeProvinceEvents(
		cultureEvents(["689", "700", "4198", "679", "680", "681", "701", "702", "2128"], 770, "qin", "Proposes qin culture for the western Qin core and early conquest base; later empire-wide Qin ownership should not erase local cultures everywhere."),
		cultureEvents(["682", "684", "685", "686", "687", "688", "1821", "1822", "1836", "1838", "2140", "2141", "2142", "2143", "2144", "2145", "2146", "2147", "2171", "2172", "2175", "2176", "4196", "4197"], 223, "chu", "Qin conquest did not immediately replace Chu regional identity; keeps Chu audit culture in former Chu provinces."),
	),
	imperialReform,
)

const song = makeState("cp_state_of_song", 770, "Song", [
	[770, "Dukes of Song", "Shang-descended Zhou state in the central plains; early rulers compressed", "abstraction"],
	[650, "Duke Xiang of Song", "Claimed hegemony but was defeated by Chu"],
	[546, "Song peace conference", "Song serves as neutral ground for interstate settlement", "abstraction"],
	[286, "King Kang of Song", "Last Song ruler before Qi, Chu, and Wei partitioned the state"],
])

const wu = makeState("cp_state_of_wu", 770, "Wu", [
	[770, "Lords of Wu", "Lower Yangtze state; early chronology compressed", "abstraction"],
	[585, "King Shoumeng of Wu", "First Wu ruler securely integrated into broader Spring and Autumn diplomacy"],
	[514, "King Helu of Wu", "Raised Wu to major-power status with Wu Zixu and Sun Wu in tradition"],
	[506, "Wu after Boju", "Wu sacks the Chu capital after the Battle of Boju", "abstraction"],
	[495, "King Fuchai of Wu", "Last major Wu king, defeated Yue before later Yue revenge"],
	[473, "Fall of Wu", "Yue conquers Wu under King Goujian", "abstraction"],
])

const yan = makeState("YAN", 770, "Yan", [
	[770, "Marquesses of Yan", "Northern Zhou state; early succession compressed", "abstraction"],
	[323, "King Yi of Yan", "Yan adopts royal title in the Warring States period"],
	[311, "King Zhao of Yan", "Rebuilds Yan and sponsors campaigns against Qi"],
	[284, "Yan coalition command", "Yan leads coalition that nearly destroys Qi", "abstraction"],
	[227, "Crown Prince Dan", "Sponsor of Jing Ke's assassination attempt against Ying Zheng"],
	[222, "King Xi of Yan", "Last Yan king before Qin conquest"],
])

const yue = makeState(
	"YUE",
	600,
	"Yue",
	[
		[600, "Kings of Yue", "Early Yue royal phase in the lower Yangtze; dates approximate", "abstraction"],
		[496, "King Goujian of Yue", "Defeated by Wu, later restored Yue and conquered Wu"],
		[473, "Goujian after Wu's fall", "Yue absorbs Wu and briefly becomes a hegemonic power", "abstraction"],
		[465, "King Luying of Yue", "Successor in the post-Goujian Yue line"],
		[333, "Fall of Yue", "Chu defeats Yue and breaks its central power", "abstraction"],
	],
	cultureEvents(["684", "685", "686", "1821", "1822", "2142", "2145", "2146", "2147", "4196"], 600, "yue_chinese", "Proposes yue_chinese culture for ancient Yue; existing Cantonese/Wu labels are later regional identities."),
	imperialReform,
)

const hanDynasty = makeState("HND", 202, "Han", [
	[202, "Emperor Gaozu of Han", "Liu Bang founds the Han dynasty after victory at Gaixia"],
	[195, "Emperor Hui of Han", "Second Han emperor under Empress Dowager Lu's influence"],
	[188, "Empress Dowager Lu", "Dominant regent of the Lu clan period"],
	[180, "Emperor Wen of Han", "Begins the Wen-Jing stabilization period"],
	[157, "Emperor Jing of Han", "Suppresses the Rebellion of the Seven States"],
	[141, "Emperor Wu of Han", "Major expansion into Korea, Vietnam, Central Asia, and against Xiongnu"],
	[87, "Emperor Zhao of Han", "Minor emperor under Huo Guang's regency"],
	[74, "Emperor Xuan of Han", "Restores effective imperial government"],
	[49, "Emperor Yuan of Han", "Late Western Han emperor"],
	[33, "Emperor Cheng of Han", "Wang family influence increases"],
	[7, "Emperor Ai of Han", "Late Western Han emperor inside the pre-2AD window"],
], null, bureaucracyReform)

const wei = makeState("cp_state_of_wei", 403, "Wei", [
	[403, "Marquess Wen of Wei", "Recognized as one of the three successor states of Jin"],
	[396, "Marquess Wu of Wei", "Continues Wei's early Warring States strength"],
	[369, "King Hui of Wei", "Major Wei ruler; moved capital to Daliang"],
	[341, "Wei after Maling", "Wei power declines after defeat by Qi at Maling", "abstraction"],
	[225, "King Jia of Wei", "Last Wei ruler before Qin floods Daliang and conquers the state"],
])

const zhao = makeState("ZAO", 403, "Zhao", [
	[403, "Marquess Lie of Zhao", "Recognized as one of the three successor states of Jin"],
	[325, "King Wuling of Zhao", "Introduced cavalry reforms and expanded Zhao power"],
	[260, "King Xiaocheng of Zhao", "Reigned during the disastrous Battle of Changping"],
	[228, "King Youmiu of Zhao", "Last main Zhao king before Qin conquest"],
	[222, "Jia of Dai", "Zhao remnant ruler in Dai before Qin conquest"],
])

const dai = makeState("DAX", 228, "Dai", [
	[228, "Jia of Dai", "Zhao royal remnant established at Dai after Qin captured Handan"],
	[222, "Fall of Dai", "Qin eliminates the final Zhao/Dai remnant", "abstraction"],
])

const henan = makeState("cp_henan", 206, "Henan", [
	[206, "Shen Yang", "King of Henan in Xiang Yu's Eighteen Kingdoms settlement"],
	[205, "Han absorption of Henan", "Henan quickly falls into Liu Bang's Han-aligned order", "abstraction"],
])

const jiaodong = makeState("cp_jiaodong", 206, "Jiaodong", [
	[206, "Tian Shi", "King of Jiaodong in the post-Qin settlement"],
	[205, "Tian Qi succession struggle", "Qi-region Eighteen Kingdoms conflict absorbs Jiaodong", "abstraction"],
])

const jiujiang = makeState("cp_jiujiang", 206, "Jiujiang", [
	[206, "Ying Bu", "King of Jiujiang under Xiang Yu, later defects to Han"],
	[203, "Ying Bu joins Han", "Jiujiang shifts toward Liu Bang during the Chu-Han Contention"],
	[196, "Ying Bu rebellion", "Ying Bu rebels against Han and is defeated"],
])

const yong = makeState("cp_yong", 206, "Yong", [
	[206, "Zhang Han", "Former Qin general made King of Yong by Xiang Yu"],
	[205, "Fall of Yong", "Liu Bang defeats the Three Qins in Guanzhong", "abstraction"],
])

const wars = [
	war({
		warId: "zhouConquestOfShang",
		name: "Zhou conquest of Shang",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_shang_dynasty",
		warGoalProvince: "692",
		attacker: ["cp_zhou_dynasty"],
		defender: ["cp_shang_dynasty"],
		start: d(1046),
		end: d(1046),
		note: "King Wu of Zhou defeats Shang at Muye; Zhou itself is covered in the prior China transition audit.",
		battles: [
			battle({
				year: 1046,
				name: "Battle of Muye",
				locationProvinceId: "692",
				attacker: { country: "cp_zhou_dynasty", commander: "King Wu of Zhou", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_shang_dynasty", commander: "Di Xin", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Huaiqing (692) stands in for the Muye/Anyang theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "battleOfChengpu",
		name: "Battle of Chengpu",
		casusBelli: "cb_hegemon",
		warGoalType: "take_province",
		warGoalTag: "CHC",
		warGoalProvince: "687",
		attacker: ["cp_state_of_jin"],
		defender: ["CHC"],
		start: d(632),
		end: d(632),
		note: "Jin defeats Chu and confirms Duke Wen's hegemony.",
		battles: [
			battle({
				year: 632,
				name: "Battle of Chengpu",
				locationProvinceId: "687",
				attacker: { country: "cp_state_of_jin", commander: "Duke Wen of Jin", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "CHC", commander: "Cheng Dechen", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Nanyang (687) stands in for the central-plains Chu-Jin theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "wuChuWar",
		name: "Wu-Chu war",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "CHC",
		warGoalProvince: "682",
		attacker: ["cp_state_of_wu"],
		defender: ["CHC"],
		start: d(506),
		end: d(505),
		note: "Wu invades Chu and sacks Ying after the Battle of Boju.",
		battles: [
			battle({
				year: 506,
				name: "Battle of Boju",
				locationProvinceId: "682",
				attacker: { country: "cp_state_of_wu", commander: "King Helu / Wu Zixu", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "CHC", commander: "Nang Wa", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Hanyang (682) stands in for the Chu heartland approach.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "yueConquestOfWu",
		name: "Yue conquest of Wu",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_state_of_wu",
		warGoalProvince: "684",
		attacker: ["YUE"],
		defender: ["cp_state_of_wu"],
		start: d(496),
		end: d(473),
		note: "Goujian of Yue recovers from defeat and conquers Wu.",
		battles: [
			battle({
				year: 494,
				name: "Battle of Fujiao",
				locationProvinceId: "684",
				attacker: { country: "cp_state_of_wu", commander: "King Fuchai", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "YUE", commander: "King Goujian", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Hangzhou (684) stands in for the lower Yangtze/Yue theater.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 473,
				name: "Fall of Wu",
				locationProvinceId: "685",
				attacker: { country: "YUE", commander: "King Goujian", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_state_of_wu", commander: "King Fuchai", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Yangzhou (685) stands in for Wu's final collapse.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "partitionOfJin",
		name: "Partition of Jin",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_state_of_jin",
		warGoalProvince: "696",
		attacker: ["cp_state_of_wei", "ZAO"],
		defender: ["cp_state_of_jin"],
		start: d(453),
		end: d(376),
		note: "Wei and Zhao, with Han not represented by a separate uncovered tag here, dismantle Jin authority.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "qiWeiWars",
		name: "Qi-Wei wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_state_of_wei",
		warGoalProvince: "696",
		attacker: ["QIC"],
		defender: ["cp_state_of_wei"],
		start: d(354),
		end: d(341),
		note: "Qi checks Wei expansion at Guiling and Maling.",
		battles: [
			battle({
				year: 354,
				name: "Battle of Guiling",
				locationProvinceId: "696",
				attacker: { country: "QIC", commander: "Sun Bin", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_state_of_wei", commander: "Pang Juan", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Handan (696) stands in for the Wei-Zhao-Qi theater.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 341,
				name: "Battle of Maling",
				locationProvinceId: "2137",
				attacker: { country: "QIC", commander: "Sun Bin", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_state_of_wei", commander: "Pang Juan", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Daming (2137) stands in for Maling.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "yanQiWar",
		name: "Yan-led coalition war against Qi",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "QIC",
		warGoalProvince: "691",
		attacker: ["YAN", "QIN", "cp_state_of_wei", "ZAO", "CHC"],
		defender: ["QIC"],
		start: d(284),
		end: d(279),
		note: "Yue Yi's coalition nearly destroys Qi before Qi recovers under Tian Dan.",
		battles: [
			battle({
				year: 284,
				name: "Battle of Jixi",
				locationProvinceId: "691",
				attacker: { country: "YAN", commander: "Yue Yi", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "QIC", commander: "King Min's forces", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Jinan (691) stands in for western Qi.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 279,
				name: "Defense of Jimo",
				locationProvinceId: "2139",
				attacker: { country: "QIC", commander: "Tian Dan", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "YAN", commander: "Yan occupation forces", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Shandong Bandao (2139) stands in for Jimo.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "qinZhaoWarChangping",
		name: "Qin-Zhao war and Changping",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "ZAO",
		warGoalProvince: "2178",
		attacker: ["QIN"],
		defender: ["ZAO"],
		start: d(262),
		end: d(260),
		note: "Qin destroys Zhao's main army at Changping.",
		battles: [
			battle({
				year: 260,
				name: "Battle of Changping",
				locationProvinceId: "2178",
				attacker: { country: "QIN", commander: "Bai Qi", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "ZAO", commander: "Zhao Kuo", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Lu'an (2178) is the closest province in the Zhao/Shangdang theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "qinUnificationWars",
		name: "Qin unification wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalTag: "QIN",
		warGoalProvince: "688",
		attacker: ["QIN"],
		defender: ["cp_state_of_wei", "ZAO", "YAN", "CHC", "QIC", "cp_state_of_wu", "YUE"],
		start: d(230),
		end: d(221),
		note: "Compresses Qin's final conquests of Han, Zhao, Wei, Chu, Yan, and Qi; Han as a Warring States state lacks a separate uncovered tag, so it is not listed as defender.",
		battles: [
			battle({
				year: 225,
				name: "Fall of Daliang",
				locationProvinceId: "688",
				attacker: { country: "QIN", commander: "Wang Ben", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_state_of_wei", commander: "King Jia", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Kaifeng (688) stands in for Daliang.",
			}),
			battle({
				year: 223,
				name: "Qin conquest of Chu",
				locationProvinceId: "682",
				attacker: { country: "QIN", commander: "Wang Jian", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "CHC", commander: "Xiang Yan", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Hanyang (682) stands in for the Chu heartland.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 221,
				name: "Surrender of Qi",
				locationProvinceId: "691",
				attacker: { country: "QIN", commander: "Wang Ben", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "QIC", commander: "King Jian", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Jinan (691) stands in for the final Qi surrender.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "threeQinsCampaign",
		name: "Liu Bang's campaign against the Three Qins",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_yong",
		warGoalProvince: "700",
		attacker: ["cp_han"],
		defender: ["cp_yong"],
		start: d(206),
		end: d(205),
		note: "Liu Bang breaks out of Hanzhong and defeats Zhang Han's Yong; cp_han is covered by the existing China transition audit.",
		battles: [],
	}),
	war({
		warId: "hanJiujiangRebellion",
		name: "Ying Bu's rebellion against Han",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_jiujiang",
		warGoalProvince: "1838",
		attacker: ["cp_jiujiang"],
		defender: ["HND"],
		start: d(196),
		end: d(195),
		note: "Ying Bu, former King of Jiujiang/Huainan, rebels against the Han imperial order.",
		battles: [],
	}),
]

const revolts = {
	"692": {
		events: [
			revoltEvent({
				year: 1042,
				type: "pretender_rebels",
				size: 3,
				comment: "Three Guards rebellion",
				note: "Shang loyalist and Zhou princely rebellion after King Wu's death; modeled as a revolt because the principal opposing dynastic tags are already represented in the conquest transition.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"379": {
		events: [
			revoltEvent({
				year: 209,
				type: "particularist_rebels",
				size: 5,
				leader: "Chen Sheng and Wu Guang",
				comment: "Dazexiang uprising",
				note: "First major anti-Qin uprising; exact province is a stand-in because the original site is outside this simplified footprint.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"1838": {
		events: [
			revoltEvent({
				year: 154,
				type: "noble_rebels",
				size: 5,
				comment: "Rebellion of the Seven States",
				note: "Large Han princely revolt against Emperor Jing's centralization; represented in the Yangtze/Huai region with no separate rebel state tags for all participants.",
				sourceConfidence: "abstraction",
			}),
		],
	},
}

const heritageAudit = [
	{
		id: "east_asian",
		name: "East Asian",
		cultures: [
			{
				id: "shang",
				name: "Shang",
				primaryTag: "cp_shang_dynasty",
				color: [93, 118, 138],
			},
			{
				id: "chu",
				name: "Chu",
				primaryTag: "CHC",
				color: [72, 132, 118],
			},
			{
				id: "qin",
				name: "Qin",
				primaryTag: "QIN",
				color: [88, 102, 154],
			},
			{
				id: "yue_chinese",
				name: "Yue",
				primaryTag: "YUE",
				color: [54, 142, 146],
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

const builders = [
	shang,
	chu,
	jinState,
	cai,
	lu,
	wey,
	qi,
	qin,
	song,
	wu,
	yan,
	yue,
	hanDynasty,
	wei,
	zhao,
	dai,
	henan,
	jiaodong,
	jiujiang,
	yong,
]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "china-warring-states-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the Shang / Spring and Autumn / Warring States / early Han-remnant batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields. Avoids duplicating the Zhou-Qin-Han transition wars already present in china-transition-wars.json where a more specific entry already exists.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "china-warring-states-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Shang / Spring and Autumn / Warring States / early Han-remnant batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(path.join(heritagesDir, "china-warring-states-heritages.json"), JSON.stringify(heritageAudit, null, "\t") + "\n")

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts, and ${heritageAudit.reduce((sum, group) => sum + group.cultures.length, 0)} heritage cultures`)
