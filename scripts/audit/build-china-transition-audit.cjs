// One-off generator for the China transition pre-2AD audit batch.
// Writes nation audit files plus a shared wars file:
//   - public/earth-history/audits/cp_zhou_dynasty.json
//   - public/earth-history/audits/cp_qin_dynasty.json
//   - public/earth-history/audits/cp_western_chu.json
//   - public/earth-history/audits/cp_han.json
//   - public/earth-history/audits/cp_zhai.json
//   - public/earth-history/audits/cp_chang_shan.json
//   - public/earth-history/audits/cp_jibei.json
//   - public/earth-history/audits/cp_liaodong.json
//   - public/earth-history/audits/cp_linjiang.json
//   - public/earth-history/audits/cp_nanyue.json
//   - public/earth-history/audits/cp_minyue.json
//   - public/earth-history/audits/wars/china-transition-wars.json
// Follows scripts/audit/ancient-nation-audit-prompt.md methodology; dates use real
// historical BCE years and project day encoding (day 0 = 2 AD Jan 1).
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

function nationBuilder(tag) {
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
	return { tag, events, ruler, govChange, reformAdd }
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
	for (const tag of attacker) {
		events.push({ date: start, nationTag: tag, kind: "warStart", side: "attacker" })
	}
	for (const tag of defender) {
		events.push({ date: start, nationTag: tag, kind: "warStart", side: "defender" })
	}
	for (const tag of attacker) {
		events.push({ date: end, nationTag: tag, kind: "warEnd", side: "attacker" })
	}
	for (const tag of defender) {
		events.push({ date: end, nationTag: tag, kind: "warEnd", side: "defender" })
	}
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

const readme =
	"Audit/proposal file: reconstructed pre-2AD events for the China transition batch: Zhou, Qin, Chu-Han successor polities, Nanyue, and Minyue. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Dates use real historical BCE years. Early Western Zhou chronology, Eighteen Kingdoms allocations, and southern Yue succession details are marked sourceConfidence: 'abstraction' where the source record or local tag coverage is thin."

// =======================================================================
// ZHOU DYNASTY (cp_zhou_dynasty)
// =======================================================================
const zhou = nationBuilder("cp_zhou_dynasty")
zhou.govChange(1046, "monarchy", "Approximate foundation of the Zhou dynasty after the conquest of Shang at Muye")
zhou.reformAdd(1046, "celestial_empire", "Reuses the existing Chinese imperial/royal reform id for the Son of Heaven model; Western Zhou was not yet the later bureaucratic empire", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[1046, "King Wu of Zhou", "Founder of Zhou royal rule after defeating Shang; 1046 BC follows the common Xia-Shang-Zhou chronology", "abstraction"],
	[1043, "King Cheng of Zhou", "Early Western Zhou king under the Duke of Zhou's regency; exact early dates are reconstructed", "abstraction"],
	[1021, "King Kang of Zhou", "Western Zhou king associated with the stable Cheng-Kang period", "abstraction"],
	[996, "King Zhao of Zhou", "Western Zhou king traditionally said to have died during southern campaigns", "abstraction"],
	[976, "King Mu of Zhou", "Long-reigned Western Zhou king prominent in later tradition", "abstraction"],
	[922, "King Gong of Zhou", "Western Zhou king in the middle royal sequence", "abstraction"],
	[900, "King Yih of Zhou", "Western Zhou king; early chronology varies by source", "abstraction"],
	[892, "King Xiao of Zhou", "Western Zhou king; early chronology varies by source", "abstraction"],
	[886, "King Yi of Zhou", "Western Zhou king; early chronology varies by source", "abstraction"],
	[877, "King Li of Zhou", "His harsh rule led to exile and the Gonghe Regency"],
	[841, "Gonghe Regency", "Interregnum after King Li's exile; 841 BC is the first securely annualized date in traditional Chinese chronology"],
	[828, "King Xuan of Zhou", "Restored Zhou royal authority after the Gonghe Regency"],
	[781, "King You of Zhou", "Last Western Zhou king; killed when Quanrong forces sacked Haojing"],
	[770, "King Ping of Zhou", "Moved the royal capital east to Luoyang, beginning the Eastern Zhou period"],
	[720, "King Huan of Zhou", "Eastern Zhou king in an era of declining royal authority"],
	[697, "King Zhuang of Zhou", "Eastern Zhou king during early Spring and Autumn fragmentation"],
	[682, "King Xi of Zhou", "Eastern Zhou king in the Spring and Autumn period"],
	[677, "King Hui of Zhou", "Eastern Zhou king; reign marked by court factional conflict"],
	[651, "King Xiang of Zhou", "Eastern Zhou king whose reign overlapped the hegemony of Duke Huan of Qi and Duke Wen of Jin"],
	[619, "King Qing of Zhou", "Eastern Zhou king; royal power remained mostly ceremonial"],
	[612, "King Kuang of Zhou", "Eastern Zhou king in the mid-Spring and Autumn period"],
	[606, "King Ding of Zhou", "Eastern Zhou king during continued weakening of central royal authority"],
	[585, "King Jian of Zhou", "Eastern Zhou king in the late Spring and Autumn period"],
	[571, "King Ling of Zhou", "Eastern Zhou king; regional states dominated policy"],
	[544, "King Jing of Zhou", "Eastern Zhou king; succession conflict followed his death"],
	[520, "King Dao of Zhou", "Brief Eastern Zhou ruler during a succession crisis"],
	[519, "King Jing of Zhou", "Restored Eastern Zhou king after the succession crisis"],
	[476, "King Yuan of Zhou", "Late Spring and Autumn / early Warring States transition ruler"],
	[468, "King Zhending of Zhou", "Eastern Zhou king during the transition into the Warring States period"],
	[441, "King Ai of Zhou", "Brief Eastern Zhou ruler"],
	[441, "King Si of Zhou", "Brief Eastern Zhou ruler in a disputed succession year"],
	[440, "King Kao of Zhou", "Eastern Zhou king; royal domain was increasingly marginal"],
	[425, "King Weilie of Zhou", "Recognized Han, Zhao, and Wei as legitimate states, conventionally marking Warring States transition"],
	[401, "King An of Zhou", "Eastern Zhou king during the mature Warring States period"],
	[375, "King Lie of Zhou", "Eastern Zhou king; regional states overshadowed the royal house"],
	[368, "King Xian of Zhou", "Eastern Zhou king during expanding Qin, Chu, Qi, Wei, Zhao, Yan, and Han competition"],
	[320, "King Shenjing of Zhou", "Late Eastern Zhou king in the Warring States period"],
	[314, "King Nan of Zhou", "Last Zhou king; Qin ended the remaining royal domain in 256 BC"],
]) {
	zhou.ruler(year, name, { dynasty: "Zhou", note, sourceConfidence: confidence })
}

