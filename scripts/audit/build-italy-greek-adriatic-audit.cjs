// One-off generator for the Italy / Greek league / Adriatic-Thracian pre-2AD audit batch.
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
	"Audit/proposal file: reconstructed pre-2AD events for the Italy / Greek league / Adriatic-Thracian batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. ProvinceEvents are deliberately narrow and only correct clear baseline mismatches using existing culture/religion ids: etruscan, greek, illyrian, thracian, hellenism, and zamolxism. No new culture or religion ids are proposed in this batch."

const monarchyReform = "autocracy_reform"
const republicReform = "oligarchy_reform"
const merchantReform = "merchants_reform"
const tribalReform = "tribal_kingdom"

function addCore(builder, year, governmentType, reformId, govNote, reformNote) {
	builder.govChange(year, governmentType, govNote)
	builder.reformAdd(year, reformId, reformNote)
}

const etruscanCore = ["115", "116", "117", "118", "2976", "2978", "4731", "4732"]
const etruscanNorth = ["106", "109", "113", "114", "2980", "4729", "4730"]
const etruscans = nationBuilder("cp_etruscans", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: [...etruscanCore, ...etruscanNorth, "1247"],
			year: 750,
			cultureId: "etruscan",
			religionId: "hellenism",
			note: "Uses existing etruscan culture and hellenism as the closest available ancient Mediterranean religion for the Etruscan league footprint; source baselines include later Roman/Umbrian/Venetian splits.",
		},
	]),
})
addCore(etruscans, 750, "republic", republicReform, "Etruscan city-state league emerges in Etruria and the Po/Tyrrhenian sphere", "Reuses oligarchy reform for aristocratic city leagues.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[750, "Villanovan-Etruscan chiefs", "Early Etruscan urbanizing horizon before secure named rulers", "abstraction"],
	[616, "Tarquinius Priscus", "Etruscan king of Rome in later Roman tradition"],
	[578, "Servius Tullius", "Roman tradition places him in the Etruscan royal sequence"],
	[535, "Etruscan thalassocracy", "Etruscan and Carthaginian forces check Phocaean expansion after Alalia", "abstraction"],
	[509, "Tarquinius Superbus", "Last Roman king; his expulsion marks Roman separation from Etruscan monarchy"],
	[474, "Etruscan maritime decline", "Defeat near Cumae weakens Etruscan sea power", "abstraction"],
	[396, "Veientine lords", "Fall of Veii to Rome begins the durable Roman advance into Etruria"],
	[283, "Etruscan league remnants", "Late Etruscan resistance after Lake Vadimo", "abstraction"],
	[264, "Volsinii aristocracy", "Roman intervention at Volsinii marks final independent Etruscan city politics", "abstraction"],
]) {
	etruscans.ruler(year, name, { dynasty: "Etruscan", note, sourceConfidence })
}

const italianCityStates = nationBuilder("cp_italian_city_states", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["119", "120", "122", "1933", "1934", "2985", "4733"],
			year: 91,
			cultureId: null,
			religionId: "hellenism",
			note: "Keeps existing Italic/Greek cultures but confirms the existing hellenism bucket for pre-Christian Italic civic cults in the Social War footprint.",
		},
	]),
})
addCore(italianCityStates, 91, "republic", republicReform, "Italian allied communities organize during the Social War against Rome", "Reuses oligarchy reform for allied municipal aristocracies.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[91, "Italian allied councils", "Marsic/Samnite/Italian allies organize against Rome after the failure of reform", "abstraction"],
	[90, "Q. Poppaedius Silo", "Marsic leader and one of the best-known commanders of the Social War"],
	[90, "Gaius Papius Mutilus", "Samnite leader in the southern Italian theater"],
	[89, "Italian confederate magistrates", "War leadership continues as Rome grants citizenship to divide the rebels", "abstraction"],
	[88, "Samnite-Lucanian holdouts", "Remaining Italian rebels continue after most communities accept Roman citizenship", "abstraction"],
]) {
	italianCityStates.ruler(year, name, { dynasty: "Italic Confederates", note, sourceConfidence })
}

