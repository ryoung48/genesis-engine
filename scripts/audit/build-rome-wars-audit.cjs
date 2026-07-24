// One-off generator for public/earth-history/audits/wars/{republic,empire}-wars.json.
// Companion to build-rom-audit.cjs / build-rmr-audit.cjs -- reconstructs
// major pre-2AD wars involving Rome (cp_roman_republic through 27 BC, ROM
// from 27 BC), mirroring events/wars.json's schema (warId/name/casusBelli/
// warGoalType/warGoalTag/warGoalProvince/isRebel/events/battles) and
// src/model/earth/history/date.ts's day encoding (365-day years, day 0 =
// 2 AD Jan 1).
//
// Every nationTag used below is an EXISTING owner tag found in
// events/provinces.json (either ROM/cp_roman_republic themselves, or an
// opposing cp_* tag -- see the grep-derived list in the readme). Every
// locationProvinceId/warGoalProvince is an EXISTING province id from
// provinces.json. Where the actual ancient battle site has no dedicated
// province in this dataset (e.g. Cannae, Trasimene), the nearest available
// province standing in for that region is used and flagged in the battle's
// `note`.
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
// Historical "218 BC" -> astronomical year -217 (no year zero).
function bc(year) {
	return 1 - year
}
function d(year, m = 1, day = 1) {
	return eu4DateToDays(bc(year), m, day)
}

function war({
	warId,
	name,
	casusBelli,
	warGoalType,
	warGoalTag = null,
	warGoalProvince = null,
	isRebel = false,
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
		isRebel,
		events,
		battles,
		note,
		sourceConfidence,
	}
}

function battle({
	year,
	m = 1,
	day = 1,
	name,
	locationProvinceId,
	attacker,
	defender,
	attackerWon,
	note,
}) {
	return {
		date: d(year, m, day),
		name,
		locationProvinceId,
		attacker,
		defender,
		attackerWon,
		note,
	}
}

