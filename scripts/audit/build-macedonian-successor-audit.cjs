// One-off generator for the Macedonian/Diadochi pre-2AD audit batch.
// Writes:
//   - public/earth-history/audits/cp_macedonian_empire.json
//   - public/earth-history/audits/cp_antigonid_dynasty.json
//   - public/earth-history/audits/cp_antigonid_macedonia.json
//   - public/earth-history/audits/cp_kingdom_of_lysimachus.json
//   - public/earth-history/audits/wars/macedonian-successor-wars.json
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
	"Audit/proposal file: reconstructed pre-2AD events for the Macedonian/Diadochi batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Dates use real historical BCE years. The early Argead list is poorly dated before Amyntas I/Alexander I, so early entries are marked sourceConfidence: 'abstraction'. Alexander's Persian campaign already exists as audits/wars/pilot-nations-wars.json:warsOfAlexander and is referenced rather than duplicated."

// =======================================================================
// MACEDONIAN EMPIRE / ARGEADS (cp_macedonian_empire)
// =======================================================================
const macedon = nationBuilder("cp_macedonian_empire")
macedon.govChange(650, "monarchy", "Approximate Argead consolidation of Macedon; early reign dates are reconstructed from later king lists")
macedon.reformAdd(650, "aristocratic_monarchy", "Reuses an existing monarchy reform id for the early Macedonian hereditary kingship", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[650, "Perdiccas I", "Traditional founder in Herodotus/Thucydides-derived Argead tradition; dates are approximate", "abstraction"],
	[620, "Argaeus I", "Early Argead king; reign chronology is reconstructed and uncertain", "abstraction"],
	[590, "Philip I", "Early Argead king; reign chronology is reconstructed and uncertain", "abstraction"],
	[560, "Aeropus I", "Early Argead king; reign chronology is reconstructed and uncertain", "abstraction"],
	[540, "Alcetas I", "Early Argead king; reign chronology is reconstructed and uncertain", "abstraction"],
	[512, "Amyntas I", "Earliest Macedonian king with firmer external historical context through Achaemenid and Greek relations"],
	[498, "Alexander I", "Known as Philhellene; navigated Macedon's position during the Persian Wars"],
	[454, "Alcetas II", "Short-reigned Argead king in the mid-5th century BC"],
	[448, "Perdiccas II", "Ruled through the Peloponnesian War era, balancing Athens, Sparta, and regional rivals"],
	[413, "Archelaus I", "Centralizing ruler who strengthened Macedonian administration and military capacity"],
	[399, "Orestes", "Minor/child king after Archelaus; regency and succession violence dominate this period", "abstraction"],
	[396, "Aeropus II", "Regent and then king during the unstable post-Archelaus succession"],
	[393, "Amyntas II", "Brief claimant in the post-Archelaus succession crisis"],
	[393, "Pausanias", "Brief claimant killed by Amyntas III; included for the full attested succession"],
	[393, "Amyntas III", "Restored Argead stability after a succession crisis and Illyrian pressure"],
	[370, "Alexander II", "Assassinated after a short reign amid noble factional conflict"],
	[368, "Ptolemy of Aloros", "Regent/usurper for Perdiccas III; included because he exercised royal authority", "abstraction"],
	[365, "Perdiccas III", "Killed fighting Illyrians in 359 BC"],
	[359, "Philip II", "Transformed Macedon into the dominant Greek power; victor at Chaeronea and founder of the League of Corinth"],
	[336, "Alexander III the Great", "Conquered the Achaemenid Empire; his Persian campaign is already represented in pilot-nations-wars.json:warsOfAlexander"],
	[323, "Philip III Arrhidaeus", "Half-brother of Alexander; nominal co-king during the regency struggles after Alexander's death"],
	[323, "Alexander IV", "Infant son of Alexander the Great and Roxane; murdered on Cassander's orders around 310/309 BC, ending the Argead line"],
]) {
	macedon.ruler(year, name, { dynasty: "Argead", note, sourceConfidence: confidence })
}
macedon.reformAdd(338, "hellenic_league_hegemon", "Proposed new reform id: Philip II's League of Corinth made Macedon hegemon of most Greek poleis; no existing reform captures this pre-Hellenistic federal hegemony", "abstraction")

