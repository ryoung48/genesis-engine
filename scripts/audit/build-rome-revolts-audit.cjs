// One-off generator for public/earth-history/audits/revolts/{republic,empire}-revolts.json.
// Companion to build-rom-audit.cjs / build-rmr-audit.cjs / build-rome-wars-audit.cjs.
// Represents internal uprisings against Roman rule as province-level `revolt`
// events, mirroring events/provinces.json's own schema for that event kind
// (see e.g. province 183 Ile-de-France's "The storming of the Bastille"),
// rather than as wars.json entries -- revolts don't need an opposing nation
// tag, which is why this is the right shape for uprisings (Servile Wars,
// Social War, Cantabrian resistance, etc.) that have no independent polity
// on the other side.
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
function bc(year) {
	return 1 - year
}
function date(year, m = 1, d = 1) {
	return eu4DateToDays(bc(year), m, d)
}

function revoltEvent({ year, m = 1, d = 1, type, size = 1, leader = null, comment, note, sourceConfidence = "traditional" }) {
	const revolt = { type, size }
	if (leader) revolt.leader = leader
	return {
		date: date(year, m, d),
		kind: "revolt",
		payload: { revolt },
		comment,
		note,
		sourceConfidence,
	}
}

// provinceId -> [revoltEvent, ...]
function addTo(map, provinceId, event) {
	if (!map[provinceId]) map[provinceId] = []
	map[provinceId].push(event)
}

// ---------------------------------------------------------------------
// REPUBLIC (509-27 BC)
// ---------------------------------------------------------------------
const republic = {}

addTo(
	republic,
	"118",
	revoltEvent({
		year: 494,
		type: "particularist_rebels",
		size: 3,
		comment: "First Secession of the Plebs",
		note: "Plebeians withdraw to the Mons Sacer in a general strike against patrician debt-bondage abuses, forcing the creation of the Tribune of the Plebs. 'particularist_rebels' used as the closest existing type for a class-based (not ethnic/religious/dynastic) uprising -- no dedicated social-conflict category exists in this dataset's rebel-type enum.",
	}),
)
addTo(
	republic,
	"118",
	revoltEvent({
		year: 449,
		type: "particularist_rebels",
		size: 3,
		comment: "Second Secession of the Plebs",
		note: "Plebeians secede again after the decemvirs' abuses (Appius Claudius and the murder of Verginia); leads to completion of the Twelve Tables and the Valerian-Horatian laws.",
	}),
)
addTo(
	republic,
	"2982",
	revoltEvent({
		year: 135,
		type: "religious_rebels",
		size: 4,
		leader: "Eunus",
		comment: "First Servile War",
		note: "Syrian-born slave Eunus, claiming prophetic/priest-king authority (hence 'religious_rebels'), leads a mass slave uprising across Sicily; crushed by consul Publius Rupilius in 132 BC. Enna, the revolt's centre, has no dedicated province in this dataset -- Syracuse (2982) stands in for Sicily.",
	}),
)
addTo(
	republic,
	"2982",
	revoltEvent({
		year: 104,
		type: "religious_rebels",
		size: 4,
		leader: "Salvius (self-styled King Tryphon)",
		comment: "Second Servile War",
		note: "Second major Sicilian slave revolt, led by Salvius/Tryphon and Athenion; ended by consul Manius Aquillius in 100 BC. Syracuse (2982) again stands in for Sicily.",
	}),
)
addTo(
	republic,
	"122",
	revoltEvent({
		year: 91,
		type: "nationalist_rebels",
		size: 5,
		leader: "Quintus Poppaedius Silo",
		comment: "Social War (Bellum Sociale)",
		note: "Rome's Italian allies (socii) revolt demanding citizenship, setting up a rival capital at Corfinium; ends in 88 BC with citizenship extended to most of Italy. Fought across many central/southern Italian towns with no single dedicated province; Apulia (122) stands in, consistent with its use for Cannae/Asculum/Beneventum in audits/wars/republic-wars.json.",
	}),
)
addTo(
	republic,
	"2813",
	revoltEvent({
		year: 80,
		type: "pretender_rebels",
		size: 4,
		leader: "Quintus Sertorius",
		comment: "Sertorian War",
		note: "Marian holdout Sertorius sets up a rival Roman government-in-exile in Hispania with local Lusitanian backing; ended in 72 BC by assassination and Pompey's campaign. Merida (2813) stands in for Lusitania, Sertorius's stronghold region.",
	}),
)
addTo(
	republic,
	"121",
	revoltEvent({
		year: 73,
		type: "nationalist_rebels",
		size: 5,
		leader: "Spartacus",
		comment: "Third Servile War",
		note: "Gladiator-led slave uprising breaking out from the ludus at Capua, defeating multiple Roman armies before Crassus's victory in 71 BC (with Pompey mopping up survivors). 'nationalist_rebels' used as the closest existing type -- no dedicated slave-revolt category exists in this dataset's rebel-type enum. Capua has no dedicated province in this dataset; Napoli (121) stands in for Campania.",
	}),
)
addTo(
	republic,
	"118",
	revoltEvent({
		year: 63,
		m: 11,
		d: 8,
		type: "noble_rebels",
		size: 2,
		leader: "Lucius Sergius Catilina",
		comment: "Catiline Conspiracy",
		note: "Patrician conspiracy to violently seize power, exposed by Cicero's Catiline Orations; crushed at the Battle of Pistoria in January 62 BC.",
	}),
)

