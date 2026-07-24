// One-off generator for the exhaustive Carthage (cp_carthage) pre-2AD audit.
// Replaces public/earth-history/audits/cp_carthage.json and merges Carthage's
// additional wars/revolts into the shared 5-nation pilot batch files:
//   - public/earth-history/audits/wars/pilot-nations-wars.json
//   - public/earth-history/audits/revolts/pilot-nations-revolts.json
// (Rome's own Punic Wars entries already live in audits/wars/republic-wars.json
// and are NOT duplicated here.)
//
// Follows scripts/audit/ancient-nation-audit-prompt.md methodology and reuses the
// day-encoding helpers from scripts/audit/build-rome-wars-audit.cjs (365-day years,
// day 0 = 2 AD Jan 1).
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2

function dayOfYear(m, dd) {
	return CUM_MONTH_DAYS[m - 1] + dd
}
function eu4DateToDays(astroYear, m, dd) {
	const startD = dayOfYear(1, 1)
	const yearDays = (astroYear - EARTH_HISTORY_START_YEAR) * 365
	return yearDays + dayOfYear(m, dd) - startD
}
function bc(year) {
	return 1 - year
}
function d(year, m = 1, dd = 1) {
	return eu4DateToDays(bc(year), m, dd)
}

// ---------------------------------------------------------------------
// cp_carthage.json -- rulers / government / reforms
// ---------------------------------------------------------------------
const events = [
	{
		date: d(650),
		kind: "governmentChange",
		payload: { governmentType: "theocracy" },
		note: "Carthage governed by an oligarchy of judge-magistrates (suffetes) under strong priestly/mercantile aristocratic influence",
		sourceConfidence: "traditional",
	},
	{
		date: d(650),
		kind: "governmentReformAdd",
		payload: { reformId: "phoenician_oligarchy" },
		note: "Matches Imperium Universalis countries.json CAR history[0]",
		sourceConfidence: "traditional",
	},
	{
		date: d(575),
		kind: "rulerChange",
		payload: {
			name: "Malchus",
			dynasty: null,
			note: "General who campaigned in Sicily and Sardinia c. 550 BC; exiled by the Carthaginian senate after a Sardinian defeat, he marched his army back and besieged Carthage to force his recall, then was executed after being accused of seeking tyranny (Justin, Epitome XVIII.7). Earliest named Carthaginian leader in the historical record.",
		},
		note: "Earliest named Carthaginian leader in the historical record; his forced recall/execution is the closest attested episode to an internal power struggle before Bomilcar's revolt in 308 BC.",
		sourceConfidence: "traditional",
	},
	{
		date: d(550),
		kind: "rulerChange",
		payload: {
			name: "Mago I",
			dynasty: "Magonid",
			note: "Founder of the Magonid dynasty that dominated Carthaginian politics for over a century",
		},
		note: "Founder of the Magonid dynasty that dominated Carthaginian politics for over a century",
		sourceConfidence: "traditional",
	},
	{
		date: d(550),
		kind: "governmentChange",
		payload: { governmentType: "republic" },
		note: "Shift toward a republican oligarchy of annually elected suffetes and the Council of Elders/Tribunal of 104, consistent with classical descriptions (Aristotle, Politics II) of the Carthaginian constitution. Anchored to Mago I's establishment of the Magonid ascendancy (retained from the prior audit pass's date).",
		sourceConfidence: "abstraction",
	},
	{
		date: d(550),
		kind: "governmentReformAdd",
		payload: { reformId: "citizens_republic" },
		note: "Matches Imperium Universalis countries.json CAR history[1] (there dated relative-year 204; re-anchored here to the same round mid-6th-century date as the prior audit pass, since the mod's internal relative-year epoch could not be reliably re-derived for non-Roman tags -- see readme).",
		sourceConfidence: "abstraction",
	},
	{
		date: d(530),
		kind: "rulerChange",
		payload: {
			name: "Hasdrubal I",
			dynasty: "Magonid",
			note: "Son of Mago I; co-led Carthaginian forces with his brother Hamilcar I",
		},
		sourceConfidence: "traditional",
	},
	{
		date: d(510),
		kind: "rulerChange",
		payload: {
			name: "Hamilcar I",
			dynasty: "Magonid",
			note: "Killed at the Battle of Himera, 480 BC, ending the first Carthaginian attempt to conquer Sicily",
		},
		note: "Killed at the Battle of Himera, 480 BC, ending the first Carthaginian attempt to conquer Sicily",
		sourceConfidence: "traditional",
	},
	{
		date: d(480),
		kind: "rulerChange",
		payload: {
			name: "Hanno I the Navigator",
			dynasty: "Magonid",
			note: "Attributed voyage of exploration down the West African coast (the Periplus of Hanno), traditionally dated to the early-to-mid 5th century BC",
		},
		note: "Attributed voyage of exploration down the West African coast",
		sourceConfidence: "traditional",
	},
	{
		date: d(440),
		kind: "rulerChange",
		payload: {
			name: "Himilco I",
			dynasty: "Magonid",
			note: "Grandson of Hamilcar I; attributed voyage of exploration to the tin coasts of northwestern Europe (Massaliote Periplus tradition), contemporary with Hanno's African voyage",
		},
		sourceConfidence: "abstraction",
	},
	{
		date: d(410),
		kind: "rulerChange",
		payload: {
			name: "Hannibal Mago",
			dynasty: "Magonid",
			note: "Grandson of Hamilcar I; sacked Selinus and Himera in Sicily in 409 BC, avenging Hamilcar's defeat there in 480 BC; died of plague during the 406 BC siege of Akragas",
		},
		note: "Sacked Himera and Selinus in Sicily, avenging his grandfather Hamilcar I",
		sourceConfidence: "traditional",
	},
	{
		date: d(406),
		kind: "rulerChange",
		payload: {
			name: "Himilco II",
			dynasty: "Magonid",
			note: "Took command after Hannibal Mago's death at Akragas (406 BC); sacked Gela and Camarina (405 BC); besieged Syracuse (397-396 BC) until plague destroyed his army; committed suicide on returning to Carthage per Diodorus Siculus",
		},
		sourceConfidence: "traditional",
	},
	{
		date: d(396),
		kind: "rulerChange",
		payload: {
			name: "Mago II",
			dynasty: "Magonid",
			note: "Rebuilt Carthaginian power in Sicily after Himilco II's disaster; won the Battle of Cronium (Cabala) against Dionysius I of Syracuse c. 379 BC before being killed in a later engagement",
		},
		sourceConfidence: "traditional",
	},
	{
		date: d(375),
		kind: "rulerChange",
		payload: {
			name: "Himilco III",
			dynasty: "Magonid",
			note: "Son of Mago II; continued the wars against Dionysius I and Dionysius II of Syracuse into the mid-4th century BC",
		},
		sourceConfidence: "abstraction",
	},
	{
		date: d(341),
		kind: "rulerChange",
		payload: {
			name: "Hanno II the Great",
			dynasty: null,
			note: "Dominant statesman of the mid-to-late 4th century BC; led a failed coup/tyranny attempt of his own c. 344 BC (Justin XXI.4) before becoming the leading advocate of Carthage's African-expansion policy",
		},
		note: "Dominant statesman of the mid-4th century BC",
		sourceConfidence: "abstraction",
	},
	{
		date: d(308),
		kind: "rulerChange",
		payload: {
			name: "Bomilcar",
			dynasty: null,
			note: "General who attempted to seize tyrannical power in Carthage in 308 BC while Agathocles of Syracuse was invading Carthaginian Africa; the coup was crushed by the citizenry and Bomilcar was crucified (Diodorus Siculus XX.43-44). See the matching revolt entry in audits/revolts/pilot-nations-revolts.json.",
		},
		note: "Attempted tyranny/coup, 308 BC; crushed and executed. See paired revolt entry.",
		sourceConfidence: "traditional",
	},
	{
		date: d(275),
		kind: "governmentChange",
		payload: { governmentType: "theocracy" },
		note: "Reassertion of aristocratic/priestly influence over the suffetes and Council of Elders in the run-up to the Punic Wars",
		sourceConfidence: "traditional",
	},
	{
		date: d(275),
		kind: "governmentReformAdd",
		payload: { reformId: "carthaginian_republic" },
		note: "Matches Imperium Universalis countries.json CAR history[2] (there dated relative-year 274; re-anchored to 275 BC)",
		sourceConfidence: "traditional",
	},
	{
		date: d(247),
		kind: "rulerChange",
		payload: {
			name: "Hamilcar Barca",
			dynasty: "Barcid",
			note: "Founder of the Barcid dynasty; commanded Carthaginian forces in Sicily in the closing years of the First Punic War, crushed the Mercenary/Truceless War revolt (241-237 BC), and rebuilt Carthaginian power in Hispania",
		},
		note: "Founder of the Barcid dynasty; rebuilt Carthaginian power in Hispania after the First Punic War",
		sourceConfidence: "traditional",
	},
	{
		date: d(229),
		kind: "rulerChange",
		payload: {
			name: "Hasdrubal the Fair",
			dynasty: "Barcid",
			note: "Son-in-law of Hamilcar; founded Carthago Nova (New Carthage) in Hispania; assassinated in 221 BC",
		},
		note: "Son-in-law of Hamilcar; founded Carthago Nova (New Carthage) in Hispania",
		sourceConfidence: "traditional",
	},
	{
		date: d(221),
		kind: "rulerChange",
		payload: {
			name: "Hannibal Barca",
			dynasty: "Barcid",
			note: "Led the invasion of Italy in the Second Punic War (218-201 BC); went into exile after the war and died c. 183 BC",
		},
		note: "Led the invasion of Italy in the Second Punic War",
		sourceConfidence: "traditional",
	},
	{
		date: d(221, 6, 1),
		kind: "rulerChange",
		payload: {
			name: "Hasdrubal Barca",
			dynasty: "Barcid",
			note: "Brother of Hannibal; held Hispania during Hannibal's Italian campaign, then marched to reinforce him but was defeated and killed at the Battle of the Metaurus (207 BC)",
		},
		sourceConfidence: "traditional",
	},
	{
		date: d(207, 6, 1),
		kind: "rulerChange",
		payload: {
			name: "Mago Barca",
			dynasty: "Barcid",
			note: "Youngest Barcid brother; opened a second front in Liguria/northern Italy (205-203 BC) before being recalled to Africa and dying of wounds on the return voyage",
		},
		sourceConfidence: "traditional",
	},
	{
		date: d(151),
		kind: "rulerChange",
		payload: {
			name: "Hasdrubal the Boetharch",
			dynasty: null,
			note: "Led Carthaginian forces in the disastrous 150 BC war against Masinissa's Numidia, then commanded the defense of Carthage in the Third Punic War (149-146 BC) until the city's fall",
		},
		note: "Killed at the Battle of Himera, 480 BC, ending the first Carthaginian attempt to conquer Sicily -- correction: final ruler before Carthage's destruction in 146 BC (audits/wars/republic-wars.json)",
		sourceConfidence: "traditional",
	},
]

