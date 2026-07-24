// One-off generator for public/earth-history/audits/cp_roman_republic.json.
// Companion to build-rom-audit.cjs, but for the Republic-era tag
// ("cp_roman_republic") seen in events/provinces.json's owner history for
// Roma (province 118), distinct from the ROM (Empire) nation tag.
// Mirrors src/model/earth/history/date.ts's day encoding (365-day years,
// day 0 = 2 AD Jan 1) so these dates share the numeric axis the engine
// already uses.
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2

function dayOfYear(m, d) {
	return CUM_MONTH_DAYS[m - 1] + d
}

function eu4DateToDays(astroYear, m, d) {
	const startD = dayOfYear(1, 1)
	const yearDays = (astroYear - EARTH_HISTORY_START_YEAR) * 365
	return yearDays + dayOfYear(m, d) - startD
}

// Historical "509 BC" -> astronomical year -508 (no year zero).
function bc(year) {
	return 1 - year
}

function date(astroYear, m = 1, d = 1) {
	return eu4DateToDays(astroYear, m, d)
}

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

// ---- Republic founding (509 BC) ----------------------------------------
// Government type + founding reform follow public/imperialis/countries.json's
// ROM entry ("245.1.1" -> republic / res_publica), an EXISTING mod-defined
// reform id, not invented here. provinces.json shows Roma passing from
// cp_etruscans to cp_roman_republic ownership around this era.
govChange(509, "republic", "Overthrow of Tarquinius Superbus; founding of the Republic")
reformAdd(
	509,
	"res_publica",
	"Matches Imperium Universalis countries.json ROM history[1] (there dated relative-year 245, i.e. 509 BC under founding-year-1 = 753 BC)",
)
ruler(509, "Lucius Junius Brutus", {
	note: "Traditionally one of the first two consuls; represents the annual consulship, not a monarch -- included as the Republic's inaugural 'ruler' entry in keeping with this dataset's convention of giving republics (VEN, GEN) a headline officeholder per era.",
	sourceConfidence: "abstraction",
})

// ---- Republic-era turning points (interpretive) ------------------------
// The Republic had no continuous single ruler; annual dual consuls make a
// faithful 480-year ruler list impractical and largely unattested at this
// granularity. These entries mark widely-agreed constitutional/military
// turning points instead, using each era's most prominent officeholder
// (dictator, reformer) as a stand-in "ruler" -- flagged sourceConfidence:
// "abstraction" throughout. Treat this whole section as a proposal, not a
// sourced record.
reformAdd(
	367,
	"licinian_sextian_reform",
	"Licinio-Sextian Rogations opened the consulship to plebeians -- proposed new reform id, no existing reform fits",
	"abstraction",
)
ruler(366, "Lucius Sextius Lateranus", {
	note: "First plebeian consul, 366 BC",
	sourceConfidence: "abstraction",
})
ruler(280, "Publius Valerius Laevinus", {
	note: "Consul at the outbreak of the Pyrrhic War; stand-in for the early 3rd century BC",
	sourceConfidence: "abstraction",
})
ruler(221, "Quintus Fabius Maximus Verrucosus", {
	note: "Dictator during the Second Punic War (adopted 'Fabian strategy'); stand-in for the Punic Wars era",
	sourceConfidence: "abstraction",
})
ruler(107, "Gaius Marius", {
	note: "Seven-time consul; associated with the Marian military reforms",
	sourceConfidence: "abstraction",
})
reformAdd(
	107,
	"marian_military_reform",
	"Marian reforms professionalized the legions -- proposed new reform id, no existing reform fits",
	"abstraction",
)
ruler(82, "Lucius Cornelius Sulla", {
	note: "Dictator 82-79 BC",
	sourceConfidence: "abstraction",
})
ruler(63, "Gnaeus Pompeius Magnus", {
	note: "Dominant figure of the 60s-50s BC (First Triumvirate); stand-in for the late Republic",
	sourceConfidence: "abstraction",
})
ruler(49, "Gaius Julius Caesar", {
	note: "Crosses the Rubicon 49 BC; dictator perpetuo from 44 BC",
	sourceConfidence: "abstraction",
})
reformAdd(
	48,
	"late_res_publica",
	"Matches Imperium Universalis countries.json ROM history[2] (there dated relative-year 600, i.e. ~154 BC under founding-year-1 = 753 BC; re-anchored here to the late Republic's actual constitutional crisis since 154 BC has no comparable attested event)",
	"abstraction",
)
ruler(44, "Marcus Antonius", {
	note: "Post-assassination consul; stand-in through the Second Triumvirate",
	sourceConfidence: "abstraction",
})
ruler(31, "Octavian", {
	note: "Battle of Actium, 31 BC; sole ruler of Rome from this point, though not yet titled Augustus. This is the Republic tag's last event -- 27 BC's transition to the Empire (governmentChange to monarchy, roman_empire_reform, Augustus rulerChange) is recorded under the ROM tag in audits/ROM.json, not here.",
	sourceConfidence: "abstraction",
})

events.sort((a, b) => a.date - b.date)

const out = {
	_readme:
		"Audit/proposal file: reconstructed events for the Republic-era tag 'cp_roman_republic' (509-27 BC), seen in events/provinces.json's owner history for Roma (province 118) but absent as its own entry in events/nations.json. Companion to audits/ROM.json, which covers the Empire (27 BC onward) under the ROM tag. Not wired into the engine. sourceConfidence: 'traditional' = well-attested Roman historiography; 'abstraction' = game-design stand-in for a period without a single attested ruler (most of the Republic). Government type 'republic' is drawn from the existing 4-family pool (tribal/monarchy/republic/theocracy) in src/model/earth/history/government.ts. Reform ids 'res_publica' and 'late_res_publica' are existing ids from geo-explorer's public/imperialis/countries.json (ROM history[1..2]); 'licinian_sextian_reform' and 'marian_military_reform' are newly proposed since nothing in the existing 109-reform pool fits.",
	tag: "cp_roman_republic",
	events,
}

const outPath = path.join(
	__dirname,
	"..",
	"public",
	"earth-history",
	"audits",
	"cp_roman_republic.json",
)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(out, null, "\t") + "\n")
console.log("wrote", outPath, events.length, "events")
