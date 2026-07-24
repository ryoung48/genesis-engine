// Pilot batch: 5 Tier-A ancient nations, same treatment as ROM/cp_roman_republic --
// rulerChange/governmentChange/governmentReformAdd for each nation
// (audits/<tag>.json), wars (audits/wars/pilot-nations-wars.json), and
// revolts (audits/revolts/pilot-nations-revolts.json). Mirrors
// src/model/earth/history/date.ts's day encoding. Not wired into the engine.
//
// Reform ids and government types are taken from geo-explorer's
// public/imperialis/countries.json wherever that mod source has a matching
// entry (CAR, PTO, SEL, PSE, MAU) -- same sourcing approach as ROM/RMR.
// Event DATES use real historical years (not the mod's internal relative-year
// numbering, which we could not reliably re-derive -- see readme note),
// same as the ROM/RMR audits.
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2
function dayOfYear(m, d) {
	return CUM_MONTH_DAYS[m - 1] + d
}
function eu4DateToDays(astroYear, m, d) {
	const startD = dayOfYear(1, 1)
	return (astroYear - EARTH_HISTORY_START_YEAR) * 365 + dayOfYear(m, d) - startD
}
function bc(year) {
	return 1 - year
}
function d(year, m = 1, day = 1) {
	return eu4DateToDays(bc(year), m, day)
}

function nationBuilder(tag) {
	const events = []
	function ruler(year, name, opts = {}) {
		events.push({
			date: d(year, opts.m ?? 1, opts.d ?? 1),
			kind: "rulerChange",
			payload: { name, ...opts },
			note: opts.note,
			sourceConfidence: opts.sourceConfidence ?? "traditional",
		})
	}
	function govChange(year, governmentType, note) {
		events.push({
			date: d(year),
			kind: "governmentChange",
			payload: { governmentType },
			note,
			sourceConfidence: "traditional",
		})
	}
	function reformAdd(year, reformId, note, confidence = "traditional") {
		events.push({
			date: d(year),
			kind: "governmentReformAdd",
			payload: { reformId },
			note,
			sourceConfidence: confidence,
		})
	}
	function religionChange(year, provinceId, religionId, note) {
		events.push({
			_provinceEvent: true,
			provinceId,
			date: d(year),
			kind: "religion",
			payload: { religionId },
			note,
			sourceConfidence: "traditional",
		})
	}
	return { tag, events, ruler, govChange, reformAdd, religionChange }
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
}) {
	const events = []
	for (const tag of attacker) events.push({ date: start, nationTag: tag, kind: "warStart", side: "attacker" })
	for (const tag of defender) events.push({ date: start, nationTag: tag, kind: "warStart", side: "defender" })
	for (const tag of attacker) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "attacker" })
	for (const tag of defender) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "defender" })
	return { warId, name, casusBelli, warGoalType, warGoalTag, warGoalProvince, isRebel: false, events, battles, note }
}
function battle({ year, m = 1, day = 1, name, locationProvinceId, attacker, defender, attackerWon, note }) {
	return { date: d(year, m, day), name, locationProvinceId, attacker, defender, attackerWon, note }
}
function revoltEvent({ year, m = 1, day = 1, type, size = 1, leader = null, comment, note }) {
	const revolt = { type, size }
	if (leader) revolt.leader = leader
	return { date: d(year, m, day), kind: "revolt", payload: { revolt }, comment, note, sourceConfidence: "traditional" }
}

