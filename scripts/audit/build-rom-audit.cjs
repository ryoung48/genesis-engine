// One-off generator for public/earth-history/audits/ROM.json.
// Mirrors src/model/earth/history/date.ts's day encoding (365-day years,
// day 0 = 2 AD Jan 1) so these dates share the numeric axis the engine
// already uses for ROM's post-2AD events.
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2

function dayOfYear(m, d) {
	return CUM_MONTH_DAYS[m - 1] + d
}

// astroYear: astronomical year numbering (no year 0). Pass BC years as
// negative historical years via bc(); pass AD years directly.
function eu4DateToDays(astroYear, m, d) {
	const startD = dayOfYear(1, 1)
	const yearDays = (astroYear - EARTH_HISTORY_START_YEAR) * 365
	return yearDays + dayOfYear(m, d) - startD
}

// Historical "753 BC" -> astronomical year -752 (no year zero).
function bc(year) {
	return 1 - year
}

function date(astroYear, m = 1, d = 1) {
	return eu4DateToDays(astroYear, m, d)
}

// Only the Empire (27 BC onward) is generated here -- Kingdom and Republic
// belong to the separate cp_etruscans / cp_roman_republic ownership tags in
// events/provinces.json, not the ROM nation tag.
const events = []
function ruler(year, name, opts = {}) {
	events.push({
		date: date(bc(year)),
		kind: "rulerChange",
		payload: { name, ...opts },
		note: opts.note,
		sourceConfidence: opts.sourceConfidence ?? "traditional",
	})
}
function govChange(year, governmentType, note) {
	events.push({
		date: date(bc(year)),
		kind: "governmentChange",
		payload: { governmentType },
		note,
		sourceConfidence: "traditional",
	})
}
function reformAdd(year, reformId, note, confidence = "traditional") {
	events.push({
		date: date(bc(year)),
		kind: "governmentReformAdd",
		payload: { reformId },
		note,
		sourceConfidence: confidence,
	})
}

// ---- Empire founding (27 BC) -------------------------------------------
govChange(27, "monarchy", "Octavian granted the title Augustus by the Senate; Principate begins")
reformAdd(
	27,
	"roman_empire_reform",
	"Existing reform id already used as ROM's base.reforms entry in nations.json -- reused here rather than inventing a new one",
)
ruler(27, "Augustus", {
	dynasty: "Julio-Claudian",
	adm: 4,
	dip: 3,
	mil: 3,
	note: "Same stat block as ROM's existing date-0 (2 AD) rulerChange in nations.json; this entry marks the actual 27 BC accession, the existing 2 AD entry is left untouched",
	sourceConfidence: "traditional",
})

events.sort((a, b) => a.date - b.date)

const out = {
	_readme:
		"Audit/proposal file: reconstructed pre-2AD ROM (Empire) events, worked backwards from the earliest event already in events/nations.json (rulerChange Augustus, date 0 = 2 AD) to the Principate's founding in 27 BC. Not wired into the engine. Kingdom (753-509 BC) and Republic (509-27 BC) are excluded -- those belong to the separate cp_etruscans / cp_roman_republic ownership tags in events/provinces.json, not the ROM nation tag. Government type 'monarchy' is drawn from the existing 4-family pool (tribal/monarchy/republic/theocracy) in src/model/earth/history/government.ts. Reform id 'roman_empire_reform' is reused as-is from nations.json's ROM.base.reforms, not invented.",
	tag: "ROM",
	events,
}

const outPath = path.join(__dirname, "..", "..", "public", "earth-history", "audits", "ROM.json")
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(out, null, "\t") + "\n")
console.log("wrote", outPath, events.length, "events")