// ---------------------------------------------------------------------
// REPUBLIC WARS (509-27 BC), fought under cp_roman_republic
// ---------------------------------------------------------------------
const republicWars = [
	war({
		warId: "pyrrhicWar",
		name: "Pyrrhic War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		attacker: ["cp_molossians"],
		defender: ["cp_roman_republic"],
		start: d(280, 1, 1),
		end: d(275, 1, 1),
		note: "Pyrrhus of Epirus (Molossian royal house) intervenes on behalf of Tarentum against Roman expansion in southern Italy.",
		battles: [
			battle({
				year: 280,
				name: "Heraclea",
				locationProvinceId: "122",
				attacker: {
					country: "cp_molossians",
					commander: "Pyrrhus of Epirus",
					infantry: 25000,
					cavalry: 3000,
					artillery: null,
					losses: 4000,
				},
				defender: {
					country: "cp_roman_republic",
					commander: "Publius Valerius Laevinus",
					infantry: 30000,
					cavalry: 3000,
					artillery: null,
					losses: 7000,
				},
				attackerWon: true,
				note: "Battle fought near Heraclea Lucaniae; provinces.json has no dedicated Lucanian province, so neighboring Apulia (122) stands in.",
			}),
			battle({
				year: 279,
				name: "Asculum",
				locationProvinceId: "122",
				attacker: {
					country: "cp_molossians",
					commander: "Pyrrhus of Epirus",
					infantry: 40000,
					cavalry: 6000,
					artillery: null,
					losses: 3500,
				},
				defender: {
					country: "cp_roman_republic",
					commander: "Publius Decius Mus",
					infantry: 40000,
					cavalry: 4000,
					artillery: null,
					losses: 6000,
				},
				attackerWon: true,
				note: "Origin of the term 'Pyrrhic victory'. Asculum Apulum was in Apulia (122).",
			}),
			battle({
				year: 275,
				name: "Beneventum",
				locationProvinceId: "122",
				attacker: {
					country: "cp_roman_republic",
					commander: "Manius Curius Dentatus",
					infantry: 20000,
					cavalry: 2000,
					artillery: null,
					losses: 3000,
				},
				defender: {
					country: "cp_molossians",
					commander: "Pyrrhus of Epirus",
					infantry: 20000,
					cavalry: 3000,
					artillery: null,
					losses: 8000,
				},
				attackerWon: true,
				note: "Beneventum sits on the Samnium/Campania border; no dedicated province exists in this dataset, so Apulia (122) stands in as the nearest available.",
			}),
		],
	}),
	war({
		warId: "firstPunicWar",
		name: "First Punic War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "125",
		attacker: ["cp_roman_republic"],
		defender: ["cp_carthage"],
		start: d(264, 1, 1),
		end: d(241, 1, 1),
		note: "Fought principally over control of Sicily.",
		battles: [
			battle({
				year: 262,
				name: "Agrigentum",
				locationProvinceId: "125",
				attacker: {
					country: "cp_roman_republic",
					commander: "Lucius Postumius Megellus",
					infantry: 40000,
					cavalry: null,
					artillery: null,
					losses: 30000,
				},
				defender: {
					country: "cp_carthage",
					commander: "Hannibal Gisco",
					infantry: 50000,
					cavalry: null,
					artillery: null,
					losses: 10000,
				},
				attackerWon: true,
				note: "Agrigentum (modern Agrigento) is in western Sicily; Palermo (125) stands in as the nearest modeled province.",
			}),
			battle({
				year: 256,
				name: "Ecnomus",
				locationProvinceId: "2982",
				attacker: {
					country: "cp_roman_republic",
					commander: "Marcus Atilius Regulus",
					infantry: null,
					cavalry: null,
					artillery: null,
					losses: 10000,
				},
				defender: {
					country: "cp_carthage",
					commander: "Hanno the Great",
					infantry: null,
					cavalry: null,
					artillery: null,
					losses: 30000,
				},
				attackerWon: true,
				note: "Naval battle off the southern Sicilian coast near Cape Ecnomus; Syracuse (2982) stands in as the nearest modeled coastal province.",
			}),
		],
	}),
	war({
		warId: "secondPunicWar",
		name: "Second Punic War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		attacker: ["cp_carthage"],
		defender: ["cp_roman_republic"],
		start: d(218, 1, 1),
		end: d(201, 1, 1),
		note: "Hannibal's invasion of Italy.",
		battles: [
			battle({
				year: 218,
				m: 12,
				day: 22,
				name: "Trebia",
				locationProvinceId: "2573",
				attacker: {
					country: "cp_carthage",
					commander: "Hannibal Barca",
					infantry: 20000,
					cavalry: 10000,
					artillery: null,
					losses: 5000,
				},
				defender: {
					country: "cp_roman_republic",
					commander: "Tiberius Sempronius Longus",
					infantry: 36000,
					cavalry: 4000,
					artillery: null,
					losses: 20000,
				},
				attackerWon: true,
				note: "Fought near the Trebia river close to Placentia (2573).",
			}),
			battle({
				year: 217,
				m: 6,
				day: 21,
				name: "Lake Trasimene",
				locationProvinceId: "2976",
				attacker: {
					country: "cp_carthage",
					commander: "Hannibal Barca",
					infantry: 40000,
					cavalry: 10000,
					artillery: null,
					losses: 2500,
				},
				defender: {
					country: "cp_roman_republic",
					commander: "Gaius Flaminius",
					infantry: 25000,
					cavalry: null,
					artillery: null,
					losses: 15000,
				},
				attackerWon: true,
				note: "Lake Trasimene sits in Etruria/Umbria; Umbria (2976) stands in as the nearest modeled province.",
			}),
			battle({
				year: 216,
				m: 8,
				day: 2,
				name: "Cannae",
				locationProvinceId: "122",
				attacker: {
					country: "cp_carthage",
					commander: "Hannibal Barca",
					infantry: 35000,
					cavalry: 10000,
					artillery: null,
					losses: 6000,
				},
				defender: {
					country: "cp_roman_republic",
					commander: "Lucius Aemilius Paullus",
					infantry: 70000,
					cavalry: 6000,
					artillery: null,
					losses: 50000,
				},
				attackerWon: true,
				note: "One of the costliest single-day defeats in Roman history; Cannae is in Apulia (122).",
			}),
			battle({
				year: 202,
				m: 10,
				day: 19,
				name: "Zama",
				locationProvinceId: "341",
				attacker: {
					country: "cp_roman_republic",
					commander: "Scipio Africanus",
					infantry: 29000,
					cavalry: 6100,
					artillery: null,
					losses: 1500,
				},
				defender: {
					country: "cp_carthage",
					commander: "Hannibal Barca",
					infantry: 36000,
					cavalry: 4000,
					artillery: 80,
					losses: 20000,
				},
				attackerWon: true,
				note: "Decisive battle of the war, fought southwest of Carthage; Tunis (341) stands in for the region.",
			}),
		],
	}),
	war({
		warId: "secondMacedonianWar",
		name: "Second Macedonian War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "3001",
		attacker: ["cp_roman_republic"],
		defender: ["cp_antigonid_macedonia"],
		start: d(200, 1, 1),
		end: d(197, 1, 1),
		battles: [
			battle({
				year: 197,
				m: 6,
				day: 23,
				name: "Cynoscephalae",
				locationProvinceId: "3001",
				attacker: {
					country: "cp_roman_republic",
					commander: "Titus Quinctius Flamininus",
					infantry: 26000,
					cavalry: null,
					artillery: null,
					losses: 700,
				},
				defender: {
					country: "cp_antigonid_macedonia",
					commander: "Philip V of Macedon",
					infantry: 25500,
					cavalry: null,
					artillery: null,
					losses: 8000,
				},
				attackerWon: true,
				note: "Fought in Thessaly; Macedonia (3001) stands in as the nearest modeled province.",
			}),
		],
	}),
	war({
		warId: "romanSeleucidWar",
		name: "Roman-Seleucid War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "318",
		attacker: ["cp_roman_republic", "cp_kingdom_of_pergamon"],
		defender: ["cp_seleucid_empire"],
		start: d(192, 1, 1),
		end: d(188, 1, 1),
		battles: [
			battle({
				year: 191,
				m: 4,
				day: 1,
				name: "Thermopylae",
				locationProvinceId: "146",
				attacker: {
					country: "cp_roman_republic",
					commander: "Manius Acilius Glabrio",
					infantry: 22000,
					cavalry: null,
					artillery: null,
					losses: 200,
				},
				defender: {
					country: "cp_seleucid_empire",
					commander: "Antiochus III",
					infantry: 10000,
					cavalry: 500,
					artillery: null,
					losses: 6000,
				},
				attackerWon: true,
				note: "No dedicated Thermopylae/Phocis province exists in this dataset; Athens (146) stands in for mainland Greece.",
			}),
			battle({
				year: 190,
				m: 12,
				day: 1,
				name: "Magnesia",
				locationProvinceId: "318",
				attacker: {
					country: "cp_roman_republic",
					commander: "Lucius Cornelius Scipio Asiaticus",
					infantry: 30000,
					cavalry: 3000,
					artillery: null,
					losses: 350,
				},
				defender: {
					country: "cp_seleucid_empire",
					commander: "Antiochus III",
					infantry: 60000,
					cavalry: 12000,
					artillery: null,
					losses: 30000,
				},
				attackerWon: true,
				note: "Magnesia ad Sipylum was near Smyrna (318).",
			}),
		],
	}),
	war({
		warId: "thirdMacedonianWar",
		name: "Third Macedonian War",
		casusBelli: "cb_annex",
		warGoalType: "annex_country",
		warGoalTag: "cp_antigonid_macedonia",
		attacker: ["cp_roman_republic"],
		defender: ["cp_antigonid_macedonia"],
		start: d(171, 1, 1),
		end: d(168, 1, 1),
		note: "Ended in the dissolution of the Antigonid kingdom into four Roman client republics.",
		battles: [
			battle({
				year: 168,
				m: 6,
				day: 22,
				name: "Pydna",
				locationProvinceId: "3001",
				attacker: {
					country: "cp_roman_republic",
					commander: "Lucius Aemilius Paullus",
					infantry: 26000,
					cavalry: null,
					artillery: null,
					losses: 100,
				},
				defender: {
					country: "cp_antigonid_macedonia",
					commander: "Perseus of Macedon",
					infantry: 32000,
					cavalry: 4000,
					artillery: null,
					losses: 20000,
				},
				attackerWon: true,
				note: "Ended Antigonid Macedon as an independent kingdom. Pydna is in Macedonia (3001).",
			}),
		],
	}),
	war({
		warId: "thirdPunicWar",
		name: "Third Punic War",
		casusBelli: "cb_annex",
		warGoalType: "annex_country",
		warGoalTag: "cp_carthage",
		attacker: ["cp_roman_republic"],
		defender: ["cp_carthage"],
		start: d(149, 1, 1),
		end: d(146, 1, 1),
		note: "Ended with the destruction of Carthage.",
		battles: [
			battle({
				year: 146,
				m: 1,
				day: 1,
				name: "Siege of Carthage",
				locationProvinceId: "341",
				attacker: {
					country: "cp_roman_republic",
					commander: "Scipio Aemilianus",
					infantry: 40000,
					cavalry: null,
					artillery: null,
					losses: 2000,
				},
				defender: {
					country: "cp_carthage",
					commander: "Hasdrubal the Boetharch",
					infantry: null,
					cavalry: null,
					artillery: null,
					losses: 25000,
				},
				attackerWon: true,
				note: "Carthage itself is not separately modeled; Tunis (341) stands in for the site.",
			}),
		],
	}),
	war({
		warId: "achaeanWar",
		name: "Achaean War",
		casusBelli: "cb_annex",
		warGoalType: "annex_country",
		warGoalTag: "cp_achaea",
		attacker: ["cp_roman_republic"],
		defender: ["cp_achaea"],
		start: d(146, 1, 1),
		end: d(146, 1, 1),
		note: "Ended Greek political independence; Corinth was razed the same year Carthage fell.",
		battles: [
			battle({
				year: 146,
				m: 1,
				day: 1,
				name: "Corinth",
				locationProvinceId: "4701",
				attacker: {
					country: "cp_roman_republic",
					commander: "Lucius Mummius",
					infantry: 23000,
					cavalry: 3500,
					artillery: null,
					losses: 500,
				},
				defender: {
					country: "cp_achaea",
					commander: "Diaeus of Megalopolis",
					infantry: 14000,
					cavalry: null,
					artillery: null,
					losses: 5000,
				},
				attackerWon: true,
			}),
		],
	}),
	war({
		warId: "jugurthineWar",
		name: "Jugurthine War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "340",
		attacker: ["cp_roman_republic"],
		defender: ["cp_kingdom_of_numidia"],
		start: d(112, 1, 1),
		end: d(106, 1, 1),
		note: "Career-making war for Marius and Sulla.",
		battles: [
			battle({
				year: 108,
				name: "Muthul",
				locationProvinceId: "340",
				attacker: {
					country: "cp_roman_republic",
					commander: "Quintus Caecilius Metellus Numidicus",
					infantry: 30000,
					cavalry: null,
					artillery: null,
					losses: 500,
				},
				defender: {
					country: "cp_kingdom_of_numidia",
					commander: "Jugurtha",
					infantry: null,
					cavalry: 10000,
					artillery: null,
					losses: 3000,
				},
				attackerWon: true,
				note: "Fought along the Muthul river near Cirta (modern Constantine, 340).",
			}),
		],
	}),
	war({
		warId: "thirdMithridaticWar",
		name: "Third Mithridatic War",
		casusBelli: "cb_annex",
		warGoalType: "annex_country",
		warGoalTag: "cp_kingdom_of_pontus",
		attacker: ["cp_roman_republic"],
		defender: ["cp_kingdom_of_pontus"],
		start: d(73, 1, 1),
		end: d(63, 1, 1),
		note: "Ended Pontic independence; Pompey annexed the kingdom's core.",
		battles: [
			battle({
				year: 67,
				name: "Zela",
				locationProvinceId: "328",
				attacker: {
					country: "cp_kingdom_of_pontus",
					commander: "Mithridates VI",
					infantry: null,
					cavalry: null,
					artillery: null,
					losses: 1000,
				},
				defender: {
					country: "cp_roman_republic",
					commander: "Gaius Valerius Triarius",
					infantry: 7000,
					cavalry: null,
					artillery: null,
					losses: 7000,
				},
				attackerWon: true,
				note: "Rare Pontic victory. Zela is in the Pontic heartland; Sinope (328) stands in as the nearest modeled province.",
			}),
		],
	}),
	war({
		warId: "finalWarOfTheRomanRepublic",
		name: "Final War of the Roman Republic",
		casusBelli: "cb_civil_war",
		warGoalType: "annex_country",
		warGoalTag: "cp_ptolemaic_kingdom",
		attacker: ["cp_roman_republic"],
		defender: ["cp_ptolemaic_kingdom"],
		start: d(32, 1, 1),
		end: d(30, 1, 1),
		note: "Octavian (leading the Roman Republic's western legions) vs. Mark Antony and Cleopatra VII's Ptolemaic Kingdom. Octavian's side is tagged cp_roman_republic since Augustus's imperial title was not granted until 27 BC, after this war's end -- see audits/ROM.json.",
		battles: [
			battle({
				year: 31,
				m: 9,
				day: 2,
				name: "Actium",
				locationProvinceId: "146",
				attacker: {
					country: "cp_roman_republic",
					commander: "Marcus Vipsanius Agrippa",
					infantry: null,
					cavalry: null,
					artillery: null,
					losses: 2500,
				},
				defender: {
					country: "cp_ptolemaic_kingdom",
					commander: "Mark Antony",
					infantry: null,
					cavalry: null,
					artillery: null,
					losses: 5000,
				},
				attackerWon: true,
				note: "Naval battle off the Ambracian Gulf in Epirus; no dedicated province exists in this dataset, so Athens (146) stands in for Greece.",
			}),
			battle({
				year: 30,
				m: 8,
				day: 1,
				name: "Alexandria",
				locationProvinceId: "358",
				attacker: {
					country: "cp_roman_republic",
					commander: "Octavian",
					infantry: null,
					cavalry: null,
					artillery: null,
					losses: 500,
				},
				defender: {
					country: "cp_ptolemaic_kingdom",
					commander: "Mark Antony",
					infantry: null,
					cavalry: null,
					artillery: null,
					losses: 3000,
				},
				attackerWon: true,
				note: "Ended with Antony and Cleopatra's suicides and Egypt's annexation.",
			}),
		],
	}),
]