const peloponnesian = nationBuilder("cp_sparta")
addCore(peloponnesian, 550, "republic", republicReform, "Sparta organizes the Peloponnesian League as a hegemonic alliance", "Reuses oligarchy reform for league councils under Spartan leadership.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[550, "Spartan kings and ephors", "Collective marker for early league organization under Sparta", "abstraction"],
	[500, "Cleomenes I and Demaratus", "Spartan dual kings at the Persian War threshold"],
	[480, "Leonidas I", "Spartan king at Thermopylae"],
	[479, "Pausanias", "Spartan regent and commander at Plataea"],
	[431, "Archidamus II", "Spartan king at the start of the Peloponnesian War"],
	[405, "Lysander", "Spartan commander whose victory at Aegospotami ends Athenian naval power"],
	[371, "Cleombrotus I", "Spartan king defeated and killed at Leuctra"],
	[338, "Spartan league remnants", "Sparta remains outside Macedonian-dominated settlements but loses broad league hegemony", "abstraction"],
]) {
	peloponnesian.ruler(year, name, { dynasty: "Spartan", note, sourceConfidence })
}

const aetolian = nationBuilder("cp_aetolia")
addCore(aetolian, 370, "republic", republicReform, "Aetolian federal league develops in central Greece", "Reuses oligarchy reform for Greek federal league institutions.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[370, "Aetolian federal councils", "Early league formation is poorly dated", "abstraction"],
	[279, "Aetolian defenders of Delphi", "Aetolian prestige rises after repelling the Gallic attack on Delphi"],
	[245, "Aetolian strategoi", "League reaches peak influence in central Greece", "abstraction"],
	[220, "Scopas of Aetolia", "Aetolian leader at the start of the Social War against Macedon and the Achaean League"],
	[191, "Aetolian anti-Roman faction", "Aetolia allies with Antiochus III against Rome"],
	[189, "Aetolian League under Roman settlement", "Roman victory forces Aetolia into dependency", "abstraction"],
]) {
	aetolian.ruler(year, name, { dynasty: "Aetolian League", note, sourceConfidence })
}

const achaean = nationBuilder("cp_achaea")
addCore(achaean, 280, "republic", republicReform, "Achaean League refounds as a federal Greek league in the northern Peloponnese", "Reuses oligarchy reform for federal league institutions.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[280, "Achaean federal councils", "Early refounded league before Aratus's leadership", "abstraction"],
	[245, "Aratus of Sicyon", "Dominant Achaean statesman who brought Sicyon and Corinth into the league"],
	[226, "Aratus after Cleomenic pressure", "Achaean League seeks Macedonian help against Sparta", "abstraction"],
	[220, "Achaean strategoi", "League fights alongside Macedon in the Social War", "abstraction"],
	[198, "Philopoemen", "Achaean statesman and general in the Roman-Macedonian era"],
	[146, "Critolaus and Diaeus", "Last Achaean leaders before Roman destruction of Corinth"],
]) {
	achaean.ruler(year, name, { dynasty: "Achaean League", note, sourceConfidence })
}

const molossians = nationBuilder("cp_molossians")
addCore(molossians, 470, "monarchy", monarchyReform, "Molossian kings rule Epirus before the later Epirote League", "Reuses autocracy reform for dynastic kingship.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[470, "Admetus", "Molossian king known from Themistocles's exile tradition; chronology approximate"],
	[429, "Tharyps", "Molossian king credited with Hellenizing reforms in Epirus"],
	[385, "Alcetas I", "Molossian king restored with Dionysius of Syracuse's support"],
	[342, "Arybbas", "Molossian king and rival of Alexander I of Epirus"],
	[342, "Alexander I of Epirus", "Molossian/Epirote king who campaigned in Italy"],
	[297, "Pyrrhus", "Aiakid king of Epirus; later fought Rome and Macedon"],
	[272, "Epirote regency", "After Pyrrhus's death, Molossian monarchy declines toward federal structures", "abstraction"],
]) {
	molossians.ruler(year, name, { dynasty: "Aeacid", note, sourceConfidence })
}

