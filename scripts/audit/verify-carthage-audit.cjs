const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..", "..", "public", "earth-history")
const provinces = JSON.parse(fs.readFileSync(path.join(root, "events", "provinces.json"), "utf8"))
const nations = JSON.parse(fs.readFileSync(path.join(root, "events", "nations.json"), "utf8"))

const provinceIds = new Set(Object.keys(provinces))
const ownerTags = new Set()
for (const id in provinces) {
	for (const ev of provinces[id].events || []) {
		if ((ev.kind === "owner" || ev.kind === "controller" || ev.kind === "coreAdd") && ev.payload?.tag) {
			ownerTags.add(ev.payload.tag)
		}
	}
}
const nationTags = new Set(Object.keys(nations))
const validTag = (t) => t === null || ownerTags.has(t) || nationTags.has(t)

const errors = []

function checkDate(date, ctx) {
	if (!(date < 0)) errors.push(`${ctx}: date ${date} is not < 0`)
}

// --- cp_carthage.json ---
const carthage = JSON.parse(fs.readFileSync(path.join(root, "audits", "cp_carthage.json"), "utf8"))
if (carthage.tag !== "cp_carthage") errors.push("cp_carthage.json: wrong tag")
for (const [i, ev] of carthage.events.entries()) {
	checkDate(ev.date, `cp_carthage.json events[${i}]`)
	if (ev.kind === "governmentChange") {
		const gt = ev.payload.governmentType
		if (!["tribal", "monarchy", "republic", "theocracy"].includes(gt))
			errors.push(`cp_carthage.json events[${i}]: bad governmentType ${gt}`)
	}
}

// --- wars ---
const wars = JSON.parse(fs.readFileSync(path.join(root, "audits", "wars", "pilot-nations-wars.json"), "utf8"))
for (const w of wars.wars) {
	for (const [i, ev] of w.events.entries()) {
		checkDate(ev.date, `war ${w.warId} events[${i}]`)
		if (!validTag(ev.nationTag)) errors.push(`war ${w.warId} events[${i}]: bad nationTag ${ev.nationTag}`)
	}
	if (w.warGoalTag && !validTag(w.warGoalTag)) errors.push(`war ${w.warId}: bad warGoalTag ${w.warGoalTag}`)
	if (w.warGoalProvince && !provinceIds.has(w.warGoalProvince))
		errors.push(`war ${w.warId}: bad warGoalProvince ${w.warGoalProvince}`)
	for (const [i, b] of w.battles.entries()) {
		checkDate(b.date, `war ${w.warId} battles[${i}]`)
		if (!provinceIds.has(b.locationProvinceId))
			errors.push(`war ${w.warId} battles[${i}]: bad locationProvinceId ${b.locationProvinceId}`)
		if (!validTag(b.attacker.country)) errors.push(`war ${w.warId} battles[${i}]: bad attacker.country ${b.attacker.country}`)
		if (!validTag(b.defender.country)) errors.push(`war ${w.warId} battles[${i}]: bad defender.country ${b.defender.country}`)
	}
}

// --- revolts ---
const revolts = JSON.parse(fs.readFileSync(path.join(root, "audits", "revolts", "pilot-nations-revolts.json"), "utf8"))
for (const provId in revolts.provinces) {
	if (!provinceIds.has(provId)) errors.push(`revolts: bad provinceId ${provId}`)
	for (const [i, ev] of revolts.provinces[provId].events.entries()) {
		checkDate(ev.date, `revolts[${provId}] events[${i}]`)
	}
}

console.log("Carthage tags used:", [...new Set([
	...carthage.events.map(() => "cp_carthage"),
])])
console.log(
	"Distinct nationTags referenced in Carthage-touched wars:",
	[...new Set(wars.wars.filter(w => w.warId === "sicilianWars" || w.warId === "carthageNumidianWar").flatMap(w => w.events.map(e => e.nationTag)))],
)
console.log("Errors found:", errors.length)
errors.forEach((e) => console.log(" -", e))
console.log(errors.length === 0 ? "VERIFICATION PASSED" : "VERIFICATION FAILED")
