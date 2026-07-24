// One-off generator for the Dayuan/Ferghana pre-2AD audit.
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

function event(year, kind, payload, note, sourceConfidence = "traditional") {
	return { date: d(year), kind, payload, note, sourceConfidence }
}

function provinceEvent(year, kind, payload, note, sourceConfidence = "abstraction") {
	return { date: d(year), kind, payload, note, sourceConfidence }
}

function battle({ year, name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence = "abstraction" }) {
	return { date: d(year), name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence }
}

function war({ warId, name, casusBelli, warGoalTag, warGoalProvince, attacker, defender, start, end, battles, note, sourceConfidence = "traditional" }) {
	const events = []
	for (const tag of attacker) events.push({ date: start, nationTag: tag, kind: "warStart", side: "attacker" })
	for (const tag of defender) events.push({ date: start, nationTag: tag, kind: "warStart", side: "defender" })
	for (const tag of attacker) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "attacker" })
	for (const tag of defender) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "defender" })
	return { warId, name, casusBelli, warGoalType: "take_province", warGoalTag, warGoalProvince, isRebel: false, events, battles, note, sourceConfidence }
}

const readme =
	"Audit/proposal file: Dayuan/Ferghana pre-2AD audit. This covers the ancient Central Asian polity represented by Cliopatria's Yuan slice in Ferghana/Arys and deliberately uses cp_dayuan instead of the medieval Yuan dynasty tag."

const nation = {
	_readme: readme,
	tag: "cp_dayuan",
	events: [
		event(110, "governmentChange", { governmentType: "monarchy" }, "Dayuan is represented as an urban Ferghana kingdom/city-state network known to Han sources.", "abstraction"),
		event(110, "governmentReformAdd", { reformId: "autocracy_reform" }, "Reuses autocracy reform for Dayuan royal rule.", "abstraction"),
		event(110, "rulerChange", { name: "Dayuan kings", dynasty: "Dayuan" }, "Collective marker for Dayuan rulers before the Han campaigns.", "abstraction"),
		event(104, "rulerChange", { name: "Wugua", dynasty: "Dayuan" }, "King of Dayuan during the Han expedition traditionally associated with the War of the Heavenly Horses."),
		event(101, "rulerChange", { name: "Meicai", dynasty: "Dayuan" }, "Dayuan noble installed after Wugua is killed during the Han-Dayuan settlement."),
	].sort((a, b) => a.date - b.date),
	provinceEvents: {
		"457": [
			provinceEvent(110, "culture", { cultureId: "sogdian" }, "Arys/Ferghana fringe keeps existing Sogdian culture for the Iranian Central Asian urban zone."),
			provinceEvent(110, "religion", { religionId: "zoroastrian" }, "Keeps existing Zoroastrian religion for the Hellenistic/Iranian Ferghana zone."),
		],
		"458": [
			provinceEvent(110, "culture", { cultureId: "sogdian" }, "Ferghana keeps existing Sogdian culture as the nearest available Central Asian Iranian culture id."),
			provinceEvent(110, "religion", { religionId: "zoroastrian" }, "Keeps existing Zoroastrian religion for the Hellenistic/Iranian Ferghana zone."),
		],
	},
}

const wars = [
	war({
		warId: "hanDayuanWar",
		name: "Han-Dayuan War",
		casusBelli: "cb_conquest",
		warGoalTag: "cp_dayuan",
		warGoalProvince: "458",
		attacker: ["cp_han"],
		defender: ["cp_dayuan"],
		start: d(104),
		end: d(101),
		note: "Han campaigns into Ferghana force Dayuan to provide the famed heavenly horses and accept a Han-favorable succession settlement.",
		battles: [
			battle({
				year: 101,
				name: "Siege of Dayuan",
				locationProvinceId: "458",
				attacker: { country: "cp_han", commander: "Li Guangli", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_dayuan", commander: "Wugua", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Ferghana (458) is used as the map stand-in for Dayuan's main urban center.",
			}),
		],
	}),
]

const revolts = {
	"458": {
		events: [
			{
				date: d(101),
				kind: "revolt",
				payload: { revolt: { type: "pretender_rebels", size: 2, leader: "Meicai" } },
				comment: "Dayuan succession settlement",
				note: "Local nobles kill Wugua and elevate Meicai during the Han-Dayuan settlement.",
				sourceConfidence: "traditional",
			},
		],
	},
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
fs.mkdirSync(path.join(auditsDir, "wars"), { recursive: true })
fs.mkdirSync(path.join(auditsDir, "revolts"), { recursive: true })
fs.writeFileSync(path.join(auditsDir, "cp_dayuan.json"), JSON.stringify(nation, null, "\t") + "\n")
fs.writeFileSync(path.join(auditsDir, "wars", "dayuan-wars.json"), JSON.stringify({ _readme: "Audit/proposal file: reconstructed pre-2AD wars for Dayuan/Ferghana.", wars }, null, "\t") + "\n")
fs.writeFileSync(path.join(auditsDir, "revolts", "dayuan-revolts.json"), JSON.stringify({ _readme: "Audit/proposal file: province revolt marker for the Dayuan succession settlement.", provinces: revolts }, null, "\t") + "\n")

console.log("wrote Dayuan audit, 1 war, and 1 revolt")