// fix the stray leftover note text on the final entry above
events[events.length - 1].note =
	"Final Carthaginian military leader before the city's destruction in 146 BC (see the thirdPunicWar entry in audits/wars/republic-wars.json)"

events.sort((a, b) => a.date - b.date)

const carthageAudit = {
	_readme:
		"Audit/proposal file: reconstructed pre-2AD events for 'cp_carthage', part of the 5-nation Tier-A pilot batch (Carthage, Achaemenid Persia, Ptolemaic Egypt, Seleucid Empire, Maurya Empire). Same methodology as audits/ROM.json and audits/cp_roman_republic.json. Not wired into the engine. Reform ids and government types are drawn from geo-explorer's public/imperialis/countries.json where that mod source has a matching entry; event dates use real historical years rather than the mod's internal relative-year numbering (which could not be reliably re-derived for non-Roman tags -- for ROM/RMR the numbers happened to check out against provinces.json's own owner-history dates, but the same check did not hold for these nations, so real historical dates were used instead and flagged accordingly). This pass expands the prior thin draft (~15 events, 1 war, 1 revolt) to the full attested succession record (Malchus through Hasdrubal the Boetharch), adds the Carthage-Numidian War (150 BC) and additional Sicilian Wars battles to audits/wars/pilot-nations-wars.json, and adds Bomilcar's 308 BC coup attempt to audits/revolts/pilot-nations-revolts.json. Rome's own Punic Wars entries (First/Second/Third) already live in audits/wars/republic-wars.json with cp_carthage as the opposing side and are intentionally NOT duplicated here. sourceConfidence: 'traditional' = well-attested history; 'abstraction' = game-design stand-in for a poorly-attested stretch or date.",
	tag: "cp_carthage",
	events,
}