// =======================================================================
// QIN STATE / DYNASTY (cp_qin_dynasty)
// =======================================================================
const qin = nationBuilder("cp_qin_dynasty")
qin.govChange(361, "monarchy", "Duke Xiao begins the Shang Yang reform era that transformed Qin into the leading Warring States power")
qin.reformAdd(361, "celestial_empire", "Reuses the existing Chinese imperial reform id; Qin only became an empire in 221 BC but the local tag covers the late state and dynasty", "abstraction")
for (const [year, name, note] of [
	[361, "Duke Xiao of Qin", "Patron of Shang Yang's Legalist reforms and Qin state strengthening"],
	[338, "King Huiwen of Qin", "First Qin ruler to use the title king; expanded Qin into Sichuan and against neighboring states"],
	[310, "King Wu of Qin", "Short-reigned Qin king after Huiwen"],
	[306, "King Zhaoxiang of Qin", "Long-reigned Qin ruler whose reign included major victories over rival Warring States powers"],
	[250, "King Xiaowen of Qin", "Brief Qin ruler between Zhaoxiang and Zhuangxiang"],
	[249, "King Zhuangxiang of Qin", "Father of Ying Zheng; ruled during Qin's late Warring States expansion"],
	[247, "Ying Zheng", "Became king of Qin as a minor before completing the conquest of the Warring States"],
	[221, "Qin Shi Huang", "Ying Zheng adopts the imperial title after unifying China"],
	[210, "Qin Er Shi", "Second Qin emperor; reign marked by court intrigue and empire-wide rebellions"],
	[207, "Ziying", "Last Qin ruler; surrendered to Liu Bang before Xiang Yu destroyed the Qin capital regime"],
]) {
	qin.ruler(year, name, { dynasty: "Qin", note })
}
qin.reformAdd(221, "chinese_imperial_bureaucracy", "Proposed new reform id: Qin's commandery-county empire, standardization projects, and emperor-centered Legalist administration differ from the older royal order", "abstraction")