// =======================================================================
// CARTHAGE (cp_carthage) -- capital Tunis (341)
// =======================================================================
const car = nationBuilder("cp_carthage")
car.govChange(650, "theocracy", "Carthage governed by an oligarchy of judge-magistrates (suffetes) under strong priestly/mercantile aristocratic influence")
car.reformAdd(650, "phoenician_oligarchy", "Matches Imperium Universalis countries.json CAR history[0]")
car.ruler(550, "Mago I", { dynasty: "Magonid", note: "Founder of the Magonid dynasty that dominated Carthaginian politics for over a century" })
car.ruler(530, "Hasdrubal I", { dynasty: "Magonid" })
car.ruler(510, "Hamilcar I", { dynasty: "Magonid", note: "Killed at the Battle of Himera, 480 BC, ending the first Carthaginian attempt to conquer Sicily" })
car.ruler(480, "Hanno the Navigator", { dynasty: "Magonid", note: "Attributed voyage of exploration down the West African coast" })
car.ruler(410, "Hannibal Mago", { dynasty: "Magonid", note: "Sacked Himera and Selinus in Sicily, avenging his grandfather Hamilcar I" })
car.govChange(550, "republic", "Shift toward a republican oligarchy of annually elected suffetes and the Council of Elders/Tribunal of 104, consistent with classical descriptions (Aristotle, Politics II) of the Carthaginian constitution", { sourceConfidence: "abstraction" })
car.reformAdd(
	550,
	"citizens_republic",
	"Matches Imperium Universalis countries.json CAR history[1] (there dated relative-year 204; re-anchored here to a round mid-6th-century date since the mod's internal relative-year epoch could not be reliably re-derived for non-Roman tags -- see readme)",
	"abstraction",
)
car.ruler(340, "Hanno II the Great", { dynasty: null, sourceConfidence: "abstraction", note: "Dominant statesman of the mid-4th century BC" })
car.govChange(275, "theocracy", "Reassertion of aristocratic/priestly influence over the suffetes and Council of Elders in the run-up to the Punic Wars")
car.reformAdd(
	275,
	"carthaginian_republic",
	"Matches Imperium Universalis countries.json CAR history[2] (there dated relative-year 274; re-anchored to the same round date as the founding of the Barcid military ascendancy)",
)
car.ruler(275, "Hamilcar Barca", { dynasty: "Barcid", note: "Founder of the Barcid dynasty; rebuilt Carthaginian power in Hispania after the First Punic War" })
car.ruler(229, "Hasdrubal the Fair", { dynasty: "Barcid", note: "Son-in-law of Hamilcar; founded Carthago Nova (New Carthage) in Hispania" })
car.ruler(221, "Hannibal Barca", { dynasty: "Barcid", note: "Led the invasion of Italy in the Second Punic War; final ruler before Carthage's destruction in 146 BC (audits/wars/republic-wars.json)" })

// =======================================================================
// ACHAEMENID EMPIRE (cp_achaemenid_empire) -- capital Fars (429, Persepolis region)
// =======================================================================
const pse = nationBuilder("cp_achaemenid_empire")
pse.govChange(559, "monarchy", "Cyrus the Great unites the Persians and Medes, founding the Achaemenid Empire")
pse.reformAdd(559, "persian_achaemenid_monarchy", "Matches Imperium Universalis countries.json PSE history[0]")
pse.ruler(559, "Cyrus the Great", { dynasty: "Achaemenid" })
pse.ruler(530, "Cambyses II", { dynasty: "Achaemenid", note: "Conquered Egypt, 525 BC" })
pse.ruler(522, "Darius I", { dynasty: "Achaemenid", note: "Reorganized the empire into satrapies" })
pse.reformAdd(518, "district_divisions", "Matches Imperium Universalis countries.json PSE history[2] -- Darius I's satrapy/administrative reforms")
pse.ruler(486, "Xerxes I", { dynasty: "Achaemenid", note: "Led the second Persian invasion of Greece, 480 BC" })
pse.ruler(465, "Artaxerxes I", { dynasty: "Achaemenid" })
pse.ruler(424, "Darius II", { dynasty: "Achaemenid" })
pse.ruler(404, "Artaxerxes II", { dynasty: "Achaemenid", note: "Longest-reigning Achaemenid king" })
pse.ruler(358, "Artaxerxes III", { dynasty: "Achaemenid" })
pse.ruler(338, "Artaxerxes IV Arses", { dynasty: "Achaemenid" })
pse.ruler(336, "Darius III", { dynasty: "Achaemenid", note: "Last Achaemenid King of Kings; defeated by Alexander the Great (audits/wars/pilot-nations-wars.json), empire falls 330 BC" })