// ---------------------------------------------------------------------
// EMPIRE WARS (27 BC - 2 AD), fought under ROM
// ---------------------------------------------------------------------
const empireWars = [
	war({
		warId: "romanKushiteWar",
		name: "Roman-Kushite War",
		casusBelli: "cb_border_war",
		warGoalType: "take_border",
		warGoalProvince: "1234",
		attacker: ["cp_kingdom_of_kush"],
		defender: ["ROM"],
		start: d(27, 1, 1),
		end: d(22, 1, 1),
		note: "Kushite raids into newly annexed Roman Egypt, followed by a Roman punitive expedition under Petronius that sacked Napata. The only well-attested Roman war within the narrow 27 BC-2 AD Empire window that this dataset provides an opposing tag for (cp_kingdom_of_kush); other candidates from the period (e.g. the Cantabrian Wars) have no matching tag in provinces.json and are omitted rather than invented.",
		battles: [
			battle({
				year: 24,
				name: "Sack of Napata",
				locationProvinceId: "1234",
				attacker: {
					country: "ROM",
					commander: "Gaius Petronius",
					infantry: 10000,
					cavalry: 800,
					artillery: null,
					losses: 300,
				},
				defender: {
					country: "cp_kingdom_of_kush",
					commander: "Amanirenas",
					infantry: null,
					cavalry: null,
					artillery: null,
					losses: 1500,
				},
				attackerWon: true,
				note: "Napata is in Nubia; no dedicated province exists in this dataset, so Nubia (1234) stands in.",
			}),
		],
	}),
]