// =======================================================================
// CHU-HAN AND EIGHTEEN KINGDOMS TAGS
// =======================================================================
const westernChu = nationBuilder("cp_western_chu")
westernChu.govChange(206, "monarchy", "Xiang Yu divides the former Qin realm and takes the hegemon-king title as Western Chu's ruler")
westernChu.reformAdd(206, "aristocratic_monarchy", "Reuses an existing monarchy reform id for Xiang Yu's aristocratic military kingship", "abstraction")
westernChu.ruler(206, "Xiang Yu", {
	dynasty: "Xiang",
	note: "Hegemon-King of Western Chu; dominant anti-Qin commander until defeated by Liu Bang in the Chu-Han Contention",
})

const han = nationBuilder("cp_han")
han.govChange(206, "monarchy", "Liu Bang receives the Kingdom of Han in the Eighteen Kingdoms settlement")
han.reformAdd(206, "celestial_empire", "Reuses the existing Chinese imperial reform id because this tag transitions from Liu Bang's Han kingdom into the Han imperial state", "abstraction")
for (const [year, name, note] of [
	[206, "Liu Bang, King of Han", "Assigned Han by Xiang Yu after the Qin collapse"],
	[202, "Emperor Gaozu of Han", "Liu Bang founds the Han dynasty after victory over Xiang Yu at Gaixia"],
	[195, "Emperor Hui of Han", "Second Han emperor; real power was increasingly held by Empress Dowager Lu"],
	[188, "Empress Dowager Lu", "Dominant regent after Emperor Hui; child emperors Qianshao and Houshao ruled under her control"],
	[180, "Emperor Wen of Han", "Chosen after the fall of the Lu clan; his reign began the Wen-Jing stabilization period"],
	[157, "Emperor Jing of Han", "Han emperor who suppressed the Rebellion of the Seven States"],
	[141, "Emperor Wu of Han", "Expansionist Han emperor whose reign included campaigns against Xiongnu, Minyue, and Nanyue"],
	[87, "Emperor Zhao of Han", "Minor emperor under Huo Guang's regency"],
	[74, "Emperor Xuan of Han", "Restored stronger imperial authority after Huo Guang's regency"],
	[49, "Emperor Yuan of Han", "Western Han emperor during increasing Confucian court influence"],
	[33, "Emperor Cheng of Han", "Western Han emperor during expanding Wang clan influence"],
	[7, "Emperor Ai of Han", "Late Western Han emperor before the Wang Mang regency crisis"],
]) {
	han.ruler(year, name, { dynasty: "Han", note })
}

const zhai = nationBuilder("cp_zhai")
zhai.govChange(206, "monarchy", "Dong Yi receives Zhai, one of the Three Qins/Eighteen Kingdoms, from Xiang Yu")
zhai.reformAdd(206, "aristocratic_monarchy", "Reuses an existing monarchy reform id for the short-lived Eighteen Kingdoms settlement", "abstraction")
zhai.ruler(206, "Dong Yi", {
	dynasty: "Dong",
	note: "Former Qin general made King of Zhai; defeated as Liu Bang broke out from Han into the Guanzhong region",
})

const changShan = nationBuilder("cp_chang_shan")
changShan.govChange(206, "monarchy", "Zhang Er receives Changshan in Xiang Yu's Eighteen Kingdoms settlement")
changShan.reformAdd(206, "aristocratic_monarchy", "Reuses an existing monarchy reform id for an Eighteen Kingdoms successor polity", "abstraction")
changShan.ruler(206, "Zhang Er", {
	dynasty: "Zhang",
	note: "Former Zhao-aligned leader made King of Changshan; soon became aligned with Han during the Chu-Han struggle",
})