// =======================================================================
// PTOLEMAIC KINGDOM (cp_ptolemaic_kingdom) -- capital Alexandria (358)
// =======================================================================
const pto = nationBuilder("cp_ptolemaic_kingdom")
pto.govChange(305, "monarchy", "Ptolemy, satrap of Egypt since Alexander's death (323 BC), takes the royal title")
pto.reformAdd(305, "aristocratic_monarchy", "Matches Imperium Universalis countries.json PTO history[0]")
pto.ruler(305, "Ptolemy I Soter", { dynasty: "Ptolemaic" })
pto.ruler(282, "Ptolemy II Philadelphus", { dynasty: "Ptolemaic", note: "Patron of the Library of Alexandria" })
pto.ruler(246, "Ptolemy III Euergetes", { dynasty: "Ptolemaic" })
pto.ruler(222, "Ptolemy IV Philopator", { dynasty: "Ptolemaic" })
pto.ruler(204, "Ptolemy V Epiphanes", { dynasty: "Ptolemaic", note: "Subject of the Rosetta Stone decree" })
pto.ruler(180, "Ptolemy VI Philometor", { dynasty: "Ptolemaic" })
pto.ruler(145, "Ptolemy VIII Euergetes II (Physcon)", { dynasty: "Ptolemaic", sourceConfidence: "abstraction", note: "Dynastic succession 145-116 BC involved repeated co-rule and civil conflict among Ptolemy VI's heirs; Physcon used here as the dominant figure of the period" })
pto.ruler(80, "Ptolemy XII Auletes", { dynasty: "Ptolemaic", note: "Father of Cleopatra VII" })
pto.ruler(51, "Cleopatra VII", { dynasty: "Ptolemaic", note: "Last active Ptolemaic ruler; kingdom ends 30 BC (audits/wars/republic-wars.json's Final War of the Roman Republic, and audits/ROM.json)" })

// =======================================================================
// SELEUCID EMPIRE (cp_seleucid_empire) -- capital Antioch (2313)
// =======================================================================
const sel = nationBuilder("cp_seleucid_empire")
sel.govChange(305, "monarchy", "Seleucus, a former general of Alexander, takes the royal title after securing Babylon and the eastern satrapies")
sel.reformAdd(305, "despotism", "Matches Imperium Universalis countries.json SEL history[0]")
sel.ruler(305, "Seleucus I Nicator", { dynasty: "Seleucid" })
sel.ruler(281, "Antiochus I Soter", { dynasty: "Seleucid" })
sel.ruler(261, "Antiochus II Theos", { dynasty: "Seleucid" })
sel.ruler(246, "Seleucus II Callinicus", { dynasty: "Seleucid" })
sel.ruler(225, "Seleucus III Ceraunus", { dynasty: "Seleucid" })
sel.ruler(222, "Antiochus III the Great", { dynasty: "Seleucid", note: "Expanded the empire to its greatest extent before losing to Rome (audits/wars/republic-wars.json's Roman-Seleucid War)" })
sel.ruler(187, "Seleucus IV Philopator", { dynasty: "Seleucid" })
sel.ruler(175, "Antiochus IV Epiphanes", { dynasty: "Seleucid", note: "Religious persecution in Judea triggers the Maccabean Revolt (audits/revolts/pilot-nations-revolts.json)" })
sel.reformAdd(
	220,
	"satrap_diadochi",
	"Matches Imperium Universalis countries.json SEL history[1] (there dated relative-year 434; re-anchored to Antiochus III's reign, when the empire's satrapal structure is best attested)",
	"abstraction",
)
sel.ruler(150, "Demetrius I Soter", { dynasty: "Seleucid", sourceConfidence: "abstraction", note: "Stand-in for the empire's long mid-2nd-century BC fragmentation into rival dynastic claimants" })
sel.ruler(83, "Tigranes the Great", { dynasty: null, sourceConfidence: "abstraction", note: "Armenian king who occupied Syria 83-69 BC amid Seleucid dynastic collapse; the rump Seleucid state was formally ended by Pompey in 63 BC" })