// =======================================================================
// EARLY ANTIGONID ASIAN KINGDOM (cp_antigonid_dynasty)
// =======================================================================
const antigonidDynasty = nationBuilder("cp_antigonid_dynasty")
antigonidDynasty.govChange(306, "monarchy", "Antigonus I and Demetrius take the royal title after the naval victory at Salamis")
antigonidDynasty.reformAdd(306, "satrap_diadochi", "Reuses the existing Diadochi/satrapal monarchy reform already used by the Seleucid audit")
antigonidDynasty.ruler(306, "Antigonus I Monophthalmus", {
	dynasty: "Antigonid",
	note: "One of Alexander's senior generals; attempted to reunify Alexander's empire before being killed at Ipsus in 301 BC",
})
antigonidDynasty.ruler(301, "Demetrius I Poliorcetes", {
	dynasty: "Antigonid",
	note: "Son of Antigonus I; continued the Antigonid cause after Ipsus and briefly seized Macedon in 294 BC",
})

// =======================================================================
// ANTIGONID MACEDONIA (cp_antigonid_macedonia)
// =======================================================================
const antigonidMacedonia = nationBuilder("cp_antigonid_macedonia")
antigonidMacedonia.govChange(294, "monarchy", "Demetrius I Poliorcetes seizes Macedon during the struggles after Cassander's sons")
antigonidMacedonia.reformAdd(294, "aristocratic_monarchy", "Reuses an existing monarchy reform id for Antigonid rule in Macedon", "abstraction")
for (const [year, name, note] of [
	[294, "Demetrius I Poliorcetes", "First Antigonid king of Macedon; expelled by Pyrrhus and Lysimachus in 288 BC"],
	[277, "Antigonus II Gonatas", "Established durable Antigonid control after the Celtic invasion and Macedonian succession chaos"],
	[239, "Demetrius II Aetolicus", "Son of Antigonus II; fought Aetolian and Epirote rivals and died after defeat by Dardanians"],
	[229, "Antigonus III Doson", "Regent-king who restored Macedonian influence in Greece and defeated Sparta at Sellasia"],
	[221, "Philip V", "Brought Macedon into conflict with Rome; First and Second Macedonian Wars already live in republic-wars.json"],
	[179, "Perseus", "Last Antigonid king; defeated by Rome at Pydna in 168 BC, already represented in republic-wars.json"],
]) {
	antigonidMacedonia.ruler(year, name, { dynasty: "Antigonid", note })
}

// =======================================================================
// KINGDOM OF LYSIMACHUS (cp_kingdom_of_lysimachus)
// =======================================================================
const lysimachus = nationBuilder("cp_kingdom_of_lysimachus")
lysimachus.govChange(306, "monarchy", "Lysimachus, Alexander's former bodyguard and satrap of Thrace, assumes the royal title")
lysimachus.reformAdd(306, "satrap_diadochi", "Reuses the existing Diadochi/satrapal monarchy reform")
lysimachus.ruler(306, "Lysimachus", {
	dynasty: "Lysimachid",
	note: "Diadoch ruler of Thrace, western Anatolia, and briefly Macedon; killed fighting Seleucus at Corupedium in 281 BC",
})
lysimachus.ruler(284, "Agathocles", {
	dynasty: "Lysimachid",
	note: "Son and heir of Lysimachus; executed after court intrigue, destabilizing the kingdom before Seleucus's invasion",
	sourceConfidence: "abstraction",
})