const jibei = nationBuilder("cp_jibei")
jibei.govChange(206, "monarchy", "Tian An receives Jibei in Xiang Yu's Eighteen Kingdoms settlement")
jibei.reformAdd(206, "aristocratic_monarchy", "Reuses an existing monarchy reform id for an Eighteen Kingdoms successor polity", "abstraction")
jibei.ruler(206, "Tian An", {
	dynasty: "Tian",
	note: "King of Jibei after the Qin collapse; one of several short-lived Qi-region successor kings",
})

const liaodong = nationBuilder("cp_liaodong")
liaodong.govChange(206, "monarchy", "Han Guang is moved from Yan to Liaodong in the Eighteen Kingdoms settlement")
liaodong.reformAdd(206, "aristocratic_monarchy", "Reuses an existing monarchy reform id for an Eighteen Kingdoms successor polity", "abstraction")
liaodong.ruler(206, "Han Guang", {
	dynasty: "Han",
	note: "Former King of Yan reassigned to Liaodong by Xiang Yu; killed after conflict with Zang Tu",
})

const linjiang = nationBuilder("cp_linjiang")
linjiang.govChange(206, "monarchy", "Gong Ao receives Linjiang in Xiang Yu's Eighteen Kingdoms settlement")
linjiang.reformAdd(206, "aristocratic_monarchy", "Reuses an existing monarchy reform id for an Eighteen Kingdoms successor polity", "abstraction")
linjiang.ruler(206, "Gong Ao", {
	dynasty: "Gong",
	note: "King of Linjiang after the Qin collapse; the kingdom survived briefly as a Chu-aligned successor state",
})
linjiang.ruler(204, "Gong Wei", {
	dynasty: "Gong",
	note: "Son of Gong Ao; killed or captured when Han forces eliminated Linjiang around 202 BC",
	sourceConfidence: "abstraction",
})

// =======================================================================
// SOUTHERN YUE STATES
// =======================================================================
const nanyue = nationBuilder("cp_nanyue")
nanyue.govChange(204, "monarchy", "Zhao Tuo breaks from the collapsing Qin south and founds Nanyue around Panyu/Guangzhou")
nanyue.reformAdd(204, "aristocratic_monarchy", "Reuses an existing monarchy reform id for the Qin-commandery successor kingdom in Lingnan", "abstraction")
for (const [year, name, note] of [
	[204, "Zhao Tuo", "Founder of Nanyue; former Qin commander who ruled Guangdong, Guangxi, and northern Vietnam"],
	[137, "Zhao Mo", "Second Nanyue ruler, usually identified as Zhao Tuo's grandson"],
	[122, "Zhao Yingqi", "Nanyue ruler who had spent time at the Han court before taking the throne"],
	[115, "Zhao Xing", "Young Nanyue king whose pro-Han court faction triggered internal conflict"],
	[112, "Zhao Jiande", "Last Nanyue ruler; installed by Lu Jia's anti-Han faction before Han conquest"],
]) {
	nanyue.ruler(year, name, { dynasty: "Zhao", note })
}

const minyue = nationBuilder("cp_minyue")
minyue.govChange(202, "monarchy", "Liu Bang recognizes Zou Wuzhu as King of Minyue after the Qin collapse")
minyue.reformAdd(202, "aristocratic_monarchy", "Reuses an existing monarchy reform id for the Yue royal house in Fujian", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[202, "Zou Wuzhu", "Recognized by Han as King of Minyue for aid during the anti-Qin and Chu-Han conflicts"],
	[192, "Zou Yao", "Recognized as King of Dong'ou, a related Yue polity north of Minyue", "abstraction"],
	[138, "Minyue ruler Ying", "Invaded Dong'ou, prompting Han intervention; name and title vary in summaries", "abstraction"],
	[135, "Zou Yushan", "Minyue ruler involved in war against Nanyue and later Han intervention", "abstraction"],
	[111, "Zou Jugu", "Eastern Yue claimant under Han pressure during the final campaigns against Minyue/Dongyue", "abstraction"],
]) {
	minyue.ruler(year, name, { dynasty: "Zou", note, sourceConfidence: confidence })
}