// =======================================================================
// MAURYA EMPIRE (cp_maurya_empire) -- capital Patna (4447, ancient Pataliputra)
// =======================================================================
const mau = nationBuilder("cp_maurya_empire")
mau.govChange(322, "tribal", "Chandragupta Maurya overthrows the Nanda dynasty with Chanakya's counsel, founding the Maurya Empire on existing Vedic-kingdom political structures")
mau.reformAdd(322, "vedic_kingdom", "Matches Imperium Universalis countries.json MAU history[0]")
mau.ruler(322, "Chandragupta Maurya", { dynasty: "Maurya" })
mau.ruler(298, "Bindusara", { dynasty: "Maurya" })
mau.ruler(268, "Ashoka", { dynasty: "Maurya", note: "Conquered Kalinga (261 BC); converted to and patronized Buddhism afterward (audits/ religion note below)" })
mau.govChange(261, "monarchy", "Centralization under Ashoka following the Kalinga War")
mau.reformAdd(
	261,
	"heterodoxy",
	"Matches Imperium Universalis countries.json MAU history[1] (there dated relative-year 290) -- Ashoka's patronage of Buddhism, a 'heterodox' (non-Vedic) tradition, re-anchored to the actual Kalinga War/conversion date",
)
mau.religionChange(
	260,
	"4447",
	"buddhism",
	"Ashoka's turn to Buddhism after the Kalinga War (261 BC) and his edicts promoting it empire-wide -- the one well-documented, single-date province-level religion conversion found in this era's research (see chat: religion/culture conversions are otherwise essentially absent pre-2AD). Patna (ancient Pataliputra), the Mauryan capital, is used as the representative province; the conversion was a court/patronage shift, not a uniform empire-wide province flip, so this should be read as marking the moment rather than claiming universal adoption.",
)
mau.ruler(232, "Dasharatha Maurya", { dynasty: "Maurya", sourceConfidence: "abstraction", note: "Ashoka's grandson and successor; the post-Ashoka Mauryan succession (Dasharatha through Brihadratha) is poorly attested and contested among sources" })
mau.ruler(185, "Brihadratha Maurya", { dynasty: "Maurya", sourceConfidence: "abstraction", note: "Last Mauryan emperor; assassinated by his own general Pushyamitra Shunga in 185 BC, ending the dynasty (matches events/provinces.json's Patna owner-history transition from cp_maurya_empire to cp_mahameghavahana_dynasty/cp_shunga_empire)" })