// =======================================================================
// WARS
// =======================================================================
const wars = [
	war({
		warId: "macedonianIllyrianWars",
		name: "Macedonian-Illyrian Wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "4780",
		attacker: ["cp_illyrian_kingdom"],
		defender: ["cp_macedonian_empire"],
		start: d(393),
		end: d(358),
		note: "Long-running Macedonian conflict with Illyrian kingdoms, including the crisis under Amyntas III and Philip II's victory after Perdiccas III's death. The dataset has cp_illyrian_kingdom and Macedonian border provinces, so this is represented as a broad recurring war.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 358,
				name: "Battle against Bardylis",
				locationProvinceId: "4780",
				attacker: { country: "cp_macedonian_empire", commander: "Philip II", infantry: 10000, cavalry: 600, artillery: null, losses: null },
				defender: { country: "cp_illyrian_kingdom", commander: "Bardylis", infantry: 10000, cavalry: 500, artillery: null, losses: 7000 },
				attackerWon: true,
				note: "Philip II's victory over Bardylis restored Macedonian security on the Illyrian frontier; Ohrid (4780) stands in for the western Macedonian border zone.",
			}),
		],
	}),
	war({
		warId: "olynthianWar",
		name: "Olynthian War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "4702",
		attacker: ["cp_macedonian_empire"],
		defender: ["cp_chalcidice_city_states"],
		start: d(349),
		end: d(348),
		note: "Philip II destroys Olynthus and the Chalcidian League, expanding Macedonian control over Chalcidice. Siroz (4702) is the closest modeled Chalcidice-region province.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "thirdSacredWarMacedonianIntervention",
		name: "Third Sacred War Macedonian Intervention",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "147",
		attacker: ["cp_macedonian_empire"],
		defender: ["cp_thessalian_city_states"],
		start: d(353),
		end: d(346),
		note: "Philip II intervenes in the Third Sacred War, defeating Phocian-led resistance and entering central Greek politics. Thessalian City-States stand in for the modeled central-northern Greek theater.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 352,
				name: "Battle of Crocus Field",
				locationProvinceId: "147",
				attacker: { country: "cp_macedonian_empire", commander: "Philip II", infantry: 20000, cavalry: 3000, artillery: null, losses: null },
				defender: { country: "cp_thessalian_city_states", commander: "Onomarchus", infantry: 20000, cavalry: 500, artillery: null, losses: 6000 },
				attackerWon: true,
				note: "Crocus Field was in Thessaly; Salonica (147) is the closest broad Macedonian/Thessalian stand-in in the province set.",
			}),
		],
	}),
	war({
		warId: "battleOfChaeronea",
		name: "Battle of Chaeronea and Macedonian Hegemony",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "146",
		attacker: ["cp_macedonian_empire"],
		defender: ["cp_athens"],
		start: d(338),
		end: d(338, 9, 1),
		note: "Philip II defeats the Athenian-Theban coalition at Chaeronea, leading to Macedonian hegemony over most Greek poleis through the League of Corinth.",
		battles: [
			battle({
				year: 338,
				month: 8,
				day: 2,
				name: "Chaeronea",
				locationProvinceId: "146",
				attacker: { country: "cp_macedonian_empire", commander: "Philip II and Alexander", infantry: 30000, cavalry: 2000, artillery: null, losses: null },
				defender: { country: "cp_athens", commander: "Chares / Theagenes", infantry: 35000, cavalry: 2000, artillery: null, losses: 2000 },
				attackerWon: true,
				note: "Chaeronea is in Boeotia; Athens (146) is used as the broad mainland Greek stand-in.",
			}),
		],
	}),
	war({
		warId: "lamianWar",
		name: "Lamian War",
		casusBelli: "cb_independence_war",
		warGoalType: "take_claim",
		warGoalProvince: "146",
		attacker: ["cp_athens"],
		defender: ["cp_macedonian_empire"],
		start: d(323),
		end: d(322),
		note: "Athenian-led Greek revolt against Macedonian control after Alexander's death; Antipater and Craterus suppress it.",
		battles: [
			battle({
				year: 322,
				name: "Crannon",
				locationProvinceId: "146",
				attacker: { country: "cp_macedonian_empire", commander: "Antipater and Craterus", infantry: 40000, cavalry: 5000, artillery: null, losses: null },
				defender: { country: "cp_athens", commander: "Antiphilus", infantry: 25000, cavalry: 3500, artillery: null, losses: null },
				attackerWon: true,
				note: "Crannon was in Thessaly; Athens (146) stands in for the Greek coalition's political center and the modeled mainland Greek province.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "battleOfIpsus",
		name: "Battle of Ipsus",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_antigonid_dynasty",
		attacker: ["cp_seleucid_empire", "cp_kingdom_of_lysimachus", "cp_ptolemaic_kingdom"],
		defender: ["cp_antigonid_dynasty"],
		start: d(302),
		end: d(301),
		note: "Coalition of Seleucus, Lysimachus, Cassander, and Ptolemy defeats Antigonus I and Demetrius, ending the Antigonid attempt to reunify Alexander's empire.",
		battles: [
			battle({
				year: 301,
				name: "Ipsus",
				locationProvinceId: "323",
				attacker: { country: "cp_seleucid_empire", commander: "Seleucus I / Lysimachus", infantry: 64000, cavalry: 10500, artillery: null, losses: null },
				defender: { country: "cp_antigonid_dynasty", commander: "Antigonus I / Demetrius", infantry: 70000, cavalry: 10000, artillery: null, losses: null },
				attackerWon: true,
				note: "Ipsus was in Phrygia; Konya (323) stands in for central Anatolia. Elephant numbers are debated, so only broad infantry/cavalry estimates are included.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "demetriusSeizesMacedon",
		name: "Demetrius I Seizes Macedon",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "3001",
		attacker: ["cp_antigonid_macedonia"],
		defender: ["cp_macedonian_empire"],
		start: d(294),
		end: d(294, 1, 2),
		note: "Demetrius I Poliorcetes intervenes in the struggle between Cassander's sons and takes the Macedonian throne. Represented as a one-day successor war because both tags exist.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "lysimachusPyrrhusExpelDemetrius",
		name: "Lysimachus and Pyrrhus Expel Demetrius",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "3001",
		attacker: ["cp_kingdom_of_lysimachus"],
		defender: ["cp_antigonid_macedonia"],
		start: d(288),
		end: d(288, 1, 2),
		note: "Lysimachus and Pyrrhus drive Demetrius I out of Macedon. Pyrrhus/Epirus has no clear pre-2AD owner tag in this batch, so Lysimachus is the modeled attacker.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "battleOfCorupedium",
		name: "Battle of Corupedium",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_kingdom_of_lysimachus",
		attacker: ["cp_seleucid_empire"],
		defender: ["cp_kingdom_of_lysimachus"],
		start: d(282),
		end: d(281),
		note: "Seleucus I defeats and kills Lysimachus, ending Lysimachus's kingdom in Asia Minor and Thrace.",
		battles: [
			battle({
				year: 281,
				name: "Corupedium",
				locationProvinceId: "318",
				attacker: { country: "cp_seleucid_empire", commander: "Seleucus I Nicator", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_kingdom_of_lysimachus", commander: "Lysimachus", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Corupedium was near Sardis in Lydia; Smyrna (318) stands in for western Anatolia.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "antigonusGonatasRestoration",
		name: "Antigonus II Gonatas Restores Antigonid Macedon",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "3001",
		attacker: ["cp_antigonid_macedonia"],
		defender: ["cp_athens"],
		start: d(277),
		end: d(276),
		note: "After Celtic invasion and succession chaos, Antigonus II Gonatas secures Macedon and begins durable Antigonid rule. No Celtic pre-2AD tag is available, so the defender is the generic fragmented Greek/Macedonian city-state field left after the collapse.",
		sourceConfidence: "abstraction",
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

for (const builder of [macedon, antigonidDynasty, antigonidMacedonia, lysimachus]) {
	writeNation(builder)
}

wars.sort((a, b) => a.events[0].date - b.events[0].date)
fs.writeFileSync(
	path.join(warsDir, "macedonian-successor-wars.json"),
	JSON.stringify(
			{
				_readme:
					"Audit/proposal file: wars for the Macedonian/Diadochi batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields for review. Not wired into the engine. Alexander's Persian campaign remains in pilot-nations-wars.json:warsOfAlexander and Roman-Macedonian wars remain in republic-wars.json.",
				wars,
			},
			null,
			"\t",
		) + "\n",
)

console.log(`wrote 4 nation files and ${wars.length} wars`)