// ---------------------------------------------------------------------
// EMPIRE (27 BC - 2 AD)
// ---------------------------------------------------------------------
const empire = {}

const cantabrianComment = "Cantabrian and Asturian Wars"
const cantabrianNote =
	"Final indigenous resistance to the Roman conquest of Hispania (the Cantabri and Astures), suppressed over a decade of campaigning including by Augustus personally; Agrippa put down a last flare-up in 19 BC. Recorded as province-level revolts rather than in audits/wars/empire-wars.json because no independent Cantabri/Astures polity has its own owner tag anywhere in events/provinces.json -- every province in the region (Cantabria, Asturias, Galicia, Burgos, Palencia) already shows ROM as its earliest recorded owner, consistent with how this dataset represents the French Revolution (province-level 'revolt' events on Ile-de-France, no opposing tag) rather than inventing one."
for (const [provinceId, size] of [
	["1745", 4],
	["207", 4],
	["206", 3],
	["1746", 2],
	["4552", 2],
]) {
	addTo(
		empire,
		provinceId,
		revoltEvent({
			year: 29,
			type: "nationalist_rebels",
			size,
			comment: cantabrianComment,
			note: cantabrianNote,
		}),
	)
}

function toProvincesShape(map) {
	const out = {}
	for (const pid of Object.keys(map)) {
		out[pid] = { events: map[pid].sort((a, b) => a.date - b.date) }
	}
	return out
}

const outDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits", "revolts")
fs.mkdirSync(outDir, { recursive: true })

const republicOut = {
	_readme:
		"Audit/proposal file: reconstructed pre-2AD revolts against the Republic-era tag 'cp_roman_republic' (509-27 BC), as province-level 'revolt' events matching events/provinces.json's own schema (payload.revolt: {type, size, leader?}, plus a top-level 'comment'). Companion to audits/cp_roman_republic.json and audits/wars/republic-wars.json. Not wired into the engine. Keyed by provinceId -> {events: [...]}. Two extra fields per event for review: 'note' and 'sourceConfidence'. 'type' values are drawn from the existing rebel-type enum already used elsewhere in provinces.json (particularist_rebels, religious_rebels, nationalist_rebels, pretender_rebels, noble_rebels) -- none were invented, though some (Spartacus, the Secessions) are flagged in their 'note' as the closest existing fit rather than a perfect category match, since this dataset has no dedicated slave-revolt or social-conflict rebel type.",
	provinces: toProvincesShape(republic),
}
const empireOut = {
	_readme:
		"Audit/proposal file: reconstructed pre-2AD revolts against ROM (27 BC - 2 AD). Companion to audits/ROM.json and audits/wars/empire-wars.json. Not wired into the engine. Keyed by provinceId -> {events: [...]}. Covers the Cantabrian/Asturian resistance discussed in chat -- represented here as revolts (no opposing tag required) rather than in the wars file, since no Cantabri/Astures polity exists as an owner tag anywhere in events/provinces.json.",
	provinces: toProvincesShape(empire),
}

fs.writeFileSync(
	path.join(outDir, "republic-revolts.json"),
	JSON.stringify(republicOut, null, "\t") + "\n",
)
fs.writeFileSync(
	path.join(outDir, "empire-revolts.json"),
	JSON.stringify(empireOut, null, "\t") + "\n",
)
console.log(
	"republic revolt provinces:",
	Object.keys(republic).length,
	"empire revolt provinces:",
	Object.keys(empire).length,
)