const illyrian = nationBuilder("cp_illyrian_kingdom", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["137", "138", "139", "143", "1766", "1831", "4174", "4175", "4750", "4754"],
			year: 250,
			cultureId: "illyrian",
			religionId: "hellenism",
			note: "Uses existing illyrian culture for the Ardiaean/Illyrian royal sphere; source baselines mix later Dalmatian, Greek, Thracian, and Albanian labels. Hellenism is the closest available pre-Christian Balkan cult bucket.",
		},
	]),
})
addCore(illyrian, 250, "monarchy", tribalReform, "Ardiaean Illyrian kingdom expands along the Adriatic coast", "Reuses tribal kingdom reform for Illyrian royal-confederate structure.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[250, "Pleuratus II", "Early Ardiaean ruler in the pre-Teuta royal sequence"],
	[231, "Agron", "Illyrian king whose naval power challenged Greek and Roman interests"],
	[230, "Teuta", "Queen-regent during the First Illyrian War"],
	[228, "Demetrius of Pharos", "Illyrian dynast and Roman client turned opponent"],
	[181, "Pleuratus III", "Illyrian king allied with Rome against Macedon"],
	[168, "Gentius", "Last major Illyrian king, defeated by Rome in the Third Illyrian War"],
]) {
	illyrian.ruler(year, name, { dynasty: "Ardiaean", note, sourceConfidence })
}

const odrysian = nationBuilder("cp_odrysian_kingdom", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["149", "150", "159", "1764", "2750", "3250", "4703", "4704"],
			year: 480,
			cultureId: "thracian",
			religionId: "zamolxism",
			note: "Uses existing thracian culture and zamolxism for the Odrysian/Thracian core; source baselines already mostly agree but this normalizes Greek/Hellenism coastal spillovers in the audit footprint.",
		},
	]),
})
addCore(odrysian, 480, "monarchy", tribalReform, "Odrysian kingdom consolidates Thracian tribes after the Persian withdrawal", "Reuses tribal kingdom reform for Odrysian royal confederation.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[480, "Teres I", "Traditional founder of the Odrysian kingdom"],
	[431, "Sitalces", "Powerful Odrysian king and Athenian ally during the Peloponnesian War"],
	[424, "Seuthes I", "Odrysian ruler after Sitalces"],
	[405, "Amadocus I", "Odrysian king during internal division with Seuthes II"],
	[400, "Seuthes II", "Odrysian claimant and ally of Xenophon's mercenaries"],
	[360, "Cotys I", "Strong Odrysian king before Macedonian intervention"],
	[341, "Cersobleptes", "Odrysian ruler defeated by Philip II of Macedon"],
	[323, "Seuthes III", "Odrysian ruler who reasserted Thracian autonomy after Alexander's death"],
	[281, "Odrysian successor kings", "Later Odrysian kings under Celtic, Macedonian, and local pressure", "abstraction"],
]) {
	odrysian.ruler(year, name, { dynasty: "Odrysian", note, sourceConfidence })
}