// =======================================================================
// WARS
// =======================================================================
const wars = [
	war({
		warId: "sicilianWars",
		name: "Sicilian Wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "2982",
		attacker: ["cp_carthage"],
		defender: ["cp_syracuse"],
		start: d(480, 1, 1),
		end: d(275, 1, 1),
		note: "Recurring conflict (480-275 BC) between Carthage and the Greek colonies of Sicily (chiefly Syracuse, which has no dedicated province tag in this dataset -- cp_syracuse stands in). Dates span the whole multi-round conflict rather than a single war for simplicity.",
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
		],
	}),
	war({
		warId: "greekPersianWars",
		name: "Greco-Persian Wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "146",
		attacker: ["cp_achaemenid_empire"],
		defender: ["cp_athens"],
		start: d(499, 1, 1),
		end: d(449, 1, 1),
		note: "Spans the Ionian Revolt through the Peace of Callias.",
		battles: [
			battle({
				year: 490,
				m: 9,
				day: 12,
				name: "Marathon",
				locationProvinceId: "146",
				attacker: { country: "cp_athens", commander: "Miltiades", infantry: 10000, cavalry: null, artillery: null, losses: 200 },
				defender: { country: "cp_achaemenid_empire", commander: "Datis", infantry: 25000, cavalry: 1000, artillery: null, losses: 6400 },
				attackerWon: true,
				note: "Marathon is in Attica; Athens (146) stands in as the nearest modeled province.",
			}),
			battle({
				year: 480,
				m: 8,
				day: 1,
				name: "Thermopylae",
				locationProvinceId: "146",
				attacker: { country: "cp_achaemenid_empire", commander: "Xerxes I", infantry: 200000, cavalry: null, artillery: null, losses: 20000 },
				defender: { country: "cp_athens", commander: "Leonidas I", infantry: 7000, cavalry: null, artillery: null, losses: 4000 },
				attackerWon: true,
				note: "No dedicated Phocis/Thermopylae province exists in this dataset (same stand-in used for the unrelated 191 BC Roman-Seleucid battle of the same name); Athens (146) stands in for mainland Greece.",
			}),
		],
	}),
	war({
		warId: "warsOfAlexander",
		name: "Wars of Alexander the Great",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_achaemenid_empire",
		attacker: ["cp_macedonian_empire"],
		defender: ["cp_achaemenid_empire"],
		start: d(334, 1, 1),
		end: d(330, 1, 1),
		note: "Ends the Achaemenid Empire; Persia's territory passes to the Macedonian Empire (cp_macedonian_empire), already an existing tag in this dataset.",
		battles: [
			battle({
				year: 334,
				m: 5,
				day: 1,
				name: "Granicus",
				locationProvinceId: "2296",
				attacker: { country: "cp_macedonian_empire", commander: "Alexander the Great", infantry: 32000, cavalry: 5100, artillery: null, losses: 300 },
				defender: { country: "cp_achaemenid_empire", commander: "Arsites", infantry: null, cavalry: 10000, artillery: null, losses: 4000 },
				attackerWon: true,
				note: "Fought in NW Anatolia; Biga (2296) stands in for the Granicus river region.",
			}),
			battle({
				year: 333,
				m: 11,
				day: 5,
				name: "Issus",
				locationProvinceId: "327",
				attacker: { country: "cp_macedonian_empire", commander: "Alexander the Great", infantry: 40000, cavalry: 5000, artillery: null, losses: 7000 },
				defender: { country: "cp_achaemenid_empire", commander: "Darius III", infantry: 100000, cavalry: null, artillery: null, losses: 20000 },
				attackerWon: true,
				note: "Issus was near modern Iskenderun; Adana (327) stands in as the nearest modeled province.",
			}),
			battle({
				year: 331,
				m: 10,
				day: 1,
				name: "Gaugamela",
				locationProvinceId: "411",
				attacker: { country: "cp_macedonian_empire", commander: "Alexander the Great", infantry: 47000, cavalry: 7000, artillery: null, losses: 1000 },
				defender: { country: "cp_achaemenid_empire", commander: "Darius III", infantry: 200000, cavalry: 40000, artillery: null, losses: 40000 },
				attackerWon: true,
				note: "Decisive battle, fought near modern Mosul (411).",
			}),
		],
	}),
	war({
		warId: "syrianWars",
		name: "Syrian Wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "364",
		attacker: ["cp_ptolemaic_kingdom"],
		defender: ["cp_seleucid_empire"],
		start: d(274, 1, 1),
		end: d(168, 1, 1),
		note: "Six recurring wars (274-168 BC) between the Ptolemies and Seleucids over Coele-Syria; dates span the whole series for simplicity, with the best-attested single battle included.",
		battles: [
			battle({
				year: 217,
				m: 6,
				day: 22,
				name: "Raphia",
				locationProvinceId: "364",
				attacker: { country: "cp_ptolemaic_kingdom", commander: "Ptolemy IV Philopator", infantry: 70000, cavalry: 5000, artillery: 73, losses: 1500 },
				defender: { country: "cp_seleucid_empire", commander: "Antiochus III", infantry: 62000, cavalry: 6000, artillery: 102, losses: 10000 },
				attackerWon: true,
				note: "One of the largest battles of the Hellenistic era. Ancient Raphia is near modern Rafah; Gaza (364) stands in for the region.",
			}),
		],
	}),
]