// ---------------------------------------------------------------------
// Wars: expand sicilianWars, add carthageNumidianWar
// ---------------------------------------------------------------------
function battle({ year, m = 1, day = 1, name, locationProvinceId, attacker, defender, attackerWon, note }) {
	return { date: d(year, m, day), name, locationProvinceId, attacker, defender, attackerWon, note }
}

const sicilianWarsExpanded = {
	warId: "sicilianWars",
	name: "Sicilian Wars",
	casusBelli: "cb_conquest",
	warGoalType: "take_claim",
	warGoalTag: null,
	warGoalProvince: "2982",
	isRebel: false,
	events: [
		{ date: d(480), nationTag: "cp_carthage", kind: "warStart", side: "attacker" },
		{ date: d(480), nationTag: "cp_syracuse", kind: "warStart", side: "defender" },
		{ date: d(265), nationTag: "cp_carthage", kind: "warEnd", side: "attacker" },
		{ date: d(265), nationTag: "cp_syracuse", kind: "warEnd", side: "defender" },
	],
	battles: [
		battle({
			year: 480,
			name: "Himera",
			locationProvinceId: "2982",
			attacker: { country: "cp_syracuse", commander: "Gelon of Syracuse", infantry: 50000, cavalry: 5000, artillery: null, losses: 3000 },
			defender: { country: "cp_carthage", commander: "Hamilcar I", infantry: null, cavalry: null, artillery: null, losses: 20000 },
			attackerWon: true,
			note: "Traditionally fought the same year as Thermopylae/Salamis. Himera itself has no dedicated province; Syracuse (2982) stands in for Sicily.",
		}),
		battle({
			year: 409,
			name: "Selinus",
			locationProvinceId: "125",
			attacker: { country: "cp_carthage", commander: "Hannibal Mago", infantry: 100000, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_syracuse", commander: null, infantry: 2500, cavalry: null, artillery: null, losses: 16000 },
			attackerWon: true,
			note: "Opening blow of the second round of the Sicilian Wars, avenging Himera (480 BC). Selinus (western Sicily) has no dedicated province; Palermo (125) stands in.",
		}),
		battle({
			year: 409,
			m: 8,
			name: "Himera (second sack)",
			locationProvinceId: "2982",
			attacker: { country: "cp_carthage", commander: "Hannibal Mago", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_syracuse", commander: "Diocles of Syracuse", infantry: null, cavalry: null, artillery: null, losses: 3000 },
			attackerWon: true,
			note: "City sacked and razed; per Diodorus, 3,000 prisoners sacrificed as retribution for Hamilcar I's death at the first Battle of Himera.",
		}),
		battle({
			year: 406,
			name: "Siege of Akragas",
			locationProvinceId: "125",
			attacker: { country: "cp_carthage", commander: "Hannibal Mago / Himilco II", infantry: 120000, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_syracuse", commander: null, infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: true,
			note: "Hannibal Mago died of plague during the siege; Himilco II took command and captured the city. Akragas (Agrigento) has no dedicated province in this dataset; Palermo (125) stands in for western Sicily.",
		}),
		battle({
			year: 405,
			name: "Gela",
			locationProvinceId: "125",
			attacker: { country: "cp_carthage", commander: "Himilco II", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_syracuse", commander: "Dionysius I of Syracuse", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: true,
			note: "Gela and Camarina abandoned to Carthage; Dionysius I forced to make peace, ceding most of Sicily west of the Halycus river. No dedicated Gela province; Palermo (125) stands in.",
		}),
		battle({
			year: 397,
			name: "Siege of Motya",
			locationProvinceId: "125",
			attacker: { country: "cp_syracuse", commander: "Dionysius I of Syracuse", infantry: 80000, cavalry: 3000, artillery: null, losses: null },
			defender: { country: "cp_carthage", commander: null, infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: true,
			note: "Dionysius I's counter-offensive captures and destroys Carthage's chief Sicilian naval base; Carthage responds the following year with Himilco II's siege of Syracuse. Motya has no dedicated province; Palermo (125) stands in for western Sicily.",
		}),
		battle({
			year: 396,
			name: "Siege of Syracuse",
			locationProvinceId: "2982",
			attacker: { country: "cp_carthage", commander: "Himilco II", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_syracuse", commander: "Dionysius I of Syracuse", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: false,
			note: "Plague devastates the besieging Carthaginian army; Himilco II abandons the siege and the remnants of his force, returning to Carthage where he is said to have committed suicide.",
		}),
		battle({
			year: 379,
			name: "Cronium (Cabala)",
			locationProvinceId: "125",
			attacker: { country: "cp_carthage", commander: "Mago II", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_syracuse", commander: "Dionysius I of Syracuse", infantry: null, cavalry: null, artillery: null, losses: 14000 },
			attackerWon: true,
			note: "Carthaginian victory avenging an earlier defeat at Cabala; leads to a negotiated peace. No dedicated province for the Halycus/Cronium region; Palermo (125) stands in.",
		}),
		battle({
			year: 341,
			name: "Crimissus",
			locationProvinceId: "125",
			attacker: { country: "cp_syracuse", commander: "Timoleon of Corinth", infantry: 12000, cavalry: 1000, artillery: null, losses: null },
			defender: { country: "cp_carthage", commander: "Hasdrubal and Hamilcar", infantry: 70000, cavalry: 10000, artillery: null, losses: 10000 },
			attackerWon: true,
			note: "Timoleon's decisive victory ends Carthage's attempt to conquer all of Sicily. No dedicated Crimissus-river province; Palermo (125) stands in for western Sicily.",
		}),
	],
	note: "Recurring conflict (480-265 BC) between Carthage and the Greek colonies of Sicily (chiefly Syracuse, which has no dedicated province tag in this dataset -- cp_syracuse stands in). Dates span the whole multi-round conflict rather than treating each round as a separate war, consistent with how this dataset already models it. Expanded from the prior single-battle draft to include every major attested engagement (Himera 480 BC through Crimissus 341 BC); the war nominally continues at a lower intensity to Pyrrhus of Epirus's Sicilian campaign (278-276 BC, see republic-wars.json's pyrrhicWar for the Italian theater) and the eve of the First Punic War (264 BC).",
	sourceConfidence: "traditional",
}

const carthageNumidianWar = {
	warId: "carthageNumidianWar",
	name: "Carthage-Numidian War",
	casusBelli: "cb_border_war",
	warGoalType: "take_border",
	warGoalTag: null,
	warGoalProvince: "340",
	isRebel: false,
	events: [
		{ date: d(150), nationTag: "cp_carthage", kind: "warStart", side: "attacker" },
		{ date: d(150), nationTag: "cp_kingdom_of_numidia", kind: "warStart", side: "defender" },
		{ date: d(150), nationTag: "cp_carthage", kind: "warEnd", side: "attacker" },
		{ date: d(150), nationTag: "cp_kingdom_of_numidia", kind: "warEnd", side: "defender" },
	],
	battles: [
		battle({
			year: 150,
			name: "Oroscopa",
			locationProvinceId: "340",
			attacker: { country: "cp_carthage", commander: "Hasdrubal the Boetharch", infantry: 25000, cavalry: null, artillery: null, losses: 58000 },
			defender: { country: "cp_kingdom_of_numidia", commander: "Masinissa I", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: false,
			note: "Carthage takes the field without Roman authorization against Masinissa's encroachments, in violation of the treaty ending the Second Punic War; the crushing defeat gives Rome its pretext for the Third Punic War (thirdPunicWar in republic-wars.json). Oroscopa is near Cirta; Cirta's province (340) stands in.",
		}),
	],
	note: "Border war (150 BC) between Carthage and Masinissa's Numidia (cp_kingdom_of_numidia, an owner tag existing in provinces.json from 197 BC). Fought without Senate approval from Rome; Carthage's defeat and unauthorized rearmament directly triggered the Third Punic War the following year.",
	sourceConfidence: "traditional",
}

const warsPath = path.join(
	__dirname,
	"..",
	"public",
	"earth-history",
	"audits",
	"wars",
	"pilot-nations-wars.json",
)
const warsFile = JSON.parse(fs.readFileSync(warsPath, "utf8"))
warsFile.wars = warsFile.wars
	.filter((w) => w.warId !== "sicilianWars")
	.concat([sicilianWarsExpanded, carthageNumidianWar])
warsFile._readme =
	"Audit/proposal file: wars for the 5-nation Tier-A pilot batch (audits/cp_carthage.json, cp_achaemenid_empire.json, cp_ptolemaic_kingdom.json, cp_seleucid_empire.json, cp_maurya_empire.json). Mirrors events/wars.json's schema. Not wired into the engine. Carthage's sicilianWars entry was expanded (single battle -> 9 battles, 480-265 BC) and carthageNumidianWar (150 BC) was added in the Carthage exhaustive-audit pass; the other 4 nations' entries (greekPersianWars, warsOfAlexander, syrianWars) are untouched. Rome's own Punic Wars against cp_carthage live separately in audits/wars/republic-wars.json and are not duplicated here."

// ---------------------------------------------------------------------
// Revolts: add Bomilcar's 308 BC coup attempt
// ---------------------------------------------------------------------
const revoltsPath = path.join(
	__dirname,
	"..",
	"public",
	"earth-history",
	"audits",
	"revolts",
	"pilot-nations-revolts.json",
)
const revoltsFile = JSON.parse(fs.readFileSync(revoltsPath, "utf8"))
revoltsFile.provinces["341"].events.push({
	date: d(308),
	kind: "revolt",
	payload: {
		revolt: { type: "noble_rebels", size: 3, leader: "Bomilcar" },
	},
	comment: "Bomilcar's coup attempt",
	note: "General Bomilcar attempts to seize tyrannical power in Carthage while Agathocles of Syracuse's army ravages Carthaginian Africa; the citizenry and mercenary garrison crush the coup and crucify Bomilcar (Diodorus Siculus XX.43-44). Tunis (341) stands in for Carthage, as with the Mercenary War entry above.",
	sourceConfidence: "traditional",
})
revoltsFile._readme =
	"Audit/proposal file: revolts for the 5-nation Tier-A pilot batch. Mirrors events/provinces.json's revolt event schema (payload.revolt: {type, size, leader?}). Not wired into the engine. Bomilcar's 308 BC coup attempt was added to Tunis (341) in the Carthage exhaustive-audit pass, alongside the existing Mercenary War (237 BC) entry; the Seleucid Maccabean Revolt entry (province 379) is untouched."

// ---------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------
const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
fs.writeFileSync(
	path.join(auditsDir, "cp_carthage.json"),
	JSON.stringify(carthageAudit, null, "\t") + "\n",
)
fs.writeFileSync(warsPath, JSON.stringify(warsFile, null, "\t") + "\n")
fs.writeFileSync(revoltsPath, JSON.stringify(revoltsFile, null, "\t") + "\n")

console.log("rulers/gov events:", carthageAudit.events.length)
console.log(
	"sicilianWars battles:",
	sicilianWarsExpanded.battles.length,
	"carthageNumidianWar battles:",
	carthageNumidianWar.battles.length,
)
console.log("total wars in pilot file:", warsFile.wars.length)
console.log("carthage revolts (province 341):", revoltsFile.provinces["341"].events.length)