// =======================================================================
// WARS
// =======================================================================
const wars = [
	war({
		warId: "qinConquestOfZhou",
		name: "Qin Conquest of Zhou",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_zhou_dynasty",
		attacker: ["cp_qin_dynasty"],
		defender: ["cp_zhou_dynasty"],
		start: d(256),
		end: d(256, 1, 2),
		note: "Qin ends the remaining Zhou royal domain. The wider Qin unification wars against Han, Zhao, Wei, Chu, Yan, and Qi are noted in the Qin audit but not fully modeled because distinct valid Warring States tags are not available in this local tag set.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "qinUnificationWars",
		name: "Qin Unification Wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "685",
		attacker: ["cp_qin_dynasty"],
		defender: ["cp_zhou_dynasty"],
		start: d(230),
		end: d(221),
		note: "Broad placeholder for Qin's sequential conquests of the six major Warring States, ending with Qi in 221 BC. The defender uses cp_zhou_dynasty as the only broad pre-Qin China tag available; this should be split if Han/Zhao/Wei/Chu/Yan/Qi state tags are added.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "qinCampaignsAgainstYue",
		name: "Qin Campaigns Against the Yue",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "667",
		attacker: ["cp_qin_dynasty"],
		defender: ["cp_minyue"],
		start: d(219),
		end: d(214),
		note: "Qin campaigns south into Yue/Lingnan territories before establishing commanderies; Minyue stands in for the valid Yue-region tag available in the dataset.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 214,
				name: "Lingnan commandery conquest",
				locationProvinceId: "667",
				attacker: { country: "cp_qin_dynasty", commander: "Qin southern armies", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_minyue", commander: "Yue defenders", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Guangzhou (667) stands in for Panyu/Lingnan. Exact battle details are not preserved in this dataset-friendly form.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "fallOfQin",
		name: "Fall of Qin",
		casusBelli: "cb_independence_war",
		warGoalType: "annex_country",
		warGoalTag: "cp_qin_dynasty",
		attacker: ["cp_western_chu", "cp_han"],
		defender: ["cp_qin_dynasty"],
		start: d(209),
		end: d(206),
		note: "Anti-Qin rebellions culminate in Xiang Yu's victory at Julu and Liu Bang's entry into the Guanzhong/Xianyang region. Represented as a coalition because both Western Chu and Han tags exist.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 207,
				name: "Battle of Julu",
				locationProvinceId: "696",
				attacker: { country: "cp_western_chu", commander: "Xiang Yu", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_qin_dynasty", commander: "Zhang Han / Wang Li", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Handan (696) stands in for the Zhao/Julu theater in Hebei.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 206,
				name: "Surrender of Ziying",
				locationProvinceId: "700",
				attacker: { country: "cp_han", commander: "Liu Bang", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_qin_dynasty", commander: "Ziying", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Shaanxi (700) stands in for the Qin heartland and Xianyang approaches.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "hanConquestOfThreeQins",
		name: "Han Conquest of the Three Qins",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "700",
		attacker: ["cp_han"],
		defender: ["cp_zhai"],
		start: d(206),
		end: d(205),
		note: "Liu Bang breaks out of Hanzhong and defeats the Qin successor kings in Guanzhong. Zhai is the valid local Three Qins tag in this batch; Yong and Sai do not have separate tags in the identified local footprint.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 206,
				name: "Guanzhong campaign",
				locationProvinceId: "4198",
				attacker: { country: "cp_han", commander: "Han Xin / Liu Bang", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_zhai", commander: "Dong Yi", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Fengxiang (4198) and Shaanxi (700) cover the Guanzhong theater; this abstracts the Three Qins sequence.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "chuHanContention",
		name: "Chu-Han Contention",
		casusBelli: "cb_unification_war",
		warGoalType: "annex_country",
		warGoalTag: "cp_western_chu",
		attacker: ["cp_han"],
		defender: ["cp_western_chu"],
		start: d(206),
		end: d(202),
		note: "Civil war between Liu Bang's Han and Xiang Yu's Western Chu after the Qin collapse. Ends with Han victory and the foundation of the Han dynasty.",
		battles: [
			battle({
				year: 205,
				name: "Battle of Pengcheng",
				locationProvinceId: "2141",
				attacker: { country: "cp_western_chu", commander: "Xiang Yu", infantry: null, cavalry: 30000, artillery: null, losses: null },
				defender: { country: "cp_han", commander: "Liu Bang", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Xuzhou (2141) stands in for Pengcheng. Ancient sources give dramatic force ratios and losses, so only the famous Chu cavalry figure is retained.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 204,
				name: "Battle of Jingxing",
				locationProvinceId: "4195",
				attacker: { country: "cp_han", commander: "Han Xin", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_chang_shan", commander: "Zhao Xie / Chen Yu", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Zhending (4195) stands in for the Zhao/Changshan theater. Included inside the Chu-Han war because local event schema does not model nested fronts.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 202,
				name: "Battle of Gaixia",
				locationProvinceId: "2143",
				attacker: { country: "cp_han", commander: "Liu Bang / Han Xin", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_western_chu", commander: "Xiang Yu", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Fengyang (2143) stands in for Gaixia in modern Anhui; the battle ended Western Chu.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "hanConquestOfLinjiang",
		name: "Han Conquest of Linjiang",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_linjiang",
		attacker: ["cp_han"],
		defender: ["cp_linjiang"],
		start: d(203),
		end: d(202),
		note: "Han forces eliminate the Chu-aligned Linjiang kingdom near the end of the Chu-Han Contention.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "hanConquestOfNanyue",
		name: "Han Conquest of Nanyue",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_nanyue",
		attacker: ["cp_han"],
		defender: ["cp_nanyue"],
		start: d(112),
		end: d(111),
		note: "Emperor Wu's armies conquer Nanyue after the Zhao Xing/Lu Jia crisis, incorporating Lingnan and northern Vietnam into Han commanderies.",
		battles: [
			battle({
				year: 111,
				name: "Fall of Panyu",
				locationProvinceId: "667",
				attacker: { country: "cp_han", commander: "Lu Bode / Yang Pu", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_nanyue", commander: "Zhao Jiande / Lu Jia", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Guangzhou (667) stands in for Panyu, Nanyue's capital.",
				sourceConfidence: "traditional",
			}),
		],
	}),
	war({
		warId: "hanCampaignsAgainstMinyue",
		name: "Han Campaigns Against Minyue",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_minyue",
		attacker: ["cp_han"],
		defender: ["cp_minyue"],
		start: d(138),
		end: d(110),
		note: "Han interventions against Minyue/Dong'ou after Minyue attacks Dong'ou and Nanyue, ending with the destruction or forced relocation of the Minyue polity around 111-110 BC.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 135,
				name: "Minyue-Nanyue crisis",
				locationProvinceId: "669",
				attacker: { country: "cp_han", commander: "Wang Hui / Han expeditionary commanders", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_minyue", commander: "Zou Yushan", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Fuzhou (669) stands in for the Minyue heartland; Han pressure and internal coups resolved the campaign.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 110,
				name: "Final Han suppression of Minyue",
				locationProvinceId: "669",
				attacker: { country: "cp_han", commander: "Han expeditionary commanders", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_minyue", commander: "Minyue/Dongyue rulers", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "The final suppression is represented at Fuzhou (669), with sparse detail because the campaign is better attested as a political-military collapse than a single battle.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
]

function writeNation(builder) {
	fs.writeFileSync(
		path.join(auditsDir, `${builder.tag}.json`),
		JSON.stringify(
			{
				_readme: readme,
				tag: builder.tag,
				events: builder.events.sort((a, b) => a.date - b.date),
			},
			null,
			"\t",
		) + "\n",
	)
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
fs.mkdirSync(warsDir, { recursive: true })

for (const builder of [
	zhou,
	qin,
	westernChu,
	han,
	zhai,
	changShan,
	jibei,
	liaodong,
	linjiang,
	nanyue,
	minyue,
]) {
	writeNation(builder)
}

wars.sort((a, b) => a.events[0].date - b.events[0].date)
fs.writeFileSync(
	path.join(warsDir, "china-transition-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: wars for the China transition batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields for review. Not wired into the engine.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote 11 nation files and ${wars.length} wars`)