// =======================================================================
// REVOLTS
// =======================================================================
const revolts = {
	341: [
		revoltEvent({
			year: 241,
			type: "noble_rebels",
			size: 5,
			leader: "Spendius and Mathos",
			comment: "Mercenary War (Truceless War)",
			note: "Carthage's unpaid mercenary army from the First Punic War rebels alongside Libyan subject towns; nearly captures Carthage itself before being crushed by Hamilcar Barca in 237 BC. 'noble_rebels' used as the closest existing type -- no dedicated mercenary/military-revolt category exists in this dataset's rebel-type enum. Tunis (341) stands in for Carthage.",
		}),
	],
	379: [
		revoltEvent({
			year: 167,
			type: "religious_rebels",
			size: 5,
			leader: "Judas Maccabeus",
			comment: "Maccabean Revolt",
			note: "Jewish uprising against Antiochus IV Epiphanes's religious persecution and the desecration of the Second Temple; leads to Hasmonean independence by 141/140 BC. Recorded as a province-level revolt on Judea (379) rather than in a wars.json-style entry because the Hasmonean/Maccabean state has no owner tag of its own anywhere in events/provinces.json for this early phase (same reasoning as the Cantabrian revolts).",
		}),
	],
}

// =======================================================================
// OUTPUT
// =======================================================================
function writeNation(builder) {
	const provinceEvents = builder.events.filter((e) => e._provinceEvent)
	const nationEvents = builder.events
		.filter((e) => !e._provinceEvent)
		.sort((a, b) => a.date - b.date)
	const out = {
		_readme: `Audit/proposal file: reconstructed pre-2AD events for '${builder.tag}', part of the 5-nation Tier-A pilot batch (Carthage, Achaemenid Persia, Ptolemaic Egypt, Seleucid Empire, Maurya Empire). Same methodology as audits/ROM.json and audits/cp_roman_republic.json. Not wired into the engine. Reform ids and government types are drawn from geo-explorer's public/imperialis/countries.json where that mod source has a matching entry; event dates use real historical years rather than the mod's internal relative-year numbering (which could not be reliably re-derived for non-Roman tags -- for ROM/RMR the numbers happened to check out against provinces.json's own owner-history dates, but the same check did not hold for these nations, so real historical dates were used instead and flagged accordingly). sourceConfidence: 'traditional' = well-attested history; 'abstraction' = game-design stand-in for a poorly-attested stretch.`,
		tag: builder.tag,
		events: nationEvents,
	}
	if (provinceEvents.length > 0) {
		out.provinceEvents = {}
		for (const e of provinceEvents) {
			const { _provinceEvent, provinceId, ...rest } = e
			if (!out.provinceEvents[provinceId]) out.provinceEvents[provinceId] = []
			out.provinceEvents[provinceId].push(rest)
		}
	}
	return out
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
const revoltsDir = path.join(auditsDir, "revolts")
fs.mkdirSync(warsDir, { recursive: true })
fs.mkdirSync(revoltsDir, { recursive: true })

for (const builder of [car, pse, pto, sel, mau]) {
	fs.writeFileSync(
		path.join(auditsDir, `${builder.tag}.json`),
		JSON.stringify(writeNation(builder), null, "\t") + "\n",
	)
}

wars.sort((a, b) => a.events[0].date - b.events[0].date)
fs.writeFileSync(
	path.join(warsDir, "pilot-nations-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: wars for the 5-nation Tier-A pilot batch (audits/cp_carthage.json, cp_achaemenid_empire.json, cp_ptolemaic_kingdom.json, cp_seleucid_empire.json, cp_maurya_empire.json). Mirrors events/wars.json's schema. Not wired into the engine.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

const revoltProvinces = {}
for (const pid of Object.keys(revolts)) {
	revoltProvinces[pid] = { events: revolts[pid].sort((a, b) => a.date - b.date) }
}
fs.writeFileSync(
	path.join(revoltsDir, "pilot-nations-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the 5-nation Tier-A pilot batch. Mirrors events/provinces.json's revolt event schema (payload.revolt: {type, size, leader?}). Not wired into the engine.",
			provinces: revoltProvinces,
		},
		null,
		"\t",
	) + "\n",
)

console.log("wrote 5 nation files, ", wars.length, "wars,", Object.keys(revolts).length, "revolt provinces")