const wars = [
	war({
		warId: "battleOfAlalia",
		name: "Battle of Alalia",
		casusBelli: "cb_trade_war",
		warGoalType: "take_province",
		warGoalTag: "cp_etruscans",
		warGoalProvince: "1247",
		attacker: ["cp_etruscans", "cp_carthage"],
		defender: ["cp_syracuse"],
		start: d(540),
		end: d(535),
		note: "Etruscans and Carthaginians check Phocaean Greek expansion near Corsica.",
		battles: [
			battle({
				year: 535,
				name: "Battle of Alalia",
				locationProvinceId: "1247",
				attacker: { country: "cp_etruscans", commander: "Etruscan-Carthaginian fleet", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_syracuse", commander: "Phocaean fleet", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Corsica is directly represented by province 1247.",
			}),
		],
	}),
	war({
		warId: "romanEtruscanWars",
		name: "Roman-Etruscan wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_etruscans",
		warGoalProvince: "116",
		attacker: ["cp_roman_republic"],
		defender: ["cp_etruscans"],
		start: d(509),
		end: d(264),
		note: "Long Roman advance from the expulsion of the Tarquins through Veii, Lake Vadimo, and Volsinii.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 396,
				name: "Fall of Veii",
				locationProvinceId: "116",
				attacker: { country: "cp_roman_republic", commander: "Marcus Furius Camillus", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_etruscans", commander: "Veientine defenders", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Firenze (116) is a stand-in for Veii because southern Etruria is coarsely represented.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 283,
				name: "Battle of Lake Vadimo",
				locationProvinceId: "2976",
				attacker: { country: "cp_roman_republic", commander: "P. Cornelius Dolabella", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_etruscans", commander: "Etruscan and Gallic coalition", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Umbria (2976) stands in for the Lake Vadimo theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "socialWar",
		name: "Social War",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_italian_city_states",
		warGoalProvince: "120",
		attacker: ["cp_italian_city_states"],
		defender: ["cp_roman_republic"],
		start: d(91),
		end: d(88),
		note: "Rome's Italian allies rebel for citizenship and political equality.",
		battles: [
			battle({
				year: 90,
				name: "Battle of Fucine Lake",
				locationProvinceId: "120",
				attacker: { country: "cp_italian_city_states", commander: "Q. Poppaedius Silo", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_roman_republic", commander: "Roman consular forces", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Abbruzzi (120) stands in for the Marsic theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "peloponnesianWarLeague",
		name: "Peloponnesian War",
		casusBelli: "cb_hegemon",
		warGoalType: "take_capital",
		warGoalTag: "cp_athens",
		warGoalProvince: "146",
		attacker: ["cp_sparta"],
		defender: ["cp_athens"],
		start: d(431),
		end: d(404),
		note: "Sparta and its league defeat the Athenian coalition; Athens has a separate covered audit tag.",
		battles: [
			battle({
				year: 405,
				name: "Battle of Aegospotami",
				locationProvinceId: "4701",
				attacker: { country: "cp_sparta", commander: "Lysander", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_athens", commander: "Athenian fleet", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Corinth (4701) stands in for the Aegean naval theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "boeotianWarLeuctra",
		name: "Boeotian War and Leuctra",
		casusBelli: "cb_hegemon",
		warGoalType: "take_province",
		warGoalTag: "cp_sparta",
		warGoalProvince: "145",
		attacker: ["cp_thebans"],
		defender: ["cp_sparta"],
		start: d(378),
		end: d(371),
		note: "Theban victory at Leuctra breaks Spartan/Peloponnesian League hegemony.",
		battles: [
			battle({
				year: 371,
				name: "Battle of Leuctra",
				locationProvinceId: "145",
				attacker: { country: "cp_thebans", commander: "Epaminondas", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_sparta", commander: "Cleombrotus I", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Morea (145) is an imperfect stand-in for the Boeotian-Spartan theater.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "cleomeneanWar",
		name: "Cleomenean War",
		casusBelli: "cb_hegemon",
		warGoalType: "take_province",
		warGoalTag: "cp_achaea",
		warGoalProvince: "1773",
		attacker: ["cp_sparta"],
		defender: ["cp_achaea", "cp_antigonid_macedonia"],
		start: d(229),
		end: d(222),
		note: "Sparta under Cleomenes III fights the Achaean League and Macedon.",
		battles: [
			battle({
				year: 222,
				name: "Battle of Sellasia",
				locationProvinceId: "145",
				attacker: { country: "cp_antigonid_macedonia", commander: "Antigonus III Doson", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_sparta", commander: "Cleomenes III", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Morea (145) stands in for Sellasia in Laconia.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "socialWarGreekLeagues",
		name: "Greek Social War",
		casusBelli: "cb_hegemon",
		warGoalType: "take_province",
		warGoalTag: "cp_aetolia",
		warGoalProvince: "4699",
		attacker: ["cp_aetolia"],
		defender: ["cp_achaea", "cp_antigonid_macedonia"],
		start: d(220),
		end: d(217),
		note: "Aetolian League fights Macedon and the Achaean League until the Peace of Naupactus.",
		battles: [],
	}),
	war({
		warId: "romanAchaeanWar",
		name: "Achaean War",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_achaea",
		warGoalProvince: "4701",
		attacker: ["cp_roman_republic"],
		defender: ["cp_achaea"],
		start: d(146),
		end: d(146),
		note: "Rome defeats the Achaean League and destroys Corinth.",
		battles: [
			battle({
				year: 146,
				name: "Battle of Corinth",
				locationProvinceId: "4701",
				attacker: { country: "cp_roman_republic", commander: "Lucius Mummius", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_achaea", commander: "Diaeus", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Corinth is directly represented by province 4701.",
			}),
		],
	}),
	war({
		warId: "pyrrhicWar",
		name: "Pyrrhic War",
		casusBelli: "cb_intervention",
		warGoalType: "take_province",
		warGoalTag: "cp_roman_republic",
		warGoalProvince: "118",
		attacker: ["cp_molossians"],
		defender: ["cp_roman_republic"],
		start: d(280),
		end: d(275),
		note: "Pyrrhus of Epirus intervenes in Italy against Rome.",
		battles: [
			battle({
				year: 280,
				name: "Battle of Heraclea",
				locationProvinceId: "1934",
				attacker: { country: "cp_molossians", commander: "Pyrrhus", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_roman_republic", commander: "Publius Valerius Laevinus", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Lucania (1934) stands in for Heraclea.",
				sourceConfidence: "abstraction",
			}),
			battle({
				year: 275,
				name: "Battle of Beneventum",
				locationProvinceId: "4733",
				attacker: { country: "cp_roman_republic", commander: "Manius Curius Dentatus", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_molossians", commander: "Pyrrhus", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Molise (4733) stands in for Beneventum.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "illyrianWars",
		name: "Illyrian Wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_illyrian_kingdom",
		warGoalProvince: "4174",
		attacker: ["cp_roman_republic"],
		defender: ["cp_illyrian_kingdom"],
		start: d(229),
		end: d(168),
		note: "Rome fights the Ardiaean/Illyrian kingdom from Teuta through Gentius.",
		battles: [
			battle({
				year: 168,
				name: "Fall of Scodra",
				locationProvinceId: "4174",
				attacker: { country: "cp_roman_republic", commander: "Lucius Anicius Gallus", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_illyrian_kingdom", commander: "Gentius", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Durres (4174) stands in for Scodra/Illyrian royal center.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "macedonianConquestOfThrace",
		name: "Macedonian conquest of Thrace",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_odrysian_kingdom",
		warGoalProvince: "2750",
		attacker: ["cp_macedonian_empire"],
		defender: ["cp_odrysian_kingdom"],
		start: d(352),
		end: d(341),
		note: "Philip II defeats the Odrysian kings and brings Thrace under Macedonian domination.",
		battles: [],
	}),
	war({
		warId: "seuthesAgainstLysimachus",
		name: "Seuthes III's war against Lysimachus",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_odrysian_kingdom",
		warGoalProvince: "2750",
		attacker: ["cp_odrysian_kingdom"],
		defender: ["cp_kingdom_of_lysimachus"],
		start: d(323),
		end: d(281),
		note: "Seuthes III and later Thracian resistance contest Lysimachus's Macedonian successor kingdom.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
]

const revolts = {
	"116": {
		events: [
			revoltEvent({
				year: 264,
				type: "particularist_rebels",
				size: 3,
				comment: "Volsinii crisis",
				note: "Roman intervention in Volsinii followed internal upheaval in the Etruscan city; no separate local tag exists.",
				sourceConfidence: "abstraction",
			}),
		],
	},
	"120": {
		events: [
			revoltEvent({
				year: 91,
				type: "particularist_rebels",
				size: 5,
				leader: "Q. Poppaedius Silo",
				comment: "Italian Social War uprising",
				note: "Companion revolt marker for the Italian allies' rebellion against Rome.",
			}),
		],
	},
	"4699": {
		events: [
			revoltEvent({
				year: 191,
				type: "particularist_rebels",
				size: 3,
				comment: "Aetolian anti-Roman agitation",
				note: "Aetolia's anti-Roman faction brings Antiochus III into Greece; no separate faction tag exists.",
				sourceConfidence: "abstraction",
			}),
		],
	},
}

function writeNation(builder) {
	const out = { _readme: readme, tag: builder.tag, events: builder.events.sort((a, b) => a.date - b.date) }
	if (builder.provinceEvents) out.provinceEvents = builder.provinceEvents
	fs.writeFileSync(path.join(auditsDir, `${builder.tag}.json`), JSON.stringify(out, null, "\t") + "\n")
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
const revoltsDir = path.join(auditsDir, "revolts")
fs.mkdirSync(warsDir, { recursive: true })
fs.mkdirSync(revoltsDir, { recursive: true })

const builders = [etruscans, italianCityStates, peloponnesian, aetolian, achaean, molossians, illyrian, odrysian]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "italy-greek-adriatic-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the Italy / Greek league / Adriatic-Thracian batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields. Some broader wars overlap famous conflicts in prior Greek/Roman audit files, but these entries supply the still-uncovered league/kingdom side.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "italy-greek-adriatic-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Italy / Greek league / Adriatic-Thracian batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, and ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts`)