republicWars.sort((a, b) => a.events[0].date - b.events[0].date)
empireWars.sort((a, b) => a.events[0].date - b.events[0].date)

const outDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits", "wars")
fs.mkdirSync(outDir, { recursive: true })

const republicOut = {
	_readme:
		"Audit/proposal file: reconstructed pre-2AD wars fought by the Republic-era tag 'cp_roman_republic' (509-27 BC). Companion to audits/cp_roman_republic.json. Mirrors events/wars.json's schema exactly, with two extra fields per war/battle for review: 'note' and (war-level only) 'sourceConfidence'. Not wired into the engine. All nationTags are existing owner tags from events/provinces.json (grep the readme note in build-rome-wars-audit.cjs for the full list checked). Where an ancient battle site has no dedicated province in provinces.json, the nearest available province stands in and is flagged in that battle's own 'note'. Casualty figures follow commonly cited ancient-source totals (Polybius, Livy, Appian) and should be read as traditional/approximate, not archaeologically verified.",
	wars: republicWars,
}
const empireOut = {
	_readme:
		"Audit/proposal file: reconstructed pre-2AD wars fought by ROM (27 BC - 2 AD, the Empire's first three decades). Companion to audits/ROM.json. Mirrors events/wars.json's schema exactly, with two extra fields per war/battle for review: 'note' and (war-level only) 'sourceConfidence'. Not wired into the engine. Only one clean match was found for this narrow window with an opposing tag that exists in events/provinces.json (cp_kingdom_of_kush); other Augustan-era wars (Cantabrian Wars, Alpine campaigns, etc.) were left out rather than assigned an invented tag.",
	wars: empireWars,
}

fs.writeFileSync(
	path.join(outDir, "republic-wars.json"),
	JSON.stringify(republicOut, null, "\t") + "\n",
)
fs.writeFileSync(
	path.join(outDir, "empire-wars.json"),
	JSON.stringify(empireOut, null, "\t") + "\n",
)
console.log("republic wars:", republicWars.length, "empire wars:", empireWars.length)
